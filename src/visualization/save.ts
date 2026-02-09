/**
 * Save Module - 报告保存逻辑（流式处理）
 *
 * 核心优化：不再一次性加载所有样本数据，而是逐个市场组处理
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExperimentResult } from '../types.js';
import type { LightExperimentResult, SampleDataLoader } from './types.js';
import { sanitizeFilename } from './utils.js';
import {
  generateIndexHTML,
  generateMarketReportHTML,
  generateSignalDetailHTML,
  generateSampleDetailHTML,
} from './reports/index.js';

/**
 * 流式保存报告套件
 *
 * @param lightResults 轻量级实验结果（不含样本数据）
 * @param outputDir 输出目录
 * @param loadSampleData 样本数据加载器（延迟加载）
 * @param takeProfitTargets 止盈目标列表
 * @param bettingId 投注策略 ID
 */
export async function saveReportSuiteStreaming(
  lightResults: LightExperimentResult[],
  outputDir: string,
  loadSampleData: SampleDataLoader,
  takeProfitTargets: number[],
  bettingId: string
): Promise<string> {
  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 1. 生成 index.html（只需要轻量数据）
  const indexPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(indexPath, generateIndexHTML({ results: lightResults }), 'utf-8');
  console.log(`  已生成: index.html`);

  // 2. 逐个市场组处理
  const totalGroups = lightResults.length;
  for (let i = 0; i < lightResults.length; i++) {
    const lightResult = lightResults[i];
    const marketGroupId = lightResult.groupId;

    console.log(`  处理市场组 ${i + 1}/${totalGroups}: ${lightResult.config.name}`);

    // 构建完整结果（包含样本数据）
    const fullResult = buildFullResult(
      lightResult,
      marketGroupId,
      loadSampleData,
      takeProfitTargets,
      bettingId
    );

    // 生成该市场组的所有报告
    await saveMarketGroupReports(fullResult, outputDir, takeProfitTargets);

    // fullResult 超出作用域后自动 GC
  }

  return indexPath;
}

/**
 * 构建完整实验结果（加载样本数据）
 */
function buildFullResult(
  lightResult: LightExperimentResult,
  marketGroupId: string,
  loadSampleData: SampleDataLoader,
  takeProfitTargets: number[],
  bettingId: string
): ExperimentResult {
  const sampleRuns: ExperimentResult['sampleRuns'] = [];

  // 为每个信号策略加载样本数据
  for (const signalResult of lightResult.signalResults) {
    const signalId = signalResult.signalType;
    // 获取该信号策略的样本索引（包含 baselinePnL）
    const sampleIndices = lightResult.sampleIndicesMap?.get(signalId);

    for (const sampleType of ['best', 'median', 'worst'] as const) {
      const sampleData = loadSampleData(marketGroupId, signalId, bettingId, sampleType);
      if (!sampleData) continue;

      // 查找或创建对应的运行结果
      let runResult = sampleRuns.find(
        (r) => r.sampleMetadata?.get(signalId)?.sampleType === sampleType
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

      // 从 sampleIndices 获取正确的 baselinePnL
      const baselinePnL = sampleIndices?.[sampleType]?.baselinePnL ?? 0;

      if (runResult.sampleData) {
        runResult.sampleData.set(signalId, sampleData);
      }
      if (runResult.sampleMetadata) {
        runResult.sampleMetadata.set(signalId, {
          runIndex: runResult.runIndex,
          baselinePnL,
          sampleType,
        });
      }
    }
  }

  return {
    config: lightResult.config,
    signalResults: lightResult.signalResults,
    monteCarloRuns: lightResult.monteCarloRuns,
    candlesPerRun: lightResult.candlesPerRun,
    elapsedMs: 0,
    sampleRuns,
  };
}

/**
 * 保存单个市场组的所有报告
 */
async function saveMarketGroupReports(
  result: ExperimentResult,
  outputDir: string,
  takeProfitTargets: number[]
): Promise<void> {
  const { config } = result;

  // 1. 生成市场报告
  const marketFilename = `market_${sanitizeFilename(config.name)}.html`;
  const marketPath = path.join(outputDir, marketFilename);
  fs.writeFileSync(marketPath, generateMarketReportHTML(result, outputDir), 'utf-8');

  // 2. 为每个信号策略生成详细报告
  for (const signalResult of result.signalResults) {
    const signalFilename = `signal_${sanitizeFilename(config.name)}_${sanitizeFilename(signalResult.signalType)}.html`;
    const signalPath = path.join(outputDir, signalFilename);
    fs.writeFileSync(
      signalPath,
      generateSignalDetailHTML(result, signalResult, outputDir),
      'utf-8'
    );

    // 3. 生成样本详情页面
    if (result.sampleRuns && result.sampleRuns.length > 0) {
      const runsWithData = result.sampleRuns.filter((run) => {
        const sampleData = run.sampleData?.get(signalResult.signalType);
        return sampleData && sampleData.trades && sampleData.trades.length > 0;
      });

      for (const run of runsWithData) {
        const sampleData = run.sampleData?.get(signalResult.signalType);
        if (!sampleData) continue;

        const meta = run.sampleMetadata?.get(signalResult.signalType);
        const originalRunIndex = meta?.runIndex ?? run.runIndex;

        // 为每个 M_T 生成独立文件
        for (const targetMT of takeProfitTargets) {
          const sampleFilename = `sample_${sanitizeFilename(config.name)}_${sanitizeFilename(signalResult.signalType)}_run${originalRunIndex + 1}_mt${targetMT}.html`;
          const samplePath = path.join(outputDir, sampleFilename);

          const sampleHTML = generateSampleDetailHTML(
            sampleData,
            signalResult.signalType,
            config.name,
            originalRunIndex,
            {
              name: config.name,
              description: config.description,
              candleCount: config.candleCount,
            },
            outputDir,
            targetMT
          );

          fs.writeFileSync(samplePath, sampleHTML, 'utf-8');
        }
      }
    }
  }

  // 4. 保存 JSON 数据
  const { exportToJSON } = await import('../analysis/index.js');
  const jsonPath = path.join(outputDir, `${sanitizeFilename(config.name)}_data.json`);
  fs.writeFileSync(jsonPath, exportToJSON(result), 'utf-8');
}

/**
 * 保存完整实验结果的报告
 *
 * 用于直接保存 ExperimentResult，不需要缓存系统
 */
export async function saveFullResults(suite: {
  results: ExperimentResult[];
  outputDir: string;
}): Promise<string> {
  const { results, outputDir } = suite;

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const indexPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(indexPath, generateIndexHTML({ results }), 'utf-8');
  console.log(`已生成: ${indexPath}`);

  for (const result of results) {
    const takeProfitTargets = result.config.betting.takeProfitTargets;
    await saveMarketGroupReports(result, outputDir, takeProfitTargets);
    console.log(`已生成: market_${sanitizeFilename(result.config.name)}.html`);
  }

  return indexPath;
}
