/**
 * Phase 1: 运行所有组合
 *
 * 执行所有 (market, signal, betting) 组合的单次运行，
 * 每次运行完成后立即写入文件并释放内存。
 */

import { runOnce } from '../../engine/index.js';
import {
  generateMarketId,
  generateMarketGroupId,
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

  const totalCombinations = config.markets.reduce(
    (sum, t) =>
      sum + t.volatilities.length * t.drifts.length * t.monteCarloRuns * config.signals.length,
    0
  );
  let processed = 0;

  console.log(`Phase 1: 运行所有组合 (共 ${totalCombinations} 个)`);

  for (const template of config.markets) {
    for (const volatility of template.volatilities) {
      for (const drift of template.drifts) {
        for (let seedOffset = 0; seedOffset < template.monteCarloRuns; seedOffset++) {
          const marketConfig: MarketConfig = {
            type: template.generator,
            volatility,
            drift,
            candleCount: template.candleCount,
            seed: template.baseSeed + seedOffset,
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
          const marketGroupId = generateMarketGroupId({
            type: template.generator,
            volatility,
            drift,
            candleCount: template.candleCount,
          });
          console.log(`  市场组 ${marketGroupId}: ${newRuns} 新运行, ${cachedRuns} 缓存命中`);
        }
      }
    }
  }

  console.log(`Phase 1 完成: ${newRuns} 新运行, ${cachedRuns} 缓存命中, 共 ${totalRuns} 个组合`);

  return { totalRuns, cachedRuns, newRuns };
}
