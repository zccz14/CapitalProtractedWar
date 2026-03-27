/**
 * 布林带突破 + 回踩入场 + 趋势门控 (Bollinger Breakout Pullback w/ Trend Gate)
 *
 * 思路：只在中轨斜率方向明确时启用回踩入场，避免中性市场反复被打。
 * - 上升趋势：突破上轨 -> 回踩上轨内侧 -> 做多
 * - 下降趋势：跌破下轨 -> 回踩下轨内侧 -> 做空
 * - 平仓：价格回到中轨附近
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollBreakoutPullbackTrendParams {
  period: number;
  stdDev: number;
  breakoutThreshold: number;
  maxWaitBars: number;
  closeThresholdRatio: number;
  trendLookback: number;
  minSlope: number;
}

const DEFAULT_PARAMS: BollBreakoutPullbackTrendParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
  maxWaitBars: 10,
  closeThresholdRatio: 0.5,
  trendLookback: 10,
  minSlope: 0,
};

@Strategy({
  type: 'boll_breakout_pullback_trend',
  name: '布林带突破(回踩+趋势门控)',
  description: '趋势明确时才启用回踩入场，提升PnL稳定性',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
    maxWaitBars: '最长等待回踩根数',
    closeThresholdRatio: '平仓阈值比例（靠近中轨）',
    trendLookback: '趋势过滤窗口（中轨斜率）',
    minSlope: '中轨最小斜率阈值',
  },
})
export class BollBreakoutPullbackTrendStrategy extends BaseStrategy<BollBreakoutPullbackTrendParams> {
  readonly type: SignalStrategyType = 'boll_breakout_pullback_trend';

  private pendingDir: 1 | -1 | 0 = 0;
  private pendingBars = 0;

  constructor(params?: Partial<BollBreakoutPullbackTrendParams>) {
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
      trendLookback,
      minSlope,
    } = this.params;

    if (!this.hasEnoughData(currentIndex, period + trendLookback)) {
      return this.hold();
    }

    const bandsNow = bollingerBands(candles, currentIndex, period, stdDev);
    const bandsPrev = bollingerBands(candles, currentIndex - trendLookback, period, stdDev);
    const slope = (bandsNow.middle - bandsPrev.middle) / trendLookback;

    const currentPrice = candles[currentIndex].close;
    const { upper, lower, middle } = bandsNow;
    const bandwidth = upper - lower;
    const closeThreshold = bandwidth * closeThresholdRatio * 0.5;

    // 平仓条件
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

    // 仅在趋势满足时启用突破
    if (slope > minSlope && currentPrice > upper * (1 + breakoutThreshold)) {
      this.pendingDir = 1;
      this.pendingBars = 0;
      return this.hold();
    }
    if (slope < -minSlope && currentPrice < lower * (1 - breakoutThreshold)) {
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
