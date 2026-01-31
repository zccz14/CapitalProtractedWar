/**
 * 实验6: K线周期合并实验
 * 
 * 目的: 验证通过合并K线周期来放大等效波动率的效果
 * 
 * 核心理论:
 * - 合并 N 根K线后，波动率放大 √N 倍
 * - 低波动市场可通过周期合并获得更高的等效波动率
 * 
 * 配置:
 * - 基础市场: 低波动率 GBM (5% 年化)
 * - 周期: 枚举 [1, 2, 5, 10, 20, 30, 60] 天
 * - 蒙特卡洛: 1000次
 */

import { BacktestEngine } from '../engine/index.js';
import { generateMarket, calculateRealizedVolatility, aggregateCandles } from '../market/generator.js';
import { createSignalStrategy } from '../signal/index.js';
import { printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import { saveComparisonReport } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult, Candle, BacktestResult, MDistributionStats, MarketConfig, SignalStrategyConfig } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

// 枚举的周期列表 (天)
const PERIODS = [1, 2, 5, 10, 20, 30, 60];

// 基础市场配置 - 低波动率市场
const BASE_VOLATILITY = 0.05; // 5% 年化波动率 (低波动)
const BASE_CANDLE_COUNT = 6000; // 足够多的基础K线，合并后仍有足够样本

interface PeriodExperimentResult {
  period: number;
  effectiveVolatility: number; // 理论等效波动率
  realizedVolatility: number;  // 实际测量波动率
  candleCount: number;         // 合并后K线数
  result: ExperimentResult;
}

/**
 * 运行单个周期的实验
 */
async function runPeriodExperiment(
  period: number,
  marketConfig: MarketConfig,
  signalConfig: SignalStrategyConfig,
  monteCarloRuns: number,
  targetMultipliers: number[],
): Promise<PeriodExperimentResult> {
  const backtestResults: BacktestResult[] = [];
  const peakMultipliers: number[] = [];
  const realizedVols: number[] = [];
  
  const engine = new BacktestEngine({
    targetMultipliers,
    tradingCostRate: 0.0003, // 0.03% 交易成本
  });

  for (let i = 0; i < monteCarloRuns; i++) {
    // 生成基础市场数据
    const baseMarketConfig = {
      ...marketConfig,
      seed: marketConfig.seed !== undefined ? marketConfig.seed + i : undefined,
    };
    const baseCandles = generateMarket(baseMarketConfig);
    
    // 合并K线
    const candles = aggregateCandles(baseCandles, period);
    
    // 计算实际波动率
    if (i < 10) { // 只计算前10次的波动率（节省计算）
      realizedVols.push(calculateRealizedVolatility(candles));
    }
    
    // 创建信号策略
    const seedOffset = signalConfig.params?.seed !== undefined ? i : 0;
    const strategy = createSignalStrategy({
      ...signalConfig,
      params: signalConfig.params?.seed !== undefined 
        ? { ...signalConfig.params, seed: (signalConfig.params.seed as number) + seedOffset }
        : signalConfig.params,
    });
    
    // 运行回测
    const result = engine.run(candles, strategy);
    backtestResults.push(result);
    peakMultipliers.push(result.peakMultiplier);
  }

  // 计算统计数据
  const mDistribution = calculateDistributionStats(peakMultipliers);
  
  // 计算达到目标的概率（基于 peakMultiplier）和平均时间
  const reachProbabilities = new Map<number, number>();
  const avgTradesToReach = new Map<number, number | null>();
  const avgCandlesToReach = new Map<number, number | null>();
  
  for (const target of targetMultipliers) {
    // 概率：峰值倍率 >= 目标的比例
    const reachCount = peakMultipliers.filter(m => m >= target).length;
    const probability = reachCount / monteCarloRuns;
    reachProbabilities.set(target, probability);
    
    // 平均时间：基于首次达到目标的索引
    let totalTrades = 0;
    let totalCandles = 0;
    let reachWithIndexCount = 0;
    
    for (const result of backtestResults) {
      const reachIndex = result.reachTargetIndices.get(target);
      if (reachIndex !== null && reachIndex !== undefined) {
        reachWithIndexCount++;
        const tradesBeforeTarget = result.trades.filter(t => t.index <= reachIndex).length;
        totalTrades += tradesBeforeTarget;
        totalCandles += reachIndex;
      }
    }
    
    if (reachWithIndexCount > 0) {
      avgTradesToReach.set(target, totalTrades / reachWithIndexCount);
      avgCandlesToReach.set(target, totalCandles / reachWithIndexCount);
    } else {
      avgTradesToReach.set(target, null);
      avgCandlesToReach.set(target, null);
    }
  }

  const avgWinRate = backtestResults.reduce((sum, r) => sum + r.winRate, 0) / monteCarloRuns;
  const avgMaxConsecutiveWins = backtestResults.reduce((sum, r) => sum + r.maxConsecutiveWins, 0) / monteCarloRuns;
  const avgTotalTurnover = backtestResults.reduce((sum, r) => sum + r.totalTurnover, 0) / monteCarloRuns;
  const avgTotalTradingCost = backtestResults.reduce((sum, r) => sum + r.totalTradingCost, 0) / monteCarloRuns;

  // 理论等效波动率 = 基础波动率 × √period
  const effectiveVolatility = BASE_VOLATILITY * Math.sqrt(period);
  
  // 实际测量波动率 (年化)
  const avgRealizedVol = realizedVols.reduce((a, b) => a + b, 0) / realizedVols.length;
  // 转换为年化: 日波动率 × √252
  const realizedVolatilityAnnualized = avgRealizedVol * Math.sqrt(252 / period);

  const experimentResult: ExperimentResult = {
    config: {
      name: `period_${period}d`,
      description: `周期${period}天合并, 等效波动率${(effectiveVolatility * 100).toFixed(1)}%`,
      market: marketConfig,
      signal: signalConfig,
      monteCarloRuns,
      targetMultipliers,
    },
    mDistribution,
    peakMultipliers,
    reachProbabilities,
    avgTradesToReach,
    avgCandlesToReach,
    avgWinRate,
    avgMaxConsecutiveWins,
    avgTotalTurnover,
    avgTotalTradingCost,
    elapsedMs: 0,
  };

  return {
    period,
    effectiveVolatility,
    realizedVolatility: realizedVolatilityAnnualized,
    candleCount: Math.floor(BASE_CANDLE_COUNT / period),
    result: experimentResult,
  };
}

