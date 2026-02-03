/**
 * Engine Module - 引擎模块入口
 *
 * 导出回测引擎、实验运行器和单次运行函数
 */

// 回测引擎
export { NewParadigmBacktestEngine, BacktestEngine } from './backtest-engine.js';

// 实验运行器
export { NewParadigmExperimentRunner, ExperimentRunner } from './experiment-runner.js';

// 单次运行函数
export { runOnce } from './run-once.js';
export type { SingleRunResult } from './run-once.js';
