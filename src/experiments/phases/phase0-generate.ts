/**
 * Phase 0: 生成市场序列
 *
 * 唯一遍历 config.markets 模板，展开 volatilities × drifts × seeds 笛卡尔积。
 * 唯一知道 volatility/drift 语义的地方。
 *
 * 输出：
 * - {outputDir}/markets/{seriesId}.csv（每个市场序列一个文件）
 * - {outputDir}/markets/manifest.json
 */

import * as fs from 'fs';
import { generateMarketId, generateMarketGroupId } from '../../cache/index.js';
import { generateMarket } from '../../market/generator.js';
import { writeCandlesCSV, getMarketCSVPath } from '../../market/csv.js';
import {
  writeManifest,
  type MarketManifest,
  type MarketGroupEntry,
} from '../../market/manifest.js';
import type { FullExperimentConfig } from '../../cache/types.js';
import type { MarketConfig } from '../../types.js';

export interface Phase0Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
}

export interface Phase0Result {
  totalSeries: number;
  cachedSeries: number;
  newSeries: number;
  groupCount: number;
}

/**
 * 执行 Phase 0: 生成市场序列
 */
export async function runPhase0(options: Phase0Options): Promise<Phase0Result> {
  const { config, force, verbose } = options;
  const { outputDir } = config;

  let totalSeries = 0;
  let cachedSeries = 0;
  let newSeries = 0;

  const groups: MarketGroupEntry[] = [];

  console.log('Phase 0: 生成市场序列 (CSV + manifest)');

  for (const template of config.markets) {
    for (const volatility of template.volatilities) {
      for (const drift of template.drifts) {
        const groupId = generateMarketGroupId({
          type: template.generator,
          volatility,
          drift,
          candleCount: template.candleCount,
        });

        const name = `vol${(volatility * 100).toFixed(0)}_drift${((drift ?? 0) * 100).toFixed(0)}`;
        const description = `${template.generator.toUpperCase()} | σ=${(volatility * 100).toFixed(1)}% | μ=${((drift ?? 0) * 100).toFixed(1)}%`;
        const metadata: Record<string, string> = {
          市场类型: template.generator.toUpperCase(),
          波动率: `${(volatility * 100).toFixed(1)}%`,
          漂移率: `${((drift ?? 0) * 100).toFixed(1)}%`,
        };

        const seriesIds: string[] = [];

        for (let seedOffset = 0; seedOffset < template.monteCarloRuns; seedOffset++) {
          const marketConfig: MarketConfig = {
            type: template.generator,
            volatility,
            drift,
            candleCount: template.candleCount,
            seed: template.baseSeed + seedOffset,
          };
          const seriesId = generateMarketId(marketConfig);
          seriesIds.push(seriesId);

          const csvPath = getMarketCSVPath(outputDir, seriesId);
          totalSeries++;

          // 缓存：CSV 文件存在即跳过（--force 时重新生成）
          if (!force && fs.existsSync(csvPath)) {
            cachedSeries++;
            if (verbose) {
              console.log(`  缓存命中: ${seriesId}`);
            }
            continue;
          }

          // 生成市场序列
          const candles = generateMarket(marketConfig);
          writeCandlesCSV(csvPath, candles);
          newSeries++;

          if (verbose) {
            console.log(`  生成: ${seriesId}`);
          }
        }

        groups.push({
          groupId,
          name,
          description,
          metadata,
          candleCount: template.candleCount,
          monteCarloRuns: template.monteCarloRuns,
          seriesIds,
        });

        if (!verbose) {
          console.log(`  市场组 ${groupId}: ${newSeries} 新生成, ${cachedSeries} 缓存命中`);
        }
      }
    }
  }

  // manifest 每次重新生成（因为可能有新模板加入）
  const manifest: MarketManifest = {
    version: '2.0.0',
    createdAt: Date.now(),
    groups,
  };
  writeManifest(outputDir, manifest);

  console.log(
    `Phase 0 完成: ${newSeries} 新生成, ${cachedSeries} 缓存命中, 共 ${totalSeries} 个序列, ${groups.length} 个组`
  );

  return { totalSeries, cachedSeries, newSeries, groupCount: groups.length };
}
