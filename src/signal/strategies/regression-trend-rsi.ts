/**
 * 线性回归趋势 + RSI 确认策略
 *
 * 双指标：回归斜率 + RSI 动量确认
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiParams {
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
}

const DEFAULT_PARAMS: RegressionTrendRsiParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00025,
  rsiPeriod: 14,
  rsiBullThreshold: 55,
  rsiBearThreshold: 45,
};

@Strategy({
  type: 'regression_trend_rsi',
  name: '回归趋势+RSI',
  description: '回归斜率与RSI双指标确认，提升趋势信号稳定性',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    rsiPeriod: 'RSI 周期',
    rsiBullThreshold: 'RSI 做多确认阈值',
    rsiBearThreshold: 'RSI 做空确认阈值',
  },
})
export class RegressionTrendRsiStrategy extends BaseStrategy<RegressionTrendRsiParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi';

  constructor(params?: Partial<RegressionTrendRsiParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { lookbackPeriod, minSlopeRatio, rsiPeriod, rsiBullThreshold, rsiBearThreshold } =
      this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const price = candles[currentIndex].close;
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
