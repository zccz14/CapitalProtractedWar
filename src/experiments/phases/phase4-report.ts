/**
 * Phase 4: 生成 HTML 报告
 *
 * 读取聚合结果和样本数据，生成 HTML 报告。
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
  ExperimentResult,
  AggregatedSignalResult,
  SampleRunData,
  MonteCarloRunResult,
} from '../../types.js';
import { saveReportSuite, type ReportSuite } from '../../visualization/index.js';

export interface Phase4Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
  marketGroup?: string;
  noOpen: boolean;
}

export interface Phase4Result {
  reportPath: string;
}

/**
 * 执行 Phase 4: 生成 HTML 报告
 */
export async function runPhase4(options: Phase4Options): Promise<Phase4Result> {
  const { config, verbose, marketGroup, noOpen } = options;
  const { outputDir } = config;

  console.log('Phase 4: 生成 HTML 报告');

  // 收集所有实验结果
  const allResults: ExperimentResult[] = [];

  for (const volatility of config.volatilities) {
    for (const drift of config.drifts) {
      const marketGroupId = `gbm_vol${(volatility * 100).toFixed(0)}_drift${(drift * 100).toFixed(0)}_n${config.candleCount}`;

      // 检查是否只处理指定市场组
      if (marketGroup && marketGroupId !== marketGroup) {
        continue;
      }

      // 收集该市场组的所有信号策略结果
      const signalResults: AggregatedSignalResult[] = [];
      const sampleRuns: MonteCarloRunResult[] = [];

      for (const signalConfig of config.signals) {
        const signalId = generateSignalId(signalConfig);
        const bettingId = generateBettingId(config.betting);

        // 读取聚合结果
        const aggPath = getAggregatedResultPath(outputDir, marketGroupId, signalId, bettingId);

        if (!fs.existsSync(aggPath)) {
          console.warn(`  警告: 聚合结果不存在: ${aggPath}`);
          continue;
        }

        const aggFile = readAggregatedResult(aggPath);
        const aggResult = aggFile.result;

        // 转换为 AggregatedSignalResult 格式
        const takeProfitStats = new Map<number, any>();
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

        // 读取样本数据
        for (const sampleType of ['best', 'median', 'worst'] as const) {
          const samplePath = getSamplePath(
            outputDir,
            marketGroupId,
            signalId,
            bettingId,
            sampleType
          );

          if (fs.existsSync(samplePath)) {
            try {
              const sampleJSON = JSON.parse(fs.readFileSync(samplePath, 'utf-8'));
              const sampleData = convertJSONToSampleData(sampleJSON);

              // 查找或创建对应的 MonteCarloRunResult
              const { baselinePnL } = aggResult.sampleIndices[sampleType];
              let runResult = sampleRuns.find(
                (r) => r.sampleMetadata?.get(signalConfig.type)?.sampleType === sampleType
              );

              if (!runResult) {
                runResult = {
                  runIndex: sampleRuns.length,
                  signalResults: [],
                  sampleData: new Map(),
                  sampleMetadata: new Map(),
                };
                sampleRuns.push(runResult);
              }

              runResult.sampleData!.set(signalConfig.type, sampleData);
              runResult.sampleMetadata!.set(signalConfig.type, {
                runIndex: runResult.runIndex,
                baselinePnL,
                sampleType,
              });
            } catch {
              if (verbose) {
                console.warn(`  警告: 无法读取样本文件: ${samplePath}`);
              }
            }
          }
        }
      }

      if (signalResults.length === 0) {
        continue;
      }

      // 构建 ExperimentResult
      const experimentResult: ExperimentResult = {
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
        elapsedMs: 0,
        sampleRuns,
      };

      allResults.push(experimentResult);

      if (verbose) {
        console.log(`  加载: ${marketGroupId} (${signalResults.length} 个信号策略)`);
      }
    }
  }

  if (allResults.length === 0) {
    console.warn('警告: 没有找到任何实验结果');
    return { reportPath: '' };
  }

  // 生成报告
  console.log(`  生成报告 (${allResults.length} 个市场条件)...`);

  const suite: ReportSuite = {
    results: allResults,
    outputDir,
  };

  const reportPath = await saveReportSuite(suite);

  console.log(`Phase 4 完成: 报告已保存到 ${reportPath}`);

  // 打开报告
  if (!noOpen) {
    openReport(reportPath);
  }

  return { reportPath };
}

/**
 * 将 JSON 转换回 SampleRunData 格式
 */
function convertJSONToSampleData(json: Record<string, any>): SampleRunData {
  return {
    prices: json.prices,
    realizedPnLCurves: objectToMap(json.realizedPnLCurves),
    unrealizedPnLCurves: objectToMap(json.unrealizedPnLCurves),
    pnlCurves: objectToMap(json.pnlCurves),
    riskLineCurves: objectToMap(json.riskLineCurves),
    vcCurves: objectToMap(json.vcCurves),
    positionCurves: objectToMap(json.positionCurves),
    takeProfitMarkers: objectToMap(json.takeProfitMarkers),
    stopLossMarkers: objectToMap(json.stopLossMarkers),
    observationEndIndices: objectToMap(json.observationEndIndices),
    estimatedCCurves: objectToMap(json.estimatedCCurves),
    stopLossCurves: objectToMap(json.stopLossCurves),
    candles: json.candles,
    signals: json.signals,
    trades: json.trades,
    baselineSnapshots: json.baselineSnapshots,
    baselineEquityCurve: json.baselineEquityCurve,
    accountSnapshots: json.accountSnapshots ? objectToMap(json.accountSnapshots) : undefined,
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
