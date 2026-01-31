/**
 * 实验5: 自适应波动率策略对比实验
 * 
 * 目的: 验证自适应波动率策略相比固定参数策略的效果
 * 
 * 实验设计:
 * 1. 基线对照组：原始趋势跟踪和均值回归策略
 * 2. 自适应模式对比：
 *    - period_scaling: 仅周期自适应
 *    - threshold_scaling: 仅阈值自适应
 *    - volatility_filter: 波动率过滤
 *    - volatility_breakout: 波动率突破信号
 *    - full: 全部功能
 * 3. 在不同市场类型下测试（GBM vs GARCH）
 */

import { ExperimentRunner } from '../engine/index.js';
import { printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import { saveReport, saveComparisonReport } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

// 策略配置
interface StrategyConfig {
  type: SignalStrategyType;
  params: Record<string, any>;
  name: string;
  shortName: string;
}

// 基线策略
const BASELINE_STRATEGIES: StrategyConfig[] = [
  {
    type: 'trend_following',
    params: { shortPeriod: 5, longPeriod: 20 },
    name: '趋势跟踪(基线)',
    shortName: 'trend_base',
  },
  {
    type: 'mean_reversion',
    params: { period: 20, deviationThreshold: 0.02 },
    name: '均值回归(基线)',
    shortName: 'mr_base',
  },
];

// 自适应波动率策略变体
const ADAPTIVE_STRATEGIES: StrategyConfig[] = [
  // 趋势跟踪 + 各种自适应模式
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'trend',
      shortPeriod: 5, 
      longPeriod: 20,
      adaptiveMode: 'period_scaling',
    },
    name: '自适应趋势-周期缩放',
    shortName: 'adp_trend_period',
  },
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'trend',
      shortPeriod: 5, 
      longPeriod: 20,
      adaptiveMode: 'threshold_scaling',
    },
    name: '自适应趋势-阈值缩放',
    shortName: 'adp_trend_thresh',
  },
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'trend',
      shortPeriod: 5, 
      longPeriod: 20,
      adaptiveMode: 'volatility_filter',
      filterExtremeVol: true,
      filterLowVol: false,
    },
    name: '自适应趋势-波动率过滤',
    shortName: 'adp_trend_filter',
  },
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'trend',
      shortPeriod: 5, 
      longPeriod: 20,
      adaptiveMode: 'volatility_breakout',
    },
    name: '自适应趋势-波动率突破',
    shortName: 'adp_trend_break',
  },
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'trend',
      shortPeriod: 5, 
      longPeriod: 20,
      adaptiveMode: 'full',
      filterExtremeVol: true,
      filterLowVol: false,
    },
    name: '自适应趋势-全功能',
    shortName: 'adp_trend_full',
  },
  // 均值回归 + 自适应模式
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'mean_reversion',
      longPeriod: 20,
      deviationThreshold: 0.02,
      adaptiveMode: 'threshold_scaling',
    },
    name: '自适应均值回归-阈值缩放',
    shortName: 'adp_mr_thresh',
  },
  {
    type: 'adaptive_volatility',
    params: { 
      baseStrategy: 'mean_reversion',
      longPeriod: 20,
      deviationThreshold: 0.02,
      adaptiveMode: 'full',
      filterExtremeVol: true,
    },
    name: '自适应均值回归-全功能',
    shortName: 'adp_mr_full',
  },
];

// 市场场景
const MARKET_SCENARIOS = [
  {
    type: 'gbm' as const,
    volatility: 0.50,
    leverage: 1,
    description: 'GBM 50% 波动率 (BTC现货级别)',
  },
  {
    type: 'garch' as const,
    volatility: 0.50,
    leverage: 1,
    garchAlpha: 0.1,
    garchBeta: 0.85,
    description: 'GARCH 50% 波动率 (波动率聚集)',
  },
  {
    type: 'gbm' as const,
    volatility: 0.50,
    leverage: 5,
    description: 'GBM 50%×5x 杠杆 (高波动场景)',
  },
  {
    type: 'garch' as const,
    volatility: 0.50,
    leverage: 5,
    garchAlpha: 0.1,
    garchBeta: 0.85,
    description: 'GARCH 50%×5x 杠杆 (高波动+聚集)',
  },
];

const BASE_TRADING_COST_RATE = 0.0005;
const MONTE_CARLO_RUNS = 1000;
const CANDLE_COUNT = 2000;

