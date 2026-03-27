/**
 * 布林带突破策略 (Bollinger Bands Breakout)
 *
 * 价格突破布林带上下轨时顺势交易：
 * - 突破上轨 -> 做多
 * - 跌破下轨 -> 做空
 * - 价格回到轨道内 -> 平仓（突破失败/回归）
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollBreakoutParams {
  /** 布林带周期 (默认20) */
  period: number;
  /** 标准差倍数 (默认2) */
  stdDev: number;
  /** 突破确认阈值 (默认0, 例如0.01=需超出轨道1%) */
  breakoutThreshold: number;
}

const DEFAULT_PARAMS: BollBreakoutParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
};

@Strategy({
  type: 'boll_breakout',
  name: '布林带突破',
  description: '价格突破布林带上下轨时顺势交易，回到轨道内平仓',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
  },
})
export class BollBreakoutStrategy extends BaseStrategy<BollBreakoutParams> {
  readonly type: SignalStrategyType = 'boll_breakout';

  constructor(params?: Partial<BollBreakoutParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, stdDev, breakoutThreshold } = this.params;

    if (!this.hasEnoughData(currentIndex, period)) {
      return this.hold();
    }

    const bands = bollingerBands(candles, currentIndex, period, stdDev);
    const currentPrice = candles[currentIndex].close;
    const { upper, lower } = bands;

    // 向上突破 -> 做多
    if (currentPrice > upper * (1 + breakoutThreshold)) {
      return this.long();
    }

    // 向下突破 -> 做空
    if (currentPrice < lower * (1 - breakoutThreshold)) {
      return this.short();
    }

    // 回到轨道内 -> 平仓
    const position = this.getPosition();
    if (position === 1 && currentPrice <= upper) {
      return this.close();
    }
    if (position === -1 && currentPrice >= lower) {
      return this.close();
    }

    return this.hold();
  }
}
