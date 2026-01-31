/**
 * 实验6b: K线周期合并 × 多策略对比实验
 * 
 * 目的: 验证不同策略在周期合并方法下的效果
 * 特别关注: 趋势跟踪策略和突破策略（原本表现不佳的策略）
 * 
 * 核心假设:
 * - 趋势跟踪和突破策略在短周期下因噪音过多表现不佳
 * - 通过周期合并，信噪比提升，策略可能改善
 * 
 * 配置:
 * - 基础市场: 低波动率 GBM (5% 年化)
 * - 周期: 枚举 [1, 5, 10, 20] 天
 * - 策略: trend_following, breakout, mean_reversion, random
 * - 蒙特卡洛: 500次
 */

import { BacktestEngine } from '../engine/index.js';
import { generateMarket, calculateRealizedVolatility, aggregateCandles } from '../market/generator.js';
import { createSignalStrategy } from '../signal/index.js';
import type { Candle, BacktestResult, MDistributionStats, MarketConfig, SignalStrategyConfig, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

// 枚举的周期列表 (天)
const PERIODS = [1, 5, 10, 20];

// 测试的策略列表
const STRATEGIES: { type: SignalStrategyType; name: string; params?: Record<string, any> }[] = [
  { 
    type: 'trend_following', 
    name: '趋势跟踪',
    params: { fastPeriod: 5, slowPeriod: 20 }
  },
  { 
    type: 'breakout', 
    name: '突破策略',
    params: { period: 20, threshold: 0 }
  },
  { 
    type: 'mean_reversion', 
    name: '均值回归',
    params: { period: 20, threshold: 2 }
  },
  { 
    type: 'random', 
    name: '随机策略',
    params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 }
  },
];

// 基础市场配置 - 低波动率市场
const BASE_VOLATILITY = 0.05; // 5% 年化波动率
const BASE_CANDLE_COUNT = 6000;
const MONTE_CARLO_RUNS = 500;

