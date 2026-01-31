#!/usr/bin/env node
/**
 * CLI - 命令行接口
 * 
 * 用法:
 *   npx tsx src/cli.ts run --volatility 0.1 --signal random --market gbm --runs 1000
 *   npx tsx src/cli.ts exp1   # 运行实验1
 *   npx tsx src/cli.ts exp2   # 运行实验2
 *   npx tsx src/cli.ts exp3   # 运行实验3
 *   npx tsx src/cli.ts exp4   # 运行实验4 (全矩阵)
 */

import { Command } from 'commander';
import { ExperimentRunner } from './engine/index.js';
import { printReport, exportToJSON } from './analysis/index.js';
import { saveReport } from './visualization/index.js';
import type { ExperimentConfig, MarketType, SignalStrategyType } from './types.js';
import { DEFAULT_TARGET_MULTIPLIERS, VOLATILITY_SCENARIOS } from './types.js';
import * as fs from 'fs';

const program = new Command();

program
  .name('cpw')
  .description('资本持久战实验框架 CLI')
  .version('1.0.0');

// 单次实验命令
program
  .command('run')
  .description('运行单次实验')
  .option('-v, --volatility <number>', '等效波动率 (0-1)', '0.1')
  .option('-m, --market <type>', '市场类型 (gbm|garch|trending|mean_reverting)', 'gbm')
  .option('-s, --signal <type>', '信号策略 (trend_following|mean_reversion|breakout|random)', 'random')
  .option('-c, --candles <number>', 'K线数量', '2000')
  .option('-r, --runs <number>', '蒙特卡洛次数', '1000')
  .option('-o, --output <dir>', '输出目录', './results/custom')
  .option('--seed <number>', '随机种子')
  .action(async (options) => {
    const volatility = parseFloat(options.volatility);
    const candleCount = parseInt(options.candles);
    const monteCarloRuns = parseInt(options.runs);
    const seed = options.seed ? parseInt(options.seed) : undefined;
    
    const scenarioDesc = VOLATILITY_SCENARIOS[volatility] || `σ=${(volatility * 100).toFixed(1)}%`;
    
    console.log('='.repeat(60));
    console.log('资本持久战实验');
    console.log('='.repeat(60));
    console.log(`市场类型: ${options.market}`);
    console.log(`波动率: ${(volatility * 100).toFixed(1)}% (${scenarioDesc})`);
    console.log(`信号策略: ${options.signal}`);
    console.log(`K线数量: ${candleCount}`);
    console.log(`蒙特卡洛次数: ${monteCarloRuns}`);
    console.log('='.repeat(60));
    
    const config: ExperimentConfig = {
      name: `custom_${options.market}_${options.signal}_v${(volatility * 100).toFixed(0)}`,
      market: {
        type: options.market as MarketType,
        volatility,
        candleCount,
        seed,
        // GARCH 默认参数
        ...(options.market === 'garch' ? {
          garchOmega: 0.00001,
          garchAlpha: 0.1,
          garchBeta: 0.85,
        } : {}),
        // 趋势市场默认参数
        ...(options.market === 'trending' ? {
          drift: 0.0005,
        } : {}),
        // 均值回归市场默认参数
        ...(options.market === 'mean_reverting' ? {
          meanReversionSpeed: 0.1,
          meanReversionTarget: 100,
        } : {}),
      },
      signal: {
        type: options.signal as SignalStrategyType,
        params: getSignalParams(options.signal, seed),
      },
      monteCarloRuns,
      targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
    };
    
    const runner = new ExperimentRunner();
    console.log('\n运行中...');
    const result = await runner.run(config);
    
    printReport(result);
    
    // 保存结果
    if (!fs.existsSync(options.output)) {
      fs.mkdirSync(options.output, { recursive: true });
    }
    await saveReport(result, options.output);
    fs.writeFileSync(`${options.output}/result.json`, exportToJSON([result]), 'utf-8');
  });

// 预设实验命令
program
  .command('exp1')
  .description('运行实验1: 基础验证实验 (不同波动率)')
  .action(async () => {
    await import('./experiments/exp1-basic.js');
  });

program
  .command('exp2')
  .description('运行实验2: 信号策略对比实验')
  .action(async () => {
    await import('./experiments/exp2-signals.js');
  });

program
  .command('exp3')
  .description('运行实验3: 市场类型对比实验')
  .action(async () => {
    await import('./experiments/exp3-markets.js');
  });

program
  .command('exp4')
  .description('运行实验4: 全矩阵扫描实验')
  .action(async () => {
    await import('./experiments/exp4-matrix.js');
  });

// 列出波动率场景
program
  .command('scenarios')
  .description('列出等效波动率场景映射')
  .action(() => {
    console.log('\n等效波动率场景映射:');
    console.log('='.repeat(50));
    for (const [vol, desc] of Object.entries(VOLATILITY_SCENARIOS)) {
      console.log(`  σ=${(parseFloat(vol) * 100).toFixed(1).padStart(5)}%  ->  ${desc}`);
    }
    console.log('\n提示: 杠杆可归一化为波动率');
    console.log('      L倍杠杆 + σ波动率 = 等效 L×σ 波动率');
  });

function getSignalParams(signalType: string, seed?: number): Record<string, number> {
  switch (signalType) {
    case 'trend_following':
      return { shortPeriod: 5, longPeriod: 20 };
    case 'mean_reversion':
      return { period: 20, deviationThreshold: 0.02 };
    case 'breakout':
      return { lookbackPeriod: 20, breakoutThreshold: 0.01 };
    case 'random':
    default:
      return { 
        tradeProbability: 0.1, 
        avgHoldingPeriod: 10,
        ...(seed !== undefined ? { seed } : {}),
      };
  }
}

program.parse();
