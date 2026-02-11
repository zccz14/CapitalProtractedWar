/**
 * Phase 1: 运行所有组合
 *
 * 遍历 manifest 中的所有市场组和序列，
 * 从 CSV 读取 candles，执行所有 (series, signal, betting) 组合的单次运行。
 */

import { runOnce } from '../../engine/index.js';
import {
  generateSignalId,
  generateBettingId,
  generateConfigHash,
  isRunCacheValid,
  getRunResultPath,
  writeRunResult,
} from '../../cache/index.js';
import type { FullExperimentConfig } from '../../cache/types.js';
import { readManifest } from '../../market/manifest.js';
import { readCandlesCSV, getMarketCSVPath } from '../../market/csv.js';
import { isSignalApplicableToGroup } from './index.js';

export interface Phase1Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
}

export interface Phase1Result {
  totalRuns: number;
  cachedRuns: number;
  newRuns: number;
}

/**
 * 执行 Phase 1: 运行所有组合
 */
export async function runPhase1(options: Phase1Options): Promise<Phase1Result> {
  const { config, force, verbose } = options;
  const { outputDir } = config;

  let totalRuns = 0;
  let cachedRuns = 0;
  let newRuns = 0;

  // 读取 manifest
  const manifest = readManifest(outputDir);

  const totalCombinations = manifest.groups.reduce(
    (sum, g) =>
      sum +
      g.seriesIds.length * config.signals.filter((s) => isSignalApplicableToGroup(s, g)).length,
    0
  );
  let processed = 0;

  console.log(`Phase 1: 运行所有组合 (共 ${totalCombinations} 个)`);

  for (const group of manifest.groups) {
    for (const seriesId of group.seriesIds) {
      // 延迟加载 candles（只在需要时读取）
      let candles: import('../../types.js').Candle[] | null = null;

      for (const signalConfig of config.signals) {
        // 检查信号是否适用于当前市场组
        if (!isSignalApplicableToGroup(signalConfig, group)) continue;

        const signalId = generateSignalId(signalConfig);
        const bettingId = generateBettingId(config.betting);

        const runPath = getRunResultPath(outputDir, seriesId, signalId, bettingId);
        const configHash = generateConfigHash(seriesId, signalConfig, config.betting);

        totalRuns++;
        processed++;

        // 检查缓存
        if (isRunCacheValid(runPath, configHash, force)) {
          cachedRuns++;
          if (verbose) {
            console.log(`  [${processed}/${totalCombinations}] 缓存命中: ${seriesId}/${signalId}`);
          }
          continue;
        }

        // 延迟加载 candles
        if (!candles) {
          const csvPath = getMarketCSVPath(outputDir, seriesId);
          candles = readCandlesCSV(csvPath);
        }

        // 运行（不记录曲线数据）
        const { stats } = runOnce(candles, signalConfig, config.betting, false);

        // 写入文件
        writeRunResult(
          runPath,
          {
            seriesId,
            signal: signalConfig,
            betting: config.betting,
          },
          stats
        );

        newRuns++;

        if (verbose || newRuns % 100 === 0) {
          console.log(`  [${processed}/${totalCombinations}] 完成: ${seriesId}/${signalId}`);
        }
      }
    }

    // 每完成一个市场组，打印进度
    if (!verbose) {
      console.log(`  市场组 ${group.groupId}: ${newRuns} 新运行, ${cachedRuns} 缓存命中`);
    }
  }

  console.log(`Phase 1 完成: ${newRuns} 新运行, ${cachedRuns} 缓存命中, 共 ${totalRuns} 个组合`);

  return { totalRuns, cachedRuns, newRuns };
}