interface StrategyPeriodResult {
  strategy: string;
  strategyType: SignalStrategyType;
  period: number;
  effectiveVolatility: number;
  candleCount: number;
  mMean: number;
  mMedian: number;
  mMax: number;
  mP95: number;
  pReach2: number;
  pReach5: number;
  pReach10: number;
  avgWinRate: number;
  avgTradeCount: number;
  timeEfficiency: number;
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

async function runStrategyPeriodExperiment(
  strategyConfig: { type: SignalStrategyType; name: string; params?: Record<string, any> },
  period: number,
  marketConfig: MarketConfig,
): Promise<StrategyPeriodResult> {
  const backtestResults: BacktestResult[] = [];
  const peakMultipliers: number[] = [];
  
  const engine = new BacktestEngine({
    targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
    tradingCostRate: 0.0003,
  });

  for (let i = 0; i < MONTE_CARLO_RUNS; i++) {
    // 生成基础市场数据
    const baseMarketConfig = {
      ...marketConfig,
      seed: marketConfig.seed !== undefined ? marketConfig.seed + i : undefined,
    };
    const baseCandles = generateMarket(baseMarketConfig);
    
    // 合并K线
    const candles = aggregateCandles(baseCandles, period);
    
    // 创建信号策略
    const signalConfig: SignalStrategyConfig = {
      type: strategyConfig.type,
      params: strategyConfig.params,
    };
    
    // 如果策略有seed参数，每次迭代使用不同seed
    if (signalConfig.params?.seed !== undefined) {
      signalConfig.params = { ...signalConfig.params, seed: (signalConfig.params.seed as number) + i };
    }
    
    const strategy = createSignalStrategy(signalConfig);
    
    // 运行回测
    const result = engine.run(candles, strategy);
    backtestResults.push(result);
    peakMultipliers.push(result.peakMultiplier);
  }

  // 计算统计数据
  const mDistribution = calculateDistributionStats(peakMultipliers);
  
  // 计算达到目标的概率
  const pReach2 = peakMultipliers.filter(m => m >= 2).length / MONTE_CARLO_RUNS;
  const pReach5 = peakMultipliers.filter(m => m >= 5).length / MONTE_CARLO_RUNS;
  const pReach10 = peakMultipliers.filter(m => m >= 10).length / MONTE_CARLO_RUNS;
  
  // 计算平均胜率和交易次数
  const avgWinRate = backtestResults.reduce((sum, r) => sum + r.winRate, 0) / MONTE_CARLO_RUNS;
  const avgTradeCount = backtestResults.reduce((sum, r) => sum + r.tradeCount, 0) / MONTE_CARLO_RUNS;

  // 理论等效波动率
  const effectiveVolatility = BASE_VOLATILITY * Math.sqrt(period);
  const candleCount = Math.floor(BASE_CANDLE_COUNT / period);
  
  // 时间效率: M均值 × (candleCount / baseCandleCount)
  const timeEfficiency = mDistribution.mean * (candleCount / BASE_CANDLE_COUNT);

  return {
    strategy: strategyConfig.name,
    strategyType: strategyConfig.type,
    period,
    effectiveVolatility,
    candleCount,
    mMean: mDistribution.mean,
    mMedian: mDistribution.median,
    mMax: mDistribution.max,
    mP95: mDistribution.percentiles.p95,
    pReach2,
    pReach5,
    pReach10,
    avgWinRate,
    avgTradeCount,
    timeEfficiency,
  };
}

async function runExperiment6b() {
  console.log('='.repeat(80));
  console.log('实验6b: K线周期合并 × 多策略对比实验');
  console.log('='.repeat(80));
  
  console.log(`\n基础配置:`);
  console.log(`- 基础波动率: ${(BASE_VOLATILITY * 100).toFixed(1)}% (年化)`);
  console.log(`- 基础K线数: ${BASE_CANDLE_COUNT}`);
  console.log(`- 枚举周期: ${PERIODS.join(', ')} 天`);
  console.log(`- 测试策略: ${STRATEGIES.map(s => s.name).join(', ')}`);
  console.log(`- 蒙特卡洛: ${MONTE_CARLO_RUNS}次\n`);

  const marketConfig: MarketConfig = {
    type: 'gbm',
    volatility: BASE_VOLATILITY,
    candleCount: BASE_CANDLE_COUNT,
    seed: 42,
  };

  const allResults: StrategyPeriodResult[] = [];

  // 枚举所有策略和周期组合
  for (const strategy of STRATEGIES) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`策略: ${strategy.name} (${strategy.type})`);
    console.log('='.repeat(60));
    
