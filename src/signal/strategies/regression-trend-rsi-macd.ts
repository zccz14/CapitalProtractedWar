/**
 * 线性回归趋势 + RSI + MACD 确认策略
 *
 * 双指标：回归斜率 + RSI 动量确认 + MACD 柱状图动能过滤
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { linearRegressionSlope, macd, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiMacdParams {
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
  /** MACD 快速 EMA 周期 (默认12) */
  macdFastPeriod: number;
  /** MACD 慢速 EMA 周期 (默认26) */
  macdSlowPeriod: number;
  /** MACD 信号线 EMA 周期 (默认9) */
  macdSignalPeriod: number;
  /** MACD 柱状图最小幅度/价格比 (默认0.00005) */
  minMacdHistRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiMacdParams = {
  lookbackPeriod: 20,
  minSlopeRatio: 0.00025,
  rsiPeriod: 14,
  rsiBullThreshold: 55,
  rsiBearThreshold: 45,
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  minMacdHistRatio: 0.00005,
};

@Strategy({
  type: 'regression_trend_rsi_macd',
  name: '回归趋势+RSI+MACD',
  description: '回归斜率与RSI动量确认，并要求MACD柱状图动能一致',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回归周期',
    minSlopeRatio: '最小斜率阈值（相对价格）',
    rsiPeriod: 'RSI 周期',
    rsiBullThreshold: 'RSI 做多确认阈值',
    rsiBearThreshold: 'RSI 做空确认阈值',
    macdFastPeriod: 'MACD 快速 EMA 周期',
    macdSlowPeriod: 'MACD 慢速 EMA 周期',
    macdSignalPeriod: 'MACD 信号线 EMA 周期',
    minMacdHistRatio: 'MACD 柱状图最小幅度/价格比',
  },
})
export class RegressionTrendRsiMacdStrategy extends BaseStrategy<RegressionTrendRsiMacdParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_macd';

  constructor(params?: Partial<RegressionTrendRsiMacdParams>) {
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
      macdFastPeriod,
      macdSlowPeriod,
      macdSignalPeriod,
      minMacdHistRatio,
    } = this.params;

    const required = Math.max(lookbackPeriod, rsiPeriod, macdSlowPeriod + macdSignalPeriod);
    if (!this.hasEnoughData(currentIndex, required)) {
      return this.hold();
    }

    const price = candles[currentIndex].close;
    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);

    const macdValue = macd(candles, currentIndex, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
    const histRatio = price === 0 ? 0 : macdValue.histogram / price;

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      histRatio >= minMacdHistRatio
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      histRatio <= -minMacdHistRatio
    ) {
      return this.short();
    }

    return this.hold();
  }
}
