/**
 * Phase 1: 运行所有组合
 *
 * 执行所有 (market, signal, betting) 组合的单次运行，
 * 每次运行完成后立即写入文件并释放内存。
 */

import { runOnce } from '../../engine/index.js';
import {
  generateMarketId,
  generateSignalId,
  generateBettingId,
  generateConfigHash,
  isRunCacheValid,
  getRunResultPath,
  writeRunResult,
} from '../../cache/index.js';
import type { FullExperimentConfig } from '../../cache/types.js';
import type { MarketConfig } from '../../types.js';

export interface Phase1Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
  marketGroup?: string;
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
  const { config, force, verbose, marketGroup } = options;
  const { outputDir, baseSeed, monteCarloRuns } = config;

  let totalRuns = 0;
  let cachedRuns = 0;
  let newRuns = 0;

  const totalCombinations =
    config.volatilities.length * config.drifts.length * monteCarloRuns * config.signals.length;
  let processed = 0;

  console.log(`Phase 1: 运行所有组合 (共 ${totalCombinations} 个)`);

  for (const volatility of config.volatilities) {
    for (const drift of config.drifts) {
      // 检查是否只处理指定市场组
      const testMarketGroupId = `gbm_vol${(volatility * 100).toFixed(0)}_drift${(drift * 100).toFixed(0)}_n${config.candleCount}`;
      if (marketGroup && testMarketGroupId !== marketGroup) {
        continue;
      }

      for (let seedOffset = 0; seedOffset < monteCarloRuns; seedOffset++) {
        const marketConfig: MarketConfig = {
          type: 'gbm',
          volatility,
          drift,
          candleCount: config.candleCount,
          seed: baseSeed + seedOffset,
        };
        const marketId = generateMarketId(marketConfig);

        for (const signalConfig of config.signals) {
          const signalId = generateSignalId(signalConfig);
          const bettingId = generateBettingId(config.betting);

          const runPath = getRunResultPath(outputDir, marketId, signalId, bettingId);
          const configHash = generateConfigHash(marketConfig, signalConfig, config.betting);

          totalRuns++;
          processed++;

          // 检查缓存
          if (isRunCacheValid(runPath, configHash, force)) {
            cachedRuns++;
            if (verbose) {
              console.log(
                `  [${processed}/${totalCombinations}] 缓存命中: ${marketId}/${signalId}`
              );
            }
            continue;
          }

          // 运行（不记录曲线数据）
          const { stats } = runOnce(marketConfig, signalConfig, config.betting, false);

          // 写入文件
          writeRunResult(
            runPath,
            {
              market: marketConfig,
              signal: signalConfig,
              betting: config.betting,
            },
            stats
          );

          newRuns++;

          if (verbose || newRuns % 100 === 0) {
            console.log(`  [${processed}/${totalCombinations}] 完成: ${marketId}/${signalId}`);
          }
        }
      }

      // 每完成一个 (volatility, drift) 组合，打印进度
      if (!verbose) {
        const vol = (volatility * 100).toFixed(0);
        const dft = (drift * 100).toFixed(0);
        console.log(`  市场组 vol${vol}_drift${dft}: ${newRuns} 新运行, ${cachedRuns} 缓存命中`);
      }
    }
  }

  console.log(`Phase 1 完成: ${newRuns} 新运行, ${cachedRuns} 缓存命中, 共 ${totalRuns} 个组合`);

  return { totalRuns, cachedRuns, newRuns };
}
