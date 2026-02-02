/**
 * 突破策略 (Breakout)
 *
 * 价格突破历史高低点时顺势交易：
 * - 突破前期高点 -> 做多
 * - 突破前期低点 -> 做空
 * - 价格回到区间内 -> 止损平仓
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { highest, lowest } from '../indicators/index.js';

export interface BreakoutParams {
  /** 回看周期 (默认20) */
  lookbackPeriod: number;
  /** 突破确认阈值 (默认0.01, 即需要超出1%才确认突破) */
  breakoutThreshold: number;
  /** 止损回撤比例 (默认0.5, 即回撤区间的50%时止损) */
  stopLossRatio: number;
}

const DEFAULT_PARAMS: BreakoutParams = {
  lookbackPeriod: 20,
  breakoutThreshold: 0.01,
  stopLossRatio: 0.5,
};

@Strategy({
  type: 'breakout',
  name: '突破策略',
  description: '价格突破历史高低点时顺势交易',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackPeriod: '回看周期',
    breakoutThreshold: '突破确认阈值',
    stopLossRatio: '止损回撤比例',
  },
})
export class BreakoutStrategy extends BaseStrategy<BreakoutParams> {
  readonly type: SignalStrategyType = 'breakout';

  // 记录突破时的高低点，用于止损判断
  private breakoutHigh: number = 0;
  private breakoutLow: number = 0;

  constructor(params?: Partial<BreakoutParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { lookbackPeriod, breakoutThreshold, stopLossRatio } = this.params;

    if (!this.hasEnoughData(currentIndex, lookbackPeriod)) {
      return this.hold();
    }

    // 计算回看周期内的最高价和最低价（不包括当前K线）
    const highestHigh = highest(candles, currentIndex - 1, lookbackPeriod, 'high');
    const lowestLow = lowest(candles, currentIndex - 1, lookbackPeriod, 'low');
    const range = highestHigh - lowestLow;

    const currentPrice = candles[currentIndex].close;

    // 向上突破 -> 做多
    if (currentPrice > highestHigh * (1 + breakoutThreshold)) {
      this.breakoutHigh = highestHigh;
      this.breakoutLow = lowestLow;
      return this.long();
    }

    // 向下突破 -> 做空
    if (currentPrice < lowestLow * (1 - breakoutThreshold)) {
      this.breakoutHigh = highestHigh;
      this.breakoutLow = lowestLow;
      return this.short();
    }

    // 止损检查
    const position = this.getPosition();
    if (position === 1) {
      const stopPrice = this.breakoutHigh - range * stopLossRatio;
      if (currentPrice < stopPrice) {
        return this.close();
      }
    }
    if (position === -1) {
      const stopPrice = this.breakoutLow + range * stopLossRatio;
      if (currentPrice > stopPrice) {
        return this.close();
      }
    }

    return this.hold();
  }

  protected onReset(): void {
    this.breakoutHigh = 0;
    this.breakoutLow = 0;
  }
}
