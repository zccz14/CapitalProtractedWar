/**
 * 线性回归趋势 + RSI + ATR + MACD 门控策略
 *
 * 在三指标基础上加入 MACD 柱状图确认，过滤动能不足区间。
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { atr, linearRegressionSlope, macd, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiAtrMacdParams {
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
  /** MACD 快速 EMA 周期 (默认12) */
  macdFastPeriod: number;
  /** MACD 慢速 EMA 周期 (默认26) */
  macdSlowPeriod: number;
  /** MACD 信号线 EMA 周期 (默认9) */
  macdSignalPeriod: number;
  /** MACD 柱状图最小幅度/价格比 (默认0.00005) */
  minMacdHistRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiAtrMacdParams = {
  lookbackPeriod: 24,
  minSlopeRatio: 0.00022,
  rsiPeriod: 14,
  rsiBullThreshold: 56,
  rsiBearThreshold: 44,
  atrPeriod: 14,
  minAtrRatio: 0.0025,
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  minMacdHistRatio: 0.00005,
};

@Strategy({
  type: 'regression_trend_rsi_atr_macd',
  name: '回归趋势+RSI+ATR+MACD门控',
  description: '在回归斜率+RSI+ATR基础上增加MACD柱状图确认，避免动能不足噪声',
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
    macdFastPeriod: 'MACD 快速 EMA 周期',
    macdSlowPeriod: 'MACD 慢速 EMA 周期',
    macdSignalPeriod: 'MACD 信号线 EMA 周期',
    minMacdHistRatio: 'MACD 柱状图最小幅度/价格比',
  },
})
export class RegressionTrendRsiAtrMacdStrategy extends BaseStrategy<RegressionTrendRsiAtrMacdParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_atr_macd';

  constructor(params?: Partial<RegressionTrendRsiAtrMacdParams>) {
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
      macdFastPeriod,
      macdSlowPeriod,
      macdSignalPeriod,
      minMacdHistRatio,
    } = this.params;

    const required = Math.max(
      lookbackPeriod,
      rsiPeriod,
      atrPeriod,
      macdSlowPeriod + macdSignalPeriod
    );
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
