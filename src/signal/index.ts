/**
 * Signal Strategies - 交易信号策略
 * 
 * 实现四种信号策略:
 * 1. TrendFollowing - 趋势跟踪 (动量策略)
 * 2. MeanReversion - 均值回归
 * 3. Breakout - 突破策略
 * 4. Random - 随机策略 (对照组)
 */

import type { 
  Candle, 
  Signal, 
  SignalDirection,
  SignalStrategy, 
  SignalStrategyConfig, 
  SignalStrategyType 
} from '../types.js';
import { createRandom, SeededRandom } from '../utils/random.js';

// ============================================
// 趋势跟踪策略 (动量策略)
// ============================================

export interface TrendFollowingParams {
  /** 短期均线周期 (默认5) */
  shortPeriod: number;
  /** 长期均线周期 (默认20) */
  longPeriod: number;
}

export class TrendFollowingStrategy implements SignalStrategy {
  readonly type: SignalStrategyType = 'trend_following';
  private params: TrendFollowingParams;
  private currentPosition: SignalDirection = 'hold';

  constructor(params?: Partial<TrendFollowingParams>) {
    this.params = {
      shortPeriod: params?.shortPeriod ?? 5,
      longPeriod: params?.longPeriod ?? 20,
    };
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { shortPeriod, longPeriod } = this.params;
    
    // 需要足够的历史数据
    if (currentIndex < longPeriod) {
      return { direction: 'hold' };
    }

    // 计算短期和长期简单移动平均线
    const shortSMA = this.calculateSMA(candles, currentIndex, shortPeriod);
    const longSMA = this.calculateSMA(candles, currentIndex, longPeriod);

    // 前一根K线的SMA
    const prevShortSMA = this.calculateSMA(candles, currentIndex - 1, shortPeriod);
    const prevLongSMA = this.calculateSMA(candles, currentIndex - 1, longPeriod);

    // 金叉: 短期均线上穿长期均线 -> 做多
    if (prevShortSMA <= prevLongSMA && shortSMA > longSMA) {
      if (this.currentPosition === 'short') {
        this.currentPosition = 'close';
        return { direction: 'close' };
      }
      this.currentPosition = 'long';
      return { direction: 'long', strength: (shortSMA - longSMA) / longSMA };
    }

    // 死叉: 短期均线下穿长期均线 -> 做空
    if (prevShortSMA >= prevLongSMA && shortSMA < longSMA) {
      if (this.currentPosition === 'long') {
        this.currentPosition = 'close';
        return { direction: 'close' };
      }
      this.currentPosition = 'short';
      return { direction: 'short', strength: (longSMA - shortSMA) / longSMA };
    }

    return { direction: 'hold' };
  }

  private calculateSMA(candles: Candle[], endIndex: number, period: number): number {
    let sum = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
      sum += candles[i].close;
    }
    return sum / period;
  }

  reset(): void {
    this.currentPosition = 'hold';
  }
}

// ============================================
// 均值回归策略
// ============================================

export interface MeanReversionParams {
  /** 均线周期 (默认20) */
  period: number;
  /** 偏离阈值 (默认0.02, 即2%偏离触发交易) */
  deviationThreshold: number;
}

export class MeanReversionStrategy implements SignalStrategy {
  readonly type: SignalStrategyType = 'mean_reversion';
  private params: MeanReversionParams;
  private currentPosition: SignalDirection = 'hold';

  constructor(params?: Partial<MeanReversionParams>) {
    this.params = {
      period: params?.period ?? 20,
      deviationThreshold: params?.deviationThreshold ?? 0.02,
    };
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { period, deviationThreshold } = this.params;

    if (currentIndex < period) {
      return { direction: 'hold' };
    }

    const sma = this.calculateSMA(candles, currentIndex, period);
    const currentPrice = candles[currentIndex].close;
    const deviation = (currentPrice - sma) / sma;

    // 价格高于均线太多 -> 做空 (预期回归)
    if (deviation > deviationThreshold) {
      if (this.currentPosition === 'long') {
        this.currentPosition = 'close';
        return { direction: 'close' };
      }
      this.currentPosition = 'short';
      return { direction: 'short', strength: Math.min(1, deviation / deviationThreshold) };
    }

    // 价格低于均线太多 -> 做多 (预期回归)
    if (deviation < -deviationThreshold) {
      if (this.currentPosition === 'short') {
        this.currentPosition = 'close';
        return { direction: 'close' };
      }
      this.currentPosition = 'long';
      return { direction: 'long', strength: Math.min(1, -deviation / deviationThreshold) };
    }

    // 价格回到均线附近 -> 平仓
    if (this.currentPosition !== 'hold' && Math.abs(deviation) < deviationThreshold * 0.5) {
      this.currentPosition = 'close';
      return { direction: 'close' };
    }

    return { direction: 'hold' };
  }

  private calculateSMA(candles: Candle[], endIndex: number, period: number): number {
    let sum = 0;
    for (let i = endIndex - period + 1; i <= endIndex; i++) {
      sum += candles[i].close;
    }
    return sum / period;
  }

  reset(): void {
    this.currentPosition = 'hold';
  }
}

// ============================================
// 突破策略
// ============================================

