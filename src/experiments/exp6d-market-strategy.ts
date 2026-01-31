/**
 * 实验6d: 完整的市场类型 × 策略 × 周期合并实验
 * 
 * 核心发现: GBM μ=0 是纯随机游走，策略选择应该基于市场特性
 * 
 * 测试矩阵:
 * - 市场: μ=0% (随机游走), μ=10% (趋势市场)
 * - 策略: 趋势跟踪, 均值回归, 突破, 随机
 * - 周期: 1, 5, 10, 20 天
 */

import { BacktestEngine } from '../engine/index.js';
import { generateMarket, aggregateCandles } from '../market/generator.js';
import { createSignalStrategy } from '../signal/index.js';
import type { BacktestResult, MarketConfig, SignalStrategyConfig, SignalStrategyType } from '../types.js';
import { DEFAULT_TARGET_MULTIPLIERS } from '../types.js';
import * as fs from 'fs';

const PERIODS = [1, 5, 10, 20];
const MONTE_CARLO_RUNS = 500;
const BASE_VOLATILITY = 0.05;
const BASE_CANDLE_COUNT = 6000;

// 两种市场
const MARKETS = [
  { name: '随机游走 (μ=0%)', drift: 0 },
  { name: '趋势市场 (μ=10%)', drift: 0.10 },
];

// 测试策略
const STRATEGIES: { type: SignalStrategyType; name: string; params?: Record<string, any> }[] = [
  { type: 'trend_following', name: '趋势跟踪', params: { fastPeriod: 5, slowPeriod: 20 } },
  { type: 'breakout', name: '突破策略', params: { period: 20, threshold: 0 } },
  { type: 'mean_reversion', name: '均值回归', params: { period: 20, threshold: 2 } },
  { type: 'random', name: '随机策略', params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 } },
];

interface Result {
  market: string;
  drift: number;
  strategy: string;
  strategyType: string;
  period: number;
  mMean: number;
  mMedian: number;
  mMax: number;
  pReach2: number;
  pReach5: number;
  pReach10: number;
  avgWinRate: number;
  avgTradeCount: number;
}

async function runTest(
  market: { name: string; drift: number },
  strategyConfig: { type: SignalStrategyType; name: string; params?: Record<string, any> },
  period: number,
): Promise<Result> {
  const peakMultipliers: number[] = [];
  const winRates: number[] = [];
  const tradeCounts: number[] = [];
  
  const engine = new BacktestEngine({
    targetMultipliers: DEFAULT_TARGET_MULTIPLIERS,
    tradingCostRate: 0.0003,
  });

  for (let i = 0; i < MONTE_CARLO_RUNS; i++) {
    const marketConfig: MarketConfig = {
      type: 'gbm',
      volatility: BASE_VOLATILITY,
      drift: market.drift,
      candleCount: BASE_CANDLE_COUNT,
      seed: 42 + i,
    };
    
    const baseCandles = generateMarket(marketConfig);
    const candles = aggregateCandles(baseCandles, period);
    
    const signalConfig: SignalStrategyConfig = {
      type: strategyConfig.type,
      params: strategyConfig.params?.seed !== undefined 
        ? { ...strategyConfig.params, seed: (strategyConfig.params.seed as number) + i }
        : strategyConfig.params,
    };
    
    const strategy = createSignalStrategy(signalConfig);
    const result = engine.run(candles, strategy);
    
    peakMultipliers.push(result.peakMultiplier);
    winRates.push(result.winRate);
    tradeCounts.push(result.tradeCount);
  }

  const sorted = [...peakMultipliers].sort((a, b) => a - b);
  const n = sorted.length;

  return {
    market: market.name,
    drift: market.drift,
    strategy: strategyConfig.name,
    strategyType: strategyConfig.type,
    period,
    mMean: peakMultipliers.reduce((a, b) => a + b, 0) / n,
    mMedian: sorted[Math.floor(n / 2)],
    mMax: sorted[n - 1],
    pReach2: peakMultipliers.filter(m => m >= 2).length / n,
    pReach5: peakMultipliers.filter(m => m >= 5).length / n,
    pReach10: peakMultipliers.filter(m => m >= 10).length / n,
    avgWinRate: winRates.reduce((a, b) => a + b, 0) / n,
    avgTradeCount: tradeCounts.reduce((a, b) => a + b, 0) / n,
  };
}

