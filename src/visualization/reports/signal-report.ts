/**
 * Signal Report - 信号策略详细报告生成
 */

import type { ExperimentResult, AggregatedSignalResult } from '../../types.js';
import { COMMON_STYLES } from '../styles.js';
import { formatNumber, sanitizeFilename } from '../utils.js';
import {
  generateIntervalHistogramSVG,
  generatePriceChartSVG,
  generateVCChartSVG,
  generateEquityChartSVG,
} from '../charts/index.js';
import { generateSampleLinksHTML } from './signal-report-samples.js';

/**
 * 生成信号策略详细报告 HTML
 */
export function generateSignalDetailHTML(
  result: ExperimentResult,
  signalResult: AggregatedSignalResult,
  _baseDir: string
): string {
  const { config } = result;
  const signalType = signalResult.signalType;

  // 收集分布图数据
  const distributionCharts: string[] = [];
  const keyTargets = config.betting.takeProfitTargets.slice(0, 6);

  if (result.sampleRuns && result.sampleRuns.length > 0) {
    for (const target of keyTargets) {
      const intervals: number[] = [];
      for (const run of result.sampleRuns) {
        const sr = run.signalResults.find((s) => s.signalType === signalType);
        const stats = sr?.takeProfitStats.get(target);
        if (stats) {
          for (const event of stats.events) {
            intervals.push(event.intervalCandles);
          }
        }
      }
      if (intervals.length > 0) {
        distributionCharts.push(
          generateIntervalHistogramSVG(intervals, target, signalType, 380, 250)
        );
      }
    }
  }

  // 生成价格走势图和资金曲线图
  const { priceChartHTML, multiplierChartsHTML } = generateChartSections(result, signalType);

  // 统计表格
  const statsTable = generateStatsTable(signalResult);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${signalType} 策略详细报告 - ${config.name}</title>
  ${COMMON_STYLES}
</head>
<body>
  <div class="container">
    <nav class="nav-breadcrumb">
      <a href="index.html">总结报告</a>
      <span>›</span>
      <a href="market_${sanitizeFilename(config.name)}.html">市场报告</a>
      <span>›</span>
      <span>${signalType}</span>
    </nav>
    
    <h1>${signalType} 策略详细报告</h1>
    <p class="subtitle">${config.name} | ${config.description ?? config.name}</p>
    
    <div class="card">
      <h2>策略表现概览</h2>
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="value">${(signalResult.avgWinRate * 100).toFixed(1)}%</div>
          <div class="label">平均胜率</div>
        </div>
        <div class="metric-card">
          <div class="value">${signalResult.avgTradeCount.toFixed(0)}</div>
          <div class="label">平均交易数</div>
        </div>
        <div class="metric-card">
          <div class="value">${formatNumber(signalResult.takeProfitStats.get(2)?.intervalStats.mean ?? null)}</div>
          <div class="label">M_T=2x 间隔</div>
        </div>
        <div class="metric-card">
          <div class="value">${signalResult.takeProfitStats.get(2)?.avgRoundsPerRun.toFixed(2) ?? 'N/A'}</div>
          <div class="label">M_T=2x 轮数</div>
        </div>
      </div>
    </div>
    
    ${priceChartHTML}
    
    ${multiplierChartsHTML}
    
    <div class="card">
      <h2>完整统计表</h2>
      ${statsTable}
    </div>
    
    <div class="card">
      <h2>止盈间隔分布</h2>
      <p style="color: #666; margin-bottom: 20px;">${result.monteCarloRuns === 1 ? '基于单次运行的分布数据' : `基于 ${result.monteCarloRuns} 次蒙特卡洛运行的分布数据`}</p>
      <div class="grid grid-2">
        ${distributionCharts.map((chart) => `<div class="chart-container">${chart}</div>`).join('')}
      </div>
    </div>
    
    ${generateSampleLinksHTML(result, signalType, config.name)}
    
    <footer>
      Sand Table | ${signalType} 策略详细报告 | ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>`;
}

/**
 * 生成图表部分
 */
function generateChartSections(
  result: ExperimentResult,
  signalType: string
): { priceChartHTML: string; multiplierChartsHTML: string } {
  let priceChartHTML = '';
  let multiplierChartsHTML = '';

  if (!result.sampleRuns || result.sampleRuns.length === 0) {
    return { priceChartHTML, multiplierChartsHTML };
  }

  const firstRun = result.sampleRuns[0];
  const sampleData = firstRun.sampleData?.get(signalType);

  if (!sampleData) {
    return { priceChartHTML, multiplierChartsHTML };
  }

  // K线走势图
  priceChartHTML = `
    <div class="card">
      <h2>K线走势图（样本运行 #1）</h2>
      <p style="color: #666; margin-bottom: 15px;">展示第一次蒙特卡洛运行的价格序列</p>
      <div class="chart-container">
        ${generatePriceChartSVG(sampleData.prices, 900, 220, `价格走势 (${sampleData.prices.length} 根K线)`)}
      </div>
    </div>
  `;

  // 资金曲线图
  const chartTargets = [2, 4, 8, 16].filter((t) => sampleData.unrealizedPnLCurves.has(t));
  if (chartTargets.length > 0) {
    const multiplierCharts = chartTargets
      .map((target) => {
        const unrealizedPnLCurve = sampleData.unrealizedPnLCurves.get(target);
        const riskLineCurve = sampleData.riskLineCurves?.get(target);
        const vcCurve = sampleData.vcCurves?.get(target);
        const pnlCurve = sampleData.pnlCurves?.get(target);
        const tpMarkers = sampleData.takeProfitMarkers.get(target) || [];
        const slMarkers = sampleData.stopLossMarkers?.get(target) || [];
        const obsEndIdx = sampleData.observationEndIndices?.get(target);

        if (unrealizedPnLCurve && riskLineCurve && vcCurve) {
          return `<div class="chart-container">${generateVCChartSVG(
            vcCurve,
            unrealizedPnLCurve,
            riskLineCurve,
            tpMarkers,
            slMarkers,
            target,
            440,
            250,
            undefined,
            obsEndIdx,
            pnlCurve
          )}</div>`;
        }
        return '';
      })
      .filter(Boolean);

    multiplierChartsHTML = `
      <div class="card">
        <h2>投注账户曲线（样本运行 #1）</h2>
        <p style="color: #666; margin-bottom: 15px;">
          蓝色: VC (风险资金) | 绿色实线: PnL (总盈亏) | 绿色虚线: UnrealizedPnL | 红色: RiskLine<br/>
          绿点: 止盈事件 (UnrealizedPnL≥M_T) | 红叉: 止损事件 (VC≤0) | 灰色区域: 观察期
        </p>
        <div class="grid grid-2">
          ${multiplierCharts.join('')}
        </div>
      </div>
    `;
  }

  // 净值曲线图
  const equityTargets = [2, 4, 8, 16].filter((t) => sampleData.pnlCurves?.has(t));
  if (equityTargets.length > 0) {
    const equityCharts = equityTargets
      .map((target) => {
        const curve = sampleData.pnlCurves?.get(target);
        if (curve) {
          return `<div class="chart-container">${generateEquityChartSVG(
            curve,
            440,
            200,
            '累计净值曲线',
            target
          )}</div>`;
        }
        return '';
      })
      .filter(Boolean);

    if (equityCharts.length > 0) {
      multiplierChartsHTML += `
        <div class="card">
          <h2>累计净值曲线（样本运行 #1）</h2>
          <p style="color: #666; margin-bottom: 15px;">
            累计净值 = Σ (pnl × 仓位) | 初始值为0 | 包含观察期交易 | 不因止盈/止损重置<br/>
            绿色填充: 正收益区间 | 红色填充: 负收益区间 | 灰色虚线: 零线
          </p>
          <div class="grid grid-2">
            ${equityCharts.join('')}
          </div>
        </div>
      `;
    }
  }

  return { priceChartHTML, multiplierChartsHTML };
}

/**
 * 生成统计表格
 */
function generateStatsTable(signalResult: AggregatedSignalResult): string {
  let statsTable = `<table>
    <thead>
      <tr>
        <th>止盈线 M_T</th>
        <th>平均间隔</th>
        <th>中位数</th>
        <th>标准差</th>
        <th>最小值</th>
        <th>最大值</th>
        <th>轮数/运行</th>
        <th>频率</th>
      </tr>
    </thead>
    <tbody>`;

  for (const [target, stats] of signalResult.takeProfitStats) {
    const { intervalStats } = stats;
    statsTable += `<tr>
      <td><strong>${target}x</strong></td>
      <td>${formatNumber(intervalStats.mean)}</td>
      <td>${formatNumber(intervalStats.median)}</td>
      <td>${formatNumber(intervalStats.std)}</td>
      <td>${formatNumber(intervalStats.min)}</td>
      <td>${formatNumber(intervalStats.max)}</td>
      <td>${stats.avgRoundsPerRun.toFixed(2)}</td>
      <td>${(stats.avgFrequency * 1000).toFixed(4)}‰</td>
    </tr>`;
  }
  statsTable += '</tbody></table>';

  return statsTable;
}
