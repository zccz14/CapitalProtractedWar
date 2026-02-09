/**
 * Sand Table - 资本持久战实验框架
 *
 * 核心模块导出（新范式 v2）
 */

// 类型定义
export * from './types.js';

// 市场生成器
export { generateMarket } from './market/generator.js';

// 信号策略
export {
  createSignalStrategy,
  TrendFollowingStrategy,
  MeanReversionStrategy,
  BreakoutStrategy,
  RandomStrategy,
} from './signal/index.js';

// 投注策略（新增）
export { MultiAccountTracker } from './betting/index.js';

// 回测引擎
export { evaluateSignalStrategy, runExperiment, runOnce } from './engine/index.js';
export type { EvaluationOutput, SingleRunResult } from './engine/index.js';

// 分析工具
export {
  formatReport,
  printReport,
  printComparisonReport,
  exportToJSON,
  exportToCSV,
  calculateHistogram,
  calculateCDF,
} from './analysis/index.js';

// 可视化
export { generateHTMLReport, saveReport, saveComparisonReport } from './visualization/index.js';

// 随机数工具
export { createRandom, Random, type SeededRandom } from './utils/random.js';
