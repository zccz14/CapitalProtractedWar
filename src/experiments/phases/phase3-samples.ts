/**
 * Phase 3: 生成代表性样本详细数据
 *
 * 为每个 (market_group, signal, betting) 组合生成 3 个代表性样本的完整曲线数据。
 */

import * as fs from 'fs';
import * as path from 'path';
import { runOnce } from '../../engine/index.js';
import {
  generateMarketGroupId,
  generateSignalId,
  generateBettingId,
  getAggregatedResultPath,
  getSamplePath,
  readAggregatedResult,
  parseMarketId,
  ensureDir,
} from '../../cache/index.js';
import type { FullExperimentConfig } from '../../cache/types.js';
import type { SampleRunData } from '../../types.js';

export interface Phase3Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
}

export interface Phase3Result {
  totalSamples: number;
  cachedSamples: number;
  newSamples: number;
}

/**
 * 执行 Phase 3: 生成代表性样本详细数据
 */
export async function runPhase3(options: Phase3Options): Promise<Phase3Result> {
  const { config, force, verbose } = options;
  const { outputDir } = config;

  let totalSamples = 0;
  let cachedSamples = 0;
  let newSamples = 0;

  console.log('Phase 3: 生成代表性样本详细数据');

  for (const template of config.markets) {
    for (const volatility of template.volatilities) {
      for (const drift of template.drifts) {
        const marketGroupId = generateMarketGroupId({
          type: template.generator,
          volatility,
          drift,
          candleCount: template.candleCount,
        });

        for (const signalConfig of config.signals) {
          const signalId = generateSignalId(signalConfig);
          const bettingId = generateBettingId(config.betting);

          // 读取聚合结果获取样本索引
          const aggPath = getAggregatedResultPath(outputDir, marketGroupId, signalId, bettingId);

          if (!fs.existsSync(aggPath)) {
            console.warn(`  警告: 聚合结果不存在: ${aggPath}`);
            continue;
          }

          const aggFile = readAggregatedResult(aggPath);
          const { sampleIndices } = aggFile.result;

          for (const sampleType of ['best', 'median', 'worst'] as const) {
            const samplePath = getSamplePath(
              outputDir,
              marketGroupId,
              signalId,
              bettingId,
              sampleType
            );

            totalSamples++;

            // 检查缓存
            if (!force && fs.existsSync(samplePath)) {
              cachedSamples++;
              if (verbose) {
                console.log(`  缓存命中: ${marketGroupId}/${signalId}/${sampleType}`);
              }
              continue;
            }

            const { marketId } = sampleIndices[sampleType];

            // 从 marketId 解析出配置
            const marketConfig = parseMarketId(marketId);

            // 重新运行，记录完整曲线数据
            const { sampleData } = runOnce(marketConfig, signalConfig, config.betting, true);

            if (sampleData) {
              // 将 Map 转换为普通对象以便 JSON 序列化
              const jsonData = convertSampleDataToJSON(sampleData);

              ensureDir(path.dirname(samplePath));
              fs.writeFileSync(samplePath, JSON.stringify(jsonData), 'utf-8');

              newSamples++;

              if (verbose) {
                console.log(`  完成: ${marketGroupId}/${signalId}/${sampleType}`);
              }
            }
          }
        }

        if (!verbose) {
          console.log(`  市场组 ${marketGroupId}: 样本生成完成`);
        }
      }
    }
  }

  console.log(`Phase 3 完成: ${newSamples} 新样本, ${cachedSamples} 缓存命中`);

  return { totalSamples, cachedSamples, newSamples };
}

/**
 * 将 SampleRunData 转换为 JSON 可序列化格式
 */
function convertSampleDataToJSON(data: SampleRunData): Record<string, unknown> {
  return {
    prices: data.prices,
    realizedPnLCurves: mapToObject(data.realizedPnLCurves),
    unrealizedPnLCurves: mapToObject(data.unrealizedPnLCurves),
    pnlCurves: mapToObject(data.pnlCurves),
    riskLineCurves: mapToObject(data.riskLineCurves),
    vcCurves: mapToObject(data.vcCurves),
    positionCurves: mapToObject(data.positionCurves),
    takeProfitMarkers: mapToObject(data.takeProfitMarkers),
    stopLossMarkers: mapToObject(data.stopLossMarkers),
    observationEndIndices: mapToObject(data.observationEndIndices),
    estimatedCCurves: mapToObject(data.estimatedCCurves),
    stopLossCurves: mapToObject(data.stopLossCurves),
    candles: data.candles,
    signals: data.signals,
    trades: data.trades,
    baselineSnapshots: data.baselineSnapshots,
    baselineEquityCurve: data.baselineEquityCurve,
    accountSnapshots: data.accountSnapshots ? mapToObject(data.accountSnapshots) : undefined,
  };
}

/**
 * 将 Map 转换为普通对象
 */
function mapToObject<K extends string | number, V>(map: Map<K, V>): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [key, value] of map) {
    obj[String(key)] = value;
  }
  return obj;
}
