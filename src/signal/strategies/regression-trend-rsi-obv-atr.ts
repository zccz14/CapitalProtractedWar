/**
 * 线性回归趋势 + RSI + OBV + ATR 门控策略
 *
 * 在回归斜率 + RSI + OBV 基础上加入 ATR 波动率门控，
 * 避免低波动噪声与无量震荡。
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { atr, linearRegressionSlope, obv, rsi, volumeProxy } from '../indicators/index.js';

export interface RegressionTrendRsiObvAtrParams {
  /** 回归周期 (默认22) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.00023） */
  minSlopeRatio: number;
  /** RSI 周期 (默认14) */
  rsiPeriod: number;
  /** 做多确认阈值 (默认54) */
  rsiBullThreshold: number;
  /** 做空确认阈值 (默认46) */
  rsiBearThreshold: number;
  /** OBV 斜率观察窗口 (默认20) */
  obvLookback: number;
  /** OBV 斜率/均量阈值 (默认0.018) */
  minObvSlopeRatio: number;
  /** ATR 周期 (默认14) */
  atrPeriod: number;
  /** 最小ATR/价格比 (默认0.0022) */
  minAtrRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiObvAtrParams = {
  lookbackPeriod: 22,
  minSlopeRatio: 0.00023,
  rsiPeriod: 14,
  rsiBullThreshold: 54,
  rsiBearThreshold: 46,
  obvLookback: 20,
  minObvSlopeRatio: 0.018,
  atrPeriod: 14,
  minAtrRatio: 0.0022,
};

@Strategy({
  type: 'regression_trend_rsi_obv_atr',
  name: '回归趋势+RSI+OBV+ATR门控',
  description: '回归斜率+RSI+OBV一致时开仓，并用ATR过滤低波动区间',
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
    atrPeriod: 'ATR 周期',
    minAtrRatio: '最小ATR/价格比',
  },
})
export class RegressionTrendRsiObvAtrStrategy extends BaseStrategy<RegressionTrendRsiObvAtrParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_obv_atr';

  constructor(params?: Partial<RegressionTrendRsiObvAtrParams>) {
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
      atrPeriod,
      minAtrRatio,
    } = this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod, obvLookback, atrPeriod);
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

    if (normalizedSlope > minSlopeRatio && rsiValue >= rsiBullThreshold && obvBullish) {
      return this.long();
    }

    if (normalizedSlope < -minSlopeRatio && rsiValue <= rsiBearThreshold && obvBearish) {
      return this.short();
    }

    return this.hold();
  }
}
