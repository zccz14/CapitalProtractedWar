/**
 * New Paradigm Backtest Engine - 新范式回测引擎
 * 
 * 核心架构：
 * 1. 市场序列生成一次，复用于所有信号策略
 * 2. 信号序列生成一次，复用于所有投注策略（不同 M_T）
 * 3. 多账户并行追踪，各账户独立止盈、独立重置
 * 
 * 新风控框架：
 * - 基准账户（BaselineTracker）：固定仓位=1，计算 C(t) 和 StopLoss(t)
 * - 投注账户（MultiAccountTracker）：参考基准账户的 C 和 StopLoss
 * - 成交价格：使用下一根K线开盘价（非当前收盘价）
 * - 观察期：C=0 或 StopLoss=0 时为观察期，Position=0
 * - 盘中检查：持仓期间每根K线检查止盈/止损
 * 
 * 核心公式：
 * - C(t) = max(亏损额/交易时间)
 * - StopLoss(t) = 历史单笔最大浮亏
 * - RiskLine(t+1) = RiskLine(t) - C(t)  // 每K线下降
 * - VC(t) = UnrealizedPnL(t) - RiskLine(t)
 * - Position(t) = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 * 
 * 止盈/止损规则（盘中触发）：
 * - 止盈：持仓期间最高浮盈 >= M_T，RealizedPnL += M_T
 * - 止损：持仓期间 VC <= 0，UnrealizedPnL 限制到 RiskLine
 */

import type { 
  Candle, 
  Signal,
  SignalStrategy, 
  SignalStrategyConfig,
  ExperimentConfig,
  ExperimentResult,
  SignalEvaluationResult,
  MonteCarloRunResult,
  AggregatedSignalResult,
  AggregatedTakeProfitStats,
  TakeProfitTargetStats,
  SampleRunData,
  TradeRecord,
  SampleMetadata,
} from '../types.js';
import { MultiAccountTracker, BaselineTracker } from '../betting/index.js';
import { createSignalStrategy } from '../signal/index.js';
import { generateMarket } from '../market/generator.js';

// ============================================
// 新范式回测引擎
// ============================================

