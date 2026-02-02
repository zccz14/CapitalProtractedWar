/**
 * 新范式实验 - 止盈间隔评估
 * 
 * 实验架构：市场序列 × 信号策略 × 投注策略(M_T)
 * 
 * 核心变化：
 * - 不再关注 E[M]（易被极端值影响）
 * - 不再关注 P(M >= k)（时间拉长总能成功）
 * - 核心关注：各 M_T 下止盈事件的平均时间间隔
 * 
 * 输出：
 * - index.html: 总结报告（带导航链接）
 * - market_xxx.html: 市场条件报告
 * - signal_xxx.html: 策略详细报告
 */

import { NewParadigmExperimentRunner } from '../engine/index.js';
import { printReport, exportToCSV } from '../analysis/index.js';
import { saveReportSuite, type ReportSuite } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult, SignalStrategyType } from '../types.js';
import { DEFAULT_TAKE_PROFIT_TARGETS } from '../types.js';
import * as fs from 'fs';
import { exec } from 'child_process';

// ============================================
// 实验配置
// ============================================

// 测试的信号策略
const SIGNAL_STRATEGIES: { type: SignalStrategyType; params?: Record<string, any> }[] = [
  { type: 'trend_following', params: { fastPeriod: 5, slowPeriod: 20 } },
  { type: 'mean_reversion', params: { period: 20, threshold: 2 } },
  { type: 'breakout', params: { period: 20, threshold: 0 } },
  { type: 'random', params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 } },
];

// 测试的波动率场景
const VOLATILITY_SCENARIOS = [
  0.05,   // 5% - 股票10x / BTC现货
  0.10,   // 10% - BTC 2x / 山寨币现货
  0.20,   // 20% - BTC 5x / MEME币
  0.50,   // 50% - BTC 10x / 极端MEME
  1.00,   // 100% - BTC 20x
];

// 测试的漂移率场景
const DRIFT_SCENARIOS = [
  0,      // 中性市场
  0.05,   // 5% 年化
  0.10,   // 10% 年化
  0.20,   // 20% 年化
  0.50,   // 50% 年化（强牛市）
];

// 实验参数
const CANDLE_COUNT = 20000;       // K线数量（2万根）
const MONTE_CARLO_RUNS = 1000;    // 蒙特卡洛运行次数
const TRADING_COST_RATE = 0.0003; // 交易成本 0.03%

// ============================================
// 主实验函数
// ============================================

async function runNewParadigmExperiment(): Promise<string> {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          资本持久战实验 - 新范式：止盈间隔评估                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log('\n核心指标：各 M_T 下止盈事件的平均时间间隔');
  console.log(`止盈线: ${DEFAULT_TAKE_PROFIT_TARGETS.join(', ')}`);
  console.log(`K线数: ${CANDLE_COUNT} | MC次数: ${MONTE_CARLO_RUNS}`);
  console.log(`波动率场景: ${VOLATILITY_SCENARIOS.map(v => (v*100).toFixed(0) + '%').join(', ')}`);
  console.log(`漂移率场景: ${DRIFT_SCENARIOS.map(d => (d*100).toFixed(0) + '%').join(', ')}`);
  console.log('\n');

  const runner = new NewParadigmExperimentRunner();
  const outputDir = './results/new_paradigm';
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 收集所有实验结果
  const allResults: ExperimentResult[] = [];
  const totalExperiments = VOLATILITY_SCENARIOS.length * DRIFT_SCENARIOS.length;
  let currentExperiment = 0;

  // 运行实验矩阵
  for (const volatility of VOLATILITY_SCENARIOS) {
    for (const drift of DRIFT_SCENARIOS) {
      currentExperiment++;
      console.log('─'.repeat(70));
      console.log(`[${currentExperiment}/${totalExperiments}] 市场: σ=${(volatility * 100).toFixed(0)}%, μ=${(drift * 100).toFixed(0)}%`);
      console.log('─'.repeat(70));
      
      const name = `vol${(volatility * 100).toFixed(0)}_drift${(drift * 100).toFixed(0)}`;
      
      const config: ExperimentConfig = {
        name,
        description: `波动率${(volatility * 100).toFixed(0)}%, 漂移率${(drift * 100).toFixed(0)}%`,
        market: {
          type: 'gbm',
          volatility,
          drift,
          candleCount: CANDLE_COUNT,
          seed: 42,
        },
        signals: SIGNAL_STRATEGIES.map(s => ({
          type: s.type,
          params: s.params,
        })),
        betting: {
          takeProfitTargets: DEFAULT_TAKE_PROFIT_TARGETS,
          tradingCostRate: TRADING_COST_RATE,
        },
        monteCarloRuns: MONTE_CARLO_RUNS,
        outputDir,
      };
      
      console.log(`运行实验 [${name}]...`);
      const startTime = Date.now();
      
      const result = await runner.run(config);
      allResults.push(result);
      
      const elapsed = Date.now() - startTime;
      console.log(`✓ 完成! 耗时 ${elapsed}ms\n`);
      
      // 打印简要报告
      printReport(result);
      
      // 保存 CSV
      const csvPath = `${outputDir}/${name}_data.csv`;
      fs.writeFileSync(csvPath, exportToCSV(result), 'utf-8');
      console.log(`CSV 已保存: ${csvPath}\n`);
    }
  }
  
  // 生成完整的报告套件
  console.log('\n' + '═'.repeat(70));
  console.log('正在生成多层级 HTML 报告...');
  console.log('═'.repeat(70) + '\n');
  
  const suite: ReportSuite = {
    results: allResults,
    outputDir,
  };
  
  const indexPath = await saveReportSuite(suite);
  
  console.log('\n' + '═'.repeat(70));
  console.log('实验完成!');
  console.log('═'.repeat(70));
  console.log(`\n📊 报告结构:`);
  console.log(`   └── ${outputDir}/`);
  console.log(`       ├── index.html (总结报告)`);
  console.log(`       ├── market_*.html (市场报告 × ${allResults.length})`);
  console.log(`       ├── signal_*.html (策略详细报告 × ${allResults.length * SIGNAL_STRATEGIES.length})`);
  console.log(`       └── *_data.json/csv (数据文件)`);
  console.log(`\n🔗 总结报告: ${indexPath}`);
  
  return indexPath;
}

