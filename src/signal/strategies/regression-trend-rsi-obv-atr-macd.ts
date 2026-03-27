/**
 * 线性回归趋势 + RSI + OBV + ATR + MACD 门控策略
 *
 * 在回归斜率 + RSI + OBV + ATR 基础上加入 MACD 柱状图确认，
 * 过滤动能不足区间，避免过度收敛。
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { atr, linearRegressionSlope, macd, obv, rsi, volumeProxy } from '../indicators/index.js';

export interface RegressionTrendRsiObvAtrMacdParams {
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
  /** MACD 快速 EMA 周期 (默认12) */
  macdFastPeriod: number;
  /** MACD 慢速 EMA 周期 (默认26) */
  macdSlowPeriod: number;
  /** MACD 信号线 EMA 周期 (默认9) */
  macdSignalPeriod: number;
  /** MACD 柱状图最小幅度/价格比 (默认0.00005) */
  minMacdHistRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiObvAtrMacdParams = {
  lookbackPeriod: 22,
  minSlopeRatio: 0.00023,
  rsiPeriod: 14,
  rsiBullThreshold: 54,
  rsiBearThreshold: 46,
  obvLookback: 20,
  minObvSlopeRatio: 0.018,
  atrPeriod: 14,
  minAtrRatio: 0.0022,
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalPeriod: 9,
  minMacdHistRatio: 0.00005,
};

@Strategy({
  type: 'regression_trend_rsi_obv_atr_macd',
  name: '回归趋势+RSI+OBV+ATR+MACD门控',
  description: '回归斜率+RSI+OBV一致时开仓，并用ATR与MACD过滤低波动与弱动能区间',
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
    macdFastPeriod: 'MACD 快速 EMA 周期',
    macdSlowPeriod: 'MACD 慢速 EMA 周期',
    macdSignalPeriod: 'MACD 信号线 EMA 周期',
    minMacdHistRatio: 'MACD 柱状图最小幅度/价格比',
  },
})
export class RegressionTrendRsiObvAtrMacdStrategy extends BaseStrategy<RegressionTrendRsiObvAtrMacdParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_obv_atr_macd';

  constructor(params?: Partial<RegressionTrendRsiObvAtrMacdParams>) {
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
      macdFastPeriod,
      macdSlowPeriod,
      macdSignalPeriod,
      minMacdHistRatio,
    } = this.params;

    const required = Math.max(
      lookbackPeriod,
      rsiPeriod,
      obvLookback,
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

    const macdValue = macd(candles, currentIndex, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
    const histRatio = price === 0 ? 0 : macdValue.histogram / price;

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      obvBullish &&
      histRatio >= minMacdHistRatio
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      obvBearish &&
      histRatio <= -minMacdHistRatio
    ) {
      return this.short();
    }

    return this.hold();
  }
}
