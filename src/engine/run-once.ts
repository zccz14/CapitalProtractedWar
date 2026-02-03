/**
 * 单次运行函数（用于缓存系统）
 *
 * 这是缓存系统的核心函数，用于执行单个 (market, signal, betting) 组合的运行。
 */

import type {
  MarketConfig,
  SignalStrategyConfig,
  BettingStrategyConfig,
  SampleRunData,
} from '../types.js';
import type { RunStats, TakeProfitStatsSummary } from '../cache/types.js';
import { MultiAccountTracker } from '../betting/index.js';
import { createSignalStrategy } from '../signal/index.js';
import { generateMarket } from '../market/generator.js';
import { evaluateSignalStrategy } from './backtest-engine.js';

/**
 * 单次运行结果
 */
export interface SingleRunResult {
  /** 统计摘要（用于缓存） */
  stats: RunStats;
  /** 样本数据（可选，仅当 recordSample=true 时） */
  sampleData?: SampleRunData;
}

/**
 * 运行单次实验
 *
 * 这是缓存系统的核心函数，用于执行单个 (market, signal, betting) 组合的运行。
 *
 * @param marketConfig - 市场配置（包含种子）
 * @param signalConfig - 信号策略配置
 * @param bettingConfig - 投注策略配置
 * @param recordSample - 是否记录完整曲线数据
 * @returns 运行结果
 */
export function runOnce(
  marketConfig: MarketConfig,
  signalConfig: SignalStrategyConfig,
  bettingConfig: BettingStrategyConfig,
  recordSample: boolean = false
): SingleRunResult {
  // 1. 生成市场序列
  const candles = generateMarket(marketConfig);

  // 2. 创建信号策略
  const strategy = createSignalStrategy(signalConfig);

  // 3. 创建多账户追踪器
  const tracker = new MultiAccountTracker(bettingConfig);

  // 4. 评估
  const { result, sampleData } = evaluateSignalStrategy(candles, strategy, tracker, recordSample);

  // 5. 转换为缓存格式
  const takeProfitStats: TakeProfitStatsSummary[] = [];
  for (const [target, stat] of result.takeProfitStats) {
    takeProfitStats.push({
      targetMultiplier: target,
      roundCount: stat.roundCount,
      intervals: stat.events.map((e) => e.intervalCandles),
      frequency: stat.frequency,
    });
  }

  // 获取基准账户最终 PnL（从评估结果中获取，不依赖 sampleData）
  const baselineFinalPnL = result.baselineFinalPnL;

  const stats: RunStats = {
    signalType: result.signalType,
    totalTradeCount: result.totalTradeCount,
    totalCandles: result.totalCandles,
    winRate: result.winRate,
    takeProfitStats,
    baselineFinalPnL,
  };

  return { stats, sampleData };
}
