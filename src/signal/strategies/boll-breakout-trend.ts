/**
 * 布林带突破 + 趋势过滤 (Bollinger Breakout with Trend Filter)
 *
 * 思路：顺势突破，但要求中轨斜率同向，过滤震荡假突破。
 * - 突破上轨 && 中轨上升 -> 做多
 * - 跌破下轨 && 中轨下降 -> 做空
 * - 价格回到轨道内 -> 平仓
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollBreakoutTrendParams {
  /** 布林带周期 (默认20) */
  period: number;
  /** 标准差倍数 (默认2) */
  stdDev: number;
  /** 突破确认阈值 (默认0) */
  breakoutThreshold: number;
  /** 趋势过滤窗口 (默认10) */
  trendLookback: number;
  /** 中轨最小斜率 (默认0, >0为上升, <0为下降) */
  minSlope: number;
}

const DEFAULT_PARAMS: BollBreakoutTrendParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
  trendLookback: 10,
  minSlope: 0,
};

@Strategy({
  type: 'boll_breakout_trend',
  name: '布林带突破(趋势过滤)',
  description: '布林带突破 + 中轨斜率过滤，减少震荡假突破',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
    trendLookback: '趋势过滤窗口（中轨斜率）',
    minSlope: '中轨最小斜率阈值',
  },
})
export class BollBreakoutTrendStrategy extends BaseStrategy<BollBreakoutTrendParams> {
  readonly type: SignalStrategyType = 'boll_breakout_trend';

  constructor(params?: Partial<BollBreakoutTrendParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, stdDev, breakoutThreshold, trendLookback, minSlope } = this.params;

    if (!this.hasEnoughData(currentIndex, period + trendLookback)) {
      return this.hold();
    }

    const bandsNow = bollingerBands(candles, currentIndex, period, stdDev);
    const bandsPrev = bollingerBands(candles, currentIndex - trendLookback, period, stdDev);

    const currentPrice = candles[currentIndex].close;
    const slope = (bandsNow.middle - bandsPrev.middle) / trendLookback;

    // 向上突破 + 上升趋势
    if (currentPrice > bandsNow.upper * (1 + breakoutThreshold) && slope > minSlope) {
      return this.long();
    }

    // 向下突破 + 下降趋势
    if (currentPrice < bandsNow.lower * (1 - breakoutThreshold) && slope < -minSlope) {
      return this.short();
    }

    // 回到轨道内 -> 平仓
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
