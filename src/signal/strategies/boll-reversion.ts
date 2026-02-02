/**
 * 布林带回归策略 (Bollinger Bands Reversion)
 *
 * 基于布林带的均值回归策略：
 * - 价格跌破下轨 -> 做多（超卖，预期回归）
 * - 价格突破上轨 -> 做空（超买，预期回归）
 * - 价格回到中轨附近 -> 平仓
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { bollingerBands } from '../indicators/index.js';

export interface BollReversionParams {
  /** 布林带周期 (默认20) */
  period: number;
  /** 标准差倍数 (默认2) */
  stdDev: number;
  /** 平仓阈值倍数 (默认0.5, 即价格回到中轨与轨道间50%位置时平仓) */
  closeThresholdRatio: number;
}

const DEFAULT_PARAMS: BollReversionParams = {
  period: 20,
  stdDev: 2,
  closeThresholdRatio: 0.5,
};

@Strategy({
  type: 'boll_reversion',
  name: '布林带回归',
  description: '价格突破布林带上下轨时反向交易，预期价格回归中轨',
  category: 'mean_reversion',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '布林带周期',
    stdDev: '标准差倍数',
    closeThresholdRatio: '平仓阈值倍数（价格回到中轨与轨道间的比例）',
  },
})
export class BollReversionStrategy extends BaseStrategy<BollReversionParams> {
  readonly type: SignalStrategyType = 'boll_reversion';

  constructor(params?: Partial<BollReversionParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, stdDev, closeThresholdRatio } = this.params;

    if (!this.hasEnoughData(currentIndex, period)) {
      return this.hold();
    }

    const bands = bollingerBands(candles, currentIndex, period, stdDev);
    const currentPrice = candles[currentIndex].close;
    const { middle, upper, lower } = bands;

    // 计算带宽（用于平仓判断）
    const bandwidth = upper - lower;
    const closeThreshold = bandwidth * closeThresholdRatio * 0.5;

    // 价格跌破下轨 -> 做多 (预期回归)
    if (currentPrice < lower) {
      return this.long();
    }

    // 价格突破上轨 -> 做空 (预期回归)
    if (currentPrice > upper) {
      return this.short();
    }

    // 价格回到中轨附近 -> 平仓
    if (this.getPosition() !== 0 && Math.abs(currentPrice - middle) < closeThreshold) {
      return this.close();
    }

    return this.hold();
  }
}
