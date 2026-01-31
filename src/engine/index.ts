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
  /** 交易成本率 (成交额的固定比例, 如 0.0003 = 0.03%) */
  tradingCostRate?: number;
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
    
    // 获取交易成本率
    const tradingCostRate = this.config.tradingCostRate ?? 0;

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
      const currentDirection = positionManager.getCurrentDirection();
      const entryPrice = positionManager.getEntryPrice();

      // 处理信号
      if (signal.direction === 'close' && currentDirection !== 'hold' && entryPrice !== null) {
        // 平仓
        const exitPrice = candles[i].close;
        const pnlPercent = this.calculatePnL(currentDirection, entryPrice, exitPrice);
        const positionSize = positionManager.getPositionSize();
        const turnover = (entryPrice + exitPrice) * positionSize;
        const tradingCost = turnover * tradingCostRate;
        
        // 处理交易结果
        positionManager.processTradeResult(pnlPercent);
        
        // 扣除交易成本 (从资产倍率中扣除)
        if (tradingCost > 0) {
          positionManager.deductCost(tradingCost);
        }
        
        // 记录交易
        trades.push({
          index: i,
          direction: currentDirection,
          entryPrice,
          exitPrice,
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

        // 清除持仓
        positionManager.setPosition('hold', null);
      } 
      else if ((signal.direction === 'long' || signal.direction === 'short') && currentDirection === 'hold') {
        // 开仓
        positionManager.setPosition(signal.direction, candles[i].close);
      }
      else if ((signal.direction === 'long' && currentDirection === 'short') || 
               (signal.direction === 'short' && currentDirection === 'long')) {
        // 反向开仓: 先平仓再开仓
        if (entryPrice !== null) {
          const exitPrice = candles[i].close;
          const pnlPercent = this.calculatePnL(currentDirection, entryPrice, exitPrice);
          const positionSize = positionManager.getPositionSize();
          const turnover = (entryPrice + exitPrice) * positionSize;
          const tradingCost = turnover * tradingCostRate;
          
          positionManager.processTradeResult(pnlPercent);
          
          // 扣除交易成本
          if (tradingCost > 0) {
            positionManager.deductCost(tradingCost);
          }
          
          trades.push({
            index: i,
            direction: currentDirection,
            entryPrice,
            exitPrice,
            positionSize,
            pnlPercent,
            assetMultiplierAfter: positionManager.getState().assetMultiplier,
            turnover,
            tradingCost,
          });

          if (pnlPercent > 0) {
            winCount++;
            currentConsecutiveLosses = 0;
          } else if (pnlPercent < 0) {
            currentConsecutiveLosses++;
            maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentConsecutiveLosses);
          }
          maxConsecutiveWins = Math.max(maxConsecutiveWins, positionManager.getState().consecutiveWins);
        }
        
        // 开新仓
        positionManager.setPosition(signal.direction, candles[i].close);
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
    const finalDirection = positionManager.getCurrentDirection();
    const finalEntryPrice = positionManager.getEntryPrice();
    if (finalDirection !== 'hold' && finalEntryPrice !== null) {
      const exitPrice = candles[candles.length - 1].close;
      const pnlPercent = this.calculatePnL(finalDirection, finalEntryPrice, exitPrice);
      const positionSize = positionManager.getPositionSize();
      const turnover = (finalEntryPrice + exitPrice) * positionSize;
      const tradingCost = turnover * tradingCostRate;
      
      positionManager.processTradeResult(pnlPercent);
      
      // 扣除交易成本
      if (tradingCost > 0) {
        positionManager.deductCost(tradingCost);
      }
      
      trades.push({
        index: candles.length - 1,
        direction: finalDirection,
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
   */
  private calculatePnL(direction: 'long' | 'short' | 'close' | 'hold', entryPrice: number, exitPrice: number): number {
    if (direction === 'long') {
      return (exitPrice - entryPrice) / entryPrice;
    } else if (direction === 'short') {
      return (entryPrice - exitPrice) / entryPrice;
    }
    return 0;
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
