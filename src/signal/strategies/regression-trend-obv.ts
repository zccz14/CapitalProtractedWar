/**
 * 线性回归趋势 + OBV 确认策略
 *
 * 单指标：回归斜率 + OBV 资金流趋势过滤
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope, obv, volumeProxy } from '../indicators/index.js';

export interface RegressionTrendObvParams {
  /** 回归周期 (默认20) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.00025） */
  minSlopeRatio: number;
  /** OBV 斜率观察窗口 (默认20) */
  obvLookback: number;
  /** OBV 斜率/均量阈值 (默认0.02) */
  minObvSlopeRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendObvParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00025,
  obvLookback: 20,
  minObvSlopeRatio: 0.02,
};

@Strategy({
  type: 'regression_trend_obv',
  name: '回归趋势+OBV',
  description: '回归斜率与OBV资金流趋势一致时开仓',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    obvLookback: 'OBV 斜率窗口',
    minObvSlopeRatio: 'OBV 斜率/均量阈值',
  },
})
export class RegressionTrendObvStrategy extends BaseStrategy<RegressionTrendObvParams> {
  readonly type: SignalStrategyType = 'regression_trend_obv';

  constructor(params?: Partial<RegressionTrendObvParams>) {
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
    const { lookbackPeriod, minSlopeRatio, obvLookback, minObvSlopeRatio } = this.params;

    const required = Math.max(lookbackPeriod, obvLookback);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
    const normalizedSlope = price === 0 ? 0 : slope / price;

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

    if (normalizedSlope > minSlopeRatio && obvBullish) {
      return this.long();
    }

    if (normalizedSlope < -minSlopeRatio && obvBearish) {
      return this.short();
    }

    return this.hold();
  }
}
