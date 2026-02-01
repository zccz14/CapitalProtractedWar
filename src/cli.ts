#!/usr/bin/env node
/**
 * CLI - 命令行接口（新范式）
 * 
 * 用法:
 *   npx tsx src/cli.ts run --volatility 0.1 --signal random --market gbm --runs 100
 *   npx tsx src/cli.ts exp-new   # 运行新范式实验
 *   npx tsx src/cli.ts scenarios # 查看波动率场景
 */

import { Command } from 'commander';
import { NewParadigmExperimentRunner } from './engine/index.js';
import { printReport, exportToJSON } from './analysis/index.js';
import { saveReport } from './visualization/index.js';
import type { ExperimentConfig, MarketType, SignalStrategyType } from './types.js';
import { DEFAULT_TAKE_PROFIT_TARGETS, VOLATILITY_SCENARIOS } from './types.js';
import * as fs from 'fs';

const program = new Command();

program
  .name('cpw')
  .description('资本持久战实验框架 CLI (新范式)')
  .version('2.0.0');

// 单次实验命令
program
  .command('run')
  .description('运行单次实验')
  .option('-v, --volatility <number>', '等效波动率 (0-1)', '0.1')
  .option('-m, --market <type>', '市场类型 (gbm|garch|trending|mean_reverting)', 'gbm')
  .option('-s, --signal <type>', '信号策略 (trend_following|mean_reversion|breakout|random)', 'random')
  .option('-c, --candles <number>', 'K线数量', '2000')
  .option('-r, --runs <number>', '蒙特卡洛次数', '100')
  .option('-o, --output <dir>', '输出目录', './results/custom')
  .option('--seed <number>', '随机种子')
  .action(async (options) => {
    const volatility = parseFloat(options.volatility);
    const candleCount = parseInt(options.candles);
    const monteCarloRuns = parseInt(options.runs);
    const seed = options.seed ? parseInt(options.seed) : undefined;
    
    const scenarioDesc = VOLATILITY_SCENARIOS[volatility] || `σ=${(volatility * 100).toFixed(1)}%`;
    
    console.log('='.repeat(60));
    console.log('资本持久战实验 (新范式)');
    console.log('='.repeat(60));
    console.log(`市场类型: ${options.market}`);
    console.log(`波动率: ${(volatility * 100).toFixed(1)}% (${scenarioDesc})`);
    console.log(`信号策略: ${options.signal}`);
    console.log(`K线数量: ${candleCount}`);
    console.log(`蒙特卡洛次数: ${monteCarloRuns}`);
    console.log(`止盈线: ${DEFAULT_TAKE_PROFIT_TARGETS.join(', ')}`);
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
      signals: [{
        type: options.signal as SignalStrategyType,
        params: getSignalParams(options.signal, seed),
      }],
      betting: {
        takeProfitTargets: DEFAULT_TAKE_PROFIT_TARGETS,
        winMultiplier: 2,
        loseMultiplier: 0,
        tradingCostRate: 0.0003,  // 0.03%
      },
      monteCarloRuns,
    };
    
    const runner = new NewParadigmExperimentRunner();
    console.log('\n运行中...');
    const result = await runner.run(config);
    
    printReport(result);
    
    // 保存结果
    if (!fs.existsSync(options.output)) {
      fs.mkdirSync(options.output, { recursive: true });
    }
    await saveReport(result, options.output);
    fs.writeFileSync(`${options.output}/result.json`, exportToJSON(result), 'utf-8');
    console.log(`\n结果已保存到: ${options.output}`);
  });

// 新范式实验命令
program
  .command('exp-new')
  .description('运行新范式实验 (止盈间隔分析)')
  .option('--quick', '快速模式 (少量MC运行)')
  .action(async (options) => {
    await import('./experiments/exp-new-paradigm.js');
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

// 列出止盈线
program
  .command('targets')
  .description('列出默认止盈线序列')
  .action(() => {
    console.log('\n默认止盈线序列 (M_T):');
    console.log('='.repeat(50));
    for (const target of DEFAULT_TAKE_PROFIT_TARGETS) {
      console.log(`  M_T = ${target}x`);
    }
    console.log('\n核心指标: 达到各止盈线的平均K线间隔');
  });

function getSignalParams(signalType: string, seed?: number): Record<string, number | string | boolean> {
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