export class NewParadigmBacktestEngine {
  /**
   * 评估单个信号策略在给定市场上的表现
   */
  evaluateSignalStrategy(
    candles: Candle[],
    strategy: SignalStrategy,
    tracker: MultiAccountTracker,
    recordSample: boolean = false
  ): { result: SignalEvaluationResult; sampleData?: SampleRunData } {
    // 重置追踪器
    tracker.reset();
    
    // 创建基准账户追踪器
    const baseline = new BaselineTracker();
    if (recordSample) {
      baseline.enableDetailRecording();
    }
    baseline.setTotalCandles(candles.length);
    
    // 启用样本记录
    if (recordSample) {
      tracker.enableSampleRecording();
    }
    
    tracker.setTotalCandles(candles.length);
    
    // ============================================
    // 信号和交易状态变量
    // ============================================
    
    /** 当前持仓：1=多, 0=空仓, -1=空 */
    let currentPosition: 0 | 1 | -1 = 0;
    
    /** 开仓价格 */
    let entryPrice: number | null = null;
    
    /** 开仓K线索引（实际成交的K线） */
    let entryIndex: number | null = null;
    
    /** 产生开仓信号的K线索引 */
    let entrySignalIndex: number | null = null;
    
    /** 统计 */
    let totalTradeCount = 0;
    let winCount = 0;
    
    // ============================================
    // 待执行的信号变化（用于下一K线开盘价成交）
    // ============================================
    
    /** 待执行的信号变化 */
    let pendingSignal: Signal | null = null;
    
    /** 产生待执行信号的K线索引 */
    let pendingSignalIndex: number | null = null;
    
    // ============================================
    // 样本数据收集
    // ============================================
    
    /** 每根K线的信号值 */
    const signals: number[] = new Array(candles.length).fill(0);
    
    /** 交易记录 */
    const trades: TradeRecord[] = [];
    
    // ============================================
    // 主循环：遍历K线
    // ============================================
    
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      // ============================================
      // 步骤0：每根K线更新风控线（即使没有交易）
      // RiskLine(t+1) = RiskLine(t) - C(t)
      // ============================================
      const currentC = baseline.getEstimatedC();
      tracker.updateRiskLineForAllAccounts(i, currentC);
      
      // ============================================
      // 步骤0.5：盘中检查止盈/止损（持仓期间）
      // ============================================
      if (currentPosition !== 0 && entryPrice !== null && entryIndex !== null) {
        const intradayResults = tracker.checkIntradayForAllAccounts(
          currentPosition as 1 | -1,
          entryPrice,
          candle.high,
          candle.low,
          i,
          totalTradeCount,
          currentC,
          baseline.getStopLoss()
        );
        
        // 处理各账户的盘中止盈/止损
        for (const [target, result] of intradayResults) {
          if (result.takeProfitTriggered) {
            tracker.processIntradayTakeProfitForAccount(
              target,
              i,
              totalTradeCount,
              currentC,
              baseline.getStopLoss()
            );
          } else if (result.stopLossTriggered) {
            tracker.processIntradayStopLossForAccount(
              target,
              i,
              totalTradeCount,
              currentC,
              baseline.getStopLoss()
            );
          }
        }
      }
      
      // ============================================
      // 步骤1：处理上一根K线的待执行信号（使用当前K线开盘价成交）
      // ============================================
      if (pendingSignal !== null && pendingSignalIndex !== null) {
        const executionPrice = candle.open;  // 使用当前K线开盘价成交
        
        // 1a. 如果有持仓，先平仓
        if (currentPosition !== 0 && entryPrice !== null && entryIndex !== null && entrySignalIndex !== null) {
          const pnlPercent = this.calculatePnL(currentPosition, entryPrice, executionPrice);
          const holdingPeriod = i - entryIndex;
          
          // 计算持仓期间最大浮亏
          const maxDrawdown = this.calculateMaxDrawdown(
            candles,
            entryIndex,
            i,
            currentPosition,
            entryPrice
          );
          
          // 先更新基准账户（计算 C 值和 StopLoss）
          baseline.processTradeResult(pnlPercent, i, holdingPeriod, totalTradeCount, maxDrawdown);
          
          // 再更新投注账户（处理未触发盘中止盈/止损的账户）
          tracker.processTradeResult(
            pnlPercent,
            i,
            totalTradeCount,
            baseline.getEstimatedC(),
            baseline.getStopLoss()
          );
          
          // 记录交易
          if (recordSample) {
            trades.push({
              tradeIndex: totalTradeCount,
              signalIndex: entrySignalIndex,
              entryIndex: entryIndex,
              exitSignalIndex: pendingSignalIndex,
              exitIndex: i,
              direction: currentPosition as 1 | -1,
              entryPrice,
              exitPrice: executionPrice,
              holdingPeriod,
              pnlPercent,
              isWin: pnlPercent > 0,
              maxDrawdown,
            });
          }
          
          // 统计
          totalTradeCount++;
          if (pnlPercent > 0) winCount++;
        }
        
        // 1b. 开新仓
        if (pendingSignal !== 0) {
          // 开仓前准备仓位
          tracker.preparePositionForAllAccounts(baseline.getStopLoss());
          
          currentPosition = pendingSignal as 1 | -1;
          entryPrice = executionPrice;
          entryIndex = i;
          entrySignalIndex = pendingSignalIndex;
        } else {
          currentPosition = 0;
          entryPrice = null;
          entryIndex = null;
          entrySignalIndex = null;
        }
        
        // 清除待执行信号
        pendingSignal = null;
        pendingSignalIndex = null;
      }
      
      // ============================================
      // 步骤2：生成当前K线的信号
      // ============================================
      const signal = strategy.generate(candles, i);
      signals[i] = signal;
      
      // ============================================
      // 步骤3：检测信号变化，记录为待执行
      // ============================================
      if (signal !== currentPosition) {
        pendingSignal = signal;
        pendingSignalIndex = i;
      }
    }
    
