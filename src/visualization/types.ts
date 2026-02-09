/**
 * Visualization Module Types - 可视化模块类型定义
 */

import type {
  ExperimentResult,
  AggregatedSignalResult,
  SampleRunData,
  MonteCarloRunResult,
} from '../types.js';
import type { SampleIndex } from '../cache/types.js';

/**
 * 轻量级实验结果（不含样本数据）
 * 用于生成 index.html 等不需要样本数据的报告
 */
export interface LightExperimentResult {
  config: ExperimentResult['config'];
  /** 市场组 ID（用于加载样本数据和文件路径） */
  groupId: string;
  signalResults: AggregatedSignalResult[];
  monteCarloRuns: number;
  candlesPerRun: number;
  /** 各信号策略的代表性样本索引（key = signalType） */
  sampleIndicesMap?: Map<
    string,
    {
      best: SampleIndex;
      median: SampleIndex;
      worst: SampleIndex;
    }
  >;
}

/**
 * 完整实验结果（包含样本数据）
 * 用于生成需要样本数据的详细报告
 */
export interface FullExperimentResult extends LightExperimentResult {
  sampleRuns: MonteCarloRunResult[];
  elapsedMs: number;
}

/**
 * 报告套件配置
 */
export interface ReportSuite {
  results: ExperimentResult[];
  outputDir: string;
}

/**
 * 样本数据加载器类型
 * 用于延迟加载样本数据，避免一次性加载所有数据导致 OOM
 */
export type SampleDataLoader = (
  marketGroupId: string,
  signalId: string,
  bettingId: string,
  sampleType: 'best' | 'median' | 'worst'
) => SampleRunData | null;

/**
 * 市场组上下文
 */
export interface MarketGroupContext {
  marketGroupId: string;
  metadata: Record<string, string>;
  candleCount: number;
}
