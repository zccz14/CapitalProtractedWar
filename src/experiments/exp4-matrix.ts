/**
 * 实验4: 全矩阵扫描实验
 * 
 * 目的: 全面扫描波动率×信号策略×市场类型的组合空间
 * 
 * 配置:
 * - 波动率: [1%, 5%, 10%, 20%]
 * - 市场: [GBM, GARCH]
 * - 信号: [趋势跟踪, 均值回归, 随机]
 * - K线数: 2000
 * - 蒙特卡洛: 500次 (减少以加快速度)
 */

import { ExperimentRunner } from '../engine/index.js';
import { printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import { saveComparisonReport } from '../visualization/index.js';
import type { ExperimentConfig, ExperimentResult, MarketType, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

const VOLATILITIES = [0.01, 0.05, 0.10, 0.20];
const MARKETS: MarketType[] = ['gbm', 'garch'];
const SIGNALS: SignalStrategyType[] = ['trend_following', 'mean_reversion', 'random'];

async function runExperiment4() {
  console.log('='.repeat(60));
  console.log('实验4: 全矩阵扫描实验');
  console.log('='.repeat(60));
  console.log(`总配置数: ${VOLATILITIES.length * MARKETS.length * SIGNALS.length}`);
  
  const runner = new ExperimentRunner();
  const results: ExperimentResult[] = [];
  let completed = 0;
  const total = VOLATILITIES.length * MARKETS.length * SIGNALS.length;
  
  for (const volatility of VOLATILITIES) {
    for (const marketType of MARKETS) {
      for (const signalType of SIGNALS) {
        const name = `v${(volatility * 100).toFixed(0)}_${marketType}_${signalType}`;
        
        const config: ExperimentConfig = {
          name,
          market: {
            type: marketType,
            volatility,
            candleCount: 2000,
            seed: 42,
            // GARCH参数
            ...(marketType === 'garch' ? {
              garchOmega: 0.00001,
              garchAlpha: 0.1,
              garchBeta: 0.85,
            } : {}),
          },
          signal: {
            type: signalType,
            params: signalType === 'random' ? {
              tradeProbability: 0.1,
              avgHoldingPeriod: 10,
              seed: 42,
            } : signalType === 'trend_following' ? {
              shortPeriod: 5,
              longPeriod: 20,
            } : {
              period: 20,
              deviationThreshold: 0.02,
            },
          },
          monteCarloRuns: 500,
          targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
        };
        
        completed++;
        console.log(`\n[${completed}/${total}] 运行: ${name}...`);
        
        const result = await runner.run(config);
        results.push(result);
        
        // 简化输出
        console.log(`  E[M]=${result.mDistribution.mean.toFixed(2)}x, P(2x)=${((result.reachProbabilities.get(2) ?? 0) * 100).toFixed(0)}%, P(10x)=${((result.reachProbabilities.get(10) ?? 0) * 100).toFixed(0)}%`);
      }
    }
  }
  
  // 打印对比表格
  console.log('\n');
  printComparisonTable(results);
  
  // 保存结果
  const outputDir = './results/exp4_matrix';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  await saveComparisonReport(results, outputDir);
  
  fs.writeFileSync(`${outputDir}/all_results.json`, exportToJSON(results), 'utf-8');
  fs.writeFileSync(`${outputDir}/comparison.csv`, exportToCSV(results), 'utf-8');
  
  console.log(`\n结果已保存到: ${outputDir}`);
  
  // 生成汇总分析
  console.log('\n' + '='.repeat(60));
  console.log('汇总分析');
  console.log('='.repeat(60));
  
  // 按波动率分组统计
  console.log('\n按波动率分组的平均 E[M]:');
  for (const vol of VOLATILITIES) {
    const volResults = results.filter(r => r.config.market.volatility === vol);
    const avgM = volResults.reduce((sum, r) => sum + r.mDistribution.mean, 0) / volResults.length;
    console.log(`  σ=${(vol * 100).toFixed(0)}%: E[M]=${avgM.toFixed(2)}x`);
  }
  
  // 按信号策略分组统计
  console.log('\n按信号策略分组的平均 E[M]:');
  for (const sig of SIGNALS) {
    const sigResults = results.filter(r => r.config.signal.type === sig);
    const avgM = sigResults.reduce((sum, r) => sum + r.mDistribution.mean, 0) / sigResults.length;
    console.log(`  ${sig}: E[M]=${avgM.toFixed(2)}x`);
  }
  
  // 按市场类型分组统计
  console.log('\n按市场类型分组的平均 E[M]:');
  for (const mkt of MARKETS) {
    const mktResults = results.filter(r => r.config.market.type === mkt);
    const avgM = mktResults.reduce((sum, r) => sum + r.mDistribution.mean, 0) / mktResults.length;
    console.log(`  ${mkt}: E[M]=${avgM.toFixed(2)}x`);
  }
}

runExperiment4().catch(console.error);