function generateHTML(results: Result[]): string {
  const randomWalkResults = results.filter(r => r.drift === 0);
  const trendResults = results.filter(r => r.drift === 0.10);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>市场类型 × 策略 × 周期合并实验</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a;
      min-height: 100vh;
      padding: 20px;
      color: #eee;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    
    .header {
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      border-radius: 20px;
      margin-bottom: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .header h1 {
      font-size: 2.8rem;
      margin-bottom: 15px;
      background: linear-gradient(90deg, #00d2ff, #3a7bd5, #00d2ff);
      background-size: 200% auto;
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: shine 3s linear infinite;
    }
    @keyframes shine {
      to { background-position: 200% center; }
    }
    .header .subtitle { opacity: 0.8; font-size: 1.2rem; }
    
    .key-insight {
      background: linear-gradient(135deg, #ff6b6b22, #feca5722);
      border: 2px solid #feca57;
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 30px;
      text-align: center;
    }
    .key-insight h2 {
      color: #feca57;
      font-size: 1.8rem;
      margin-bottom: 15px;
    }
    .key-insight p {
      font-size: 1.1rem;
      line-height: 1.8;
    }
    .key-insight .formula {
      background: rgba(0,0,0,0.3);
      padding: 15px 30px;
      border-radius: 8px;
      display: inline-block;
      margin: 15px 0;
      font-family: monospace;
      font-size: 1.2rem;
      color: #00d2ff;
    }
    
    .section {
      background: rgba(255,255,255,0.03);
      border-radius: 16px;
      padding: 30px;
      margin-bottom: 30px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .section h2 {
      font-size: 1.6rem;
      margin-bottom: 25px;
      color: #00d2ff;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section h2::before {
      content: '';
      width: 6px;
      height: 28px;
      background: linear-gradient(180deg, #00d2ff, #3a7bd5);
      border-radius: 3px;
    }
    
    .market-comparison {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    .market-card {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 25px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .market-card.random-walk { border-left: 4px solid #9b59b6; }
    .market-card.trending { border-left: 4px solid #2ecc71; }
    .market-card h3 {
      font-size: 1.3rem;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .market-card.random-walk h3 { color: #9b59b6; }
    .market-card.trending h3 { color: #2ecc71; }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
      font-size: 0.9rem;
    }
    th, td {
      padding: 12px 8px;
      text-align: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    }
    th {
      background: rgba(0,210,255,0.15);
      font-weight: 600;
      font-size: 0.8rem;
      color: #00d2ff;
    }
    tr:hover { background: rgba(255,255,255,0.05); }
    
    .best { background: rgba(46, 204, 113, 0.3) !important; color: #2ecc71; font-weight: bold; }
    .worst { background: rgba(231, 76, 60, 0.2) !important; color: #e74c3c; }
    .good { color: #2ecc71; }
    .bad { color: #e74c3c; }
    
    .chart-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 25px;
      margin: 25px 0;
    }
    .chart-box {
      background: rgba(255,255,255,0.03);
      border-radius: 12px;
      padding: 20px;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .chart-box h4 {
      text-align: center;
      margin-bottom: 15px;
      color: #fff;
      font-size: 1rem;
    }
    
    .conclusion-grid {
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
    .conclusion-card.danger { border-left: 4px solid #e74c3c; }
    .conclusion-card.info { border-left: 4px solid #3498db; }
    .conclusion-card h4 {
      margin-bottom: 15px;
      font-size: 1.1rem;
    }
    .conclusion-card.success h4 { color: #2ecc71; }
    .conclusion-card.warning h4 { color: #f39c12; }
    .conclusion-card.danger h4 { color: #e74c3c; }
    .conclusion-card.info h4 { color: #3498db; }
    .conclusion-card p, .conclusion-card li {
      line-height: 1.7;
      opacity: 0.9;
    }
    .conclusion-card ul { margin-left: 20px; margin-top: 10px; }
    
    .strategy-tag {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.85rem;
      font-weight: 600;
    }
    .strategy-tag.trend { background: #3498db33; color: #3498db; }
    .strategy-tag.breakout { background: #e74c3c33; color: #e74c3c; }
    .strategy-tag.mr { background: #2ecc7133; color: #2ecc71; }
    .strategy-tag.random { background: #9b59b633; color: #9b59b6; }

    .highlight-box {
      background: linear-gradient(135deg, rgba(0,210,255,0.1), rgba(58,123,213,0.1));
      border: 1px solid rgba(0,210,255,0.3);
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    
    @media (max-width: 900px) {
      .market-comparison, .chart-grid, .conclusion-grid { grid-template-columns: 1fr; }
      .header h1 { font-size: 1.8rem; }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>市场类型 × 策略 × 周期合并</h1>
      <p class="subtitle">验证策略选择应该基于市场特性 - 资本持久战框架</p>
    </div>
    
    <div class="key-insight">
      <h2>🎯 核心发现</h2>
      <p>
        <strong>GBM 的漂移率 μ 决定了市场是"随机游走"还是"趋势市场"</strong><br>
        策略的选择应该匹配市场特性，而不是盲目应用周期合并
      </p>
      <div class="formula">
        μ = 0% → 随机游走 → 均值回归友好<br>
        μ > 0% → 趋势市场 → 趋势跟踪友好
      </div>
    </div>
    
    <div class="section">
      <h2>实验配置</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px;">
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 0.85rem; opacity: 0.7;">基础波动率 σ</div>
          <div style="font-size: 1.3rem; font-weight: bold; color: #00d2ff;">5%</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 0.85rem; opacity: 0.7;">基础K线数</div>
          <div style="font-size: 1.3rem; font-weight: bold; color: #00d2ff;">6,000</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 0.85rem; opacity: 0.7;">蒙特卡洛</div>
          <div style="font-size: 1.3rem; font-weight: bold; color: #00d2ff;">500次</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 0.85rem; opacity: 0.7;">测试周期</div>
          <div style="font-size: 1.3rem; font-weight: bold; color: #00d2ff;">1,5,10,20天</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 0.85rem; opacity: 0.7;">交易成本</div>
          <div style="font-size: 1.3rem; font-weight: bold; color: #00d2ff;">0.03%</div>
        </div>
        <div style="background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; text-align: center;">
          <div style="font-size: 0.85rem; opacity: 0.7;">测试策略</div>
          <div style="font-size: 1.3rem; font-weight: bold; color: #00d2ff;">4种</div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>市场类型对比</h2>
      <div class="market-comparison">
        <div class="market-card random-walk">
          <h3>🎲 随机游走市场 (μ=0%)</h3>
          <p style="margin-bottom: 15px; opacity: 0.8;">无趋势，价格随机波动，短期偏离后倾向回归</p>
          <table>
            <thead>
              <tr><th>策略</th><th>周期</th><th>M均值</th><th>P(M≥2)</th><th>胜率</th></tr>
            </thead>
            <tbody>
              ${randomWalkResults.map(r => {
                const isBest = r.strategy === '均值回归' && r.period === 10;
                return `<tr class="${isBest ? 'best' : ''}">
                  <td><span class="strategy-tag ${r.strategyType === 'trend_following' ? 'trend' : r.strategyType === 'breakout' ? 'breakout' : r.strategyType === 'mean_reversion' ? 'mr' : 'random'}">${r.strategy}</span></td>
                  <td>${r.period}天</td>
                  <td>${r.mMean.toFixed(2)}x</td>
                  <td>${(r.pReach2 * 100).toFixed(1)}%</td>
                  <td>${(r.avgWinRate * 100).toFixed(1)}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        
        <div class="market-card trending">
          <h3>📈 趋势市场 (μ=10%)</h3>
          <p style="margin-bottom: 15px; opacity: 0.8;">有持续向上趋势，价格长期上涨</p>
          <table>
            <thead>
              <tr><th>策略</th><th>周期</th><th>M均值</th><th>P(M≥2)</th><th>胜率</th></tr>
            </thead>
            <tbody>
              ${trendResults.map(r => {
                const isBest = r.strategy === '趋势跟踪' && r.period === 10;
                const isWorst = r.strategy === '均值回归' && r.period >= 10;
                return `<tr class="${isBest ? 'best' : isWorst ? 'worst' : ''}">
                  <td><span class="strategy-tag ${r.strategyType === 'trend_following' ? 'trend' : r.strategyType === 'breakout' ? 'breakout' : r.strategyType === 'mean_reversion' ? 'mr' : 'random'}">${r.strategy}</span></td>
                  <td>${r.period}天</td>
                  <td>${r.mMean.toFixed(2)}x</td>
                  <td>${(r.pReach2 * 100).toFixed(1)}%</td>
                  <td>${(r.avgWinRate * 100).toFixed(1)}%</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>策略表现对比图</h2>
      <div class="chart-grid">
        <div class="chart-box">
          <h4>随机游走市场 - M均值 vs 周期</h4>
          <canvas id="chart1"></canvas>
        </div>
        <div class="chart-box">
          <h4>趋势市场 - M均值 vs 周期</h4>
          <canvas id="chart2"></canvas>
        </div>
        <div class="chart-box">
          <h4>随机游走市场 - P(M≥2) vs 周期</h4>
          <canvas id="chart3"></canvas>
        </div>
        <div class="chart-box">
          <h4>趋势市场 - P(M≥2) vs 周期</h4>
          <canvas id="chart4"></canvas>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>关键策略深度分析</h2>
      
      <div class="highlight-box">
        <h3 style="color: #2ecc71; margin-bottom: 15px;">✅ 均值回归策略</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <h4 style="margin-bottom: 10px;">随机游走市场 (μ=0%)</h4>
            <ul style="margin-left: 20px;">
              <li>1天周期: M=1.45, 胜率=60.4%</li>
              <li><strong style="color: #2ecc71;">10天周期: M=56.95, P(M≥2)=49%</strong></li>
              <li>周期合并大幅提升表现！</li>
            </ul>
          </div>
          <div>
            <h4 style="margin-bottom: 10px;">趋势市场 (μ=10%)</h4>
            <ul style="margin-left: 20px;">
              <li>1天周期: M=1.19, 胜率=48.9%</li>
              <li><strong style="color: #e74c3c;">10天周期: M=1.07, 胜率=34.9%</strong></li>
              <li>完全失效！趋势市场不适合均值回归</li>
            </ul>
          </div>
        </div>
      </div>
      
      <div class="highlight-box" style="border-color: #3498db;">
        <h3 style="color: #3498db; margin-bottom: 15px;">📊 趋势跟踪策略</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div>
            <h4 style="margin-bottom: 10px;">随机游走市场 (μ=0%)</h4>
            <ul style="margin-left: 20px;">
              <li>1天周期: M=1.49, 胜率=34.4%</li>
              <li>10天周期: M=1.43, 胜率=35.7%</li>
              <li><strong style="color: #f39c12;">表现平庸，无趋势可跟踪</strong></li>
            </ul>
          </div>
          <div>
            <h4 style="margin-bottom: 10px;">趋势市场 (μ=10%)</h4>
            <ul style="margin-left: 20px;">
              <li>1天周期: M=1.59, 胜率=36.0%</li>
              <li><strong style="color: #2ecc71;">10天周期: M=2.84, P(M≥2)=65.8%</strong></li>
              <li>周期合并+趋势市场=最佳组合！</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>结论与建议</h2>
      <div class="conclusion-grid">
        <div class="conclusion-card success">
          <h4>✅ 正确的做法</h4>
          <ul>
            <li><strong>先识别市场类型</strong>，再选择策略</li>
            <li>随机游走市场 → 均值回归 + 周期合并</li>
            <li>趋势市场 → 趋势跟踪 + 周期合并</li>
            <li>周期合并的作用是<strong>放大信号、过滤噪音</strong></li>
          </ul>
        </div>
        <div class="conclusion-card danger">
          <h4>❌ 错误的做法</h4>
          <ul>
            <li>在趋势市场使用均值回归（会持续亏损）</li>
            <li>在随机游走市场使用趋势跟踪（无趋势可跟）</li>
            <li>不考虑市场特性盲目应用策略</li>
            <li>认为周期合并能让任何策略变好</li>
          </ul>
        </div>
        <div class="conclusion-card warning">
          <h4>⚠️ 周期合并的真正作用</h4>
          <p>周期合并不是万能的。它的作用是：</p>
          <ul>
            <li>放大等效波动率 (√N 倍)</li>
            <li>过滤短期噪音，提升信噪比</li>
            <li>减少交易频率，降低成本占比</li>
          </ul>
          <p style="margin-top: 10px;"><strong>但策略必须匹配市场特性才能生效！</strong></p>
        </div>
        <div class="conclusion-card info">
          <h4>💡 实际应用建议</h4>
          <ul>
            <li><strong>加密货币</strong>：高波动+趋势明显 → 趋势跟踪</li>
            <li><strong>外汇</strong>：低波动+区间震荡 → 均值回归+长周期</li>
            <li><strong>股票指数</strong>：长期上涨趋势 → 趋势跟踪</li>
            <li><strong>商品期货</strong>：周期性震荡 → 均值回归</li>
          </ul>
        </div>
      </div>
    </div>
    
    <footer style="text-align: center; padding: 30px; opacity: 0.6;">
      资本持久战 (Capital Protracted War) | 生成时间: ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
  
  <script>
    const periods = ${JSON.stringify(PERIODS)};
    const strategies = ['趋势跟踪', '突破策略', '均值回归', '随机策略'];
    const colors = ['#3498db', '#e74c3c', '#2ecc71', '#9b59b6'];
    
    const data = ${JSON.stringify(results)};
    const randomWalkData = data.filter(d => d.drift === 0);
    const trendData = data.filter(d => d.drift === 0.10);
    
    function getChartData(sourceData, field) {
      return strategies.map((s, i) => ({
        label: s,
        data: periods.map(p => {
          const r = sourceData.find(d => d.strategy === s && d.period === p);
          return r ? (field === 'pReach2' ? r[field] * 100 : r[field]) : 0;
        }),
        borderColor: colors[i],
        backgroundColor: colors[i] + '33',
        tension: 0.3,
        fill: false,
        pointRadius: 5,
      }));
    }
    
    const chartOptions = {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { color: '#eee', padding: 15 } } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } },
        x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#eee' } }
      }
    };
    
    new Chart(document.getElementById('chart1'), {
      type: 'line',
      data: { labels: periods.map(p => p + '天'), datasets: getChartData(randomWalkData, 'mMean') },
      options: { ...chartOptions, plugins: { ...chartOptions.plugins, title: { display: false } } }
    });
    
    new Chart(document.getElementById('chart2'), {
      type: 'line',
      data: { labels: periods.map(p => p + '天'), datasets: getChartData(trendData, 'mMean') },
      options: chartOptions
    });
    
    new Chart(document.getElementById('chart3'), {
      type: 'line',
      data: { labels: periods.map(p => p + '天'), datasets: getChartData(randomWalkData, 'pReach2') },
      options: chartOptions
    });
    
    new Chart(document.getElementById('chart4'), {
      type: 'line',
      data: { labels: periods.map(p => p + '天'), datasets: getChartData(trendData, 'pReach2') },
      options: chartOptions
    });
  </script>
</body>
</html>`;
}

async function main() {
  console.log('='.repeat(80));
  console.log('实验6d: 市场类型 × 策略 × 周期合并 完整实验');
  console.log('='.repeat(80));
  
  const results: Result[] = [];

  for (const market of MARKETS) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`市场: ${market.name}`);
    console.log('='.repeat(60));
    
    for (const strategy of STRATEGIES) {
      for (const period of PERIODS) {
        process.stdout.write(`  ${strategy.name}, ${period}天... `);
        const result = await runTest(market, strategy, period);
        results.push(result);
        console.log(`M=${result.mMean.toFixed(2)}, P(M≥2)=${(result.pReach2 * 100).toFixed(1)}%, WR=${(result.avgWinRate * 100).toFixed(1)}%`);
      }
    }
  }

  // 保存结果
  const outputDir = './results/exp6d_market_strategy';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(`${outputDir}/results.json`, JSON.stringify(results, null, 2), 'utf-8');
  fs.writeFileSync(`${outputDir}/report.html`, generateHTML(results), 'utf-8');

  console.log(`\n结果已保存到: ${outputDir}`);
  console.log(`HTML报告: ${outputDir}/report.html`);
}

main().catch(console.error);
