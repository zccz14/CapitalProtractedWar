/**
 * Engine Module - 引擎模块入口
 *
 * 导出回测引擎函数、实验运行器和单次运行函数
 */

// 回测引擎
export { evaluateSignalStrategy } from './backtest-engine.js';
export type { EvaluationOutput } from './backtest-engine.js';

// 实验运行器
export { runExperiment } from './experiment-runner.js';

// 单次运行函数
export { runOnce } from './run-once.js';
export type { SingleRunResult } from './run-once.js';
