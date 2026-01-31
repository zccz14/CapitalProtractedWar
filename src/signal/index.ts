/**
 * Signal Strategies - 交易信号策略
 * 
 * 模块化架构：
 * - base.ts: 基类和注册机制
 * - indicators/: 技术指标库
 * - strategies/: 各策略实现
 * 
 * 支持的策略类型：
 * 1. trend_following - 趋势跟踪 (均线交叉)
 * 2. mean_reversion - 均值回归
 * 3. breakout - 突破策略
 * 4. random - 随机策略 (对照组)
 * 5. adaptive_volatility - 自适应波动率策略
 */

// 导出基类和注册机制
export {
  BaseStrategy,
  Strategy,
  registerStrategy,
  createStrategy,
  getRegisteredStrategies,
  isStrategyRegistered,
  getStrategyMeta,
  strategyConfig,
  type BaseStrategyParams,
  type StrategyCategory,
  type StrategyMeta,
  type StrategyConstructor,
} from './base.js';

// 导出技术指标
export * from './indicators/index.js';

// 导入并导出所有策略（触发装饰器注册）
export * from './strategies/index.js';

// 向后兼容：导出工厂函数别名
import { createStrategy } from './base.js';
export const createSignalStrategy = createStrategy;
