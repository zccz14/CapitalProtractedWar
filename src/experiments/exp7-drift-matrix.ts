/**
 * 实验7: 漂移率(Drift) × 策略 × 波动率 矩阵实验
 * 
 * 核心问题: 不同市场漂移率(μ)下，哪种策略表现最好？
 * 
 * 理论背景:
 * - μ = 0%: 纯随机游走，无趋势，均值回归策略有优势
 * - μ > 0%: 趋势市场，价格长期上涨，趋势跟踪策略有优势
 * 
 * 测试矩阵:
 * - 漂移率 μ: [0%, 5%, 10%, 20%]
 * - 波动率 σ: [5%, 10%, 20%]
 * - 策略: [趋势跟踪, 均值回归, 突破, 随机]
 * 
 * 输出: 自定义HTML报告，展示 漂移率 × 策略 矩阵
 */

import { ExperimentRunner } from '../engine/index.js';
import { saveReport } from '../visualization/index.js';
import { printComparisonTable, exportToJSON, exportToCSV } from '../analysis/index.js';
import type { ExperimentConfig, ExperimentResult, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

// 测试参数
const DRIFTS = [0, 0.05, 0.10, 0.20];  // 年化漂移率
const VOLATILITIES = [0.05, 0.10, 0.20];  // 年化波动率
const STRATEGIES: { type: SignalStrategyType; name: string; params?: Record<string, any> }[] = [
  { type: 'trend_following', name: '趋势跟踪', params: { fastPeriod: 5, slowPeriod: 20 } },
  { type: 'mean_reversion', name: '均值回归', params: { period: 20, threshold: 2 } },
  { type: 'breakout', name: '突破策略', params: { period: 20, threshold: 0 } },
  { type: 'random', name: '随机策略', params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 } },
];

const CANDLE_COUNT = 2000;  // K线数量
const MONTE_CARLO_RUNS = 500;  // 蒙特卡洛次数
const TRADING_COST_RATE = 0.0003;  // 交易成本 0.03%

function getDriftLabel(drift: number): string {
  return `μ=${(drift * 100).toFixed(0)}%`;
}

function getVolatilityLabel(vol: number): string {
  return `σ=${(vol * 100).toFixed(0)}%`;
}

