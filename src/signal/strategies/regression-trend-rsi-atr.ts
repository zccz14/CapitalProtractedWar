/**
 * 线性回归趋势 + RSI + ATR 门控策略
 *
 * 在双指标基础上加入 ATR 波动率门控，过滤低波动区间。
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { atr, linearRegressionSlope, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiAtrParams {
  /** 回归周期 (默认24) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.00022） */
  minSlopeRatio: number;
  /** RSI 周期 (默认14) */
  rsiPeriod: number;
  /** 做多确认阈值 (默认56) */
  rsiBullThreshold: number;
  /** 做空确认阈值 (默认44) */
  rsiBearThreshold: number;
  /** ATR 周期 (默认14) */
  atrPeriod: number;
  /** 最小ATR/价格比 (默认0.0025) */
  minAtrRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiAtrParams = {
  lookbackPeriod: 24,
  minSlopeRatio: 0.00022,
  rsiPeriod: 14,
  rsiBullThreshold: 56,
  rsiBearThreshold: 44,
  atrPeriod: 14,
  minAtrRatio: 0.0025,
};

@Strategy({
  type: 'regression_trend_rsi_atr',
  name: '回归趋势+RSI+ATR门控',
  description: '在回归斜率+RSI基础上增加ATR波动率门控，避免低波动噪声',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    rsiPeriod: 'RSI 周期',
    rsiBullThreshold: 'RSI 做多确认阈值',
    rsiBearThreshold: 'RSI 做空确认阈值',
    atrPeriod: 'ATR 周期',
    minAtrRatio: '最小ATR/价格比',
  },
})
export class RegressionTrendRsiAtrStrategy extends BaseStrategy<RegressionTrendRsiAtrParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_atr';

  constructor(params?: Partial<RegressionTrendRsiAtrParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const {
      lookbackPeriod,
      minSlopeRatio,
      rsiPeriod,
      rsiBullThreshold,
      rsiBearThreshold,
      atrPeriod,
      minAtrRatio,
    } = this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod, atrPeriod);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const price = candles[currentIndex].close;
    const atrValue = atr(candles, currentIndex, atrPeriod);
    const atrRatio = price === 0 ? 0 : atrValue / price;

    if (atrRatio < minAtrRatio) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);

    if (normalizedSlope > minSlopeRatio && rsiValue >= rsiBullThreshold) {
      return this.long();
    }

    if (normalizedSlope < -minSlopeRatio && rsiValue <= rsiBearThreshold) {
      return this.short();
    }

    return this.hold();
  }
}
