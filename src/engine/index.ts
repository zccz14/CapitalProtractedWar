/**
 * Backtest Engine - 回测引擎
 * 
 * 核心功能:
 * 1. 运行单次回测: 在给定K线上执行策略
 * 2. 跟踪资产倍率历史
 * 3. 记录交易和达到目标的时间
 * 4. 运行蒙特卡洛模拟
 */

import type { 
  Candle, 
  Signal,
  SignalStrategy, 
  BacktestResult, 
  TradeRecord,
  ExperimentConfig,
  ExperimentResult,
  MDistributionStats,
} from '../types.js';
import { AntiMartingalePositionManager, type AntiMartingaleConfig } from '../position/index.js';
import { createSignalStrategy } from '../signal/index.js';
import { generateMarket } from '../market/generator.js';

// ============================================
// 回测引擎配置
// ============================================

export interface BacktestEngineConfig {
  /** 目标倍率列表 */
  targetMultipliers: number[];
  /** 仓位管理配置 */
  positionConfig?: Partial<AntiMartingaleConfig>;
  /** 交易成本率 (基础成本率, 如 0.0005 = 0.05%) */
  tradingCostRate?: number;
  /** 杠杆倍数 (用于放大交易成本, 默认1) */
  leverage?: number;
}

// ============================================
// 回测引擎
// ============================================

export class BacktestEngine {
  private config: BacktestEngineConfig;

  constructor(config: BacktestEngineConfig) {
    this.config = config;
  }

  /**
   * 运行单次回测
   */
  run(candles: Candle[], strategy: SignalStrategy): BacktestResult {
    // 初始化仓位管理器
    const positionManager = new AntiMartingalePositionManager(this.config.positionConfig);
    strategy.reset();
    
    // 获取交易成本率和杠杆倍数
    const baseTradingCostRate = this.config.tradingCostRate ?? 0;
    const leverage = this.config.leverage ?? 1;
    // 实际交易成本率 = 基础成本率 × 杠杆倍数
    const effectiveTradingCostRate = baseTradingCostRate * leverage;

    // 初始化跟踪变量
    const multiplierHistory: number[] = [1]; // 初始倍率为1
    const trades: TradeRecord[] = [];
    const reachTargetIndices = new Map<number, number | null>();
    
    // 初始化目标倍率跟踪
    for (const target of this.config.targetMultipliers) {
      reachTargetIndices.set(target, null);
    }

    let winCount = 0;
    let maxConsecutiveWins = 0;
    let maxConsecutiveLosses = 0;
    let currentConsecutiveLosses = 0;

    // 遍历K线
    for (let i = 0; i < candles.length; i++) {
      const signal = strategy.generate(candles, i);
      const currentPosition = positionManager.getPosition();
      const entryPrice = positionManager.getEntryPrice();
      const currentPrice = candles[i].close;

      // 简化的交易逻辑: 只要目标仓位与当前仓位不同，就需要处理
      if (signal !== currentPosition) {
        // 1. 如果有现有仓位，先平仓
        if (currentPosition !== 0 && entryPrice !== null) {
          const pnlPercent = this.calculatePnL(currentPosition, entryPrice, currentPrice);
          const positionSize = positionManager.getPositionSize();
          const turnover = (entryPrice + currentPrice) * positionSize;
          const tradingCost = turnover * effectiveTradingCostRate;
          
          // 处理交易结果
          positionManager.processTradeResult(pnlPercent);
          
          // 扣除交易成本
          if (tradingCost > 0) {
            positionManager.deductCost(tradingCost);
          }
          
          // 记录交易
          trades.push({
            index: i,
            position: currentPosition,
            entryPrice,
            exitPrice: currentPrice,
            positionSize,
            pnlPercent,
            assetMultiplierAfter: positionManager.getState().assetMultiplier,
            turnover,
            tradingCost,
          });

          // 更新统计
          if (pnlPercent > 0) {
            winCount++;
            currentConsecutiveLosses = 0;
          } else if (pnlPercent < 0) {
            currentConsecutiveLosses++;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
          }
          maxConsecutiveWins = Math.max(maxConsecutiveWins, positionManager.getState().consecutiveWins);
        }

        // 2. 设置新仓位
        if (signal !== 0) {
          // 开新仓
          positionManager.setPosition(signal, currentPrice);
        } else {
          // 平仓后保持空仓
          positionManager.setPosition(0, null);
        }
      }

      // 记录当前资产倍率
      const currentMultiplier = positionManager.getState().assetMultiplier;
      multiplierHistory.push(currentMultiplier);

      // 检查是否达到目标倍率
      for (const target of this.config.targetMultipliers) {
        if (reachTargetIndices.get(target) === null && currentMultiplier >= target) {
          reachTargetIndices.set(target, i);
        }
      }
    }

    // 如果还有持仓,在最后平仓
    const finalPosition = positionManager.getPosition();
    const finalEntryPrice = positionManager.getEntryPrice();
    if (finalPosition !== 0 && finalEntryPrice !== null) {
      const exitPrice = candles[candles.length - 1].close;
      const pnlPercent = this.calculatePnL(finalPosition, finalEntryPrice, exitPrice);
      const positionSize = positionManager.getPositionSize();
      const turnover = (finalEntryPrice + exitPrice) * positionSize;
      const tradingCost = turnover * effectiveTradingCostRate;
      
      positionManager.processTradeResult(pnlPercent);
      
      // 扣除交易成本
      if (tradingCost > 0) {
        positionManager.deductCost(tradingCost);
      }
      
      trades.push({
        index: candles.length - 1,
        position: finalPosition,
        entryPrice: finalEntryPrice,
        exitPrice,
        positionSize,
        pnlPercent,
        assetMultiplierAfter: positionManager.getState().assetMultiplier,
        turnover,
        tradingCost,
      });

      if (pnlPercent > 0) {
        winCount++;
      } else if (pnlPercent < 0) {
        currentConsecutiveLosses++;
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
      }
    }

    const state = positionManager.getState();
    
    // 计算总成交额和总交易成本
    const totalTurnover = trades.reduce((sum, t) => sum + t.turnover, 0);
    const totalTradingCost = trades.reduce((sum, t) => sum + t.tradingCost, 0);
    
    return {
      peakMultiplier: state.peakMultiplier,
      finalMultiplier: state.assetMultiplier,
      tradeCount: trades.length,
      winCount,
      winRate: trades.length > 0 ? winCount / trades.length : 0,
      maxConsecutiveWins,
      maxConsecutiveLosses,
      multiplierHistory,
      trades,
      reachTargetIndices,
      totalTurnover,
      totalTradingCost,
    };
  }