    for (const period of PERIODS) {
      process.stdout.write(`  周期 ${period}天... `);
      const result = await runStrategyPeriodExperiment(strategy, period, marketConfig);
      allResults.push(result);
      console.log(`M均值=${result.mMean.toFixed(2)}, P(M≥2)=${(result.pReach2 * 100).toFixed(1)}%, 胜率=${(result.avgWinRate * 100).toFixed(1)}%`);
    }
  }

  // 打印汇总表格 - 按策略分组
  console.log('\n' + '='.repeat(80));
  console.log('实验结果汇总 - 按策略分组');
  console.log('='.repeat(80));

  for (const strategy of STRATEGIES) {
    const strategyResults = allResults.filter(r => r.strategy === strategy.name);
    console.log(`\n【${strategy.name}】`);
    console.log('周期 | 等效σ | K线数 | M均值 | M中位 | P(M≥2) | P(M≥5) | 胜率 | 交易数 | 效率');
    console.log('-'.repeat(90));
    
    for (const r of strategyResults) {
      console.log(
        `${r.period.toString().padStart(4)}d | ` +
        `${(r.effectiveVolatility * 100).toFixed(1).padStart(5)}% | ` +
        `${r.candleCount.toString().padStart(5)} | ` +
        `${r.mMean.toFixed(2).padStart(5)} | ` +
        `${r.mMedian.toFixed(2).padStart(5)} | ` +
        `${(r.pReach2 * 100).toFixed(1).padStart(6)}% | ` +
        `${(r.pReach5 * 100).toFixed(1).padStart(6)}% | ` +
        `${(r.avgWinRate * 100).toFixed(1).padStart(4)}% | ` +
        `${r.avgTradeCount.toFixed(0).padStart(6)} | ` +
        `${r.timeEfficiency.toFixed(3)}`
      );
    }
  }

  // 打印横向对比 - 同周期不同策略
  console.log('\n' + '='.repeat(80));
  console.log('横向对比 - 同周期不同策略的 M均值');
  console.log('='.repeat(80));
  
  console.log('\n策略 \\ 周期     |    1天    |    5天    |   10天    |   20天    ');
  console.log('-'.repeat(70));
  
  for (const strategy of STRATEGIES) {
    const strategyResults = allResults.filter(r => r.strategy === strategy.name);
    const values = PERIODS.map(p => {
      const r = strategyResults.find(r => r.period === p);
      return r ? r.mMean.toFixed(2).padStart(7) : '   N/A';
    });
    console.log(`${strategy.name.padEnd(14)} | ${values.join('   |   ')}   `);
  }

  // 打印 P(M≥2) 对比
  console.log('\n策略 \\ 周期     |    1天    |    5天    |   10天    |   20天     (P(M≥2))');
  console.log('-'.repeat(70));
  
  for (const strategy of STRATEGIES) {
    const strategyResults = allResults.filter(r => r.strategy === strategy.name);
    const values = PERIODS.map(p => {
      const r = strategyResults.find(r => r.period === p);
      return r ? `${(r.pReach2 * 100).toFixed(1)}%`.padStart(7) : '   N/A';
    });
    console.log(`${strategy.name.padEnd(14)} | ${values.join('   |   ')}   `);
  }

  // 找出每个周期下最佳策略
  console.log('\n' + '='.repeat(80));
  console.log('各周期最佳策略');
  console.log('='.repeat(80));
  
  for (const period of PERIODS) {
    const periodResults = allResults.filter(r => r.period === period);
    const bestByM = periodResults.reduce((a, b) => a.mMean > b.mMean ? a : b);
    const bestByP2 = periodResults.reduce((a, b) => a.pReach2 > b.pReach2 ? a : b);
    console.log(`\n周期 ${period}天:`);
    console.log(`  - M均值最高: ${bestByM.strategy} (${bestByM.mMean.toFixed(2)}x)`);
    console.log(`  - P(M≥2)最高: ${bestByP2.strategy} (${(bestByP2.pReach2 * 100).toFixed(1)}%)`);
  }

  // 分析趋势跟踪和突破策略的改善情况
  console.log('\n' + '='.repeat(80));
  console.log('关键分析: 趋势跟踪和突破策略的周期效应');
  console.log('='.repeat(80));

  for (const strategyName of ['趋势跟踪', '突破策略']) {
    const strategyResults = allResults.filter(r => r.strategy === strategyName);
    const baseline = strategyResults.find(r => r.period === 1);
    
    console.log(`\n【${strategyName}】相对于1天周期的变化:`);
    console.log('周期 | M均值变化 | P(M≥2)变化 | 胜率变化');
    console.log('-'.repeat(50));
    
    for (const r of strategyResults) {
      if (!baseline) continue;
      const mChange = ((r.mMean / baseline.mMean - 1) * 100).toFixed(1);
      const pChange = ((r.pReach2 - baseline.pReach2) * 100).toFixed(1);
      const wrChange = ((r.avgWinRate - baseline.avgWinRate) * 100).toFixed(1);
      
      console.log(
        `${r.period.toString().padStart(4)}d | ` +
        `${mChange.padStart(9)}% | ` +
        `${pChange.padStart(10)}pp | ` +
        `${wrChange.padStart(8)}pp`
      );
    }
  }

  // 保存结果
  const outputDir = './results/exp6b_period_strategies';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(`${outputDir}/all_results.json`, JSON.stringify(allResults, null, 2), 'utf-8');
  
  // 生成 CSV
  const csvHeader = 'strategy,strategyType,period,effectiveVolatility,candleCount,mMean,mMedian,mMax,mP95,pReach2,pReach5,pReach10,avgWinRate,avgTradeCount,timeEfficiency';
  const csvRows = allResults.map(r => 
    `${r.strategy},${r.strategyType},${r.period},${r.effectiveVolatility},${r.candleCount},${r.mMean},${r.mMedian},${r.mMax},${r.mP95},${r.pReach2},${r.pReach5},${r.pReach10},${r.avgWinRate},${r.avgTradeCount},${r.timeEfficiency}`
  );
  fs.writeFileSync(`${outputDir}/results.csv`, [csvHeader, ...csvRows].join('\n'), 'utf-8');

  // 生成 HTML 报告
  generateHTMLReport(allResults, outputDir);

  console.log(`\n结果已保存到: ${outputDir}`);
  
  // 打印结论
  console.log('\n' + '='.repeat(80));
  console.log('结论');
  console.log('='.repeat(80));
}

