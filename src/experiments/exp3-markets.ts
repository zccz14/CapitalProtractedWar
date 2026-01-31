/**
 * 实验3: 市场类型对比实验
 * 
 * 目的: 对比Anti-Martingale在不同市场结构下的表现
 * 
 * 配置:
 * - 市场类型: [GBM, GARCH, 趋势, 均值回归]
 * - 波动率: 10%
 * - 信号: 随机策略 (控制变量)
 * - K线数: 2000
 * - 蒙特卡洛: 1000次
 */

import { ExperimentRunner } from '../engine/index.js';
import { printReport, printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import { saveReport, saveComparisonReport } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult, MarketType, MarketConfig } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

const MARKET_CONFIGS: Array<{
  type: MarketType;
  extraParams: Partial<MarketConfig>;
  name: string;
}> = [
  {
    type: 'gbm',
    extraParams: {},
    name: 'GBM (独立同分布)',
  },
  {
    type: 'garch',
    extraParams: {
      garchOmega: 0.00001,
      garchAlpha: 0.1,
      garchBeta: 0.85,
    },
    name: 'GARCH (波动率聚集)',
  },
  {
    type: 'trending',
    extraParams: {
      drift: 0.0005, // 日漂移率0.05%
    },
    name: '趋势市场 (有漂移)',
  },
  {
    type: 'mean_reverting',
    extraParams: {
      meanReversionSpeed: 0.1,
      meanReversionTarget: 100,
    },
    name: '均值回归市场',
  },
];

async function runExperiment3() {
  console.log('='.repeat(60));
  console.log('实验3: 市场类型对比实验');
  console.log('='.repeat(60));
  
  const runner = new ExperimentRunner();
  const results: ExperimentResult[] = [];
  const volatility = 0.10;
  
  for (const market of MARKET_CONFIGS) {
    const config: ExperimentConfig = {
      name: `exp3_${market.type}`,
      description: `${market.name}, 波动率10%, 随机信号`,
      market: {
        type: market.type,
        volatility,
        candleCount: 2000,
        seed: 42,
        ...market.extraParams,
      },
      signal: {
        type: 'random',
        params: {
          tradeProbability: 0.1,
          avgHoldingPeriod: 10,
          seed: 42,
        },
      },
      monteCarloRuns: 1000,
      targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
    };
    
    console.log(`\n运行: ${config.name} (${market.name})...`);
    const result = await runner.run(config);
    results.push(result);
    
    printReport(result);
  }
  
  // 打印对比表格
  console.log('\n');
  printComparisonTable(results);
  
  // 保存结果
  const outputDir = './results/exp3_markets';
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

runExperiment3().catch(console.error);
