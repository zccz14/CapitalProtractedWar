/**
 * 自适应波动率策略 (Adaptive Volatility)
 * 
 * 根据历史波动率动态调整交易参数：
 * - 波动率计算：基于对数收益率的历史波动率 (HV)
 * - 状态分类：通过百分位排名分类波动率状态 (low/normal/high/extreme)
 * - 五种自适应模式：
 *   - period_scaling: 根据波动率调整均线周期
 *   - threshold_scaling: 根据波动率调整触发阈值
 *   - volatility_filter: 在极端波动时过滤交易
 *   - volatility_breakout: 波动率突破时生成信号
 *   - full: 全部功能组合
 */

import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';
import { historicalVolatility, sma, percentileRank } from '../indicators/index.js';

// ============================================
// 类型定义
// ============================================

/** 波动率状态 */
export type VolatilityRegime = 'low' | 'normal' | 'high' | 'extreme';

/** 波动率状态信息 */
export interface VolatilityState {
  /** 当前波动率 (日化) */
  currentHV: number;
  /** 波动率在历史中的百分位排名 (0-100) */
  percentile: number;
  /** 波动率状态分类 */
  regime: VolatilityRegime;
  /** 波动率变化趋势 (正=上升, 负=下降) */
  trend: number;
}

/** 自适应模式 */
export type AdaptiveMode = 
  | 'period_scaling'      // 均线周期自适应
  | 'threshold_scaling'   // 阈值自适应
  | 'volatility_filter'   // 波动率过滤（择时）
  | 'volatility_breakout' // 波动率突破信号
  | 'full';               // 全部功能

export interface AdaptiveVolatilityParams {
  // === 基础信号参数 ===
  /** 基础策略类型 (趋势跟踪 或 均值回归) */
  baseStrategy: 'trend' | 'mean_reversion';
  /** 短期均线周期 (默认5) */
  shortPeriod: number;
  /** 长期均线周期 (默认20) */
  longPeriod: number;
  /** 偏离阈值 (用于均值回归, 默认0.02) */
  deviationThreshold: number;

  // === 波动率计算参数 ===
  /** HV计算周期 (默认20) */
  hvPeriod: number;
  /** 波动率历史回看周期 (用于计算百分位, 默认60) */
  volatilityLookback: number;

  // === 波动率状态阈值 ===
  /** 低波动率百分位阈值 (默认20) */
  lowVolPercentile: number;
  /** 高波动率百分位阈值 (默认80) */
  highVolPercentile: number;
  /** 极端波动率百分位阈值 (默认95) */
  extremeVolPercentile: number;

  // === 自适应调整参数 ===
  /** 自适应模式 */
  adaptiveMode: AdaptiveMode;
  /** 低波动时周期缩放因子 (默认1.5, 周期变长) */
  lowVolPeriodScale: number;
  /** 高波动时周期缩放因子 (默认0.7, 周期变短) */
  highVolPeriodScale: number;
  /** 低波动时阈值缩放因子 (默认0.7, 阈值变小) */
  lowVolThresholdScale: number;
  /** 高波动时阈值缩放因子 (默认1.5, 阈值变大) */
  highVolThresholdScale: number;

  // === 波动率过滤参数 ===
  /** 极端波动时是否禁止开仓 (默认true) */
  filterExtremeVol: boolean;
  /** 低波动时是否禁止开仓 (默认false) */
  filterLowVol: boolean;

  // === 波动率突破参数 ===
  /** 波动率突破触发百分位 (默认90) */
  volBreakoutPercentile: number;
  /** 波动率突破后等待K线数 (确认价格方向, 默认3) */
  volBreakoutConfirmBars: number;
}

const DEFAULT_PARAMS: AdaptiveVolatilityParams = {
  // 基础信号参数
  baseStrategy: 'trend',
  shortPeriod: 5,
  longPeriod: 20,
  deviationThreshold: 0.02,

  // 波动率计算参数
  hvPeriod: 20,
  volatilityLookback: 60,

  // 波动率状态阈值
  lowVolPercentile: 20,
  highVolPercentile: 80,
  extremeVolPercentile: 95,

  // 自适应调整参数
  adaptiveMode: 'full',
  lowVolPeriodScale: 1.5,
  highVolPeriodScale: 0.7,
  lowVolThresholdScale: 0.7,
  highVolThresholdScale: 1.5,

  // 波动率过滤参数
  filterExtremeVol: true,
  filterLowVol: false,

  // 波动率突破参数
  volBreakoutPercentile: 90,
  volBreakoutConfirmBars: 3,
};

