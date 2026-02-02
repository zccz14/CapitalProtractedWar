/**
 * 均值回归策略 (Mean Reversion)
 *
 * 当价格偏离均线时进行反向交易：
 * - 价格高于均线太多 -> 做空（预期回归）
 * - 价格低于均线太多 -> 做多（预期回归）
 * - 价格回到均线附近 -> 平仓
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { sma } from '../indicators/index.js';

export interface MeanReversionParams {
  /** 均线周期 (默认20) */
  period: number;
  /** 偏离阈值 (默认0.02, 即2%偏离触发交易) */
  deviationThreshold: number;
  /** 平仓阈值倍数 (默认0.5, 即偏离回到阈值的50%时平仓) */
  closeThresholdRatio: number;
}

const DEFAULT_PARAMS: MeanReversionParams = {
  period: 20,
  deviationThreshold: 0.02,
  closeThresholdRatio: 0.5,
};

@Strategy({
  type: 'mean_reversion',
  name: '均值回归',
  description: '价格偏离均线时反向交易，预期价格回归均值',
  category: 'mean_reversion',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    period: '均线周期',
    deviationThreshold: '偏离阈值（如0.02表示2%）',
    closeThresholdRatio: '平仓阈值倍数',
  },
})
export class MeanReversionStrategy extends BaseStrategy<MeanReversionParams> {
  readonly type: SignalStrategyType = 'mean_reversion';

  constructor(params?: Partial<MeanReversionParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, deviationThreshold, closeThresholdRatio } = this.params;

    if (!this.hasEnoughData(currentIndex, period)) {
      return this.hold();
    }

    const mean = sma(candles, currentIndex, period);
    const currentPrice = candles[currentIndex].close;
    const deviation = (currentPrice - mean) / mean;

    // 价格高于均线太多 -> 做空 (预期回归)
    if (deviation > deviationThreshold) {
      return this.short();
    }

    // 价格低于均线太多 -> 做多 (预期回归)
    if (deviation < -deviationThreshold) {
      return this.long();
    }

    // 价格回到均线附近 -> 平仓
    const closeThreshold = deviationThreshold * closeThresholdRatio;
    if (this.getPosition() !== 0 && Math.abs(deviation) < closeThreshold) {
      return this.close();
    }

    return this.hold();
  }
}
