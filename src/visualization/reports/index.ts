/**
 * Reports Module - 报告生成模块
 */

export { generateIndexHTML, type ReportSuiteForIndex } from './index-report.js';
export { generateMarketReportHTML } from './market-report.js';
export { generateSignalDetailHTML, generateSampleLinksHTML } from './signal-report.js';
export { generateSampleDetailHTML } from './sample-report.js';
export { generatePriceSignalChartSVG } from './sample-charts.js';
export {
  generateTradesTable,
  generateBaselineTable,
  generateAccountSnapshotsTable,
  generateCandleDataTable,
} from './sample-tables.js';
