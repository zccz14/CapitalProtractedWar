/**
 * 布林带突破 + 回踩入场 (Bollinger Breakout Pullback)
 *
 * 思路：先出现突破，等待回踩上/下轨再顺势入场，降低追高风险。
 * - 突破上轨 -> 进入待入场状态，回踩到上轨内侧 -> 做多
 * - 跌破下轨 -> 待入场，回踩到下轨内侧 -> 做空
 * - 平仓：价格回到中轨附近
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollBreakoutPullbackParams {
  /** 布林带周期 (默认20) */
  period: number;
  /** 标准差倍数 (默认2) */
  stdDev: number;
  /** 突破确认阈值 (默认0) */
  breakoutThreshold: number;
  /** 最长等待回踩根数 (默认10) */
  maxWaitBars: number;
  /** 平仓阈值比例 (默认0.5, 接近中轨即出) */
  closeThresholdRatio: number;
}

const DEFAULT_PARAMS: BollBreakoutPullbackParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
  maxWaitBars: 10,
  closeThresholdRatio: 0.5,
};

@Strategy({
  type: 'boll_breakout_pullback',
  name: '布林带突破(回踩入场)',
  description: '突破后等待回踩轨道内侧再入场，减少追高风险',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
    maxWaitBars: '最长等待回踩根数',
    closeThresholdRatio: '平仓阈值比例（靠近中轨）',
  },
})
export class BollBreakoutPullbackStrategy extends BaseStrategy<BollBreakoutPullbackParams> {
  readonly type: SignalStrategyType = 'boll_breakout_pullback';

  private pendingDir: 1 | -1 | 0 = 0; // 1=等待做多回踩, -1=等待做空回踩
  private pendingBars = 0;

  constructor(params?: Partial<BollBreakoutPullbackParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, stdDev, breakoutThreshold, maxWaitBars, closeThresholdRatio } = this.params;

    if (!this.hasEnoughData(currentIndex, period)) {
      return this.hold();
    }

    const bands = bollingerBands(candles, currentIndex, period, stdDev);
    const currentPrice = candles[currentIndex].close;
    const { upper, lower, middle } = bands;

    // 计算平仓阈值
    const bandwidth = upper - lower;
    const closeThreshold = bandwidth * closeThresholdRatio * 0.5;

    // 若已有持仓，靠近中轨平仓
    const position = this.getPosition();
    if (position === 1 && Math.abs(currentPrice - middle) < closeThreshold) {
      return this.close();
    }
    if (position === -1 && Math.abs(currentPrice - middle) < closeThreshold) {
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
        // 超时取消
        this.pendingDir = 0;
        this.pendingBars = 0;
      }
    }

    // 触发突破，进入等待回踩
    if (currentPrice > upper * (1 + breakoutThreshold)) {
      this.pendingDir = 1;
      this.pendingBars = 0;
      return this.hold();
    }
    if (currentPrice < lower * (1 - breakoutThreshold)) {
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
