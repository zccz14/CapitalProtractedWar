/**
 * 趋势跟踪策略 (Trend Following)
 * 
 * 基于均线交叉的经典趋势跟踪策略：
 * - 金叉（短期均线上穿长期均线）做多
 * - 死叉（短期均线下穿长期均线）做空
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { sma } from '../indicators/index.js';

export interface TrendFollowingParams {
  /** 短期均线周期 (默认5) */
  shortPeriod: number;
  /** 长期均线周期 (默认20) */
  longPeriod: number;
}

const DEFAULT_PARAMS: TrendFollowingParams = {
  shortPeriod: 5,
  longPeriod: 20,
};

@Strategy({
  type: 'trend_following',
  name: '趋势跟踪',
  description: '基于均线交叉的趋势跟踪策略，金叉做多，死叉做空',
  category: 'trend',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    shortPeriod: '短期均线周期',
    longPeriod: '长期均线周期',
  },
})
export class TrendFollowingStrategy extends BaseStrategy<TrendFollowingParams> {
  readonly type: SignalStrategyType = 'trend_following';

  constructor(params?: Partial<TrendFollowingParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { shortPeriod, longPeriod } = this.params;
    
    // 需要足够的历史数据
    if (!this.hasEnoughData(currentIndex, longPeriod)) {
      return this.hold();
    }

    // 计算当前和前一根K线的均线
    const shortSMA = sma(candles, currentIndex, shortPeriod);
    const longSMA = sma(candles, currentIndex, longPeriod);
    const prevShortSMA = sma(candles, currentIndex - 1, shortPeriod);
    const prevLongSMA = sma(candles, currentIndex - 1, longPeriod);

    // 金叉: 短期均线上穿长期均线 -> 做多
    if (prevShortSMA <= prevLongSMA && shortSMA > longSMA) {
      const strength = (shortSMA - longSMA) / longSMA;
      return this.openPosition('long', strength);
    }

    // 死叉: 短期均线下穿长期均线 -> 做空
    if (prevShortSMA >= prevLongSMA && shortSMA < longSMA) {
      const strength = (longSMA - shortSMA) / longSMA;
      return this.openPosition('short', strength);
    }

    return this.hold();
  }
}