// ============================================
// 快速测试函数（用于验证）
// ============================================

async function runQuickTest(): Promise<string> {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║              快速测试：验证新范式引擎和报告系统                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  
  const runner = new NewParadigmExperimentRunner();
  const outputDir = './results/quick_test';
  
  // 收集结果
  const allResults: ExperimentResult[] = [];
  
  // 快速测试的市场配置（精简版）
  const marketConfigs = [
    { volatility: 0.05, drift: 0, name: 'vol5_drift0' },
    { volatility: 0.10, drift: 0, name: 'vol10_drift0' },
    { volatility: 0.20, drift: 0, name: 'vol20_drift0' },
    { volatility: 0.20, drift: 0.10, name: 'vol20_drift10' },
  ];
  
  for (const mc of marketConfigs) {
    console.log(`\n运行 [${mc.name}]...`);
    
    const config: ExperimentConfig = {
      name: mc.name,
      market: {
        type: 'gbm',
        volatility: mc.volatility,
        drift: mc.drift,
        candleCount: 10000,  // 快速测试用1万根K线
        seed: 42,
      },
      // 使用全部4个信号策略
      signals: SIGNAL_STRATEGIES.map(s => ({
        type: s.type,
        params: s.params,
      })),
      betting: {
        takeProfitTargets: DEFAULT_TAKE_PROFIT_TARGETS,  // 完整的止盈线序列到1024
      },
      monteCarloRuns: 50,  // 快速测试用50次MC
    };
    
    const result = await runner.run(config);
    allResults.push(result);
    
    console.log(`✓ 完成! 耗时 ${result.elapsedMs}ms`);
    printReport(result);
  }
  
  // 生成报告套件
  console.log('\n生成多层级报告...');
  
  const suite: ReportSuite = {
    results: allResults,
    outputDir,
  };
  
  const indexPath = await saveReportSuite(suite);
  
  console.log(`\n📊 快速测试报告已保存到: ${outputDir}`);
  console.log(`🔗 总结报告: ${indexPath}`);
  
  return indexPath;
}

// ============================================
// 打开报告（跨平台）
// ============================================

function openReport(filePath: string): void {
  const platform = process.platform;
  let command: string;
  
  if (platform === 'darwin') {
    command = `open "${filePath}"`;
  } else if (platform === 'win32') {
    command = `start "" "${filePath}"`;
  } else {
    command = `xdg-open "${filePath}"`;
  }
  
  exec(command, (error) => {
    if (error) {
      console.error(`无法打开报告: ${error.message}`);
      console.log(`请手动打开: ${filePath}`);
    } else {
      console.log(`\n🌐 已在浏览器中打开总结报告`);
    }
  });
}

// ============================================
// 入口
// ============================================

const args = process.argv.slice(2);

async function main() {
  let indexPath: string;
  
  if (args.includes('--quick') || args.includes('-q')) {
    indexPath = await runQuickTest();
  } else {
    indexPath = await runNewParadigmExperiment();
  }
  
  // 自动打开报告
  if (!args.includes('--no-open')) {
    openReport(indexPath);
  }
}

main().catch(console.error);