    // ============================================
    // 处理最后一笔未平仓交易
    // ============================================
    if (currentPosition !== 0 && entryPrice !== null && entryIndex !== null && entrySignalIndex !== null) {
      const exitPrice = candles[candles.length - 1].close;
      const exitIndex = candles.length - 1;
      const pnlPercent = this.calculatePnL(currentPosition, entryPrice, exitPrice);
      const holdingPeriod = exitIndex - entryIndex;
      
      // 计算最大浮亏
      const maxDrawdown = this.calculateMaxDrawdown(
        candles,
        entryIndex,
        exitIndex,
        currentPosition,
        entryPrice
      );
      
      // 更新基准账户
      baseline.processTradeResult(pnlPercent, exitIndex, holdingPeriod, totalTradeCount, maxDrawdown);
      
      // 更新投注账户
      tracker.processTradeResult(
        pnlPercent,
        exitIndex,
        totalTradeCount,
        baseline.getEstimatedC(),
        baseline.getStopLoss()
      );
      
      // 记录交易
      if (recordSample) {
        trades.push({
          tradeIndex: totalTradeCount,
          signalIndex: entrySignalIndex,
          entryIndex: entryIndex,
          exitSignalIndex: exitIndex,
          exitIndex: exitIndex,
          direction: currentPosition as 1 | -1,
          entryPrice,
          exitPrice,
          holdingPeriod,
          pnlPercent,
          isWin: pnlPercent > 0,
          maxDrawdown,
        });
      }
      
      totalTradeCount++;
      if (pnlPercent > 0) winCount++;
    }
    
    // 完成基准账户
    baseline.finalize();
    
    const result: SignalEvaluationResult = {
      signalType: strategy.type,
      takeProfitStats: tracker.getStatsByTarget(),
      totalTradeCount,
      totalCandles: candles.length,
      winRate: totalTradeCount > 0 ? winCount / totalTradeCount : 0,
    };
    
    // ============================================
    // 收集样本数据
    // ============================================
    let sampleData: SampleRunData | undefined;
    if (recordSample) {
      sampleData = {
        prices: candles.map(c => c.close),
        realizedPnLCurves: tracker.getRealizedPnLCurves(),
        unrealizedPnLCurves: tracker.getUnrealizedPnLCurves(),
        pnlCurves: tracker.getPnLCurves(),
        riskLineCurves: tracker.getRiskLineCurves(),
        vcCurves: tracker.getVCCurves(),
        positionCurves: tracker.getPositionCurves(),
        takeProfitMarkers: tracker.getTakeProfitMarkers(),
        stopLossMarkers: tracker.getStopLossMarkers(),
        observationEndIndices: tracker.getObservationEndIndices(),
        estimatedCCurves: tracker.getEstimatedCCurves(),
        stopLossCurves: tracker.getStopLossCurves(),
        // 详细数据
        candles: candles,
        signals: signals,
        trades: trades,
        baselineSnapshots: baseline.getSnapshots(),
        baselineEquityCurve: baseline.getEquityCurve(),
        accountSnapshots: tracker.getAccountSnapshots(),
      };
    }
    
    return { result, sampleData };
  }

  /**
   * 计算盈亏百分比
   */
  private calculatePnL(position: number, entryPrice: number, exitPrice: number): number {
    return position * (exitPrice - entryPrice) / entryPrice;
  }

  /**
   * 计算持仓期间最大浮亏
   * 
   * @param candles - K线数据
   * @param entryIndex - 开仓K线索引
   * @param exitIndex - 平仓K线索引
   * @param direction - 方向：1=做多, -1=做空
   * @param entryPrice - 开仓价格
   * @returns 最大浮亏（正数表示亏损）
   */
  private calculateMaxDrawdown(
    candles: Candle[],
    entryIndex: number,
    exitIndex: number,
    direction: number,
    entryPrice: number
  ): number {
    let maxDrawdown = 0;
    
    for (let i = entryIndex; i <= exitIndex && i < candles.length; i++) {
      const candle = candles[i];
      // 做多：用最低价计算浮亏
      // 做空：用最高价计算浮亏
      const worstPrice = direction > 0 ? candle.low : candle.high;
      // drawdown > 0 表示亏损
      const drawdown = -direction * (worstPrice - entryPrice) / entryPrice;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    return maxDrawdown;
  }
}

// ============================================
// 新范式实验运行器
// ============================================

