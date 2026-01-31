/**
 * Capital Protracted War - 资本持久战实验框架
 * 
 * 核心模块导出
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

// 仓位管理
export {
  AntiMartingalePositionManager,
  FixedPositionManager,
  createPositionManager,
} from './position/index.js';

// 回测引擎
export { BacktestEngine, ExperimentRunner } from './engine/index.js';

// 分析工具
export {
  formatReport,
  printReport,
  compareExperiments,
  printComparisonTable,
  exportToJSON,
  exportToCSV,
  calculateHistogram,
  calculateCDF,
} from './analysis/index.js';

// 可视化
export {
  generateHTMLReport,
  generateComparisonHTMLReport,
  saveReport,
  saveComparisonReport,
} from './visualization/index.js';

// 随机数工具
export { createRandom, Random, type SeededRandom } from './utils/random.js';
