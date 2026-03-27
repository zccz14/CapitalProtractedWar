/**
 * 线性回归趋势 + RSI + ATR + MACD + ADX + CCI 门控策略
 *
 * 在 ADX 门控基础上加入 CCI 动能过滤，避免弱动能区间。
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { adx, atr, cci, linearRegressionSlope, macd, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiAtrMacdAdxCciParams {
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
}

const DEFAULT_PARAMS: RegressionTrendRsiAtrMacdAdxCciParams = {
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
};

@Strategy({
  type: 'regression_trend_rsi_atr_macd_adx_cci',
  name: '回归趋势+RSI+ATR+MACD+ADX+CCI门控',
  description: '在回归斜率+RSI+ATR+MACD+ADX基础上加入CCI动能过滤，减少弱动能噪声',
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
  },
})
export class RegressionTrendRsiAtrMacdAdxCciStrategy extends BaseStrategy<RegressionTrendRsiAtrMacdAdxCciParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_atr_macd_adx_cci';

  constructor(params?: Partial<RegressionTrendRsiAtrMacdAdxCciParams>) {
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
      adxPeriod,
      minAdx,
      cciPeriod,
      cciThreshold,
    } = this.params;

    const required = Math.max(
      lookbackPeriod,
      rsiPeriod,
      atrPeriod,
      macdSlowPeriod + macdSignalPeriod,
      adxPeriod * 2,
      cciPeriod
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

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);

    const macdValue = macd(candles, currentIndex, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
    const histRatio = price === 0 ? 0 : macdValue.histogram / price;

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      histRatio >= minMacdHistRatio &&
      cciValue >= cciThreshold
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      histRatio <= -minMacdHistRatio &&
      cciValue <= -cciThreshold
    ) {
      return this.short();
    }

    return this.hold();
  }
}
