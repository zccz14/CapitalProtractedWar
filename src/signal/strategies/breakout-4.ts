/**
 * 4根K线突破策略 (Breakout-4)
 *
 * 简单的突破策略：
 * - 当前收盘超过前面4根K线的最高价 -> 平空做多
 * - 当前收盘低于前面4根K线的最低价 -> 平多做空
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { highest, lowest } from '../indicators/index.js';

export interface Breakout4Params {
  /** 回看K线数量 (默认4) */
  lookbackCount: number;
}

const DEFAULT_PARAMS: Breakout4Params = {
  lookbackCount: 4,
};

@Strategy({
  type: 'breakout_4',
  name: '4根K线突破',
  description: '价格突破前4根K线的高低点时反向操作',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    lookbackCount: '回看K线数量',
  },
})
export class Breakout4Strategy extends BaseStrategy<Breakout4Params> {
  readonly type: SignalStrategyType = 'breakout_4';

  constructor(params?: Partial<Breakout4Params>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { lookbackCount } = this.params;

    if (!this.hasEnoughData(currentIndex, lookbackCount)) {
      return this.hold();
    }

    const highestHigh = highest(candles, currentIndex - 1, lookbackCount, 'high');
    const lowestLow = lowest(candles, currentIndex - 1, lookbackCount, 'low');
    const currentPrice = candles[currentIndex].close;
    const currentPosition = this.getPosition();

    if (currentPrice > highestHigh) {
      if (currentPosition === -1) {
        return this.long();
      }
      if (currentPosition === 0) {
        return this.long();
      }
    }

    if (currentPrice < lowestLow) {
      if (currentPosition === 1) {
        return this.short();
      }
      if (currentPosition === 0) {
        return this.short();
      }
    }

    return this.hold();
  }
}
