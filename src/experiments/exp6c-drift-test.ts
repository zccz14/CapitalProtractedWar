/**
 * 实验6c: 验证市场类型对周期合并效果的影响
 * 
 * 问题: GBM (μ=0) 本质是随机游走，没有趋势
 *       趋势跟踪策略表现差是因为市场没有趋势，而非策略本身问题
 * 
 * 验证:
 * - 对比 μ=0 (无趋势) vs μ>0 (有趋势) 的 GBM
 * - 观察趋势跟踪策略在有趋势市场中的表现
 */

import { BacktestEngine } from '../engine/index.js';
import { generateMarket, aggregateCandles } from '../market/generator.js';
import { createSignalStrategy } from '../signal/index.js';
import type { BacktestResult, MarketConfig, SignalStrategyConfig, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';

const PERIODS = [1, 5, 10, 20];
const MONTE_CARLO_RUNS = 500;
const BASE_VOLATILITY = 0.05;
const BASE_CANDLE_COUNT = 6000;

// 不同的漂移率
const DRIFT_VALUES = [0, 0.05, 0.10, 0.20]; // 0%, 5%, 10%, 20% 年化

// 测试策略
const STRATEGIES: { type: SignalStrategyType; name: string; params?: Record<string, any> }[] = [
  { type: 'trend_following', name: '趋势跟踪', params: { fastPeriod: 5, slowPeriod: 20 } },
  { type: 'mean_reversion', name: '均值回归', params: { period: 20, threshold: 2 } },
  { type: 'random', name: '随机策略', params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 } },
];

interface Result {
  drift: number;
  strategy: string;
  period: number;
  mMean: number;
  pReach2: number;
  avgWinRate: number;
}

async function runTest(
  drift: number,
  strategyConfig: { type: SignalStrategyType; name: string; params?: Record<string, any> },
  period: number,
): Promise<Result> {
  const peakMultipliers: number[] = [];
  const winRates: number[] = [];
  
  const engine = new BacktestEngine({
    targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
    tradingCostRate: 0.0003,
  });

  for (let i = 0; i < MONTE_CARLO_RUNS; i++) {
    const marketConfig: MarketConfig = {
      type: 'gbm',
      volatility: BASE_VOLATILITY,
      drift: drift, // 关键：设置漂移率
      candleCount: BASE_CANDLE_COUNT,
      seed: 42 + i,
    };
    
    const baseCandles = generateMarket(marketConfig);
    const candles = aggregateCandles(baseCandles, period);
    
    const signalConfig: SignalStrategyConfig = {
      type: strategyConfig.type,
      params: strategyConfig.params?.seed !== undefined 
        ? { ...strategyConfig.params, seed: (strategyConfig.params.seed as number) + i }
        : strategyConfig.params,
    };
    
    const strategy = createSignalStrategy(signalConfig);
    const result = engine.run(candles, strategy);
    
    peakMultipliers.push(result.peakMultiplier);
    winRates.push(result.winRate);
  }

  return {
    drift,
    strategy: strategyConfig.name,
    period,
    mMean: peakMultipliers.reduce((a, b) => a + b, 0) / MONTE_CARLO_RUNS,
    pReach2: peakMultipliers.filter(m => m >= 2).length / MONTE_CARLO_RUNS,
    avgWinRate: winRates.reduce((a, b) => a + b, 0) / MONTE_CARLO_RUNS,
  };
}