  /**
   * 计算盈亏百分比
   * 
   * @param position - 持仓方向: 1=多, -1=空
   * @param entryPrice - 入场价格
   * @param exitPrice - 出场价格
   * @returns 盈亏百分比
   */
  private calculatePnL(position: number, entryPrice: number, exitPrice: number): number {
    // PnL = position * (exitPrice - entryPrice) / entryPrice
    return position * (exitPrice - entryPrice) / entryPrice;
  }
}

// ============================================
// 蒙特卡洛实验运行器
// ============================================

export class ExperimentRunner {
  /**
   * 运行实验
   */
  async run(config: ExperimentConfig): Promise<ExperimentResult> {
    const startTime = Date.now();
    
    const backtestResults: BacktestResult[] = [];
    const peakMultipliers: number[] = [];
    
    // 保存样本数据用于可视化 (保存最好、中位、最差的样本)
    const sampleData: Array<{
      candles: Candle[];
      multiplierHistory: number[];
      peakMultiplier: number;
      index: number;
    }> = [];
    
    const engine = new BacktestEngine({
      targetMultipliers: config.targetMultipliers,
      tradingCostRate: config.tradingCostRate,
      leverage: config.market.leverage,
    });

    // 运行蒙特卡洛模拟
    for (let i = 0; i < config.monteCarloRuns; i++) {
      // 生成市场数据 (每次使用不同种子)
      const marketConfig = {
        ...config.market,
        seed: config.market.seed !== undefined ? config.market.seed + i : undefined,
      };
      const candles = generateMarket(marketConfig);
      
      // 创建信号策略 (每次重置)
      const seedOffset = config.signal.params?.seed !== undefined ? i : 0;
      const strategy = createSignalStrategy({
        ...config.signal,
        params: config.signal.params?.seed !== undefined 
          ? { ...config.signal.params, seed: (config.signal.params.seed as number) + seedOffset }
          : config.signal.params,
      });
      
      // 运行回测
      const result = engine.run(candles, strategy);
      backtestResults.push(result);
      peakMultipliers.push(result.peakMultiplier);
      
      // 保存样本数据 (保存前5个和一些有代表性的)
      if (i < 3 || result.peakMultiplier > 10 || result.peakMultiplier > (sampleData[0]?.peakMultiplier ?? 0)) {
        sampleData.push({
          candles,
          multiplierHistory: result.multiplierHistory,
          peakMultiplier: result.peakMultiplier,
          index: i,
        });
        // 只保留最多6个样本，按峰值倍率排序
        if (sampleData.length > 6) {
          sampleData.sort((a, b) => b.peakMultiplier - a.peakMultiplier);
          sampleData.length = 6;
        }
      }
    }

    // 计算统计数据
    const mDistribution = this.calculateDistributionStats(peakMultipliers);
    
    // 计算达到目标的概率和平均时间
    const reachProbabilities = new Map<number, number>();
    const avgTradesToReach = new Map<number, number | null>();
    const avgCandlesToReach = new Map<number, number | null>();
    
    for (const target of config.targetMultipliers) {
      let reachCount = 0;
      let totalTrades = 0;
      let totalCandles = 0;
      
      for (const result of backtestResults) {
        const reachIndex = result.reachTargetIndices.get(target);
        if (reachIndex !== null && reachIndex !== undefined) {
          reachCount++;
          // 计算达到目标时的交易次数
          const tradesBeforeTarget = result.trades.filter(t => t.index <= reachIndex).length;
          totalTrades += tradesBeforeTarget;
          totalCandles += reachIndex;
        }
      }
      
      const probability = reachCount / config.monteCarloRuns;
      reachProbabilities.set(target, probability);
      
      if (reachCount > 0) {
        avgTradesToReach.set(target, totalTrades / reachCount);
        avgCandlesToReach.set(target, totalCandles / reachCount);
      } else {
        avgTradesToReach.set(target, null);
        avgCandlesToReach.set(target, null);
      }
    }

    // 计算平均胜率和最大连胜
    const avgWinRate = backtestResults.reduce((sum, r) => sum + r.winRate, 0) / config.monteCarloRuns;
    const avgMaxConsecutiveWins = backtestResults.reduce((sum, r) => sum + r.maxConsecutiveWins, 0) / config.monteCarloRuns;
    
    // 计算平均总成交额
    const avgTotalTurnover = backtestResults.reduce((sum, r) => sum + r.totalTurnover, 0) / config.monteCarloRuns;
    
    // 计算平均总交易成本
    const avgTotalTradingCost = backtestResults.reduce((sum, r) => sum + r.totalTradingCost, 0) / config.monteCarloRuns;

    const elapsedMs = Date.now() - startTime;

    // 准备样本运行数据
    const sampleRuns = sampleData.map(s => ({
      candles: s.candles,
      multiplierHistory: s.multiplierHistory,
      peakMultiplier: s.peakMultiplier,
    }));

    return {
      config,
      mDistribution,
      peakMultipliers,
      reachProbabilities,
      avgTradesToReach,
      avgCandlesToReach,
      avgWinRate,
      avgMaxConsecutiveWins,
      avgTotalTurnover,
      avgTotalTradingCost,
      elapsedMs,
      sampleRuns,
    };
  }

  /**
   * 计算分布统计
   */
  private calculateDistributionStats(values: number[]): MDistributionStats {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    
    const mean = values.reduce((sum, v) => sum + v, 0) / n;
    const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
    const std = Math.sqrt(variance);
    
    const percentile = (p: number) => {
      const index = Math.floor(p * n);
      return sorted[Math.min(index, n - 1)];
    };

    return {
      mean,
      median: percentile(0.5),
      std,
      min: sorted[0],
      max: sorted[n - 1],
      percentiles: {
        p5: percentile(0.05),
        p25: percentile(0.25),
        p50: percentile(0.5),
        p75: percentile(0.75),
        p95: percentile(0.95),
        p99: percentile(0.99),
      },
    };
  }
}
