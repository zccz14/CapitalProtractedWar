/**
 * 布林带突破 + 确认 (Bollinger Breakout Confirmation)
 *
 * 思路：突破后要求连续 N 根K线保持在轨道外才入场，过滤假突破。
 * - 连续 N 根收盘 > 上轨 -> 做多
 * - 连续 N 根收盘 < 下轨 -> 做空
 * - 价格回到轨道内 -> 平仓
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollBreakoutConfirmParams {
  /** 布林带周期 (默认20) */
  period: number;
  /** 标准差倍数 (默认2) */
  stdDev: number;
  /** 突破确认阈值 (默认0) */
  breakoutThreshold: number;
  /** 连续确认根数 (默认2) */
  confirmBars: number;
}

const DEFAULT_PARAMS: BollBreakoutConfirmParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
  confirmBars: 2,
};

@Strategy({
  type: 'boll_breakout_confirm',
  name: '布林带突破(确认)',
  description: '突破后连续N根K线确认再入场，减少假突破',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
    confirmBars: '连续确认根数',
  },
})
export class BollBreakoutConfirmStrategy extends BaseStrategy<BollBreakoutConfirmParams> {
  readonly type: SignalStrategyType = 'boll_breakout_confirm';

  constructor(params?: Partial<BollBreakoutConfirmParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, stdDev, breakoutThreshold, confirmBars } = this.params;

    if (!this.hasEnoughData(currentIndex, period + confirmBars)) {
      return this.hold();
    }

    // 检查最近 confirmBars 根是否全部在轨道外
    let above = true;
    let below = true;
    for (let i = currentIndex - confirmBars + 1; i <= currentIndex; i++) {
      const bands = bollingerBands(candles, i, period, stdDev);
      const price = candles[i].close;
      if (price <= bands.upper * (1 + breakoutThreshold)) {
        above = false;
      }
      if (price >= bands.lower * (1 - breakoutThreshold)) {
        below = false;
      }
    }

    if (above) return this.long();
    if (below) return this.short();

    // 回到轨道内 -> 平仓
    const bandsNow = bollingerBands(candles, currentIndex, period, stdDev);
    const currentPrice = candles[currentIndex].close;
    const position = this.getPosition();
    if (position === 1 && currentPrice <= bandsNow.upper) {
      return this.close();
    }
    if (position === -1 && currentPrice >= bandsNow.lower) {
      return this.close();
    }

    return this.hold();
  }
}
