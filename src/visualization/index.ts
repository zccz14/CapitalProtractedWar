/**
 * Visualization Module - 可视化模块（新范式）
 *
 * 多层级报告系统：
 * 1. 总结报告 (index.html) - 实验总览，带链接导航到详细报告
 * 2. 市场报告 (market_xxx.html) - 特定市场条件下的信号策略对比
 * 3. 策略报告 (signal_xxx.html) - 特定信号策略的详细分析
 * 4. 样本报告 (sample_xxx.html) - 样本级别详细分析
 */

// 类型导出
export type {
  LightExperimentResult,
  FullExperimentResult,
  ReportSuite,
  SampleDataLoader,
  MarketGroupContext,
} from './types.js';

// 样式和工具
export { COMMON_STYLES } from './styles.js';
export { formatNumber, getHeatmapColor, sanitizeFilename } from './utils.js';

// 图表生成
export {
  generateIntervalHistogramSVG,
  generateHeatmapSVG,
  generateEquityChartSVG,
  generatePriceChartSVG,
  generateVCChartSVG,
  generateMultiplierChartSVG,
} from './charts/index.js';

// 报告生成
export {
  generateIndexHTML,
  generateMarketReportHTML,
  generateSignalDetailHTML,
  generateSampleLinksHTML,
  generateSampleDetailHTML,
  type ReportSuiteForIndex,
} from './reports/index.js';

// 保存功能
export { saveReportSuiteStreaming, saveReportSuite } from './save.js';

// 向后兼容的别名
import { saveReportSuite as _saveReportSuite } from './save.js';
import type { ExperimentResult } from '../types.js';

/**
 * 生成 HTML 报告（向后兼容）
 */
export function generateHTMLReport(result: ExperimentResult): string {
  const { generateMarketReportHTML } = require('./reports/index.js');
  return generateMarketReportHTML(result, '');
}

/**
 * 保存单个结果的报告（向后兼容）
 */
export async function saveReport(result: ExperimentResult, outputDir: string): Promise<void> {
  await _saveReportSuite({ results: [result], outputDir });
}

/**
 * 保存多个结果的对比报告（向后兼容）
 */
export async function saveComparisonReport(
  results: ExperimentResult[],
  outputDir: string
): Promise<string> {
  return await _saveReportSuite({ results, outputDir });
}
