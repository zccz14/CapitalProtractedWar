/**
 * Experiment Runner - 实验运行器
 *
 * 负责运行完整的蒙特卡洛实验，包括：
 * - 多次 MC 运行
 * - 结果聚合
 * - 代表性样本选择
 */

import type {
  ExperimentConfig,
  ExperimentResult,
  SignalEvaluationResult,
  MonteCarloRunResult,
  AggregatedSignalResult,
  AggregatedTakeProfitStats,
  TakeProfitTargetStats,
  SampleRunData,
  SampleMetadata,
} from '../types.js';
import { MultiAccountTracker } from '../betting/index.js';
import { createSignalStrategy } from '../signal/index.js';
import { generateMarket } from '../market/generator.js';
import { evaluateSignalStrategy } from './backtest-engine.js';

/**
 * 为每个信号策略选择代表性样本（最佳/中位/最差）
 *
 * 基于基准账户 PnL（仓位=1）进行排序选择
 */
function selectRepresentativeSamples(
  allRunResults: MonteCarloRunResult[],
  config: ExperimentConfig
): MonteCarloRunResult[] {
  const signalTypes = config.signals.map((s) => s.type);

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
    const rankings = signalRankings.get(signalType);
    if (!rankings) continue;
    const n = rankings.length;

    const worstIdx = rankings[0].idx;
    const medianIdx = rankings[Math.floor(n / 2)].idx;
    const bestIdx = rankings[n - 1].idx;

    // 记录每个索引对应的样本类型
    for (const [idx, type] of [
      [worstIdx, 'worst'],
      [medianIdx, 'median'],
      [bestIdx, 'best'],
    ] as const) {
      if (!selectedIndicesMap.has(idx)) {
        selectedIndicesMap.set(idx, new Map());
      }
      const typeMap = selectedIndicesMap.get(idx);
      if (typeMap) {
        typeMap.set(signalType, type);
      }
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
 * 聚合单个 M_T 在多次运行中的统计
 */
function aggregateTakeProfitStats(
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

    const percentile = (p: number): number => {
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

/**
 * 聚合多次 MC 运行的结果
 */
function aggregateResults(
  runResults: MonteCarloRunResult[],
  config: ExperimentConfig
): AggregatedSignalResult[] {
  const numRuns = runResults.length;
  const signalTypes = config.signals.map((s) => s.type);

  return signalTypes.map((signalType, signalIndex) => {
    // 收集该信号策略在所有运行中的结果
    const signalRunResults = runResults.map((r) => r.signalResults[signalIndex]);

    // 计算平均胜率和交易数
    const avgWinRate = signalRunResults.reduce((sum, r) => sum + r.winRate, 0) / numRuns;
    const avgTradeCount = signalRunResults.reduce((sum, r) => sum + r.totalTradeCount, 0) / numRuns;

    // 聚合各 M_T 的统计
    const takeProfitStats = new Map<number, AggregatedTakeProfitStats>();

    for (const target of config.betting.takeProfitTargets) {
      const stats = signalRunResults.map((r) => r.takeProfitStats.get(target));
      const validStats = stats.filter((s): s is NonNullable<typeof s> => s !== undefined);
      if (validStats.length === 0) continue;
      const aggregated = aggregateTakeProfitStats(validStats, target);
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
 * 运行完整实验
 */
export async function runExperiment(config: ExperimentConfig): Promise<ExperimentResult> {
  const startTime = Date.now();

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
        params:
          signalConfig.params?.seed !== undefined
            ? { ...signalConfig.params, seed: (signalConfig.params.seed as number) + seedOffset }
            : signalConfig.params,
      });

      // 创建多账户追踪器（每个信号策略独立）
      const tracker = new MultiAccountTracker(config.betting);

      // 评估
      const { result, sampleData } = evaluateSignalStrategy(
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
  const aggregatedResults = aggregateResults(allRunResults, config);

  const elapsedMs = Date.now() - startTime;

  return {
    config,
    signalResults: aggregatedResults,
    monteCarloRuns: config.monteCarloRuns,
    candlesPerRun: config.market.candleCount,
    elapsedMs,
    // 选择代表性样本用于可视化
    sampleRuns: selectRepresentativeSamples(allRunResults, config),
  };
}