@Strategy({
  type: 'adaptive_volatility',
  name: '自适应波动率',
  description: '根据历史波动率动态调整交易参数，支持多种自适应模式',
  category: 'volatility',
  defaultParams: DEFAULT_PARAMS,
  paramDescriptions: {
    baseStrategy: '基础策略类型（trend/mean_reversion）',
    shortPeriod: '短期均线周期',
    longPeriod: '长期均线周期',
    deviationThreshold: '偏离阈值（用于均值回归）',
    hvPeriod: 'HV计算周期',
    volatilityLookback: '波动率历史回看周期',
    lowVolPercentile: '低波动率百分位阈值',
    highVolPercentile: '高波动率百分位阈值',
    extremeVolPercentile: '极端波动率百分位阈值',
    adaptiveMode: '自适应模式',
    lowVolPeriodScale: '低波动时周期缩放因子',
    highVolPeriodScale: '高波动时周期缩放因子',
    lowVolThresholdScale: '低波动时阈值缩放因子',
    highVolThresholdScale: '高波动时阈值缩放因子',
    filterExtremeVol: '极端波动时是否禁止开仓',
    filterLowVol: '低波动时是否禁止开仓',
    volBreakoutPercentile: '波动率突破触发百分位',
    volBreakoutConfirmBars: '波动率突破后确认K线数',
  },
})
export class AdaptiveVolatilityStrategy extends BaseStrategy<AdaptiveVolatilityParams> {
  readonly type: SignalStrategyType = 'adaptive_volatility';
  
  // 波动率历史记录 (用于计算百分位)
  private hvHistory: number[] = [];
  
  // 波动率突破状态
  private volBreakoutDetected: boolean = false;
  private volBreakoutBar: number = 0;
  private priceAtBreakout: number = 0;

  constructor(params?: Partial<AdaptiveVolatilityParams>) {
    super({
      ...DEFAULT_PARAMS,
      ...params,
    });
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const { hvPeriod, volatilityLookback, adaptiveMode } = this.params;
    
    // 需要足够的数据
    const minRequired = Math.max(hvPeriod, this.params.longPeriod) + volatilityLookback;
    if (!this.hasEnoughData(currentIndex, minRequired)) {
      return this.hold();
    }

    // 1. 计算当前波动率状态
    const volState = this.calculateVolatilityState(candles, currentIndex);
    
    // 2. 检查波动率过滤
    if (this.shouldFilter(volState)) {
      // 如果有持仓，在极端波动时考虑平仓
      if (this.getPosition() !== 'hold' && volState.regime === 'extreme') {
        return this.closePosition();
      }
      return this.hold();
    }

    // 3. 波动率突破信号处理
    if (adaptiveMode === 'volatility_breakout' || adaptiveMode === 'full') {
      const breakoutSignal = this.handleVolatilityBreakout(candles, currentIndex, volState);
      if (breakoutSignal.direction !== 'hold') {
        return breakoutSignal;
      }
    }

    // 4. 计算自适应参数
    const adaptedParams = this.getAdaptedParams(volState);

    // 5. 生成基础信号
    const baseSignal = this.params.baseStrategy === 'trend'
      ? this.generateTrendSignal(candles, currentIndex, adaptedParams)
      : this.generateMeanReversionSignal(candles, currentIndex, adaptedParams);

    // 6. 根据波动率状态调整信号强度
    if (baseSignal.direction !== 'hold' && baseSignal.strength !== undefined) {
      // 高波动时降低信号强度
      if (volState.regime === 'high') {
        baseSignal.strength *= 0.7;
      } else if (volState.regime === 'extreme') {
        baseSignal.strength *= 0.5;
      }
    }

    return baseSignal;
  }

  /** 计算波动率状态 */
  private calculateVolatilityState(candles: Candle[], currentIndex: number): VolatilityState {
    const { hvPeriod, volatilityLookback, lowVolPercentile, highVolPercentile, extremeVolPercentile } = this.params;

    // 计算当前历史波动率 (HV)
    const currentHV = historicalVolatility(candles, currentIndex, hvPeriod);
    
    // 更新波动率历史
    this.hvHistory.push(currentHV);
    if (this.hvHistory.length > volatilityLookback) {
      this.hvHistory.shift();
    }

    // 计算百分位排名
    const percentile = percentileRank(this.hvHistory, currentHV);

    // 计算波动率趋势 (短期HV vs 长期HV)
    const shortTermHV = historicalVolatility(candles, currentIndex, Math.max(2, Math.floor(hvPeriod / 2)));
    const trend = currentHV > 0 ? (shortTermHV - currentHV) / currentHV : 0;

    // 分类波动率状态
    let regime: VolatilityRegime;
    if (percentile >= extremeVolPercentile) {
      regime = 'extreme';
    } else if (percentile >= highVolPercentile) {
      regime = 'high';
    } else if (percentile <= lowVolPercentile) {
      regime = 'low';
    } else {
      regime = 'normal';
    }

    return { currentHV, percentile, regime, trend };
  }

  /** 检查是否应该过滤（不交易） */
  private shouldFilter(volState: VolatilityState): boolean {
    const { adaptiveMode, filterExtremeVol, filterLowVol } = this.params;
    
    if (adaptiveMode !== 'volatility_filter' && adaptiveMode !== 'full') {
      return false;
    }

    if (filterExtremeVol && volState.regime === 'extreme') {
      return true;
    }
    if (filterLowVol && volState.regime === 'low') {
      return true;
    }

    return false;
  }

