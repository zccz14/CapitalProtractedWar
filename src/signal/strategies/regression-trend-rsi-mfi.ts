/**
 * 线性回归趋势 + RSI + MFI 确认策略
 *
 * 双指标：回归斜率 + RSI 动量确认 + MFI 资金流确认
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope, mfi, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiMfiParams {
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
  /** MFI 周期 (默认14) */
  mfiPeriod: number;
  /** 做多确认阈值 (默认60) */
  mfiBullThreshold: number;
  /** 做空确认阈值 (默认40) */
  mfiBearThreshold: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiMfiParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00025,
  rsiPeriod: 14,
  rsiBullThreshold: 55,
  rsiBearThreshold: 45,
  mfiPeriod: 14,
  mfiBullThreshold: 60,
  mfiBearThreshold: 40,
};

@Strategy({
  type: 'regression_trend_rsi_mfi',
  name: '回归趋势+RSI+MFI',
  description: '回归斜率与RSI动量确认，并要求MFI资金流一致',
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
  },
})
export class RegressionTrendRsiMfiStrategy extends BaseStrategy<RegressionTrendRsiMfiParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_mfi';

  constructor(params?: Partial<RegressionTrendRsiMfiParams>) {
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
      mfiPeriod,
      mfiBullThreshold,
      mfiBearThreshold,
    } = this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod, mfiPeriod);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);
    const mfiValue = mfi(candles, currentIndex, mfiPeriod);

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      mfiValue >= mfiBullThreshold
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      mfiValue <= mfiBearThreshold
    ) {
      return this.short();
    }

    return this.hold();
  }
}
