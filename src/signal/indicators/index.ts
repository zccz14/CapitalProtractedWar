/**
 * 技术指标计算模块
 *
 * 提供常用技术指标的高效计算实现
 */

import type { Candle } from '../../types.js';

// ============================================
// 移动平均线指标
// ============================================

/**
 * 计算简单移动平均线 (SMA)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期
 * @param priceKey 价格字段 (默认 'close')
 */
export function sma(
  candles: Candle[],
  endIndex: number,
  period: number,
  priceKey: 'open' | 'high' | 'low' | 'close' = 'close'
): number {
  if (endIndex < period - 1) return NaN;

  let sum = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sum += candles[i][priceKey];
  }
  return sum / period;
}

/**
 * 计算指数移动平均线 (EMA)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期
 * @param priceKey 价格字段 (默认 'close')
 */
export function ema(
  candles: Candle[],
  endIndex: number,
  period: number,
  priceKey: 'open' | 'high' | 'low' | 'close' = 'close'
): number {
  if (endIndex < period - 1) return NaN;

  const multiplier = 2 / (period + 1);

  // 初始值使用 SMA
  let emaValue = sma(candles, period - 1, period, priceKey);

  // 从 period 开始计算 EMA
  for (let i = period; i <= endIndex; i++) {
    emaValue = (candles[i][priceKey] - emaValue) * multiplier + emaValue;
  }

  return emaValue;
}

// ============================================
// 波动率指标
// ============================================

/**
 * 计算历史波动率 (HV) - 基于对数收益率标准差
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期
 * @returns 日化波动率
 */
export function historicalVolatility(candles: Candle[], endIndex: number, period: number): number {
  if (endIndex < period) return NaN;

  const returns: number[] = [];
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    const logReturn = Math.log(candles[i].close / candles[i - 1].close);
    returns.push(logReturn);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance);
}

/**
 * 计算真实波幅 (True Range)
 * @param candles K线数据
 * @param index 当前索引
 */
export function trueRange(candles: Candle[], index: number): number {
  if (index < 1) return candles[index].high - candles[index].low;

  const current = candles[index];
  const prevClose = candles[index - 1].close;

  return Math.max(
    current.high - current.low,
    Math.abs(current.high - prevClose),
    Math.abs(current.low - prevClose)
  );
}

/**
 * 计算平均真实波幅 (ATR)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认14)
 */
export function atr(candles: Candle[], endIndex: number, period: number = 14): number {
  if (endIndex < period) return NaN;

  let atrValue = 0;

  // 初始 ATR 为前 period 个 TR 的平均
  for (let i = 1; i <= period; i++) {
    atrValue += trueRange(candles, i);
  }
  atrValue /= period;

  // 使用平滑公式继续计算
  for (let i = period + 1; i <= endIndex; i++) {
    atrValue = (atrValue * (period - 1) + trueRange(candles, i)) / period;
  }

  return atrValue;
}

// ============================================
// 通道和区间指标
// ============================================

/**
 * 计算最高价
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 回看周期
 */
export function highest(
  candles: Candle[],
  endIndex: number,
  period: number,
  priceKey: 'open' | 'high' | 'low' | 'close' = 'high'
): number {
  if (endIndex < period - 1) return NaN;

  let max = -Infinity;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    max = Math.max(max, candles[i][priceKey]);
  }
  return max;
}

/**
 * 计算最低价
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 回看周期
 */
export function lowest(
  candles: Candle[],
  endIndex: number,
  period: number,
  priceKey: 'open' | 'high' | 'low' | 'close' = 'low'
): number {
  if (endIndex < period - 1) return NaN;

  let min = Infinity;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    min = Math.min(min, candles[i][priceKey]);
  }
  return min;
}

/**
 * 计算布林带
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认20)
 * @param stdDev 标准差倍数 (默认2)
 */
export function bollingerBands(
  candles: Candle[],
  endIndex: number,
  period: number = 20,
  stdDev: number = 2
): { middle: number; upper: number; lower: number } {
  if (endIndex < period - 1) {
    return { middle: NaN, upper: NaN, lower: NaN };
  }

  const middle = sma(candles, endIndex, period);

  // 计算标准差
  let sumSquaredDiff = 0;
  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    sumSquaredDiff += (candles[i].close - middle) ** 2;
  }
  const std = Math.sqrt(sumSquaredDiff / period);

  return {
    middle,
    upper: middle + stdDev * std,
    lower: middle - stdDev * std,
  };
}

