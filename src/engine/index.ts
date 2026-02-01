/**
 * New Paradigm Backtest Engine - 新范式回测引擎
 * 
 * 核心架构：
 * 1. 市场序列生成一次，复用于所有信号策略
 * 2. 信号序列生成一次，复用于所有投注策略（不同 M_T）
 * 3. 多账户并行追踪，各账户独立止盈、独立重置
 * 
 * 重要变更（双账户架构）：
 * - 基准账户（BaselineTracker）：固定仓位=1，计算 C 值
 * - 反马丁账户（MultiAccountTracker）：参考基准账户的 C 值
 * - 成交价格：使用下一根K线开盘价（非当前收盘价）
 * - 观察期：C=0 时为观察期，反马丁账户实际仓位=0
 * 
 * 评估指标变化：
 * - 不再关注 E[M]（易被极端值影响）
 * - 不再关注 P(M >= k)（时间拉长总能成功）
 * - 核心关注：各 M_T 下止盈事件的平均时间间隔
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
} from '../types.js';
import { MultiAccountTracker } from '../betting/index.js';
import { BaselineTracker } from '../betting/baseline-tracker.js';
import { createSignalStrategy } from '../signal/index.js';
import { generateMarket } from '../market/generator.js';

// ============================================
// 新范式回测引擎
// ============================================

export class NewParadigmBacktestEngine {
  /**
   * 评估单个信号策略在给定市场上的表现
   * 
   * 重构说明（双账户架构）：
   * 1. 基准账户（BaselineTracker）：
   *    - 固定仓位 = 1
   *    - 连续运行，不止盈/止损
   *    - 计算 C 值（最大亏损速度）
   *    - 记录基准净值曲线
   * 
   * 2. 反马丁账户（MultiAccountTracker）：
   *    - 参考基准账户的 C 值
   *    - C = 0 时为观察期，实际仓位 = 0
   *    - 实盘期使用反马丁格尔仓位管理
   * 
   * 3. 成交价格改进：
   *    - 信号在当前K线产生
   *    - 成交在下一根K线开盘价执行
   * 
   * @param candles - 市场K线序列
   * @param strategy - 信号策略
   * @param tracker - 多账户追踪器
   * @param recordSample - 是否记录样本数据（用于可视化）
   * @returns 信号策略评估结果和可选的样本数据
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
    
    // 启用样本记录（必须在 setTotalCandles 之前调用）
    if (recordSample) {
      tracker.enableSampleRecording();
    }
    
    tracker.setTotalCandles(candles.length);
    
    // ============================================
    // 信号和交易状态变量
    // ============================================
    
    /** 当前持仓：1=多, 0=空仓, -1=空 */
    let currentPosition = 0;
    
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
      // 步骤1：处理上一根K线的待执行信号（使用当前K线开盘价成交）
      // ============================================
      if (pendingSignal !== null && pendingSignalIndex !== null) {
        const executionPrice = candle.open;  // 使用当前K线开盘价成交
        
        // 1a. 如果有持仓，先平仓
        if (currentPosition !== 0 && entryPrice !== null && entryIndex !== null && entrySignalIndex !== null) {
          const pnlPercent = this.calculatePnL(currentPosition, entryPrice, executionPrice);
          const holdingPeriod = i - entryIndex;
          
          // 先更新基准账户（计算 C 值）
          baseline.processTradeResult(pnlPercent, i, holdingPeriod, totalTradeCount);
          const externalC = baseline.getEstimatedC();
          
          // 再更新反马丁账户（使用基准账户的 C 值）
          tracker.processTradeResult(
            pnlPercent, 
            i, 
            entryPrice, 
            executionPrice, 
            entryIndex, 
            totalTradeCount,
            externalC
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
            });
          }
          
          // 统计
          totalTradeCount++;
          if (pnlPercent > 0) winCount++;
        }
        
        // 1b. 开新仓
        if (pendingSignal !== 0) {
          currentPosition = pendingSignal;
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
    // 处理最后一笔待执行信号（如果K线已结束）
    // 注意：实际中最后一个信号无法执行（没有下一根K线的开盘价）
    // 但为了完整性，我们用最后K线的收盘价处理未平仓交易
    // ============================================
    if (currentPosition !== 0 && entryPrice !== null && entryIndex !== null && entrySignalIndex !== null) {
      const exitPrice = candles[candles.length - 1].close;
      const exitIndex = candles.length - 1;
      const pnlPercent = this.calculatePnL(currentPosition, entryPrice, exitPrice);
      const holdingPeriod = exitIndex - entryIndex;
      
      // 先更新基准账户
      baseline.processTradeResult(pnlPercent, exitIndex, holdingPeriod, totalTradeCount);
      const externalC = baseline.getEstimatedC();
      
      // 再更新反马丁账户
      tracker.processTradeResult(
        pnlPercent, 
        exitIndex, 
        entryPrice, 
        exitPrice, 
        entryIndex, 
        totalTradeCount,
        externalC
      );
      
      // 记录交易
      if (recordSample) {
        trades.push({
          tradeIndex: totalTradeCount,
          signalIndex: entrySignalIndex,
          entryIndex: entryIndex,
          exitSignalIndex: exitIndex,  // 强制平仓，没有真正的退出信号
          exitIndex: exitIndex,
          direction: currentPosition as 1 | -1,
          entryPrice,
          exitPrice,
          holdingPeriod,
          pnlPercent,
          isWin: pnlPercent > 0,
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
        multiplierCurves: tracker.getMultiplierCurves(),
        takeProfitMarkers: tracker.getTakeProfitMarkers(),
        stopLossMarkers: tracker.getStopLossMarkers(),
        riskLineCurves: tracker.getRiskLineCurves(),
        observationEndIndices: tracker.getObservationEndIndices(),
        estimatedCCurves: tracker.getEstimatedCCurves(),
        equityCurves: tracker.getEquityCurves(),
        // 新增：完整样本数据
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
      // 是否记录样本数据（只记录前3次运行）
      const recordSample = runIndex < 3;
      
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
        const tracker = new MultiAccountTracker(
          config.betting,
          config.market.leverage ?? 1
        );
        
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
      };
      
      // 只为前3次运行保存样本数据
      if (recordSample) {
        runResult.sampleData = sampleDataMap;
      }
      
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
      // 保存少量样本用于可视化
      sampleRuns: allRunResults.slice(0, 3),
    };
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

// 旧的引擎类型别名
export { NewParadigmBacktestEngine as BacktestEngine };
export { NewParadigmExperimentRunner as ExperimentRunner };
