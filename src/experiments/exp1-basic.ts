/**
 * 实验1: 基础验证实验
 * 
 * 目的: 验证Anti-Martingale在不同波动率下的表现
 * 
 * 配置:
 * - 市场: GBM (几何布朗运动)
 * - 信号: 随机策略 (对照组)
 * - 波动率: 扫描 [1%, 5%, 10%, 20%, 50%]
 * - K线数: 2000
 * - 蒙特卡洛: 1000次
 */

import { ExperimentRunner } from '../engine/index.js';
import { printReport, printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import { saveReport, saveComparisonReport } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

const VOLATILITIES = [0.01, 0.05, 0.10, 0.20, 0.50];

async function runExperiment1() {
  console.log('='.repeat(60));
  console.log('实验1: 基础验证实验 - Anti-Martingale在不同波动率下的表现');
  console.log('='.repeat(60));
  
  const runner = new ExperimentRunner();
  const results: ExperimentResult[] = [];
  
  for (const volatility of VOLATILITIES) {
    const config: ExperimentConfig = {
      name: `exp1_vol_${(volatility * 100).toFixed(0)}pct`,
      description: `GBM市场, 波动率${(volatility * 100).toFixed(0)}%, 随机信号`,
      market: {
        type: 'gbm',
        volatility,
        candleCount: 2000,
        seed: 42,
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
    
    console.log(`\n运行: ${config.name}...`);
    const result = await runner.run(config);
    results.push(result);
    
    printReport(result);
  }
  
  // 打印对比表格
  console.log('\n');
  printComparisonTable(results);
  
  // 保存结果
  const outputDir = './results/exp1_basic';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  for (const result of results) {
    await saveReport(result, outputDir);
  }
  
  await saveComparisonReport(results, outputDir);
  
  // 保存JSON和CSV
  fs.writeFileSync(`${outputDir}/all_results.json`, exportToJSON(results), 'utf-8');
  fs.writeFileSync(`${outputDir}/comparison.csv`, exportToCSV(results), 'utf-8');
  
  console.log(`\n结果已保存到: ${outputDir}`);
}

// 运行实验
runExperiment1().catch(console.error);