// ============================================
// 动量指标
// ============================================

/**
 * 计算相对强弱指标 (RSI)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认14)
 */
export function rsi(candles: Candle[], endIndex: number, period: number = 14): number {
  if (endIndex < period) return NaN;

  let gains = 0;
  let losses = 0;

  // 计算初始平均涨跌
  for (let i = 1; i <= period; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) {
      gains += change;
    } else {
      losses -= change;
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // 使用平滑公式继续计算
  for (let i = period + 1; i <= endIndex; i++) {
    const change = candles[i].close - candles[i - 1].close;
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/**
 * 计算 MACD 指标
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param fastPeriod 快速 EMA 周期 (默认12)
 * @param slowPeriod 慢速 EMA 周期 (默认26)
 * @param signalPeriod 信号线 EMA 周期 (默认9)
 */
export function macd(
  candles: Candle[],
  endIndex: number,
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } {
  if (endIndex < slowPeriod - 1) {
    return { macd: NaN, signal: NaN, histogram: NaN };
  }

  const macdSeries: number[] = [];
  const start = slowPeriod - 1;
  for (let i = start; i <= endIndex; i++) {
    const fast = ema(candles, i, fastPeriod);
    const slow = ema(candles, i, slowPeriod);
    macdSeries.push(fast - slow);
  }

  // 计算信号线 EMA
  if (macdSeries.length < signalPeriod) {
    const macdValue = macdSeries[macdSeries.length - 1];
    return { macd: macdValue, signal: NaN, histogram: NaN };
  }

  const multiplier = 2 / (signalPeriod + 1);
  let signalValue = macdSeries.slice(0, signalPeriod).reduce((a, b) => a + b, 0) / signalPeriod;

  for (let i = signalPeriod; i < macdSeries.length; i++) {
    signalValue = (macdSeries[i] - signalValue) * multiplier + signalValue;
  }

  const macdValue = macdSeries[macdSeries.length - 1];
  return {
    macd: macdValue,
    signal: signalValue,
    histogram: macdValue - signalValue,
  };
}

/**
 * 计算平均方向指数 (ADX)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认14)
 */
export function adx(candles: Candle[], endIndex: number, period: number = 14): number {
  if (endIndex < period * 2) return NaN;

  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i <= endIndex; i++) {
    const current = candles[i];
    const prev = candles[i - 1];

    const upMove = current.high - prev.high;
    const downMove = prev.low - current.low;

    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;

    trList.push(trueRange(candles, i));
    plusDmList.push(plusDm);
    minusDmList.push(minusDm);
  }

  let atrValue = 0;
  let plusDmSmoothed = 0;
  let minusDmSmoothed = 0;

  for (let i = 0; i < period; i++) {
    atrValue += trList[i];
    plusDmSmoothed += plusDmList[i];
    minusDmSmoothed += minusDmList[i];
  }
  atrValue /= period;
  plusDmSmoothed /= period;
  minusDmSmoothed /= period;

  const dxList: number[] = [];

  for (let i = period; i < trList.length; i++) {
    if (i > period) {
      atrValue = (atrValue * (period - 1) + trList[i]) / period;
      plusDmSmoothed = (plusDmSmoothed * (period - 1) + plusDmList[i]) / period;
      minusDmSmoothed = (minusDmSmoothed * (period - 1) + minusDmList[i]) / period;
    }

    const plusDi = atrValue === 0 ? 0 : (100 * plusDmSmoothed) / atrValue;
    const minusDi = atrValue === 0 ? 0 : (100 * minusDmSmoothed) / atrValue;

    const denom = plusDi + minusDi;
    const dx = denom === 0 ? 0 : (100 * Math.abs(plusDi - minusDi)) / denom;
    dxList.push(dx);
  }

  if (dxList.length < period) return NaN;

  let adxValue = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < dxList.length; i++) {
    adxValue = (adxValue * (period - 1) + dxList[i]) / period;
  }

  return adxValue;
}

/**
 * 计算价格变化率
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期
 */
export function roc(candles: Candle[], endIndex: number, period: number): number {
  if (endIndex < period) return NaN;

  const currentPrice = candles[endIndex].close;
  const pastPrice = candles[endIndex - period].close;

  return (currentPrice - pastPrice) / pastPrice;
}

/**
 * 计算商品通道指数 (CCI)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认20)
 */
export function cci(candles: Candle[], endIndex: number, period: number = 20): number {
  if (endIndex < period - 1) return NaN;

  const start = endIndex - period + 1;
  const typicalPrices: number[] = [];

  for (let i = start; i <= endIndex; i++) {
    const candle = candles[i];
    typicalPrices.push((candle.high + candle.low + candle.close) / 3);
  }

  const mean = typicalPrices.reduce((a, b) => a + b, 0) / typicalPrices.length;
  const meanDeviation =
    typicalPrices.reduce((sum, tp) => sum + Math.abs(tp - mean), 0) / typicalPrices.length;

  if (meanDeviation === 0) return 0;

  const currentTypicalPrice = typicalPrices[typicalPrices.length - 1];
  return (currentTypicalPrice - mean) / (0.015 * meanDeviation);
}

/**
 * 计算随机指标 (KDJ)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period RSV 周期 (默认9)
 * @param kPeriod K 线平滑周期 (默认3)
 * @param dPeriod D 线平滑周期 (默认3)
 * @returns { k: K值, d: D值, j: J值 }
 */
export function kdj(
  candles: Candle[],
  endIndex: number,
  period: number = 9,
  kPeriod: number = 3,
  dPeriod: number = 3
): { k: number; d: number; j: number } {
  if (endIndex < period - 1) return { k: NaN, d: NaN, j: NaN };

  const rsvList: number[] = [];

  // 计算 RSV (Raw Stochastic Value)
  for (let i = period - 1; i <= endIndex; i++) {
    const start = i - period + 1;
    let highestHigh = -Infinity;
    let lowestLow = Infinity;

    for (let j = start; j <= i; j++) {
      highestHigh = Math.max(highestHigh, candles[j].high);
      lowestLow = Math.min(lowestLow, candles[j].low);
    }

    const currentClose = candles[i].close;
    if (highestHigh === lowestLow) {
      rsvList.push(50); // 避免除以零
    } else {
      rsvList.push(((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100);
    }
  }

  if (rsvList.length === 0) return { k: NaN, d: NaN, j: NaN };

  // 计算 K 值 (RSV 的平滑移动平均)
  let kValue = rsvList[0];
  for (let i = 1; i < rsvList.length; i++) {
    kValue = (2 / (kPeriod + 1)) * rsvList[i] + (1 - 2 / (kPeriod + 1)) * kValue;
  }

  // 计算 D 值 (K 值的平滑移动平均)
  let dValue = kValue;
  const kHistory: number[] = [kValue];
  for (let i = 1; i < rsvList.length; i++) {
    kValue = (2 / (kPeriod + 1)) * rsvList[i] + (1 - 2 / (kPeriod + 1)) * kValue;
    kHistory.push(kValue);
  }

  // 重新计算 D 值
  dValue = kHistory.slice(0, dPeriod).reduce((a, b) => a + b, 0) / dPeriod;
  for (let i = dPeriod; i < kHistory.length; i++) {
    dValue = (2 / (dPeriod + 1)) * kHistory[i] + (1 - 2 / (dPeriod + 1)) * dValue;
  }

  const currentK = kValue;
  const currentD = dValue;
  const currentJ = 3 * currentK - 2 * currentD;

  return { k: currentK, d: currentD, j: currentJ };
}

/**
 * 计算成交量代理 (volume 为空时使用价格波动作为代理)
 */
export function volumeProxy(candle: Candle): number {
  if (
    candle.volume !== null &&
    candle.volume !== undefined &&
    Number.isFinite(candle.volume) &&
    candle.volume > 0
  ) {
    return candle.volume;
  }

  const range = candle.high - candle.low;
  if (range > 0) return range;

  const body = Math.abs(candle.close - candle.open);
  if (body > 0) return body;

  return 1;
}

/**
 * 计算资金流量指数 (MFI)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认14)
 */
export function mfi(candles: Candle[], endIndex: number, period: number = 14): number {
  if (endIndex < period) return NaN;

  let positiveFlow = 0;
  let negativeFlow = 0;

  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const typicalPrice = (current.high + current.low + current.close) / 3;
    const prevTypicalPrice = (prev.high + prev.low + prev.close) / 3;
    const moneyFlow = typicalPrice * volumeProxy(current);

    if (typicalPrice > prevTypicalPrice) {
      positiveFlow += moneyFlow;
    } else if (typicalPrice < prevTypicalPrice) {
      negativeFlow += moneyFlow;
    }
  }

  if (negativeFlow === 0) return 100;
  if (positiveFlow === 0) return 0;

  const ratio = positiveFlow / negativeFlow;
  return 100 - 100 / (1 + ratio);
}

/**
 * 计算 OBV (On-Balance Volume)
 * 以 volume 为空时的代理成交量作为替代
 */
export function obv(candles: Candle[], endIndex: number): number {
  if (endIndex <= 0) return 0;

  let obvValue = 0;
  for (let i = 1; i <= endIndex; i++) {
    const current = candles[i];
    const previous = candles[i - 1];
    const volume = volumeProxy(current);

    if (current.close > previous.close) {
      obvValue += volume;
    } else if (current.close < previous.close) {
      obvValue -= volume;
    }
  }

  return obvValue;
}

/**
 * 计算线性回归斜率 (每根K线的价格变化趋势)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期
 * @param priceKey 价格字段 (默认 'close')
 */
export function linearRegressionSlope(
  candles: Candle[],
  endIndex: number,
  period: number,
  priceKey: 'open' | 'high' | 'low' | 'close' = 'close'
): number {
  if (endIndex < period - 1) return NaN;

  const start = endIndex - period + 1;
  const n = period;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const y = candles[start + i][priceKey];
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumXX - sumX * sumX;

  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * 计算 Williams %R (威廉指标)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认14)
 */
export function williamsR(candles: Candle[], endIndex: number, period: number = 14): number {
  if (endIndex < period) return NaN;

  let highestHigh = -Infinity;
  let lowestLow = Infinity;

  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    highestHigh = Math.max(highestHigh, candles[i].high);
    lowestLow = Math.min(lowestLow, candles[i].low);
  }

  const currentClose = candles[endIndex].close;
  if (highestHigh === lowestLow) return -50;

  return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
}

/**
 * 计算 Aroon 指标 (阿隆指标)
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期 (默认25)
 * @returns { aroonUp: Aroon Up 线, aroonDown: Aroon Down 线 }
 */
export function aroon(
  candles: Candle[],
  endIndex: number,
  period: number = 25
): { aroonUp: number; aroonDown: number } {
  if (endIndex < period) return { aroonUp: NaN, aroonDown: NaN };

  let highestHighIndex = -1;
  let lowestLowIndex = -1;
  let highestHigh = -Infinity;
  let lowestLow = Infinity;

  for (let i = endIndex - period + 1; i <= endIndex; i++) {
    if (candles[i].high > highestHigh) {
      highestHigh = candles[i].high;
      highestHighIndex = i;
    }
    if (candles[i].low < lowestLow) {
      lowestLow = candles[i].low;
      lowestLowIndex = i;
    }
  }

  const periodsSinceHigh = endIndex - highestHighIndex;
  const periodsSinceLow = endIndex - lowestLowIndex;

  const aroonUp = ((period - periodsSinceHigh) / period) * 100;
  const aroonDown = ((period - periodsSinceLow) / period) * 100;

  return { aroonUp, aroonDown };
}

// ============================================
// 统计函数
// ============================================

/**
 * 计算百分位排名
 * @param values 数值数组
 * @param currentValue 当前值
 * @returns 百分位 (0-100)
 */
export function percentileRank(values: number[], currentValue: number): number {
  if (values.length === 0) return 50;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = sorted.findIndex((v) => v >= currentValue);

  if (rank === -1) return 100;
  return (rank / sorted.length) * 100;
}

/**
 * 计算标准差
 * @param values 数值数组
 */
export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => (v - mean) ** 2);
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

/**
 * 计算收益率序列
 * @param candles K线数据
 * @param startIndex 开始索引
 * @param endIndex 结束索引
 * @param logReturn 是否使用对数收益率 (默认true)
 */
export function returns(
  candles: Candle[],
  startIndex: number,
  endIndex: number,
  logReturn: boolean = true
): number[] {
  const result: number[] = [];

  for (let i = Math.max(1, startIndex); i <= endIndex; i++) {
    if (logReturn) {
      result.push(Math.log(candles[i].close / candles[i - 1].close));
    } else {
      result.push((candles[i].close - candles[i - 1].close) / candles[i - 1].close);
    }
  }

  return result;
}
