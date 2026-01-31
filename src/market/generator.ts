/**
 * 市场数据生成器
 * 支持 GBM, GARCH, 趋势市场, 均值回归市场
 */

import type { Candle, MarketConfig, MarketType } from '../types.js';
import { Random } from '../utils/random.js';

/**
 * 几何布朗运动 (GBM) 生成器
 * dS = μS dt + σS dW
 * 
 * 注意：volatility 参数是年化波动率，会自动转换为日波动率
 */
export function generateGBM(config: MarketConfig, random: Random): Candle[] {
  const {
    volatility: sigmaAnnual,
    drift: muAnnual = 0,
    initialPrice: S0 = 100,
    candleCount,
    tradingDaysPerYear = 252,  // 每年交易日数
  } = config;

  // 转换为日波动率和日漂移率
  const sigmaDaily = sigmaAnnual / Math.sqrt(tradingDaysPerYear);
  const muDaily = muAnnual / tradingDaysPerYear;

  const candles: Candle[] = [];
  let S = S0;
  const dt = 1; // 1天
  const startTime = Date.now();

  for (let i = 0; i < candleCount; i++) {
    const epsilon = random.nextGaussian();
    // 对数收益率 (使用日波动率)
    const logReturn = (muDaily - 0.5 * sigmaDaily * sigmaDaily) * dt + sigmaDaily * Math.sqrt(dt) * epsilon;
    const newS = S * Math.exp(logReturn);

    // 生成K线 (简化: open=前close, close=newS, high/low基于波动)
    const intraVolatility = sigmaDaily * Math.abs(epsilon) * 0.5;
    const high = Math.max(S, newS) * (1 + intraVolatility * random.next());
    const low = Math.min(S, newS) * (1 - intraVolatility * random.next());

    candles.push({
      time: startTime + i * 86400000, // 每天一根
      open: S,
      high,
      low,
      close: newS,
    });

    S = newS;
  }

  return candles;
}

/**
 * GARCH(1,1) 生成器
 * 模拟波动率聚集效应
 * σ²_t = ω + α*ε²_{t-1} + β*σ²_{t-1}
 * 
 * 注意：volatility 参数是年化波动率
 */
export function generateGARCH(config: MarketConfig, random: Random): Candle[] {
  const {
    volatility: targetSigmaAnnual,
    drift: muAnnual = 0,
    initialPrice: S0 = 100,
    candleCount,
    garchAlpha: alpha = 0.1,
    garchBeta: beta = 0.85,
    tradingDaysPerYear = 252,
  } = config;

  // 转换为日波动率
  const targetSigmaDaily = targetSigmaAnnual / Math.sqrt(tradingDaysPerYear);
  const muDaily = muAnnual / tradingDaysPerYear;

  // 计算omega使得无条件方差等于目标日波动率的平方
  // E[σ²] = ω / (1 - α - β) = targetSigmaDaily²
  const omega = targetSigmaDaily * targetSigmaDaily * (1 - alpha - beta);

  const candles: Candle[] = [];
  let S = S0;
  let sigma2 = targetSigmaDaily * targetSigmaDaily; // 当前条件方差 (日)
  const startTime = Date.now();

  for (let i = 0; i < candleCount; i++) {
    const epsilon = random.nextGaussian();
    const sigma = Math.sqrt(sigma2);
    
    // 对数收益率
    const logReturn = (muDaily - 0.5 * sigma2) + sigma * epsilon;
    const newS = S * Math.exp(logReturn);

    // 更新GARCH方差 (波动率聚集)
    sigma2 = omega + alpha * logReturn * logReturn + beta * sigma2;

    // 生成K线
    const intraVolatility = sigma * Math.abs(epsilon) * 0.5;
    const high = Math.max(S, newS) * (1 + intraVolatility * random.next());
    const low = Math.min(S, newS) * (1 - intraVolatility * random.next());

    candles.push({
      time: startTime + i * 86400000,
      open: S,
      high,
      low,
      close: newS,
    });

    S = newS;
  }

  return candles;
}

/**
 * 趋势市场生成器
 * 在GBM基础上增加显著正漂移
 */
export function generateTrending(config: MarketConfig, random: Random): Candle[] {
  const trendingConfig: MarketConfig = {
    ...config,
    // 如果没有指定漂移率，默认设置为波动率的50%
    drift: config.drift ?? config.volatility * 0.5,
  };
  return generateGBM(trendingConfig, random);
}

/**
 * 均值回归市场生成器
 * Ornstein-Uhlenbeck过程
 * dS = θ(μ - S)dt + σdW
 * 
 * 注意：volatility 参数是年化波动率
 */
export function generateMeanReverting(config: MarketConfig, random: Random): Candle[] {
  const {
    volatility: sigmaAnnual,
    initialPrice: S0 = 100,
    candleCount,
    meanReversionSpeed: thetaAnnual = 0.1,
    meanReversionTarget: targetPrice = S0,
    tradingDaysPerYear = 252,
  } = config;

  // 转换为日参数
  const sigmaDaily = sigmaAnnual / Math.sqrt(tradingDaysPerYear);
  const thetaDaily = thetaAnnual / tradingDaysPerYear;

  const candles: Candle[] = [];
  let S = S0;
  const dt = 1;
  const startTime = Date.now();

  for (let i = 0; i < candleCount; i++) {
    const epsilon = random.nextGaussian();
    
    // OU过程: dS = θ(μ - S)dt + σdW
    const dS = thetaDaily * (targetPrice - S) * dt + sigmaDaily * S * Math.sqrt(dt) * epsilon;
    const newS = Math.max(S + dS, 0.01); // 防止价格为负

    // 生成K线
    const intraVolatility = sigmaDaily * Math.abs(epsilon) * 0.5;
    const high = Math.max(S, newS) * (1 + intraVolatility * random.next());
    const low = Math.min(S, newS) * (1 - intraVolatility * random.next());

    candles.push({
      time: startTime + i * 86400000,
      open: S,
      high,
      low,
      close: newS,
    });

    S = newS;
  }

  return candles;
}

/**
 * 市场数据生成器工厂
 */
export function generateMarket(config: MarketConfig): Candle[] {
  const random = new Random(config.seed);

  switch (config.type) {
    case 'gbm':
      return generateGBM(config, random);
    case 'garch':
      return generateGARCH(config, random);
    case 'trending':
      return generateTrending(config, random);
    case 'mean_reverting':
      return generateMeanReverting(config, random);
    default:
      throw new Error(`Unknown market type: ${config.type}`);
  }
}

/**
 * 计算K线序列的实际波动率
 */
export function calculateRealizedVolatility(candles: Candle[]): number {
  if (candles.length < 2) return 0;

  const returns: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const logReturn = Math.log(candles[i].close / candles[i - 1].close);
    returns.push(logReturn);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  
  return Math.sqrt(variance);
}
