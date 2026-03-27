/**
 * 线性回归趋势 + MFI 确认策略
 *
 * 单指标：回归斜率 + MFI 资金流确认
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope, mfi } from '../indicators/index.js';

export interface RegressionTrendMfiParams {
  /** 回归周期 (默认20) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.00025） */
  minSlopeRatio: number;
  /** MFI 周期 (默认14) */
  mfiPeriod: number;
  /** 做多确认阈值 (默认60) */
  mfiBullThreshold: number;
  /** 做空确认阈值 (默认40) */
  mfiBearThreshold: number;
}

const DEFAULT_PARAMS: RegressionTrendMfiParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00025,
  mfiPeriod: 14,
  mfiBullThreshold: 60,
  mfiBearThreshold: 40,
};

@Strategy({
  type: 'regression_trend_mfi',
  name: '回归趋势+MFI',
  description: '回归斜率与MFI资金流确认，提高趋势信号质量',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    mfiPeriod: 'MFI 周期',
    mfiBullThreshold: 'MFI 做多确认阈值',
    mfiBearThreshold: 'MFI 做空确认阈值',
  },
})
export class RegressionTrendMfiStrategy extends BaseStrategy<RegressionTrendMfiParams> {
  readonly type: SignalStrategyType = 'regression_trend_mfi';

  constructor(params?: Partial<RegressionTrendMfiParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { lookbackPeriod, minSlopeRatio, mfiPeriod, mfiBullThreshold, mfiBearThreshold } =
      this.params;

    const required = Math.max(lookbackPeriod, mfiPeriod);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const mfiValue = mfi(candles, currentIndex, mfiPeriod);

    if (normalizedSlope > minSlopeRatio && mfiValue >= mfiBullThreshold) {
      return this.long();
    }

    if (normalizedSlope < -minSlopeRatio && mfiValue <= mfiBearThreshold) {
      return this.short();
    }

    return this.hold();
  }
}