async function main() {
  console.log('='.repeat(80));
  console.log('实验6c: 市场漂移率 (μ) 对周期合并效果的影响');
  console.log('='.repeat(80));
  
  console.log(`\n验证假设: GBM μ=0 是纯随机游走，趋势跟踪策略无法工作`);
  console.log(`测试漂移率: ${DRIFT_VALUES.map(d => (d * 100).toFixed(0) + '%').join(', ')}`);
  console.log(`波动率: ${(BASE_VOLATILITY * 100).toFixed(0)}%`);
  console.log(`\n注意: 当 μ > 0 时，市场有向上的趋势\n`);

  const results: Result[] = [];

  for (const drift of DRIFT_VALUES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`漂移率 μ = ${(drift * 100).toFixed(0)}% (年化)`);
    console.log('='.repeat(60));
    
    for (const strategy of STRATEGIES) {
      for (const period of [1, 10]) { // 只测试 1天和10天，加快速度
        process.stdout.write(`  ${strategy.name}, ${period}天... `);
        const result = await runTest(drift, strategy, period);
        results.push(result);
        console.log(`M=${result.mMean.toFixed(2)}, P(M≥2)=${(result.pReach2 * 100).toFixed(1)}%, WR=${(result.avgWinRate * 100).toFixed(1)}%`);
      }
    }
  }

  // 打印对比表格
  console.log('\n' + '='.repeat(80));
  console.log('趋势跟踪策略在不同漂移率下的表现');
  console.log('='.repeat(80));
  
  console.log('\nμ (漂移) | 周期 | M均值 | P(M≥2) | 胜率');
  console.log('-'.repeat(50));
  
  const trendResults = results.filter(r => r.strategy === '趋势跟踪');
  for (const r of trendResults) {
    console.log(
      `${(r.drift * 100).toFixed(0).padStart(6)}% | ` +
      `${r.period.toString().padStart(4)}d | ` +
      `${r.mMean.toFixed(2).padStart(5)} | ` +
      `${(r.pReach2 * 100).toFixed(1).padStart(6)}% | ` +
      `${(r.avgWinRate * 100).toFixed(1).padStart(5)}%`
    );
  }

  console.log('\n' + '='.repeat(80));
  console.log('均值回归策略在不同漂移率下的表现');
  console.log('='.repeat(80));
  
  console.log('\nμ (漂移) | 周期 | M均值 | P(M≥2) | 胜率');
  console.log('-'.repeat(50));
  
  const mrResults = results.filter(r => r.strategy === '均值回归');
  for (const r of mrResults) {
    console.log(
      `${(r.drift * 100).toFixed(0).padStart(6)}% | ` +
      `${r.period.toString().padStart(4)}d | ` +
      `${r.mMean.toFixed(2).padStart(5)} | ` +
      `${(r.pReach2 * 100).toFixed(1).padStart(6)}% | ` +
      `${(r.avgWinRate * 100).toFixed(1).padStart(5)}%`
    );
  }

  // 分析
  console.log('\n' + '='.repeat(80));
  console.log('分析结论');
  console.log('='.repeat(80));
  
  // 比较 μ=0 vs μ=20% 时趋势跟踪的表现
  const tf_0_1 = trendResults.find(r => r.drift === 0 && r.period === 1);
  const tf_20_1 = trendResults.find(r => r.drift === 0.20 && r.period === 1);
  const tf_0_10 = trendResults.find(r => r.drift === 0 && r.period === 10);
  const tf_20_10 = trendResults.find(r => r.drift === 0.20 && r.period === 10);
  
  console.log(`
1. 趋势跟踪策略:
   - μ=0%, 1天:  M=${tf_0_1?.mMean.toFixed(2)}, WR=${((tf_0_1?.avgWinRate ?? 0) * 100).toFixed(1)}%
   - μ=20%, 1天: M=${tf_20_1?.mMean.toFixed(2)}, WR=${((tf_20_1?.avgWinRate ?? 0) * 100).toFixed(1)}%
   - μ=0%, 10天:  M=${tf_0_10?.mMean.toFixed(2)}, WR=${((tf_0_10?.avgWinRate ?? 0) * 100).toFixed(1)}%
   - μ=20%, 10天: M=${tf_20_10?.mMean.toFixed(2)}, WR=${((tf_20_10?.avgWinRate ?? 0) * 100).toFixed(1)}%

2. 结论:
   - 如果趋势跟踪在 μ>0 时表现更好 → 证明策略本身没问题，是市场缺乏趋势
   - 如果趋势跟踪在 μ>0 时表现仍差 → 策略实现可能有问题
`);
}

main().catch(console.error);
