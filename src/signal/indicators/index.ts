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
export function historicalVolatility(
  candles: Candle[],
  endIndex: number,
  period: number
): number {
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
export function atr(
  candles: Candle[],
  endIndex: number,
  period: number = 14
): number {
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
export function rsi(
  candles: Candle[],
  endIndex: number,
  period: number = 14
): number {
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
  return 100 - (100 / (1 + rs));
}

/**
 * 计算价格变化率
 * @param candles K线数据
 * @param endIndex 结束索引（包含）
 * @param period 周期
 */
export function roc(
  candles: Candle[],
  endIndex: number,
  period: number
): number {
  if (endIndex < period) return NaN;
  
  const currentPrice = candles[endIndex].close;
  const pastPrice = candles[endIndex - period].close;
  
  return (currentPrice - pastPrice) / pastPrice;
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
  const rank = sorted.findIndex(v => v >= currentValue);
  
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
  const squaredDiffs = values.map(v => (v - mean) ** 2);
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