export class NewParadigmExperimentRunner {
  /**
   * 运行完整实验
   */
  async run(config: ExperimentConfig): Promise<ExperimentResult> {
    const startTime = Date.now();
    const engine = new NewParadigmBacktestEngine();
    
    // 收集所有 MC 运行的结果
    const allRunResults: MonteCarloRunResult[] = [];
    
    // 蒙特卡洛循环
    for (let runIndex = 0; runIndex < config.monteCarloRuns; runIndex++) {
      // 所有运行都记录样本数据，用于后续选择代表性样本
      const recordSample = true;
      
      // 1. 生成市场序列（每次 MC 运行一次）
      const marketConfig = {
        ...config.market,
        seed: config.market.seed !== undefined ? config.market.seed + runIndex : undefined,
      };
      const candles = generateMarket(marketConfig);
      
      // 2. 对每个信号策略评估
      const signalResults: SignalEvaluationResult[] = [];
      const sampleDataMap = new Map<string, SampleRunData>();
      
      for (const signalConfig of config.signals) {
        // 创建信号策略
        const seedOffset = signalConfig.params?.seed !== undefined ? runIndex : 0;
        const strategy = createSignalStrategy({
          ...signalConfig,
          params: signalConfig.params?.seed !== undefined 
            ? { ...signalConfig.params, seed: (signalConfig.params.seed as number) + seedOffset }
            : signalConfig.params,
        });
        
        // 创建多账户追踪器（每个信号策略独立）
        const tracker = new MultiAccountTracker(config.betting);
        
        // 评估
        const { result, sampleData } = engine.evaluateSignalStrategy(
          candles, 
          strategy, 
          tracker,
          recordSample
        );
        signalResults.push(result);
        
        // 保存样本数据
        if (sampleData) {
          sampleDataMap.set(strategy.type, sampleData);
        }
      }
      
      const runResult: MonteCarloRunResult = {
        runIndex,
        signalResults,
        sampleData: sampleDataMap,
      };
      
      allRunResults.push(runResult);
    }
    
    // 3. 聚合所有 MC 运行的结果
    const aggregatedResults = this.aggregateResults(allRunResults, config);
    
    const elapsedMs = Date.now() - startTime;
    
    return {
      config,
      signalResults: aggregatedResults,
      monteCarloRuns: config.monteCarloRuns,
      candlesPerRun: config.market.candleCount,
      elapsedMs,
      // 选择代表性样本用于可视化
      sampleRuns: this.selectRepresentativeSamples(allRunResults, config),
    };
  }

  /**
   * 为每个信号策略选择代表性样本（最佳/中位/最差）
   * 
   * 基于基准账户 PnL（仓位=1）进行排序选择
   */
  private selectRepresentativeSamples(
    allRunResults: MonteCarloRunResult[],
    config: ExperimentConfig
  ): MonteCarloRunResult[] {
    const signalTypes = config.signals.map(s => s.type);
    
    // 为每个信号策略计算排名
    const signalRankings = new Map<string, { idx: number; pnl: number }[]>();
    
    for (const signalType of signalTypes) {
      const runPnLs = allRunResults.map((run, idx) => {
        const sampleData = run.sampleData?.get(signalType);
        const baselinePnL = sampleData?.baselineEquityCurve?.slice(-1)[0] ?? 0;
        return { idx, pnl: baselinePnL };
      });
      runPnLs.sort((a, b) => a.pnl - b.pnl);
      signalRankings.set(signalType, runPnLs);
    }
    
    // 收集所有需要的运行索引及其对应的样本类型
    // key = runIndex, value = Map<signalType, sampleType>
    const selectedIndicesMap = new Map<number, Map<string, 'best' | 'median' | 'worst'>>();
    
    for (const signalType of signalTypes) {
      const rankings = signalRankings.get(signalType)!;
      const n = rankings.length;
      
      const worstIdx = rankings[0].idx;
      const medianIdx = rankings[Math.floor(n / 2)].idx;
      const bestIdx = rankings[n - 1].idx;
      
      // 记录每个索引对应的样本类型
      for (const [idx, type] of [[worstIdx, 'worst'], [medianIdx, 'median'], [bestIdx, 'best']] as const) {
        if (!selectedIndicesMap.has(idx)) {
          selectedIndicesMap.set(idx, new Map());
        }
        selectedIndicesMap.get(idx)!.set(signalType, type);
      }
    }
    
    // 构建结果，添加元数据
    return Array.from(selectedIndicesMap.entries()).map(([idx, typeMap]) => {
      const run = allRunResults[idx];
      const metadata = new Map<string, SampleMetadata>();
      
      for (const [signalType, sampleType] of typeMap) {
        const sampleData = run.sampleData?.get(signalType);
        const baselinePnL = sampleData?.baselineEquityCurve?.slice(-1)[0] ?? 0;
        metadata.set(signalType, {
          runIndex: idx,
          baselinePnL,
          sampleType,
        });
      }
      
      return { ...run, sampleMetadata: metadata };
    });
  }

