/**
 * 线性回归趋势 + RSI + OBV + ADX 门控策略
 *
 * 在双指标基础上增加 ADX 趋势强度过滤，减少弱趋势噪声交易
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { adx, linearRegressionSlope, obv, rsi, volumeProxy } from '../indicators/index.js';

export interface RegressionTrendRsiObvAdxParams {
  /** 回归周期 (默认20) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.00025） */
  minSlopeRatio: number;
  /** RSI 周期 (默认14) */
  rsiPeriod: number;
  /** 做多确认阈值 (默认55) */
  rsiBullThreshold: number;
  /** 做空确认阈值 (默认45) */
  rsiBearThreshold: number;
  /** OBV 斜率观察窗口 (默认20) */
  obvLookback: number;
  /** OBV 斜率/均量阈值 (默认0.02) */
  minObvSlopeRatio: number;
  /** ADX 周期 (默认14) */
  adxPeriod: number;
  /** ADX 趋势强度阈值 (默认18) */
  minAdx: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiObvAdxParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00025,
  rsiPeriod: 14,
  rsiBullThreshold: 55,
  rsiBearThreshold: 45,
  obvLookback: 20,
  minObvSlopeRatio: 0.02,
  adxPeriod: 14,
  minAdx: 18,
};

@Strategy({
  type: 'regression_trend_rsi_obv_adx',
  name: '回归趋势+RSI+OBV+ADX',
  description: '回归斜率与RSI/OBV一致性，并要求ADX趋势强度过滤',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    rsiPeriod: 'RSI 周期',
    rsiBullThreshold: 'RSI 做多确认阈值',
    rsiBearThreshold: 'RSI 做空确认阈值',
    obvLookback: 'OBV 斜率窗口',
    minObvSlopeRatio: 'OBV 斜率/均量阈值',
    adxPeriod: 'ADX 周期',
    minAdx: 'ADX 趋势强度阈值',
  },
})
export class RegressionTrendRsiObvAdxStrategy extends BaseStrategy<RegressionTrendRsiObvAdxParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_obv_adx';

  constructor(params?: Partial<RegressionTrendRsiObvAdxParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  private linearRegressionSlopeFromValues(values: number[]): number {
    if (values.length < 2) return 0;
    const n = values.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }

    const numerator = n * sumXY - sumX * sumY;
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  private averageVolumeProxy(candles: Candle[], startIndex: number, endIndex: number): number {
    const length = Math.max(1, endIndex - startIndex + 1);
    let sum = 0;
    for (let i = startIndex; i <= endIndex; i++) {
      sum += volumeProxy(candles[i]);
    }
    return sum / length;
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const {
      lookbackPeriod,
      minSlopeRatio,
      rsiPeriod,
      rsiBullThreshold,
      rsiBearThreshold,
      obvLookback,
      minObvSlopeRatio,
      adxPeriod,
      minAdx,
    } = this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod, obvLookback, adxPeriod);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);

    const obvValues: number[] = [];
    const obvStart = currentIndex - obvLookback + 1;
    for (let i = obvStart; i <= currentIndex; i++) {
      obvValues.push(obv(candles, i));
    }
    const obvSlope = this.linearRegressionSlopeFromValues(obvValues);
    const avgVolume = this.averageVolumeProxy(candles, obvStart, currentIndex);
    const obvSlopeRatio = avgVolume === 0 ? 0 : obvSlope / avgVolume;
    const obvBullish = obvSlopeRatio >= minObvSlopeRatio;
    const obvBearish = obvSlopeRatio <= -minObvSlopeRatio;

    const adxValue = adx(candles, currentIndex, adxPeriod);
    const adxStrong = adxValue >= minAdx;

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      obvBullish &&
      adxStrong
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      obvBearish &&
      adxStrong
    ) {
      return this.short();
    }

    return this.hold();
  }
}
