/**
 * 随机策略 (Random)
 * 
 * 对照组策略，用于验证其他策略是否真的有效：
 * - 以固定概率随机开仓（做多或做空）
 * - 持仓时间服从指数分布
 * - 使用可复现的随机数生成器
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { createRandom, SeededRandom } from '../../utils/random.js';

export interface RandomParams {
  /** 交易概率 (每根K线的交易概率, 默认0.1) */
  tradeProbability: number;
  /** 持仓平均周期 (默认10根K线) */
  avgHoldingPeriod: number;
  /** 随机种子 */
  seed?: number;
}

const DEFAULT_PARAMS: RandomParams = {
  tradeProbability: 0.1,
  avgHoldingPeriod: 10,
  seed: undefined,
};

@Strategy({
  type: 'random',
  name: '随机策略',
  description: '对照组策略，随机开仓平仓，用于验证其他策略的有效性',
  category: 'other',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    tradeProbability: '每根K线的交易概率',
    avgHoldingPeriod: '持仓平均周期（K线数）',
    seed: '随机种子（可选，用于复现）',
  },
})
export class RandomStrategy extends BaseStrategy<RandomParams> {
  readonly type: SignalStrategyType = 'random';
  
  private random: SeededRandom;
  private barsHeld: number = 0;

  constructor(params?: Partial<RandomParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
    this.random = createRandom(this.params.seed);
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { tradeProbability, avgHoldingPeriod } = this.params;

    // 如果有持仓，考虑平仓
    if (this.getPosition() !== 0) {
      this.barsHeld++;
      // 平仓概率随持仓时间增加（指数分布）
      const closeProbability = 1 - Math.exp(-this.barsHeld / avgHoldingPeriod);
      if (this.random.next() < closeProbability) {
        this.barsHeld = 0;
        return this.close();
      }
      return this.hold();
    }

    // 考虑开仓
    if (this.random.next() < tradeProbability) {
      // 50% 做多, 50% 做空
      if (this.random.next() < 0.5) {
        return this.long();
      } else {
        return this.short();
      }
    }

    return this.hold();
  }

  protected onReset(): void {
    this.barsHeld = 0;
    // 重新初始化随机数生成器以保持可复现性
    this.random = createRandom(this.params.seed);
  }
}
