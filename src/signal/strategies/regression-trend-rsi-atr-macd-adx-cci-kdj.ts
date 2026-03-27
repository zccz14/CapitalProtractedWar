/**
 * 线性回归趋势 + RSI + ATR + MACD + ADX + CCI + KDJ 门控策略
 *
 * 在 CCI 门控基础上加入 KDJ 随机指标超买超卖过滤，进一步减少虚假信号。
 *
 * KDJ 指标说明：
 * - K 值：快速随机线，反映当前价格在周期内的相对位置
 * - D 值：慢速随机线，K 值的平滑
 * - J 值：3*K - 2*D，放大 K、D 的波动
 * - 超买区域：K/D > 80
 * - 超卖区域：K/D < 20
 * - 金叉：K 上穿 D（做多信号）
 * - 死叉：K 下穿 D（做空信号）
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { adx, atr, cci, kdj, linearRegressionSlope, macd, rsi } from '../indicators/index.js';

export interface RegressionTrendRsiAtrMacdAdxCciKdjParams {
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
}

const DEFAULT_PARAMS: RegressionTrendRsiAtrMacdAdxCciKdjParams = {
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
};

@Strategy({
  type: 'regression_trend_rsi_atr_macd_adx_cci_kdj',
  name: '回归趋势+RSI+ATR+MACD+ADX+CCI+KDJ门控',
  description: '在回归斜率+RSI+ATR+MACD+ADX+CCI基础上加入KDJ超买超卖过滤，减少虚假突破信号',
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
  },
})
export class RegressionTrendRsiAtrMacdAdxCciKdjStrategy extends BaseStrategy<RegressionTrendRsiAtrMacdAdxCciKdjParams> {
  readonly type: SignalStrategyType = 'regression_trend_rsi_atr_macd_adx_cci_kdj';

  constructor(params?: Partial<RegressionTrendRsiAtrMacdAdxCciKdjParams>) {
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
      kdjPeriod,
      kdjKPeriod,
      kdjDPeriod,
      kdjOverbought,
      kdjOversold,
    } = this.params;

    const required = Math.max(
      lookbackPeriod,
      rsiPeriod,
      atrPeriod,
      macdSlowPeriod + macdSignalPeriod,
      adxPeriod * 2,
      cciPeriod,
      kdjPeriod + kdjKPeriod + kdjDPeriod
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
    // KDJ 做多：要求从超卖区域回升 (D < 30)，做空：要求从超买区域回落 (D > 70)
    const kdjBullish = kdjValue.d < kdjOversold;
    const kdjBearish = kdjValue.d > kdjOverbought;

    const slope = linearRegressionSlope(candles, currentIndex, lookbackPeriod);
    const normalizedSlope = price === 0 ? 0 : slope / price;
    const rsiValue = rsi(candles, currentIndex, rsiPeriod);

    const macdValue = macd(candles, currentIndex, macdFastPeriod, macdSlowPeriod, macdSignalPeriod);
    const histRatio = price === 0 ? 0 : macdValue.histogram / price;

    if (
      normalizedSlope > minSlopeRatio &&
      rsiValue >= rsiBullThreshold &&
      histRatio >= minMacdHistRatio &&
      cciValue >= cciThreshold &&
      kdjBullish
    ) {
      return this.long();
    }

    if (
      normalizedSlope < -minSlopeRatio &&
      rsiValue <= rsiBearThreshold &&
      histRatio <= -minMacdHistRatio &&
      cciValue <= -cciThreshold &&
      kdjBearish
    ) {
      return this.short();
    }

    return this.hold();
  }
}