  /** 处理波动率突破信号 */
  private handleVolatilityBreakout(
    candles: Candle[], 
    currentIndex: number, 
    volState: VolatilityState
  ): Signal {
    const { volBreakoutPercentile, volBreakoutConfirmBars } = this.params;

    // 检测波动率突破
    if (!this.volBreakoutDetected && volState.percentile >= volBreakoutPercentile) {
      this.volBreakoutDetected = true;
      this.volBreakoutBar = currentIndex;
      this.priceAtBreakout = candles[currentIndex].close;
    }

    // 等待价格确认
    if (this.volBreakoutDetected) {
      const barsSinceBreakout = currentIndex - this.volBreakoutBar;
      
      if (barsSinceBreakout >= volBreakoutConfirmBars) {
        const currentPrice = candles[currentIndex].close;
        const priceChange = (currentPrice - this.priceAtBreakout) / this.priceAtBreakout;
        
        // 重置突破状态
        this.volBreakoutDetected = false;

        // 根据价格变化方向开仓
        const threshold = 0.01; // 1% 价格变化确认
        if (Math.abs(priceChange) > threshold) {
          const direction = priceChange > 0 ? 'long' : 'short';
          const strength = Math.min(1, Math.abs(priceChange) * 10);
          return this.openPosition(direction, strength);
        }
      }
    }

    return this.hold();
  }

  /** 获取自适应调整后的参数 */
  private getAdaptedParams(volState: VolatilityState): {
    shortPeriod: number;
    longPeriod: number;
    deviationThreshold: number;
  } {
    const { 
      shortPeriod, longPeriod, deviationThreshold,
      adaptiveMode, 
      lowVolPeriodScale, highVolPeriodScale,
      lowVolThresholdScale, highVolThresholdScale 
    } = this.params;

    let periodScale = 1;
    let thresholdScale = 1;

    // 周期自适应
    if (adaptiveMode === 'period_scaling' || adaptiveMode === 'full') {
      if (volState.regime === 'low') {
        periodScale = lowVolPeriodScale;
      } else if (volState.regime === 'high' || volState.regime === 'extreme') {
        periodScale = highVolPeriodScale;
      }
    }

    // 阈值自适应
    if (adaptiveMode === 'threshold_scaling' || adaptiveMode === 'full') {
      if (volState.regime === 'low') {
        thresholdScale = lowVolThresholdScale;
      } else if (volState.regime === 'high' || volState.regime === 'extreme') {
        thresholdScale = highVolThresholdScale;
      }
    }

    return {
      shortPeriod: Math.max(2, Math.round(shortPeriod * periodScale)),
      longPeriod: Math.max(5, Math.round(longPeriod * periodScale)),
      deviationThreshold: deviationThreshold * thresholdScale,
    };
  }

  /** 生成趋势跟踪信号 */
  private generateTrendSignal(
    candles: Candle[], 
    currentIndex: number,
    params: { shortPeriod: number; longPeriod: number }
  ): Signal {
    const { shortPeriod, longPeriod } = params;

    if (currentIndex < longPeriod) {
      return this.hold();
    }

    const shortSMA = sma(candles, currentIndex, shortPeriod);
    const longSMA = sma(candles, currentIndex, longPeriod);
    const prevShortSMA = sma(candles, currentIndex - 1, shortPeriod);
    const prevLongSMA = sma(candles, currentIndex - 1, longPeriod);

    // 金叉
    if (prevShortSMA <= prevLongSMA && shortSMA > longSMA) {
      const strength = (shortSMA - longSMA) / longSMA;
      return this.openPosition('long', strength);
    }

    // 死叉
    if (prevShortSMA >= prevLongSMA && shortSMA < longSMA) {
      const strength = (longSMA - shortSMA) / longSMA;
      return this.openPosition('short', strength);
    }

    return this.hold();
  }

  /** 生成均值回归信号 */
  private generateMeanReversionSignal(
    candles: Candle[], 
    currentIndex: number,
    params: { longPeriod: number; deviationThreshold: number }
  ): Signal {
    const { longPeriod, deviationThreshold } = params;

    if (currentIndex < longPeriod) {
      return this.hold();
    }

    const mean = sma(candles, currentIndex, longPeriod);
    const currentPrice = candles[currentIndex].close;
    const deviation = (currentPrice - mean) / mean;

    // 价格高于均线太多 -> 做空
    if (deviation > deviationThreshold) {
      const strength = Math.min(1, deviation / deviationThreshold);
      return this.openPosition('short', strength);
    }

    // 价格低于均线太多 -> 做多
    if (deviation < -deviationThreshold) {
      const strength = Math.min(1, -deviation / deviationThreshold);
      return this.openPosition('long', strength);
    }

    // 回到均线附近 -> 平仓
    if (this.getPosition() !== 'hold' && Math.abs(deviation) < deviationThreshold * 0.5) {
      return this.closePosition();
    }

    return this.hold();
  }

  protected onReset(): void {
    this.hvHistory = [];
    this.volBreakoutDetected = false;
    this.volBreakoutBar = 0;
    this.priceAtBreakout = 0;
  }
}
