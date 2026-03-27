/**
 * 线性回归趋势 + RSI + MFI 门控策略
 *
 * 门控/参数微调：在 RSI + MFI 双指标基础上，引入 MFI 斜率门控
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope, mfi, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiMfiGateParams {
  /** 回归周期 (默认20) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.00023） */
  minSlopeRatio: number;
  /** RSI 周期 (默认14) */
  rsiPeriod: number;
  /** 做多确认阈值 (默认55) */
  rsiBullThreshold: number;
  /** 做空确认阈值 (默认45) */
  rsiBearThreshold: number;
  /** MFI 周期 (默认14) */
  mfiPeriod: number;
  /** 做多确认阈值 (默认60) */
  mfiBullThreshold: number;
  /** 做空确认阈值 (默认40) */
  mfiBearThreshold: number;
  /** MFI 斜率观察窗口 (默认12) */
  mfiLookback: number;
  /** 最小 MFI 斜率阈值 (默认0.2) */
  minMfiSlope: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiMfiGateParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00023,
  rsiPeriod: 14,
  rsiBullThreshold: 55,
  rsiBearThreshold: 45,
  mfiPeriod: 14,
  mfiBullThreshold: 60,
  mfiBearThreshold: 40,
  mfiLookback: 12,
  minMfiSlope: 0.2,
};

@Strategy({
  type: 'regression_trend_rsi_mfi_gate',
  name: '回归趋势+RSI+MFI(门控)',
  description: '回归斜率与RSI/MFI确认，并要求MFI斜率同向强化',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    rsiPeriod: 'RSI 周期',
    rsiBullThreshold: 'RSI 做多确认阈值',
    rsiBearThreshold: 'RSI 做空确认阈值',
    mfiPeriod: 'MFI 周期',
    mfiBullThreshold: 'MFI 做多确认阈值',
    mfiBearThreshold: 'MFI 做空确认阈值',
    mfiLookback: 'MFI 斜率观察窗口',
    minMfiSlope: '最小 MFI 斜率阈值',
  },
})
export class RegressionTrendRsiMfiGateStrategy extends BaseStrategy<RegressionTrendRsiMfiGateParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_mfi_gate';

  constructor(params?: Partial<RegressionTrendRsiMfiGateParams>) {
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

  generate(candles: Candle[], currentIndex: number): Signal {
    const {
      lookbackPeriod,
      minSlopeRatio,
      rsiPeriod,
      rsiBullThreshold,
      rsiBearThreshold,
      mfiPeriod,
      mfiBullThreshold,
      mfiBearThreshold,
      mfiLookback,
      minMfiSlope,
    } = this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod, mfiPeriod + mfiLookback);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);
    const mfiValue = mfi(candles, currentIndex, mfiPeriod);

    const mfiValues: number[] = [];
    const mfiStart = currentIndex - mfiLookback + 1;
    for (let i = mfiStart; i <= currentIndex; i++) {
      const value = mfi(candles, i, mfiPeriod);
      if (!Number.isFinite(value)) return this.hold();
      mfiValues.push(value);
    }
    const mfiSlope = this.linearRegressionSlopeFromValues(mfiValues);
    const mfiBullish = mfiSlope >= minMfiSlope;
    const mfiBearish = mfiSlope <= -minMfiSlope;

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      mfiValue >= mfiBullThreshold &&
      mfiBullish
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      mfiValue <= mfiBearThreshold &&
      mfiBearish
    ) {
      return this.short();
    }

    return this.hold();
  }
}