  /**
   * 聚合多次 MC 运行的结果
   */
  private aggregateResults(
    runResults: MonteCarloRunResult[],
    config: ExperimentConfig
  ): AggregatedSignalResult[] {
    const numRuns = runResults.length;
    const signalTypes = config.signals.map(s => s.type);
    
    return signalTypes.map((signalType, signalIndex) => {
      // 收集该信号策略在所有运行中的结果
      const signalRunResults = runResults.map(r => r.signalResults[signalIndex]);
      
      // 计算平均胜率和交易数
      const avgWinRate = signalRunResults.reduce((sum, r) => sum + r.winRate, 0) / numRuns;
      const avgTradeCount = signalRunResults.reduce((sum, r) => sum + r.totalTradeCount, 0) / numRuns;
      
      // 聚合各 M_T 的统计
      const takeProfitStats = new Map<number, AggregatedTakeProfitStats>();
      
      for (const target of config.betting.takeProfitTargets) {
        const aggregated = this.aggregateTakeProfitStats(
          signalRunResults.map(r => r.takeProfitStats.get(target)!),
          target
        );
        takeProfitStats.set(target, aggregated);
      }
      
      return {
        signalType,
        takeProfitStats,
        avgWinRate,
        avgTradeCount,
      };
    });
  }

  /**
   * 聚合单个 M_T 在多次运行中的统计
   */
  private aggregateTakeProfitStats(
    stats: TakeProfitTargetStats[],
    targetMultiplier: number
  ): AggregatedTakeProfitStats {
    const numRuns = stats.length;
    
    // 收集所有止盈间隔
    const allIntervals: number[] = [];
    let totalRoundCount = 0;
    let totalFrequency = 0;
    
    for (const stat of stats) {
      totalRoundCount += stat.roundCount;
      totalFrequency += stat.frequency;
      for (const event of stat.events) {
        allIntervals.push(event.intervalCandles);
      }
    }
    
    const avgRoundsPerRun = totalRoundCount / numRuns;
    const avgFrequency = totalFrequency / numRuns;
    
    // 计算聚合统计
    let intervalStats: AggregatedTakeProfitStats['intervalStats'];
    
    if (allIntervals.length === 0) {
      intervalStats = {
        mean: null,
        median: null,
        std: null,
        min: null,
        max: null,
        p25: null,
        p50: null,
        p75: null,
        p95: null,
      };
    } else {
      const sorted = [...allIntervals].sort((a, b) => a - b);
      const n = sorted.length;
      const mean = allIntervals.reduce((sum, v) => sum + v, 0) / n;
      const variance = allIntervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
      const std = Math.sqrt(variance);
      
      const percentile = (p: number) => {
        const index = Math.floor(p * n);
        return sorted[Math.min(index, n - 1)];
      };
      
      intervalStats = {
        mean,
        median: percentile(0.5),
        std,
        min: sorted[0],
        max: sorted[n - 1],
        p25: percentile(0.25),
        p50: percentile(0.5),
        p75: percentile(0.75),
        p95: percentile(0.95),
      };
    }
    
    return {
      targetMultiplier,
      totalRoundCount,
      avgRoundsPerRun,
      intervalStats,
      avgFrequency,
    };
  }
}

// ============================================
// 导出（保持向后兼容性）
// ============================================

export { NewParadigmBacktestEngine as BacktestEngine };
export { NewParadigmExperimentRunner as ExperimentRunner };
