/**
 * 实验2: 信号策略对比实验
 * 
 * 目的: 对比不同信号策略在Anti-Martingale下的表现
 * 
 * 配置:
 * - 市场: GBM (几何布朗运动)
 * - 波动率: [10%, 20%, 50%, 100%]
 * - 信号: [趋势跟踪, 均值回归, 突破, 随机]
 * - K线数: 2000
 * - 蒙特卡洛: 1000次
 * - 交易成本: 0.05% (固定成本率)
 */

import { ExperimentRunner } from '../engine/index.js';
import { printReport, printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import { saveReport, saveComparisonReport } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

const SIGNAL_STRATEGIES: Array<{
  type: SignalStrategyType;
  params: Record<string, number>;
  name: string;
  shortName: string;
}> = [
  {
    type: 'trend_following',
    params: { shortPeriod: 5, longPeriod: 20 },
    name: '趋势跟踪(5/20)',
    shortName: 'trend',
  },
  {
    type: 'mean_reversion',
    params: { period: 20, deviationThreshold: 0.02 },
    name: '均值回归(20,2%)',
    shortName: 'mean_rev',
  },
  {
    type: 'breakout',
    params: { lookbackPeriod: 20, breakoutThreshold: 0.01 },
    name: '突破策略(20,1%)',
    shortName: 'breakout',
  },
  {
    type: 'random',
    params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 },
    name: '随机策略',
    shortName: 'random',
  },
];

// 测试不同波动率
const VOLATILITIES = [0.10, 0.20, 0.50, 1.00];

// 交易成本率 (0.05%)
const TRADING_COST_RATE = 0.0005;

async function runExperiment2() {
  console.log('='.repeat(60));
  console.log('实验2: 信号策略 × 波动率 对比实验');
  console.log(`交易成本率: ${(TRADING_COST_RATE * 100).toFixed(4)}%`);
  console.log('='.repeat(60));
  
  const runner = new ExperimentRunner();
  const results: ExperimentResult[] = [];
  
  for (const volatility of VOLATILITIES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`波动率: ${(volatility * 100).toFixed(0)}%`);
    console.log('='.repeat(60));
    
    for (const strategy of SIGNAL_STRATEGIES) {
      const config: ExperimentConfig = {
        name: `exp2_${strategy.shortName}_vol${(volatility * 100).toFixed(0)}`,
        description: `GBM市场, 波动率${(volatility * 100).toFixed(0)}%, ${strategy.name}`,
        market: {
          type: 'gbm',
          volatility,
          candleCount: 2000,
          seed: 42,
        },
        signal: {
          type: strategy.type,
          params: strategy.params,
        },
        monteCarloRuns: 1000,
        targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
        tradingCostRate: TRADING_COST_RATE,
      };
      
      console.log(`\n运行: ${config.name} (${strategy.name})...`);
      const result = await runner.run(config);
      results.push(result);
      
      // 只打印摘要
      console.log(`  E[M]=${result.mDistribution.mean.toFixed(2)}x, P(2x)=${((result.reachProbabilities.get(2) ?? 0) * 100).toFixed(0)}%, P(10x)=${((result.reachProbabilities.get(10) ?? 0) * 100).toFixed(0)}%`);
    }
  }
  
  // 打印对比表格
  console.log('\n');
  printComparisonTable(results);
  
  // 保存结果
  const outputDir = './results/exp2_signals';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const result of results) {
    await saveReport(result, outputDir);
  }
  
  await saveComparisonReport(results, outputDir);
  
  fs.writeFileSync(`${outputDir}/all_results.json`, exportToJSON(results), 'utf-8');
  fs.writeFileSync(`${outputDir}/comparison.csv`, exportToCSV(results), 'utf-8');
  
  console.log(`\n结果已保存到: ${outputDir}`);
}

runExperiment2().catch(console.error);