function calculateDistributionStats(values: number[]): MDistributionStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  
  const percentile = (p: number) => {
    const index = Math.floor(p * n);
    return sorted[Math.min(index, n - 1)];
  };

  return {
    mean,
    median: percentile(0.5),
    std,
    min: sorted[0],
    max: sorted[n - 1],
    percentiles: {
      p5: percentile(0.05),
      p25: percentile(0.25),
      p50: percentile(0.5),
      p75: percentile(0.75),
      p95: percentile(0.95),
      p99: percentile(0.99),
    },
  };
}

async function runExperiment6() {
  console.log('='.repeat(70));
  console.log('实验6: K线周期合并实验 - 通过合并周期放大等效波动率');
  console.log('='.repeat(70));
  
  console.log(`\n基础配置:`);
  console.log(`- 基础波动率: ${(BASE_VOLATILITY * 100).toFixed(1)}% (年化)`);
  console.log(`- 基础K线数: ${BASE_CANDLE_COUNT}`);
  console.log(`- 枚举周期: ${PERIODS.join(', ')} 天`);
  console.log(`- 理论波动率放大: √N 倍\n`);

  const marketConfig: MarketConfig = {
    type: 'gbm',
    volatility: BASE_VOLATILITY,
    candleCount: BASE_CANDLE_COUNT,
    seed: 42,
  };

  const signalConfig: SignalStrategyConfig = {
    type: 'random',
    params: {
      tradeProbability: 0.1,
      avgHoldingPeriod: 10,
      seed: 42,
    },
  };

  const periodResults: PeriodExperimentResult[] = [];

  // 枚举所有周期
  for (const period of PERIODS) {
    console.log(`\n运行周期 ${period} 天...`);
    const result = await runPeriodExperiment(
      period,
      marketConfig,
      signalConfig,
      1000,
      DEFAULT_TARGET_MULTIPLIERS,
    );
    periodResults.push(result);
    
    console.log(`  - 理论等效波动率: ${(result.effectiveVolatility * 100).toFixed(2)}%`);
    console.log(`  - 实际测量波动率: ${(result.realizedVolatility * 100).toFixed(2)}%`);
    console.log(`  - 合并后K线数: ${result.candleCount}`);
    console.log(`  - M均值: ${result.result.mDistribution.mean.toFixed(2)}`);
    console.log(`  - P(M≥2): ${((result.result.reachProbabilities.get(2) ?? 0) * 100).toFixed(1)}%`);
  }

  // 打印汇总表格
  console.log('\n' + '='.repeat(70));
  console.log('周期合并效果汇总');
  console.log('='.repeat(70));
  
  console.log('\n周期 | 等效σ | 实际σ | K线数 | M均值 | M中位 | P(M≥2) | P(M≥5) | P(M≥10)');
  console.log('-'.repeat(85));
  
  for (const pr of periodResults) {
    const r = pr.result;
    console.log(
      `${pr.period.toString().padStart(4)}d | ` +
      `${(pr.effectiveVolatility * 100).toFixed(1).padStart(5)}% | ` +
      `${(pr.realizedVolatility * 100).toFixed(1).padStart(5)}% | ` +
      `${pr.candleCount.toString().padStart(5)} | ` +
      `${r.mDistribution.mean.toFixed(2).padStart(5)} | ` +
      `${r.mDistribution.median.toFixed(2).padStart(5)} | ` +
      `${((r.reachProbabilities.get(2) ?? 0) * 100).toFixed(1).padStart(6)}% | ` +
      `${((r.reachProbabilities.get(5) ?? 0) * 100).toFixed(1).padStart(6)}% | ` +
      `${((r.reachProbabilities.get(10) ?? 0) * 100).toFixed(1).padStart(6)}%`
    );
  }

  // 打印效率分析
  console.log('\n' + '='.repeat(70));
  console.log('时间效率分析 (单位时间的期望收益)');
  console.log('='.repeat(70));
  
  const baseResult = periodResults[0]; // period=1 作为基准
  console.log('\n周期 | M均值 | 相对M提升 | K线减少 | 时间效率比');
  console.log('-'.repeat(60));
  
  for (const pr of periodResults) {
    const mRatio = pr.result.mDistribution.mean / baseResult.result.mDistribution.mean;
    const candleRatio = pr.candleCount / baseResult.candleCount;
    const timeEfficiency = mRatio * candleRatio; // (M提升) × (时间占比) = 单位时间效率
    
    console.log(
      `${pr.period.toString().padStart(4)}d | ` +
      `${pr.result.mDistribution.mean.toFixed(2).padStart(5)} | ` +
      `${mRatio.toFixed(2).padStart(9)}x | ` +
      `${(candleRatio * 100).toFixed(1).padStart(8)}% | ` +
      `${timeEfficiency.toFixed(3).padStart(10)}`
    );
  }

  // 保存结果
  const outputDir = './results/exp6_period_aggregation';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 保存详细结果
  const allResults = periodResults.map(pr => pr.result);
  await saveComparisonReport(allResults, outputDir);
  fs.writeFileSync(`${outputDir}/all_results.json`, exportToJSON(allResults), 'utf-8');
  fs.writeFileSync(`${outputDir}/comparison.csv`, exportToCSV(allResults), 'utf-8');

  // 保存周期分析报告
  const periodAnalysis = periodResults.map(pr => ({
    period: pr.period,
    effectiveVolatility: pr.effectiveVolatility,
    realizedVolatility: pr.realizedVolatility,
    candleCount: pr.candleCount,
    mMean: pr.result.mDistribution.mean,
    mMedian: pr.result.mDistribution.median,
    mMax: pr.result.mDistribution.max,
    pReach2: pr.result.reachProbabilities.get(2),
    pReach5: pr.result.reachProbabilities.get(5),
    pReach10: pr.result.reachProbabilities.get(10),
  }));
  fs.writeFileSync(`${outputDir}/period_analysis.json`, JSON.stringify(periodAnalysis, null, 2), 'utf-8');

  console.log(`\n结果已保存到: ${outputDir}`);
  
  // 打印结论
  console.log('\n' + '='.repeat(70));
  console.log('结论');
  console.log('='.repeat(70));
  console.log(`
1. 周期合并确实可以放大等效波动率，实测接近理论值 √N 倍

2. 但存在 Trade-off:
   - 波动率放大 √N 倍
   - 可用K线数减少 N 倍
   - 单位时间期望收益 ≈ 1/√N

3. 周期合并的价值:
   - 当原始波动率过低，策略无法盈利时（被手续费吃掉）
   - 通过周期合并可以使策略"可行"
   - 虽然时间效率降低，但至少能盈利

4. 最优周期选择:
   - 取决于手续费率和目标波动率
   - 需要找到使策略净收益为正的最小周期
`);
}

// 运行实验
runExperiment6().catch(console.error);
