/**
 * Phase 2: 聚合结果
 *
 * 将同一市场条件组（相同波动率+漂移率，不同种子）的运行结果聚合成统计量。
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateMarketId,
  generateSignalId,
  generateBettingId,
  getRunResultPath,
  getAggregatedResultPath,
  readRunResult,
  writeAggregatedResult,
  isAggregationCacheValid,
  calculateStats,
} from '../../cache/index.js';
import type {
  FullExperimentConfig,
  AggregatedResult,
  RunStats,
  SampleIndex,
} from '../../cache/types.js';
import type { MarketConfig } from '../../types.js';

export interface Phase2Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
}

export interface Phase2Result {
  totalAggregations: number;
  cachedAggregations: number;
  newAggregations: number;
}

/**
 * 执行 Phase 2: 聚合结果
 */
export async function runPhase2(options: Phase2Options): Promise<Phase2Result> {
  const { config, force, verbose } = options;
  const { outputDir, baseSeed, monteCarloRuns } = config;

  let totalAggregations = 0;
  let cachedAggregations = 0;
  let newAggregations = 0;

  console.log('Phase 2: 聚合结果');

  for (const volatility of config.volatilities) {
    for (const drift of config.drifts) {
      const marketGroupId = `gbm_vol${(volatility * 100).toFixed(0)}_drift${(drift * 100).toFixed(0)}_n${config.candleCount}`;

      for (const signalConfig of config.signals) {
        const signalId = generateSignalId(signalConfig);
        const bettingId = generateBettingId(config.betting);

        const aggPath = getAggregatedResultPath(outputDir, marketGroupId, signalId, bettingId);
        const runsDir = path.join(outputDir, 'runs');

        totalAggregations++;

        // 检查聚合缓存
        if (isAggregationCacheValid(aggPath, runsDir, force)) {
          cachedAggregations++;
          if (verbose) {
            console.log(`  缓存命中: ${marketGroupId}/${signalId}`);
          }
          continue;
        }

        // 读取所有相关的 run 文件
        const runs: { marketId: string; stats: RunStats }[] = [];

        for (let seedOffset = 0; seedOffset < monteCarloRuns; seedOffset++) {
          const marketConfig: MarketConfig = {
            type: 'gbm',
            volatility,
            drift,
            candleCount: config.candleCount,
            seed: baseSeed + seedOffset,
          };
          const marketId = generateMarketId(marketConfig);
          const runPath = getRunResultPath(outputDir, marketId, signalId, bettingId);

          if (fs.existsSync(runPath)) {
            const runFile = readRunResult(runPath);
            runs.push({ marketId, stats: runFile.result });
          }
        }

        if (runs.length === 0) {
          console.warn(`  警告: ${marketGroupId}/${signalId} 没有找到运行结果`);
          continue;
        }

        // 聚合
        const aggregated = aggregateRuns(runs, marketGroupId, signalId, bettingId);

        // 写入
        writeAggregatedResult(aggPath, aggregated);

        newAggregations++;

        if (verbose) {
          console.log(`  完成: ${marketGroupId}/${signalId} (${runs.length} 次运行)`);
        }
      }

      if (!verbose) {
        console.log(`  市场组 ${marketGroupId}: 聚合完成`);
      }
    }
  }

  console.log(`Phase 2 完成: ${newAggregations} 新聚合, ${cachedAggregations} 缓存命中`);

  return { totalAggregations, cachedAggregations, newAggregations };
}

/**
 * 聚合多次运行的结果
 */
function aggregateRuns(
  runs: { marketId: string; stats: RunStats }[],
  marketGroupId: string,
  signalId: string,
  bettingId: string
): AggregatedResult {
  const n = runs.length;

  // 计算平均胜率和交易数
  const avgWinRate = runs.reduce((sum, r) => sum + r.stats.winRate, 0) / n;
  const avgTradeCount = runs.reduce((sum, r) => sum + r.stats.totalTradeCount, 0) / n;

  // 聚合各 M_T 的统计
  const targetSet = new Set<number>();
  for (const run of runs) {
    for (const stat of run.stats.takeProfitStats) {
      targetSet.add(stat.targetMultiplier);
    }
  }

  const takeProfitStats = Array.from(targetSet)
    .sort((a, b) => a - b)
    .map((target) => {
      // 收集所有间隔
      const allIntervals: number[] = [];
      let totalRoundCount = 0;
      let totalFrequency = 0;

      for (const run of runs) {
        const stat = run.stats.takeProfitStats.find((s) => s.targetMultiplier === target);
        if (stat) {
          totalRoundCount += stat.roundCount;
          totalFrequency += stat.frequency;
          allIntervals.push(...stat.intervals);
        }
      }

      const intervalStats = calculateStats(allIntervals);

      return {
        targetMultiplier: target,
        totalRoundCount,
        avgRoundsPerRun: totalRoundCount / n,
        intervalStats,
        avgFrequency: totalFrequency / n,
      };
    });

  // 选择代表性样本
  const sampleIndices = selectRepresentativeSamples(runs);

  return {
    marketGroupId,
    signalId,
    bettingId,
    runCount: n,
    avgWinRate,
    avgTradeCount,
    takeProfitStats,
    sampleIndices,
  };
}

/**
 * 选择代表性样本（best/median/worst）
 */
function selectRepresentativeSamples(runs: { marketId: string; stats: RunStats }[]): {
  best: SampleIndex;
  median: SampleIndex;
  worst: SampleIndex;
} {
  // 按 baselineFinalPnL 排序
  const sorted = [...runs].sort((a, b) => a.stats.baselineFinalPnL - b.stats.baselineFinalPnL);
  const n = sorted.length;

  const worst = sorted[0];
  const median = sorted[Math.floor(n / 2)];
  const best = sorted[n - 1];

  return {
    best: { marketId: best.marketId, baselinePnL: best.stats.baselineFinalPnL },
    median: { marketId: median.marketId, baselinePnL: median.stats.baselineFinalPnL },
    worst: { marketId: worst.marketId, baselinePnL: worst.stats.baselineFinalPnL },
  };
}