export interface BreakoutParams {
  /** 回看周期 (默认20) */
  lookbackPeriod: number;
  /** 突破确认阈值 (默认0.01, 即需要超出1%才确认突破) */
  breakoutThreshold: number;
}

export class BreakoutStrategy implements SignalStrategy {
  readonly type: SignalStrategyType = 'breakout';
  private params: BreakoutParams;
  private currentPosition: SignalDirection = 'hold';

  constructor(params?: Partial<BreakoutParams>) {
    this.params = {
      lookbackPeriod: params?.lookbackPeriod ?? 20,
      breakoutThreshold: params?.breakoutThreshold ?? 0.01,
    };
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { lookbackPeriod, breakoutThreshold } = this.params;

    if (currentIndex < lookbackPeriod) {
      return { direction: 'hold' };
    }

    // 计算回看周期内的最高价和最低价
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let i = currentIndex - lookbackPeriod; i < currentIndex; i++) {
      highestHigh = Math.max(highestHigh, candles[i].high);
      lowestLow = Math.min(lowestLow, candles[i].low);
    }

    const currentPrice = candles[currentIndex].close;
    const range = highestHigh - lowestLow;

    // 向上突破 -> 做多
    if (currentPrice > highestHigh * (1 + breakoutThreshold)) {
      if (this.currentPosition === 'short') {
        this.currentPosition = 'close';
        return { direction: 'close' };
      }
      this.currentPosition = 'long';
      const strength = (currentPrice - highestHigh) / range;
      return { direction: 'long', strength: Math.min(1, strength) };
    }

    // 向下突破 -> 做空
    if (currentPrice < lowestLow * (1 - breakoutThreshold)) {
      if (this.currentPosition === 'long') {
        this.currentPosition = 'close';
        return { direction: 'close' };
      }
      this.currentPosition = 'short';
      const strength = (lowestLow - currentPrice) / range;
      return { direction: 'short', strength: Math.min(1, strength) };
    }

    // 价格回到区间内 -> 可能止损
    if (this.currentPosition === 'long' && currentPrice < highestHigh - range * 0.5) {
      this.currentPosition = 'close';
      return { direction: 'close' };
    }
    if (this.currentPosition === 'short' && currentPrice > lowestLow + range * 0.5) {
      this.currentPosition = 'close';
      return { direction: 'close' };
    }

    return { direction: 'hold' };
  }

  reset(): void {
    this.currentPosition = 'hold';
  }
}

// ============================================
// 随机策略 (对照组)
// ============================================

export interface RandomParams {
  /** 交易概率 (每根K线的交易概率, 默认0.1) */
  tradeProbability: number;
  /** 持仓平均周期 (默认10根K线) */
  avgHoldingPeriod: number;
  /** 随机种子 */
  seed?: number;
}

export class RandomStrategy implements SignalStrategy {
  readonly type: SignalStrategyType = 'random';
  private params: RandomParams;
  private random: SeededRandom;
  private currentPosition: SignalDirection = 'hold';
  private barsHeld: number = 0;

  constructor(params?: Partial<RandomParams>) {
    this.params = {
      tradeProbability: params?.tradeProbability ?? 0.1,
      avgHoldingPeriod: params?.avgHoldingPeriod ?? 10,
      seed: params?.seed,
    };
    this.random = createRandom(this.params.seed);
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { tradeProbability, avgHoldingPeriod } = this.params;

    // 如果有持仓,考虑平仓
    if (this.currentPosition !== 'hold') {
      this.barsHeld++;
      // 平仓概率随持仓时间增加
      const closeProbability = 1 - Math.exp(-this.barsHeld / avgHoldingPeriod);
      if (this.random.next() < closeProbability) {
        this.currentPosition = 'close';
        this.barsHeld = 0;
        return { direction: 'close' };
      }
      return { direction: 'hold' };
    }

    // 考虑开仓
    if (this.random.next() < tradeProbability) {
      // 50% 做多, 50% 做空
      if (this.random.next() < 0.5) {
        this.currentPosition = 'long';
        return { direction: 'long', strength: this.random.next() };
      } else {
        this.currentPosition = 'short';
        return { direction: 'short', strength: this.random.next() };
      }
    }

    return { direction: 'hold' };
  }

  reset(): void {
    this.currentPosition = 'hold';
    this.barsHeld = 0;
    // 重新初始化随机数生成器以保持可复现性
    this.random = createRandom(this.params.seed);
  }
}

// ============================================
// 策略工厂
// ============================================

export function createSignalStrategy(config: SignalStrategyConfig): SignalStrategy {
  const params = config.params ?? {};

  switch (config.type) {
    case 'trend_following':
      return new TrendFollowingStrategy({
        shortPeriod: params.shortPeriod,
        longPeriod: params.longPeriod,
      });
    
    case 'mean_reversion':
      return new MeanReversionStrategy({
        period: params.period,
        deviationThreshold: params.deviationThreshold,
      });
    
    case 'breakout':
      return new BreakoutStrategy({
        lookbackPeriod: params.lookbackPeriod,
        breakoutThreshold: params.breakoutThreshold,
      });
    
    case 'random':
      return new RandomStrategy({
        tradeProbability: params.tradeProbability,
        avgHoldingPeriod: params.avgHoldingPeriod,
        seed: params.seed,
      });
    
    default:
      throw new Error(`Unknown signal strategy type: ${(config as any).type}`);
  }
}
