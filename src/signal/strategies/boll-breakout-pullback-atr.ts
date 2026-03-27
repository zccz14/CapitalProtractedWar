/**
 * 布林带突破 + 回踩入场 + ATR 波动过滤 (Bollinger Breakout Pullback w/ ATR Filter)
 *
 * 思路：突破后回踩入场，但要求 ATR/价格高于阈值，避免低波动假信号。
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands, atr, ema } from '../indicators/index.js';

export interface BollBreakoutPullbackAtrParams {
  period: number;
  stdDev: number;
  breakoutThreshold: number;
  maxWaitBars: number;
  closeThresholdRatio: number;
  atrPeriod: number;
  minAtrRatio: number;
  trendFast: number;
  trendSlow: number;
}

const DEFAULT_PARAMS: BollBreakoutPullbackAtrParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
  maxWaitBars: 10,
  closeThresholdRatio: 0.5,
  atrPeriod: 14,
  minAtrRatio: 0.003,
  trendFast: 20,
  trendSlow: 50,
};

@Strategy({
  type: 'boll_breakout_pullback_atr',
  name: '布林带突破(回踩+ATR过滤)',
  description: '回踩入场 + ATR波动过滤 + EMA趋势门控',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
    maxWaitBars: '最长等待回踩根数',
    closeThresholdRatio: '平仓阈值比例（靠近中轨）',
    atrPeriod: 'ATR周期',
    minAtrRatio: '最小ATR占比(ATR/Price)',
    trendFast: '趋势快线EMA周期',
    trendSlow: '趋势慢线EMA周期',
  },
})
export class BollBreakoutPullbackAtrStrategy extends BaseStrategy<BollBreakoutPullbackAtrParams> {
  readonly type: SignalStrategyType = 'boll_breakout_pullback_atr';

  private pendingDir: 1 | -1 | 0 = 0;
  private pendingBars = 0;

  constructor(params?: Partial<BollBreakoutPullbackAtrParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const {
      period,
      stdDev,
      breakoutThreshold,
      maxWaitBars,
      closeThresholdRatio,
      atrPeriod,
      minAtrRatio,
      trendFast,
      trendSlow,
    } = this.params;

    if (!this.hasEnoughData(currentIndex, Math.max(period, trendSlow, atrPeriod) + 1)) {
      return this.hold();
    }

    const bands = bollingerBands(candles, currentIndex, period, stdDev);
    const currentPrice = candles[currentIndex].close;
    const { upper, lower, middle } = bands;

    const atrValue = atr(candles, currentIndex, atrPeriod);
    const atrRatio = atrValue / currentPrice;

    const emaFast = ema(candles, currentIndex, trendFast);
    const emaSlow = ema(candles, currentIndex, trendSlow);

    const bandwidth = upper - lower;
    const closeThreshold = bandwidth * closeThresholdRatio * 0.5;

    // 平仓
    const position = this.getPosition();
    if (position !== 0 && Math.abs(currentPrice - middle) < closeThreshold) {
      return this.close();
    }

    // 等待回踩入场
    if (this.pendingDir !== 0) {
      this.pendingBars += 1;
      if (this.pendingBars <= maxWaitBars) {
        if (this.pendingDir === 1 && currentPrice <= upper) {
          this.pendingDir = 0;
          this.pendingBars = 0;
          return this.long();
        }
        if (this.pendingDir === -1 && currentPrice >= lower) {
          this.pendingDir = 0;
          this.pendingBars = 0;
          return this.short();
        }
      } else {
        this.pendingDir = 0;
        this.pendingBars = 0;
      }
    }

    // 过滤条件：足够波动 + EMA趋势方向
    if (atrRatio < minAtrRatio) return this.hold();

    const upTrend = emaFast > emaSlow;
    const downTrend = emaFast < emaSlow;

    if (upTrend && currentPrice > upper * (1 + breakoutThreshold)) {
      this.pendingDir = 1;
      this.pendingBars = 0;
      return this.hold();
    }
    if (downTrend && currentPrice < lower * (1 - breakoutThreshold)) {
      this.pendingDir = -1;
      this.pendingBars = 0;
      return this.hold();
    }

    return this.hold();
  }

  protected onReset(): void {
    this.pendingDir = 0;
    this.pendingBars = 0;
  }
}
