/**
 * 线性回归趋势 + RSI + ATR + MACD + ADX + CCI + KDJ + OBV + ROC 门控策略
 *
 * 在 OBV 成交量趋势确认基础上加入 ROC 动量过滤：
 * - ROC 衡量价格变化率
 * - 当 ROC 与趋势方向一致且幅度足够时才开仓，避免低动量震荡
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import {
  adx,
  atr,
  cci,
  kdj,
  linearRegressionSlope,
  macd,
  obv,
  roc,
  rsi,
  volumeProxy,
} from '../indicators/index.js';

export interface RegressionTrendRsiAtrMacdAdxCciKdjObvRocParams {
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
  /** ADX 周期 (默认14) */
  adxPeriod: number;
  /** ADX 最小趋势强度 (默认20) */
  minAdx: number;
  /** CCI 周期 (默认20) */
  cciPeriod: number;
  /** CCI 动能阈值 (默认100) */
  cciThreshold: number;
  /** KDJ RSV 周期 (默认9) */
  kdjPeriod: number;
  /** KDJ K 线平滑周期 (默认3) */
  kdjKPeriod: number;
  /** KDJ D 线平滑周期 (默认3) */
  kdjDPeriod: number;
  /** KDJ 超买阈值 (默认80) */
  kdjOverbought: number;
  /** KDJ 超卖阈值 (默认20) */
  kdjOversold: number;
  /** OBV 斜率观察窗口 (默认20) */
  obvLookback: number;
  /** OBV 斜率/均量阈值 (默认0.02) */
  minObvSlopeRatio: number;
  /** ROC 周期 (默认12) */
  rocPeriod: number;
  /** ROC 最小幅度阈值 (默认0.002) */
  minRocRatio: number;
}

const DEFAULT_PARAMS: RegressionTrendRsiAtrMacdAdxCciKdjObvRocParams = {
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
  adxPeriod: 14,
  minAdx: 20,
  cciPeriod: 20,
  cciThreshold: 100,
  kdjPeriod: 9,
  kdjKPeriod: 3,
  kdjDPeriod: 3,
  kdjOverbought: 80,
  kdjOversold: 20,
  obvLookback: 20,
  minObvSlopeRatio: 0.02,
  rocPeriod: 12,
  minRocRatio: 0.002,
};

@Strategy({
  type: 'regression_trend_rsi_atr_macd_adx_cci_kdj_obv_roc',
  name: '回归趋势+RSI+ATR+MACD+ADX+CCI+KDJ+OBV+ROC门控',
  description: '在回归斜率+RSI+ATR+MACD+ADX+CCI+KDJ+OBV基础上加入ROC动量确认，过滤低动量震荡',
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
    adxPeriod: 'ADX 周期',
    minAdx: 'ADX 最小趋势强度',
    cciPeriod: 'CCI 周期',
    cciThreshold: 'CCI 动能阈值',
    kdjPeriod: 'KDJ RSV 周期',
    kdjKPeriod: 'KDJ K 线平滑周期',
    kdjDPeriod: 'KDJ D 线平滑周期',
    kdjOverbought: 'KDJ 超买阈值',
    kdjOversold: 'KDJ 超卖阈值',
    obvLookback: 'OBV 斜率窗口',
    minObvSlopeRatio: 'OBV 斜率/均量阈值',
    rocPeriod: 'ROC 周期',
    minRocRatio: 'ROC 最小幅度阈值',
  },
})
export class RegressionTrendRsiAtrMacdAdxCciKdjObvRocStrategy extends BaseStrategy<RegressionTrendRsiAtrMacdAdxCciKdjObvRocParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_atr_macd_adx_cci_kdj_obv_roc';

  constructor(params?: Partial<RegressionTrendRsiAtrMacdAdxCciKdjObvRocParams>) {
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
      const x = i;
      const y = values[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }
    const numerator = n * sumXY - sumX * sumY;
    const denominator = n * sumXX - sumX * sumX;
    if (denominator === 0) return 0;
    return numerator / denominator;
  }

  private averageVolumeProxy(candles: Candle[], startIndex: number, endIndex: number): number {
    if (startIndex > endIndex) return 0;
    let sum = 0;
    for (let i = startIndex; i <= endIndex; i++) {
      sum += volumeProxy(candles[i]);
    }
    return sum / (endIndex - startIndex + 1);
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
      adxPeriod,
      minAdx,
      cciPeriod,
      cciThreshold,
      kdjPeriod,
      kdjKPeriod,
      kdjDPeriod,
      kdjOverbought,
      kdjOversold,
      obvLookback,
      minObvSlopeRatio,
      rocPeriod,
      minRocRatio,
    } = this.params;

    const required = Math.max(
      lookbackPeriod,
      rsiPeriod,
      atrPeriod,
      macdSlowPeriod + macdSignalPeriod,
      adxPeriod * 2,
      cciPeriod,
      kdjPeriod + kdjKPeriod + kdjDPeriod,
      obvLookback,
      rocPeriod
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

    const adxValue = adx(candles, currentIndex, adxPeriod);
    if (adxValue < minAdx) {
      return this.hold();
    }

    const cciValue = cci(candles, currentIndex, cciPeriod);
    if (Math.abs(cciValue) < cciThreshold) {
      return this.hold();
    }

    const kdjValue = kdj(candles, currentIndex, kdjPeriod, kdjKPeriod, kdjDPeriod);
    const kdjBullish = kdjValue.d < kdjOversold;
    const kdjBearish = kdjValue.d > kdjOverbought;

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

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);

    const macdValue = macd(candles, currentIndex, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
    const histRatio = price === 0 ? 0 : macdValue.histogram / price;

    const rocValue = roc(candles, currentIndex, rocPeriod);

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      histRatio >= minMacdHistRatio &&
      cciValue >= cciThreshold &&
      kdjBullish &&
      obvBullish &&
      rocValue >= minRocRatio
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      histRatio <= -minMacdHistRatio &&
      cciValue <= -cciThreshold &&
      kdjBearish &&
      obvBearish &&
      rocValue <= -minRocRatio
    ) {
      return this.short();
    }

    return this.hold();
  }
}
