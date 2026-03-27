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
export { BollBreakoutStrategy, type BollBreakoutParams } from './boll-breakout.js';
export { BollBreakoutTrendStrategy, type BollBreakoutTrendParams } from './boll-breakout-trend.js';
export {
  BollBreakoutSqueezeStrategy,
  type BollBreakoutSqueezeParams,
} from './boll-breakout-squeeze.js';
export {
  BollBreakoutConfirmStrategy,
  type BollBreakoutConfirmParams,
} from './boll-breakout-confirm.js';
export {
  BollBreakoutPullbackStrategy,
  type BollBreakoutPullbackParams,
} from './boll-breakout-pullback.js';
export {
  BollBreakoutPullbackTrendStrategy,
  type BollBreakoutPullbackTrendParams,
} from './boll-breakout-pullback-trend.js';
export {
  BollBreakoutPullbackAtrStrategy,
  type BollBreakoutPullbackAtrParams,
} from './boll-breakout-pullback-atr.js';
export { RegressionTrendStrategy, type RegressionTrendParams } from './regression-trend.js';
export {
  RegressionTrendObvStrategy,
  type RegressionTrendObvParams,
} from './regression-trend-obv.js';
export {
  RegressionTrendRsiStrategy,
  type RegressionTrendRsiParams,
} from './regression-trend-rsi.js';
export {
  RegressionTrendMfiStrategy,
  type RegressionTrendMfiParams,
} from './regression-trend-mfi.js';
export {
  RegressionTrendRsiMfiStrategy,
  type RegressionTrendRsiMfiParams,
} from './regression-trend-rsi-mfi.js';
export {
  RegressionTrendRsiMfiGateStrategy,
  type RegressionTrendRsiMfiGateParams,
} from './regression-trend-rsi-mfi-gate.js';
export {
  RegressionTrendRsiMacdStrategy,
  type RegressionTrendRsiMacdParams,
} from './regression-trend-rsi-macd.js';
export {
  RegressionTrendRsiObvStrategy,
  type RegressionTrendRsiObvParams,
} from './regression-trend-rsi-obv.js';
export {
  RegressionTrendRsiObvAdxStrategy,
  type RegressionTrendRsiObvAdxParams,
} from './regression-trend-rsi-obv-adx.js';
export {
  RegressionTrendRsiObvAtrStrategy,
  type RegressionTrendRsiObvAtrParams,
} from './regression-trend-rsi-obv-atr.js';
export {
  RegressionTrendRsiObvAtrMacdStrategy,
  type RegressionTrendRsiObvAtrMacdParams,
} from './regression-trend-rsi-obv-atr-macd.js';
export {
  RegressionTrendRsiAtrStrategy,
  type RegressionTrendRsiAtrParams,
} from './regression-trend-rsi-atr.js';
export {
  RegressionTrendRsiAtrMacdStrategy,
  type RegressionTrendRsiAtrMacdParams,
} from './regression-trend-rsi-atr-macd.js';
export {
  RegressionTrendRsiAtrMacdAdxStrategy,
  type RegressionTrendRsiAtrMacdAdxParams,
} from './regression-trend-rsi-atr-macd-adx.js';
export {
  RegressionTrendRsiAtrMacdAdxCciStrategy,
  type RegressionTrendRsiAtrMacdAdxCciParams,
} from './regression-trend-rsi-atr-macd-adx-cci.js';
export {
  RegressionTrendRsiAtrMacdAdxCciKdjStrategy,
  type RegressionTrendRsiAtrMacdAdxCciKdjParams,
} from './regression-trend-rsi-atr-macd-adx-cci-kdj.js';
export {
  RegressionTrendRsiAtrMacdAdxCciKdjObvStrategy,
  type RegressionTrendRsiAtrMacdAdxCciKdjObvParams,
} from './regression-trend-rsi-atr-macd-adx-cci-kdj-obv.js';
export {
  RegressionTrendRsiAtrMacdAdxCciKdjObvRocStrategy,
  type RegressionTrendRsiAtrMacdAdxCciKdjObvRocParams,
} from './regression-trend-rsi-atr-macd-adx-cci-kdj-obv-roc.js';
export {
  RegressionTrendRsiAtrMacdAdxCciKdjObvRocWilliamsRStrategy,
  type RegressionTrendRsiAtrMacdAdxCciKdjObvRocWilliamsRParams,
} from './regression-trend-rsi-atr-macd-adx-cci-kdj-obv-roc-williamsr.js';
export {
  RegressionTrendRsiAtrMacdAdxCciKdjObvRocWilliamsrAroonStrategy,
  type RegressionTrendRsiAtrMacdAdxCciKdjObvRocWilliamsrAroonParams,
} from './regression-trend-rsi-atr-macd-adx-cci-kdj-obv-roc-williamsr-aroon.js';
