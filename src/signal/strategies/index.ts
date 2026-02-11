/**
 * 策略索引文件
 *
 * 导入所有策略并触发自动注册
 */

// 导入所有策略（触发装饰器注册）
export { TrendFollowingStrategy, type TrendFollowingParams } from './trend-following.js';
export { MeanReversionStrategy, type MeanReversionParams } from './mean-reversion.js';
export { BreakoutStrategy, type BreakoutParams } from './breakout.js';
export { Breakout4Strategy, type Breakout4Params } from './breakout-4.js';
export { RandomStrategy, type RandomParams } from './random.js';
export {
  AdaptiveVolatilityStrategy,
  type AdaptiveVolatilityParams,
  type VolatilityRegime,
  type VolatilityState,
  type AdaptiveMode,
} from './adaptive-volatility.js';
export { BollReversionStrategy, type BollReversionParams } from './boll-reversion.js';
export { PrecomputedStrategy, type PrecomputedParams } from './precomputed.js';
