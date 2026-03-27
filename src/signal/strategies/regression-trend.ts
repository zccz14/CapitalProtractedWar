/**
 * 线性回归趋势策略 (Regression Trend)
 *
 * 使用回归斜率作为单一指标：
 * - 斜率显著为正 -> 做多
 * - 斜率显著为负 -> 做空
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope } from '../indicators/index.js';

export interface RegressionTrendParams {
  /** 回归周期 (默认20) */
  lookbackPeriod: number;
  /** 最小斜率阈值（占当前价格比例，默认0.0003） */
  minSlopeRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.0003,
};

@Strategy({
  type: 'regression_trend',
  name: '线性回归趋势',
  description: '基于线性回归斜率的趋势策略，斜率为正做多、为负做空',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
  },
})
export class RegressionTrendStrategy extends BaseStrategy<RegressionTrendParams> {
  readonly type: SignalStrategyType = 'regression_trend';

  constructor(params?: Partial<RegressionTrendParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { lookbackPeriod, minSlopeRatio } = this.params;

    if (!this.hasEnoughData(currentIndex, lookbackPeriod)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
    const normalizedSlope = price === 0 ? 0 : slope / price;

    if (normalizedSlope > minSlopeRatio) {
      return this.long();
    }

    if (normalizedSlope < -minSlopeRatio) {
      return this.short();
    }

    return this.hold();
  }
}