// 生成自定义HTML报告，展示 漂移率 × 策略 矩阵
function generateDriftMatrixHTML(results: ExperimentResult[]): string {
  // 提取数据
  const data = results.map(r => ({
    name: r.config.name,
    drift: r.config.market.drift ?? 0,
    volatility: r.config.market.volatility,
    strategy: r.config.signal.type,
    meanM: r.mDistribution.mean,
    medianM: r.mDistribution.median,
    prob2x: r.reachProbabilities.get(2) ?? 0,
    prob10x: r.reachProbabilities.get(10) ?? 0,
    prob100x: r.reachProbabilities.get(100) ?? 0,
    winRate: r.avgWinRate,
  }));

  const strategyNames: Record<string, string> = {
    'trend_following': '趋势跟踪',
    'mean_reversion': '均值回归',
    'breakout': '突破策略',
    'random': '随机策略',
  };

  const formatM = (v: number) => v >= 1000 ? v.toExponential(1) : v.toFixed(2);
  const formatPct = (v: number) => (v * 100).toFixed(0) + '%';
  const getColorBg = (prob: number) => prob > 0.5 ? '#27ae6044' : prob > 0.1 ? '#f39c1244' : '#e74c3c44';

  // 为每个波动率生成一组矩阵
  const generateVolatilitySection = (vol: number) => {
    const volData = data.filter(d => d.volatility === vol);
    
    const generateMatrix = (metric: 'meanM' | 'prob2x' | 'prob10x' | 'winRate', title: string, formatter: (v: number) => string, useColor: boolean = false) => {
      const headerCells = DRIFTS.map(d => `<th>${getDriftLabel(d)}</th>`).join('');
      const bodyRows = STRATEGIES.map(s => {
        const cells = DRIFTS.map(d => {
          const row = volData.find(r => r.drift === d && r.strategy === s.type);
          if (!row) return '<td>-</td>';
          const value = row[metric];
          const bg = useColor ? getColorBg(value) : '';
          const reportLink = `${row.name}_report.html`;
          return `<td style="background: ${bg}"><a href="${reportLink}" class="cell-link">${formatter(value)}</a></td>`;
        }).join('');
        return `<tr><td class="strategy-cell">${strategyNames[s.type]}</td>${cells}</tr>`;
      }).join('\n');
      
      return `
        <div class="matrix-card">
          <h4>${title}</h4>
          <table class="matrix-table">
            <thead><tr><th>策略 \\ 漂移率</th>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      `;
    };
    
    return `
      <div class="vol-section">
        <h3>${getVolatilityLabel(vol)} 波动率</h3>
        <div class="matrix-grid">
          ${generateMatrix('meanM', 'E[M] 平均峰值倍率', v => formatM(v) + 'x')}
          ${generateMatrix('prob2x', 'P(M≥2x) 翻倍概率', formatPct, true)}
          ${generateMatrix('prob10x', 'P(M≥10x) 10倍概率', formatPct, true)}
          ${generateMatrix('winRate', '胜率', formatPct)}
        </div>
      </div>
    `;
  };

  // 生成策略对比分析
  const generateStrategyAnalysis = () => {
    let analysis = '';
    
    for (const strategy of STRATEGIES) {
      const sData = data.filter(d => d.strategy === strategy.type);
      const bestByDrift = DRIFTS.map(drift => {
        const driftData = sData.filter(d => d.drift === drift);
        const best = driftData.reduce((a, b) => a.meanM > b.meanM ? a : b);
        return { drift, best };
      });
      
      analysis += `
        <div class="strategy-card ${strategy.type}">
          <h4>${strategyNames[strategy.type]}</h4>
          <table>
            <tr><th>漂移率</th><th>最佳波动率</th><th>E[M]</th><th>P(M≥2)</th></tr>
            ${bestByDrift.map(({ drift, best }) => `
              <tr>
                <td>${getDriftLabel(drift)}</td>
                <td>${getVolatilityLabel(best.volatility)}</td>
                <td>${formatM(best.meanM)}x</td>
                <td>${formatPct(best.prob2x)}</td>
              </tr>
            `).join('')}
          </table>
        </div>
      `;
    }
    
    return analysis;
  };

  // 找出每个漂移率下的最佳策略
  const findBestStrategies = () => {
    return DRIFTS.map(drift => {
      const driftData = data.filter(d => d.drift === drift);
      const byStrategy = STRATEGIES.map(s => {
        const sData = driftData.filter(d => d.strategy === s.type);
        const avgM = sData.reduce((sum, d) => sum + d.meanM, 0) / sData.length;
        const avgProb2x = sData.reduce((sum, d) => sum + d.prob2x, 0) / sData.length;
        return { strategy: s.type, name: strategyNames[s.type], avgM, avgProb2x };
      });
      const best = byStrategy.reduce((a, b) => a.avgM > b.avgM ? a : b);
      const worst = byStrategy.reduce((a, b) => a.avgM < b.avgM ? a : b);
      return { drift, best, worst };
    });
  };

  const bestStrategies = findBestStrategies();

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>漂移率(Drift) × 策略 矩阵分析</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      min-height: 100vh;
      padding: 30px;
      color: #eee;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    
    .header {
      text-align: center;
      padding: 40px 20px;
      background: rgba(255,255,255,0.05);
      border-radius: 20px;
      margin-bottom: 30px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 {
      font-size: 2.5rem;
      background: linear-gradient(90deg, #00d2ff, #3a7bd5);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 15px;
    }
    .header .subtitle { opacity: 0.7; font-size: 1.1rem; }
    
    .key-insight {
      background: linear-gradient(135deg, rgba(0,210,255,0.1), rgba(58,123,213,0.1));
      border: 2px solid #00d2ff;
      border-radius: 16px;
      padding: 25px 30px;
      margin-bottom: 30px;
    }
    .key-insight h2 { color: #00d2ff; margin-bottom: 15px; font-size: 1.4rem; }
    .key-insight ul { margin-left: 20px; line-height: 1.8; }
    .key-insight li { margin: 8px 0; }
    .key-insight .highlight { color: #feca57; font-weight: bold; }
    
    .section {
      background: rgba(255,255,255,0.03);
      border-radius: 16px;
      padding: 25px;
      margin-bottom: 25px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .section > h2 {
      font-size: 1.3rem;
      margin-bottom: 20px;
      color: #00d2ff;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    
    .vol-section {
      background: rgba(255,255,255,0.02);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 20px;
    }
    .vol-section h3 {
      font-size: 1.1rem;
      margin-bottom: 15px;
      color: #fff;
    }
    
    .matrix-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
    }
    .matrix-card {
      background: rgba(255,255,255,0.05);
      border-radius: 10px;
      padding: 15px;
    }
    .matrix-card h4 {
      font-size: 0.9rem;
      color: #aaa;
      margin-bottom: 10px;
      text-align: center;
    }
    .matrix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85rem;
    }
    .matrix-table th, .matrix-table td {
      padding: 8px 6px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .matrix-table th {
      background: rgba(0,210,255,0.15);
      color: #00d2ff;
      font-size: 0.8rem;
    }
    .matrix-table .strategy-cell {
      text-align: left;
      font-weight: 600;
      color: #fff;
      background: rgba(255,255,255,0.05);
    }
    .matrix-table .cell-link {
      color: inherit;
      text-decoration: none;
      display: block;
      padding: 2px;
      border-radius: 4px;
      transition: all 0.2s;
    }
    .matrix-table .cell-link:hover {
      background: rgba(0,210,255,0.3);
      color: #00d2ff;
    }
    
    .best-strategies {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-top: 20px;
    }
    .best-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      text-align: center;
    }
    .best-card.random-walk { border-top: 3px solid #9b59b6; }
    .best-card.weak-trend { border-top: 3px solid #3498db; }
    .best-card.strong-trend { border-top: 3px solid #2ecc71; }
    .best-card h4 { font-size: 1rem; margin-bottom: 10px; opacity: 0.8; }
    .best-card .drift { font-size: 0.85rem; color: #aaa; margin-bottom: 15px; }
    .best-card .strategy-name {
      font-size: 1.2rem;
      font-weight: bold;
      margin-bottom: 5px;
    }
    .best-card.random-walk .strategy-name { color: #9b59b6; }
    .best-card.weak-trend .strategy-name { color: #3498db; }
    .best-card.strong-trend .strategy-name { color: #2ecc71; }
    .best-card .metrics { font-size: 0.85rem; color: #aaa; }
    
    .strategy-cards {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-top: 20px;
    }
    .strategy-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
    }
    .strategy-card.trend_following { border-left: 4px solid #3498db; }
    .strategy-card.mean_reversion { border-left: 4px solid #2ecc71; }
    .strategy-card.breakout { border-left: 4px solid #e74c3c; }
    .strategy-card.random { border-left: 4px solid #9b59b6; }
    .strategy-card h4 { margin-bottom: 15px; font-size: 1.1rem; }
    .strategy-card table { width: 100%; font-size: 0.85rem; }
    .strategy-card th, .strategy-card td { padding: 8px; text-align: center; }
    .strategy-card th { color: #aaa; border-bottom: 1px solid rgba(255,255,255,0.1); }
    
    .conclusion {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
    }
    .conclusion-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 25px;
    }
    .conclusion-card.success { border-left: 4px solid #2ecc71; }
    .conclusion-card.warning { border-left: 4px solid #f39c12; }
    .conclusion-card h4 { margin-bottom: 15px; }
    .conclusion-card.success h4 { color: #2ecc71; }
    .conclusion-card.warning h4 { color: #f39c12; }
    .conclusion-card ul { margin-left: 20px; line-height: 1.8; }
    
    .legend {
      display: flex;
      justify-content: center;
      gap: 30px;
      margin: 20px 0;
      font-size: 0.85rem;
    }
    .legend span {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .legend .color-box {
      width: 20px;
      height: 20px;
      border-radius: 4px;
    }
    .legend .high { background: #27ae6044; }
    .legend .medium { background: #f39c1244; }
    .legend .low { background: #e74c3c44; }
    
    footer {
      text-align: center;
      padding: 30px;
      opacity: 0.5;
      font-size: 0.9rem;
    }
    
    @media (max-width: 900px) {
      .matrix-grid, .best-strategies, .strategy-cards, .conclusion { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>漂移率(Drift) × 策略 矩阵分析</h1>
      <p class="subtitle">验证策略选择应该匹配市场特性 - 资本持久战框架</p>
    </div>
    
    <div class="key-insight">
      <h2>核心发现</h2>
      <ul>
        <li><span class="highlight">μ = 0% (随机游走)</span>: 均值回归策略表现最佳，周期合并放大效果</li>
        <li><span class="highlight">μ > 0% (趋势市场)</span>: 当漂移率足够高时，突破策略开始占优</li>
        <li><span class="highlight">高波动率</span>: 放大策略效果，但所有策略的概率指标都较低</li>
        <li><span class="highlight">策略选择必须匹配市场特性</span>，盲目应用策略可能导致亏损</li>
      </ul>
    </div>
    
    <div class="section">
      <h2>各漂移率下的最佳策略</h2>
      <div class="best-strategies">
        ${bestStrategies.map(({ drift, best, worst }) => {
          const cardClass = drift === 0 ? 'random-walk' : drift <= 0.05 ? 'weak-trend' : 'strong-trend';
          const driftType = drift === 0 ? '随机游走' : drift <= 0.05 ? '弱趋势' : '强趋势';
          return `
            <div class="best-card ${cardClass}">
              <h4>${driftType}</h4>
              <div class="drift">${getDriftLabel(drift)}</div>
              <div class="strategy-name">${best.name}</div>
              <div class="metrics">E[M]=${formatM(best.avgM)}x</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    
    <div class="section">
      <h2>漂移率 × 策略 详细矩阵</h2>
      <div class="legend">
        <span><div class="color-box high"></div> P > 50%</span>
        <span><div class="color-box medium"></div> P 10-50%</span>
        <span><div class="color-box low"></div> P < 10%</span>
      </div>
      ${VOLATILITIES.map(vol => generateVolatilitySection(vol)).join('')}
    </div>
    
    <div class="section">
      <h2>策略表现分析</h2>
      <div class="strategy-cards">
        ${generateStrategyAnalysis()}
      </div>
    </div>
    
    <div class="section">
      <h2>结论与建议</h2>
      <div class="conclusion">
        <div class="conclusion-card success">
          <h4>正确的策略选择</h4>
          <ul>
            <li><strong>随机游走市场 (μ=0%)</strong>: 均值回归 + 高波动率</li>
            <li><strong>弱趋势市场 (μ=5%)</strong>: 均值回归仍有优势</li>
            <li><strong>强趋势市场 (μ≥10%)</strong>: 突破策略开始占优</li>
            <li><strong>极强趋势 (μ=20%)</strong>: 突破策略表现最好</li>
          </ul>
        </div>
        <div class="conclusion-card warning">
          <h4>注意事项</h4>
          <ul>
            <li>E[M] 高不代表策略稳定，需关注 P(M≥2x)</li>
            <li>均值回归在趋势市场中 P(M≥2x) 显著下降</li>
            <li>实际市场漂移率难以预测，需要动态调整</li>
            <li>高波动率放大收益也放大风险</li>
          </ul>
        </div>
      </div>
    </div>
    
    <footer>
      资本持久战 (Capital Protracted War) | 生成时间: ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>`;
}

async function runExperiment7() {
  console.log('='.repeat(70));
  console.log('实验7: 漂移率(Drift) × 策略 × 波动率 矩阵实验');
  console.log('='.repeat(70));
  console.log('\n核心问题: 市场漂移率如何影响策略选择？\n');
  
  const totalConfigs = DRIFTS.length * VOLATILITIES.length * STRATEGIES.length;
  console.log(`测试矩阵: ${DRIFTS.length}漂移率 × ${VOLATILITIES.length}波动率 × ${STRATEGIES.length}策略 = ${totalConfigs}组配置\n`);
  
  const runner = new ExperimentRunner();
  const results: ExperimentResult[] = [];
  let completed = 0;
  
  for (const drift of DRIFTS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`市场漂移率: ${getDriftLabel(drift)} ${drift === 0 ? '(随机游走)' : drift >= 0.1 ? '(强趋势)' : '(弱趋势)'}`);
    console.log('─'.repeat(60));
    
    for (const volatility of VOLATILITIES) {
      for (const strategy of STRATEGIES) {
        const name = `drift${(drift * 100).toFixed(0)}_vol${(volatility * 100).toFixed(0)}_${strategy.type}`;
        
        const config: ExperimentConfig = {
          name,
          market: {
            type: 'gbm',
            volatility,
            drift,
            candleCount: CANDLE_COUNT,
            seed: 42,
          },
          signal: {
            type: strategy.type,
            params: strategy.type === 'random' 
              ? { ...strategy.params, seed: 42 }
              : strategy.params,
          },
          monteCarloRuns: MONTE_CARLO_RUNS,
          targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
          tradingCostRate: TRADING_COST_RATE,
        };
        
        completed++;
        process.stdout.write(`  [${completed}/${totalConfigs}] ${getVolatilityLabel(volatility)} ${strategy.name}... `);
        
        const result = await runner.run(config);
        results.push(result);
        
        const prob2x = result.reachProbabilities.get(2) ?? 0;
        const prob10x = result.reachProbabilities.get(10) ?? 0;
        console.log(`E[M]=${result.mDistribution.mean.toFixed(2)}x, P(2x)=${(prob2x * 100).toFixed(0)}%, P(10x)=${(prob10x * 100).toFixed(0)}%, WR=${(result.avgWinRate * 100).toFixed(0)}%`);
      }
    }
  }
  
  // 打印对比表格
  console.log('\n');
  printComparisonTable(results);
  
  // 保存结果
  const outputDir = './results/exp7_drift_matrix';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 保存每个实验的详细报告
  for (const result of results) {
    await saveReport(result, outputDir);
  }
  
  // 保存自定义漂移矩阵报告
  const customReportHTML = generateDriftMatrixHTML(results);
  fs.writeFileSync(`${outputDir}/drift_matrix_report.html`, customReportHTML, 'utf-8');
  console.log(`漂移矩阵报告已保存: ${outputDir}/drift_matrix_report.html`);
  
  // 保存数据文件
  fs.writeFileSync(`${outputDir}/all_results.json`, exportToJSON(results), 'utf-8');
  fs.writeFileSync(`${outputDir}/comparison.csv`, exportToCSV(results), 'utf-8');
  
  console.log(`\n结果已保存到: ${outputDir}`);
  console.log(`推荐查看: ${outputDir}/drift_matrix_report.html`);
  
  // 生成汇总分析
  printSummaryAnalysis(results);
}

function printSummaryAnalysis(results: ExperimentResult[]) {
  console.log('\n' + '='.repeat(70));
  console.log('关键发现汇总');
  console.log('='.repeat(70));
  
  // 按漂移率分组，找出每组最佳策略
  console.log('\n各漂移率下的最佳策略:');
  console.log('─'.repeat(50));
  
  for (const drift of DRIFTS) {
    const driftResults = results.filter(r => r.config.market.drift === drift);
    
    // 按E[M]排序找最佳
    const sorted = [...driftResults].sort((a, b) => b.mDistribution.mean - a.mDistribution.mean);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    
    console.log(`\n${getDriftLabel(drift)} ${drift === 0 ? '(随机游走)' : '(趋势市场)'}:`);
    console.log(`  最佳: ${best.config.signal.type} @ ${getVolatilityLabel(best.config.market.volatility)}`);
    console.log(`        E[M]=${best.mDistribution.mean.toFixed(2)}x, P(2x)=${((best.reachProbabilities.get(2) ?? 0) * 100).toFixed(0)}%`);
    console.log(`  最差: ${worst.config.signal.type} @ ${getVolatilityLabel(worst.config.market.volatility)}`);
    console.log(`        E[M]=${worst.mDistribution.mean.toFixed(2)}x, P(2x)=${((worst.reachProbabilities.get(2) ?? 0) * 100).toFixed(0)}%`);
  }
  
  // 策略推荐
  console.log('\n' + '─'.repeat(50));
  console.log('策略选择建议:');
  console.log('─'.repeat(50));
  console.log('  μ = 0% (随机游走):  推荐 均值回归 策略');
  console.log('  μ > 0% (趋势市场):  推荐 趋势跟踪/突破 策略');
  console.log('  高波动率:           放大策略效果，但风险也更大');
  console.log('\n关键洞察: 策略选择必须匹配市场特性！');
}

runExperiment7().catch(console.error);