async function runExperiment5() {
  console.log('='.repeat(80));
  console.log('实验5: 自适应波动率策略效果验证');
  console.log('='.repeat(80));
  console.log(`蒙特卡洛次数: ${MONTE_CARLO_RUNS}`);
  console.log(`K线数量: ${CANDLE_COUNT}`);
  console.log(`基础交易成本率: ${(BASE_TRADING_COST_RATE * 100).toFixed(4)}%`);
  console.log('='.repeat(80));

  const runner = new ExperimentRunner();
  const allResults: ExperimentResult[] = [];
  const resultsByScenario: Map<string, ExperimentResult[]> = new Map();

  for (const scenario of MARKET_SCENARIOS) {
    const effectiveVol = scenario.volatility * scenario.leverage;
    
    console.log(`\n${'#'.repeat(80)}`);
    console.log(`# 市场场景: ${scenario.description}`);
    console.log(`# 等效波动率: ${(effectiveVol * 100).toFixed(0)}%`);
    console.log('#'.repeat(80));

    const scenarioResults: ExperimentResult[] = [];
    const allStrategies = [...BASELINE_STRATEGIES, ...ADAPTIVE_STRATEGIES];

    for (const strategy of allStrategies) {
      const config: ExperimentConfig = {
        name: `exp5_${strategy.shortName}_${scenario.type}_vol${(scenario.volatility * 100).toFixed(0)}_lev${scenario.leverage}`,
        description: `${scenario.description}, ${strategy.name}`,
        market: {
          type: scenario.type,
          volatility: effectiveVol,
          leverage: scenario.leverage,
          candleCount: CANDLE_COUNT,
          seed: 42,
          ...(scenario.type === 'garch' ? {
            garchAlpha: scenario.garchAlpha,
            garchBeta: scenario.garchBeta,
          } : {}),
        },
        signal: {
          type: strategy.type,
          params: strategy.params,
        },
        monteCarloRuns: MONTE_CARLO_RUNS,
        targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
        tradingCostRate: BASE_TRADING_COST_RATE,
      };

      console.log(`\n运行: ${strategy.name}...`);
      const startTime = Date.now();
      const result = await runner.run(config);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      // 打印摘要
      const p2 = (result.reachProbabilities.get(2) ?? 0) * 100;
      const p10 = (result.reachProbabilities.get(10) ?? 0) * 100;
      const p100 = (result.reachProbabilities.get(100) ?? 0) * 100;
      console.log(`  E[M]=${result.mDistribution.mean.toFixed(2)}x | P(2x)=${p2.toFixed(1)}% | P(10x)=${p10.toFixed(1)}% | P(100x)=${p100.toFixed(1)}% | ${elapsed}s`);

      scenarioResults.push(result);
      allResults.push(result);
    }

    resultsByScenario.set(scenario.description, scenarioResults);

    // 打印场景对比
    console.log(`\n--- ${scenario.description} 对比表 ---`);
    printComparisonTable(scenarioResults);
  }

  // 保存结果
  const outputDir = './results/exp5_adaptive_volatility';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 为每个实验生成详细报告
  console.log('\n生成详细报告...');
  for (const result of allResults) {
    await saveReport(result, outputDir);
    console.log(`  已生成: ${result.config.name}`);
  }

  await saveComparisonReport(allResults, outputDir);
  fs.writeFileSync(`${outputDir}/all_results.json`, exportToJSON(allResults), 'utf-8');
  fs.writeFileSync(`${outputDir}/comparison.csv`, exportToCSV(allResults), 'utf-8');

  // 生成分析报告
  generateAnalysisReport(resultsByScenario, outputDir);

  console.log(`\n${'='.repeat(80)}`);
  console.log(`实验完成! 结果已保存到: ${outputDir}`);
  console.log('='.repeat(80));
}

/**
 * 生成分析报告
 */
function generateAnalysisReport(
  resultsByScenario: Map<string, ExperimentResult[]>,
  outputDir: string
) {
  let report = '# 自适应波动率策略实验分析报告\n\n';
  report += `生成时间: ${new Date().toISOString()}\n\n`;

  for (const [scenario, results] of resultsByScenario) {
    report += `## ${scenario}\n\n`;
    report += '| 策略 | E[M] | P(2x) | P(10x) | P(100x) | 胜率 | 交易成本 |\n';
    report += '|------|------|-------|--------|---------|------|----------|\n';

    // 找到基线策略作为对照
    const trendBaseline = results.find(r => r.config.name.includes('trend_base'));
    const mrBaseline = results.find(r => r.config.name.includes('mr_base'));

    for (const result of results) {
      const p2 = ((result.reachProbabilities.get(2) ?? 0) * 100).toFixed(1);
      const p10 = ((result.reachProbabilities.get(10) ?? 0) * 100).toFixed(1);
      const p100 = ((result.reachProbabilities.get(100) ?? 0) * 100).toFixed(1);
      const winRate = (result.avgWinRate * 100).toFixed(1);
      const cost = result.avgTotalTradingCost.toFixed(4);

      // 计算相对于基线的改善
      let improvement = '';
      const baseline = result.config.name.includes('trend') || result.config.name.includes('adp_trend')
        ? trendBaseline
        : mrBaseline;
      
      if (baseline && result !== baseline) {
        const baselineP10 = (baseline.reachProbabilities.get(10) ?? 0) * 100;
        const currentP10 = (result.reachProbabilities.get(10) ?? 0) * 100;
        const diff = currentP10 - baselineP10;
        if (Math.abs(diff) > 0.5) {
          improvement = diff > 0 ? ` (+${diff.toFixed(1)}%)` : ` (${diff.toFixed(1)}%)`;
        }
      }

      const strategyName = result.config.description?.split(', ')[1] ?? result.config.name;
      report += `| ${strategyName} | ${result.mDistribution.mean.toFixed(2)}x | ${p2}% | ${p10}%${improvement} | ${p100}% | ${winRate}% | ${cost} |\n`;
    }

    report += '\n';
  }

  // 总结
  report += '## 关键发现\n\n';
  report += '### 各模式效果:\n\n';
  report += '- **period_scaling**: 根据波动率调整均线周期\n';
  report += '- **threshold_scaling**: 根据波动率调整触发阈值\n';
  report += '- **volatility_filter**: 极端波动时暂停交易\n';
  report += '- **volatility_breakout**: 波动率突破时产生信号\n';
  report += '- **full**: 综合所有功能\n\n';

  report += '### 市场适应性:\n\n';
  report += '- GBM 市场: 独立同分布波动，自适应调整可能帮助有限\n';
  report += '- GARCH 市场: 波动率聚集效应明显，自适应策略应表现更好\n';

  fs.writeFileSync(`${outputDir}/analysis_report.md`, report, 'utf-8');
  console.log(`\n分析报告已保存: ${outputDir}/analysis_report.md`);
}

runExperiment5().catch(console.error);
