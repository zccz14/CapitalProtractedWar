/**
 * 布林带突破 + 挤压过滤 (Bollinger Breakout with Squeeze Filter)
 *
 * 思路：只在带宽收窄（低波动）时参与突破，过滤噪声。
 * - 带宽比 < squeezeThreshold 且突破上轨 -> 做多
 * - 带宽比 < squeezeThreshold 且跌破下轨 -> 做空
 * - 价格回到轨道内 -> 平仓
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollBreakoutSqueezeParams {
  /** 布林带周期 (默认20) */
  period: number;
  /** 标准差倍数 (默认2) */
  stdDev: number;
  /** 突破确认阈值 (默认0) */
  breakoutThreshold: number;
  /** 带宽比阈值 (默认0.04) = (upper-lower)/middle */
  squeezeThreshold: number;
}

const DEFAULT_PARAMS: BollBreakoutSqueezeParams = {
  period: 20,
  stdDev: 2,
  breakoutThreshold: 0,
  squeezeThreshold: 0.04,
};

@Strategy({
  type: 'boll_breakout_squeeze',
  name: '布林带突破(挤压过滤)',
  description: '仅在布林带收窄时参与突破，减少震荡噪声',
  category: 'breakout',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    breakoutThreshold: '突破确认阈值（超出轨道的比例）',
    squeezeThreshold: '带宽比阈值（(upper-lower)/middle）',
  },
})
export class BollBreakoutSqueezeStrategy extends BaseStrategy<BollBreakoutSqueezeParams> {
  readonly type: SignalStrategyType = 'boll_breakout_squeeze';

  constructor(params?: Partial<BollBreakoutSqueezeParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, stdDev, breakoutThreshold, squeezeThreshold } = this.params;

    if (!this.hasEnoughData(currentIndex, period)) {
      return this.hold();
    }

    const bands = bollingerBands(candles, currentIndex, period, stdDev);
    const currentPrice = candles[currentIndex].close;
    const bandwidthRatio = (bands.upper - bands.lower) / bands.middle;

    const isSqueeze = bandwidthRatio < squeezeThreshold;

    if (isSqueeze && currentPrice > bands.upper * (1 + breakoutThreshold)) {
      return this.long();
    }
    if (isSqueeze && currentPrice < bands.lower * (1 - breakoutThreshold)) {
      return this.short();
    }

    // 回到轨道内 -> 平仓
    const position = this.getPosition();
    if (position === 1 && currentPrice <= bands.upper) {
      return this.close();
    }
    if (position === -1 && currentPrice >= bands.lower) {
      return this.close();
    }

    return this.hold();
  }
}