function generateHTMLReport(results: StrategyPeriodResult[], outputDir: string) {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>K线周期合并 × 多策略对比实验</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 20px;
      color: #eee;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    
    .header {
      text-align: center;
      padding: 40px 20px;
      background: linear-gradient(135deg, #0f3460 0%, #533483 100%);
      border-radius: 16px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    }
    .header h1 {
      font-size: 2.5rem;
      margin-bottom: 10px;
      background: linear-gradient(90deg, #00d2ff, #3a7bd5);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .header .subtitle { opacity: 0.8; font-size: 1.1rem; }
    
    .section {
      background: rgba(255,255,255,0.05);
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 30px;
      backdrop-filter: blur(10px);
    }
    .section h2 {
      font-size: 1.5rem;
      margin-bottom: 20px;
      color: #00d2ff;
      border-bottom: 2px solid #00d2ff;
      padding-bottom: 10px;
    }
    
    .config-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .config-item {
      background: rgba(255,255,255,0.1);
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }
    .config-item .label { font-size: 0.85rem; opacity: 0.7; }
    .config-item .value { font-size: 1.3rem; font-weight: bold; color: #00d2ff; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px 8px;
      text-align: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    th {
      background: rgba(0,210,255,0.2);
      font-weight: 600;
      font-size: 0.85rem;
    }
    tr:hover { background: rgba(255,255,255,0.05); }
    
    .highlight-best { background: rgba(46, 204, 113, 0.3) !important; color: #2ecc71; font-weight: bold; }
    .highlight-worst { background: rgba(231, 76, 60, 0.3) !important; color: #e74c3c; }
    
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .chart-box {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
    }
    .chart-box h4 {
      text-align: center;
      margin-bottom: 15px;
      color: #fff;
    }
    
    .strategy-card {
      background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
      border-left: 4px solid #00d2ff;
    }
    .strategy-card h3 {
      color: #00d2ff;
      margin-bottom: 15px;
    }
    
    .insight-box {
      background: linear-gradient(135deg, rgba(241, 196, 15, 0.2) 0%, rgba(243, 156, 18, 0.1) 100%);
      border-radius: 12px;
      padding: 25px;
      margin: 20px 0;
      border-left: 4px solid #f1c40f;
    }
    .insight-box h3 { color: #f1c40f; margin-bottom: 15px; }
    .insight-box ul { margin-left: 20px; }
    .insight-box li { margin-bottom: 10px; line-height: 1.6; }
    
    .conclusion-box {
      background: linear-gradient(135deg, rgba(46, 204, 113, 0.2) 0%, rgba(39, 174, 96, 0.1) 100%);
      border-radius: 12px;
      padding: 25px;
      border-left: 4px solid #2ecc71;
    }
    .conclusion-box h3 { color: #2ecc71; margin-bottom: 15px; }
    
    @media (max-width: 768px) {
      .chart-grid { grid-template-columns: 1fr; }
      .header h1 { font-size: 1.8rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>K线周期合并 × 多策略对比实验</h1>
      <p class="subtitle">验证不同策略在周期合并方法下的效果 - 资本持久战框架</p>
    </div>
    
    <div class="section">
      <h2>实验配置</h2>
      <div class="config-grid">
        <div class="config-item">
          <div class="label">基础波动率</div>
          <div class="value">5%</div>
        </div>
        <div class="config-item">
          <div class="label">基础K线数</div>
          <div class="value">6,000</div>
        </div>
        <div class="config-item">
          <div class="label">蒙特卡洛次数</div>
          <div class="value">500</div>
        </div>
        <div class="config-item">
          <div class="label">枚举周期</div>
          <div class="value">1,5,10,20天</div>
        </div>
        <div class="config-item">
          <div class="label">测试策略</div>
          <div class="value">4种</div>
        </div>
        <div class="config-item">
          <div class="label">交易成本</div>
          <div class="value">0.03%</div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>M均值对比 (策略 × 周期)</h2>
      <table>
        <thead>
          <tr>
            <th>策略</th>
            <th>1天</th>
            <th>5天</th>
            <th>10天</th>
            <th>20天</th>
            <th>变化趋势</th>
          </tr>
        </thead>
        <tbody>
          ${STRATEGIES.map(s => {
            const strategyResults = results.filter(r => r.strategy === s.name);
            const values = PERIODS.map(p => strategyResults.find(r => r.period === p)?.mMean ?? 0);
            const maxVal = Math.max(...values);
            const trend = values[values.length - 1] > values[0] ? '📈 上升' : '📉 下降';
            return `<tr>
              <td><strong>${s.name}</strong></td>
              ${values.map((v, i) => `<td class="${v === maxVal ? 'highlight-best' : ''}">${v.toFixed(2)}x</td>`).join('')}
              <td>${trend}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="section">
      <h2>P(M≥2) 翻倍概率对比</h2>
      <table>
        <thead>
          <tr>
            <th>策略</th>
            <th>1天</th>
            <th>5天</th>
            <th>10天</th>
            <th>20天</th>
          </tr>
        </thead>
        <tbody>
          ${STRATEGIES.map(s => {
            const strategyResults = results.filter(r => r.strategy === s.name);
            const values = PERIODS.map(p => strategyResults.find(r => r.period === p)?.pReach2 ?? 0);
            const maxVal = Math.max(...values);
            return `<tr>
              <td><strong>${s.name}</strong></td>
              ${values.map(v => `<td class="${v === maxVal ? 'highlight-best' : ''}">${(v * 100).toFixed(1)}%</td>`).join('')}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    
    <div class="section">
      <h2>可视化分析</h2>
      <div class="chart-grid">
        <div class="chart-box">
          <h4>M均值 vs 周期 (各策略)</h4>
          <canvas id="chartMean"></canvas>
        </div>
        <div class="chart-box">
          <h4>P(M≥2) vs 周期 (各策略)</h4>
          <canvas id="chartP2"></canvas>
        </div>
        <div class="chart-box">
          <h4>胜率 vs 周期 (各策略)</h4>
          <canvas id="chartWinRate"></canvas>
        </div>
        <div class="chart-box">
          <h4>时间效率 vs 周期 (各策略)</h4>
          <canvas id="chartEfficiency"></canvas>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>各策略详细数据</h2>
      ${STRATEGIES.map(s => {
        const strategyResults = results.filter(r => r.strategy === s.name);
        return `
        <div class="strategy-card">
          <h3>${s.name} (${s.type})</h3>
          <table>
            <thead>
              <tr>
                <th>周期</th>
                <th>等效σ</th>
                <th>K线数</th>
                <th>M均值</th>
                <th>M中位</th>
                <th>M最大</th>
                <th>P(M≥2)</th>
                <th>P(M≥5)</th>
                <th>胜率</th>
                <th>交易数</th>
              </tr>
            </thead>
            <tbody>
              ${strategyResults.map(r => `
                <tr>
                  <td>${r.period}天</td>
                  <td>${(r.effectiveVolatility * 100).toFixed(1)}%</td>
                  <td>${r.candleCount}</td>
                  <td>${r.mMean.toFixed(2)}x</td>
                  <td>${r.mMedian.toFixed(2)}x</td>
                  <td>${r.mMax.toFixed(1)}x</td>
                  <td>${(r.pReach2 * 100).toFixed(1)}%</td>
                  <td>${(r.pReach5 * 100).toFixed(1)}%</td>
                  <td>${(r.avgWinRate * 100).toFixed(1)}%</td>
                  <td>${r.avgTradeCount.toFixed(0)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
      }).join('')}
    </div>
    
    <div class="section">
      <h2>关键发现</h2>
      <div class="insight-box">
        <h3>⚠️ 重要观察</h3>
        <ul>
          <li><strong>趋势跟踪策略</strong>：观察周期增加时M均值和胜率的变化，分析信噪比改善是否有效</li>
          <li><strong>突破策略</strong>：检验更长周期是否能过滤假突破，提升策略表现</li>
          <li><strong>均值回归策略</strong>：分析周期变化对均值回归信号的影响</li>
          <li><strong>随机策略</strong>：作为对照组，观察纯粹由交易机会减少带来的效果</li>
        </ul>
      </div>
    </div>
    
    <div class="section">
      <h2>结论</h2>
      <div class="conclusion-box">
        <h3>✅ 实验结论</h3>
        <p>根据实验数据，分析各策略在周期合并下的表现变化...</p>
        <p style="margin-top: 15px;">（具体结论需根据实验数据分析得出）</p>
      </div>
    </div>
  </div>
  
  <script>
    const periods = ${JSON.stringify(PERIODS)};
    const strategies = ${JSON.stringify(STRATEGIES.map(s => s.name))};
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#9b59b6'];
    
    const data = ${JSON.stringify(results)};
    
    // 按策略组织数据
    function getDataByStrategy(field) {
      return strategies.map((s, i) => ({
        label: s,
        data: periods.map(p => {
          const r = data.find(d => d.strategy === s && d.period === p);
          return r ? r[field] : 0;
        }),
        borderColor: colors[i],
        backgroundColor: colors[i] + '33',
        tension: 0.4,
        fill: false,
      }));
    }
    
    // Chart 1: M均值
    new Chart(document.getElementById('chartMean'), {
      type: 'line',
      data: {
        labels: periods.map(p => p + '天'),
        datasets: getDataByStrategy('mMean'),
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#eee' } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } },
          x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } }
        }
      }
    });
    
    // Chart 2: P(M≥2)
    new Chart(document.getElementById('chartP2'), {
      type: 'line',
      data: {
        labels: periods.map(p => p + '天'),
        datasets: strategies.map((s, i) => ({
          label: s,
          data: periods.map(p => {
            const r = data.find(d => d.strategy === s && d.period === p);
            return r ? r.pReach2 * 100 : 0;
          }),
          borderColor: colors[i],
          backgroundColor: colors[i] + '33',
          tension: 0.4,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#eee' } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } },
          x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } }
        }
      }
    });
    
    // Chart 3: 胜率
    new Chart(document.getElementById('chartWinRate'), {
      type: 'line',
      data: {
        labels: periods.map(p => p + '天'),
        datasets: strategies.map((s, i) => ({
          label: s,
          data: periods.map(p => {
            const r = data.find(d => d.strategy === s && d.period === p);
            return r ? r.avgWinRate * 100 : 0;
          }),
          borderColor: colors[i],
          backgroundColor: colors[i] + '33',
          tension: 0.4,
          fill: false,
        })),
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#eee' } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } },
          x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } }
        }
      }
    });
    
    // Chart 4: 时间效率
    new Chart(document.getElementById('chartEfficiency'), {
      type: 'line',
      data: {
        labels: periods.map(p => p + '天'),
        datasets: getDataByStrategy('timeEfficiency'),
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#eee' } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } },
          x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } }
        }
      }
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(`${outputDir}/report.html`, html, 'utf-8');
  console.log(`HTML报告已保存: ${outputDir}/report.html`);
}

// 运行实验
runExperiment6b().catch(console.error);
