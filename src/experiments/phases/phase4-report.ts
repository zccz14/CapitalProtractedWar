/**
 * Phase 4: 生成 HTML 报告（流式处理版本）
 *
 * 优化：不再一次性加载所有样本数据，而是逐个市场组处理
 * 内存占用从 ~13GB 降低到 ~500MB
 */

import * as fs from 'fs';
import { exec } from 'child_process';
import {
  generateSignalId,
  generateBettingId,
  getAggregatedResultPath,
  getSamplePath,
  readAggregatedResult,
} from '../../cache/index.js';
import type { FullExperimentConfig } from '../../cache/types.js';
import type {
  AggregatedSignalResult,
  AggregatedTakeProfitStats,
  SampleRunData,
  AccountSnapshot,
} from '../../types.js';
import {
  saveReportSuiteStreaming,
  type LightExperimentResult,
  type SampleDataLoader,
} from '../../visualization/index.js';

export interface Phase4Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
  noOpen: boolean;
}

export interface Phase4Result {
  reportPath: string;
}

/**
 * 执行 Phase 4: 生成 HTML 报告（流式处理）
 */
export async function runPhase4(options: Phase4Options): Promise<Phase4Result> {
  const { config, verbose, noOpen } = options;
  const { outputDir } = config;

  console.log('Phase 4: 生成 HTML 报告（流式处理）');

  // 第一遍：收集轻量数据（不含样本数据）
  const lightResults: LightExperimentResult[] = [];
  const bettingId = generateBettingId(config.betting);

  for (const volatility of config.volatilities) {
    for (const drift of config.drifts) {
      const marketGroupId = `gbm_vol${(volatility * 100).toFixed(0)}_drift${(drift * 100).toFixed(0)}_n${config.candleCount}`;

      // 只收集聚合结果，不读取样本数据
      const signalResults: AggregatedSignalResult[] = [];
      // 收集各信号策略的样本索引
      const sampleIndicesMap = new Map<
        string,
        {
          best: { marketId: string; baselinePnL: number };
          median: { marketId: string; baselinePnL: number };
          worst: { marketId: string; baselinePnL: number };
        }
      >();

      for (const signalConfig of config.signals) {
        const signalId = generateSignalId(signalConfig);
        const aggPath = getAggregatedResultPath(outputDir, marketGroupId, signalId, bettingId);

        if (!fs.existsSync(aggPath)) {
          if (verbose) {
            console.warn(`  警告: 聚合结果不存在: ${aggPath}`);
          }
          continue;
        }

        const aggFile = readAggregatedResult(aggPath);
        const aggResult = aggFile.result;

        // 转换为 AggregatedSignalResult 格式
        const takeProfitStats = new Map<number, AggregatedTakeProfitStats>();
        for (const stat of aggResult.takeProfitStats) {
          takeProfitStats.set(stat.targetMultiplier, {
            targetMultiplier: stat.targetMultiplier,
            totalRoundCount: stat.totalRoundCount,
            avgRoundsPerRun: stat.avgRoundsPerRun,
            intervalStats: stat.intervalStats,
            avgFrequency: stat.avgFrequency,
          });
        }

        signalResults.push({
          signalType: signalConfig.type,
          takeProfitStats,
          avgWinRate: aggResult.avgWinRate,
          avgTradeCount: aggResult.avgTradeCount,
        });

        // 收集样本索引（包含 baselinePnL）
        if (aggResult.sampleIndices) {
          sampleIndicesMap.set(signalConfig.type, aggResult.sampleIndices);
        }
      }

      if (signalResults.length === 0) {
        continue;
      }

      // 构建轻量级结果
      lightResults.push({
        config: {
          name: `vol${(volatility * 100).toFixed(0)}_drift${(drift * 100).toFixed(0)}`,
          description: `波动率${(volatility * 100).toFixed(0)}%, 漂移率${(drift * 100).toFixed(0)}%`,
          market: {
            type: 'gbm',
            volatility,
            drift,
            candleCount: config.candleCount,
            seed: config.baseSeed,
          },
          signals: config.signals,
          betting: config.betting,
          monteCarloRuns: config.monteCarloRuns,
        },
        signalResults,
        monteCarloRuns: config.monteCarloRuns,
        candlesPerRun: config.candleCount,
        sampleIndicesMap,
      });

      if (verbose) {
        console.log(`  收集: ${marketGroupId} (${signalResults.length} 个信号策略)`);
      }
    }
  }

  if (lightResults.length === 0) {
    console.warn('警告: 没有找到任何实验结果');
    return { reportPath: '' };
  }

  // 创建样本数据加载器（延迟加载）
  const loadSampleData: SampleDataLoader = (mktGroupId, signalType, betId, sampleType) => {
    // 根据 signalType 找到对应的 signalConfig
    const signalConfig = config.signals.find((s) => s.type === signalType);
    if (!signalConfig) return null;

    const signalId = generateSignalId(signalConfig);
    const samplePath = getSamplePath(outputDir, mktGroupId, signalId, betId, sampleType);

    if (!fs.existsSync(samplePath)) return null;

    try {
      const sampleJSON = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
      return convertJSONToSampleData(sampleJSON);
    } catch {
      return null;
    }
  };

  // 流式生成报告
  console.log(`  生成报告 (${lightResults.length} 个市场条件)...`);
  const reportPath = await saveReportSuiteStreaming(
    lightResults,
    outputDir,
    loadSampleData,
    config.betting.takeProfitTargets,
    bettingId
  );

  console.log(`Phase 4 完成: 报告已保存到 ${reportPath}`);

  if (!noOpen) {
    openReport(reportPath);
  }

  return { reportPath };
}

