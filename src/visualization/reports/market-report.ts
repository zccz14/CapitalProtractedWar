/**
 * Market Report - 市场条件报告生成
 */

import type { ExperimentResult } from '../../types.js';
import { COMMON_STYLES } from '../styles.js';
import { formatNumber, sanitizeFilename } from '../utils.js';
import { generateHeatmapSVG } from '../charts/index.js';

/**
 * 生成市场条件报告 HTML
 */
export function generateMarketReportHTML(result: ExperimentResult, _baseDir: string): string {
  const { config } = result;

  const heatmap = generateHeatmapSVG(result);

  // 策略对比表
  let comparisonTable = `<table>
    <thead>
      <tr>
        <th>策略</th>
        <th>胜率</th>
        <th>交易数</th>
        <th>M_T=2</th>
        <th>M_T=4</th>
        <th>M_T=8</th>
        <th>M_T=16</th>
        <th>M_T=32</th>
        <th>详细</th>
      </tr>
    </thead>
    <tbody>`;

  for (const signal of result.signalResults) {
    const filename = `signal_${sanitizeFilename(config.name)}_${sanitizeFilename(signal.signalType)}.html`;
    comparisonTable += `<tr>
      <td><strong>${signal.signalType}</strong></td>
      <td>${(signal.avgWinRate * 100).toFixed(1)}%</td>
      <td>${signal.avgTradeCount.toFixed(0)}</td>
      <td>${formatNumber(signal.takeProfitStats.get(2)?.intervalStats.mean ?? null)}</td>
      <td>${formatNumber(signal.takeProfitStats.get(4)?.intervalStats.mean ?? null)}</td>
      <td>${formatNumber(signal.takeProfitStats.get(8)?.intervalStats.mean ?? null)}</td>
      <td>${formatNumber(signal.takeProfitStats.get(16)?.intervalStats.mean ?? null)}</td>
      <td>${formatNumber(signal.takeProfitStats.get(32)?.intervalStats.mean ?? null)}</td>
      <td><a href="${filename}" class="tag tag-blue">查看详情</a></td>
    </tr>`;
  }
  comparisonTable += '</tbody></table>';

  // 找出最佳策略
  const bestByTarget = new Map<number, { signal: string; interval: number }>();
  for (const target of config.betting.takeProfitTargets.slice(0, 5)) {
    let best = { signal: '', interval: Infinity };
    for (const signal of result.signalResults) {
      const interval = signal.takeProfitStats.get(target)?.intervalStats.mean;
      if (interval !== null && interval !== undefined && interval < best.interval) {
        best = { signal: signal.signalType, interval };
      }
    }
    if (best.signal) bestByTarget.set(target, best);
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>市场报告 - ${config.name}</title>
  ${COMMON_STYLES}
</head>
<body>
  <div class="container">
    <nav class="nav-breadcrumb">
      <a href="index.html">总结报告</a>
      <span>›</span>
      <span>${config.name}</span>
    </nav>
    
    <h1>市场条件报告</h1>
    <p class="subtitle">${config.name} | ${config.market.type.toUpperCase()} | σ=${(config.market.volatility * 100).toFixed(1)}% | μ=${((config.market.drift ?? 0) * 100).toFixed(1)}%</p>
    
    <div class="card">
      <h2>实验配置</h2>
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="value">${config.market.type.toUpperCase()}</div>
          <div class="label">市场类型</div>
        </div>
        <div class="metric-card">
          <div class="value">${(config.market.volatility * 100).toFixed(1)}%</div>
          <div class="label">波动率</div>
        </div>
        <div class="metric-card">
          <div class="value">${config.market.candleCount}</div>
          <div class="label">K线数量</div>
        </div>
        <div class="metric-card">
          <div class="value">${config.monteCarloRuns}</div>
          <div class="label">MC运行次数</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>最佳策略推荐</h2>
      <div class="grid grid-3">
        ${Array.from(bestByTarget.entries())
          .map(
            ([target, best]) => `
          <div class="metric-card">
            <div class="value" style="font-size: 20px;">${best.signal}</div>
            <div class="label">M_T=${target}x 最短间隔: ${formatNumber(best.interval)}</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    
    <div class="card">
      <h2>热力图：平均止盈间隔</h2>
      <p style="color: #666; margin-bottom: 15px;">颜色越绿表示间隔越短（止盈更快）</p>
      <div class="chart-container">${heatmap}</div>
    </div>
    
    <div class="card">
      <h2>策略对比</h2>
      ${comparisonTable}
    </div>
    
    <div class="card">
      <h2>各策略详细报告</h2>
      <div class="grid grid-2">
        ${result.signalResults
          .map((signal) => {
            const filename = `signal_${sanitizeFilename(config.name)}_${sanitizeFilename(signal.signalType)}.html`;
            return `
            <a href="${filename}" class="link-card">
              <h4>${signal.signalType}</h4>
              <p>胜率 ${(signal.avgWinRate * 100).toFixed(1)}% | M_T=2 间隔 ${formatNumber(signal.takeProfitStats.get(2)?.intervalStats.mean ?? null)}</p>
            </a>
          `;
          })
          .join('')}
      </div>
    </div>
    
    <footer>
      Sand Table | 市场报告 | ${new Date().toLocaleString('zh-CN')} | 耗时 ${result.elapsedMs}ms
    </footer>
  </div>
</body>
</html>`;
}