/**
 * 将 JSON 转换回 SampleRunData 格式
 */
function convertJSONToSampleData(json: Record<string, unknown>): SampleRunData {
  return {
    prices: json.prices as number[],
    realizedPnLCurves: objectToMap(json.realizedPnLCurves as Record<string, number[]>),
    unrealizedPnLCurves: objectToMap(json.unrealizedPnLCurves as Record<string, number[]>),
    pnlCurves: objectToMap(json.pnlCurves as Record<string, number[]>),
    riskLineCurves: objectToMap(json.riskLineCurves as Record<string, number[]>),
    vcCurves: objectToMap(json.vcCurves as Record<string, number[]>),
    positionCurves: objectToMap(json.positionCurves as Record<string, number[]>),
    takeProfitMarkers: objectToMap(json.takeProfitMarkers as Record<string, number[]>),
    stopLossMarkers: objectToMap(json.stopLossMarkers as Record<string, number[]>),
    observationEndIndices: objectToMap(json.observationEndIndices as Record<string, number>),
    estimatedCCurves: objectToMap(json.estimatedCCurves as Record<string, number[]>),
    stopLossCurves: objectToMap(json.stopLossCurves as Record<string, number[]>),
    candles: json.candles as SampleRunData['candles'],
    signals: json.signals as SampleRunData['signals'],
    trades: json.trades as SampleRunData['trades'],
    baselineSnapshots: json.baselineSnapshots as SampleRunData['baselineSnapshots'],
    baselineEquityCurve: json.baselineEquityCurve as number[],
    accountSnapshots: json.accountSnapshots
      ? objectToMap(json.accountSnapshots as Record<string, AccountSnapshot[]>)
      : undefined,
  };
}

/**
 * 将普通对象转换为 Map
 */
function objectToMap<V>(obj: Record<string, V>): Map<number, V> {
  const map = new Map<number, V>();
  if (obj) {
    for (const [key, value] of Object.entries(obj)) {
      map.set(Number(key), value);
    }
  }
  return map;
}

/**
 * 打开报告（跨平台）
 */
function openReport(filePath: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${filePath}"`;
  } else if (platform === 'win32') {
    command = `start "" "${filePath}"`;
  } else {
    command = `xdg-open "${filePath}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.error(`无法打开报告: ${error.message}`);
      console.log(`请手动打开: ${filePath}`);
    } else {
      console.log(`已在浏览器中打开报告`);
    }
  });
}
