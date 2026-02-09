/**
 * Index Report - 顶层总结报告生成
 */

import type { ExperimentResult } from '../../types.js';
import { COMMON_STYLES } from '../styles.js';
import { formatNumber, sanitizeFilename } from '../utils.js';
import type { LightExperimentResult } from '../types.js';

/**
 * 报告套件配置（用于生成 index.html）
 */
export interface ReportSuiteForIndex {
  results: LightExperimentResult[] | ExperimentResult[];
}

/**
 * 生成顶层总结报告 HTML
 */
export function generateIndexHTML(suite: ReportSuiteForIndex): string {
  const { results } = suite;

  // 汇总统计
  const totalRuns = results.reduce((sum, r) => sum + r.monteCarloRuns, 0);
  const totalSignals = new Set(results.flatMap((r) => r.signalResults.map((s) => s.signalType)))
    .size;
  const totalMarkets = results.length;

  // 全局最佳策略
  const globalBest = new Map<number, { market: string; signal: string; interval: number }>();
  const targets = [2, 4, 8, 16, 32];

  for (const target of targets) {
    let best = { market: '', signal: '', interval: Infinity };
    for (const result of results) {
      for (const signal of result.signalResults) {
        const interval = signal.takeProfitStats.get(target)?.intervalStats.mean;
        if (interval !== null && interval !== undefined && interval < best.interval) {
          best = { market: result.config.name, signal: signal.signalType, interval };
        }
      }
    }
    if (best.market) globalBest.set(target, best);
  }

  // 收集所有 metadata keys（用于表头）
  const metadataKeys = new Set<string>();
  for (const result of results) {
    if (result.config.metadata) {
      for (const key of Object.keys(result.config.metadata)) {
        metadataKeys.add(key);
      }
    }
  }
  const metadataKeysArray = Array.from(metadataKeys);

  // 市场条件列表
  const marketCards = results
    .map((result) => {
      const filename = `market_${sanitizeFilename(result.config.name)}.html`;
      const bestSignal = result.signalResults.reduce((best, curr) => {
        const bestInt = best.takeProfitStats.get(2)?.intervalStats.mean ?? Infinity;
        const currInt = curr.takeProfitStats.get(2)?.intervalStats.mean ?? Infinity;
        return currInt < bestInt ? curr : best;
      });

      const subtitle = result.config.description ?? result.config.name;

      return `
      <a href="${filename}" class="link-card">
        <h4>${result.config.name}</h4>
        <p>${subtitle}</p>
        <p style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
          最佳: ${bestSignal.signalType} (M_T=2 间隔 ${formatNumber(bestSignal.takeProfitStats.get(2)?.intervalStats.mean ?? null)})
        </p>
      </a>
    `;
    })
    .join('');

  // 综合矩阵表格
  let matrixTable = `<table>
    <thead>
      <tr>
        <th>市场条件</th>
        ${metadataKeysArray.map((k) => `<th>${k}</th>`).join('')}
        ${results[0]?.signalResults.map((s) => `<th>${s.signalType}<br/><small>M_T=2 间隔</small></th>`).join('') ?? ''}
      </tr>
    </thead>
    <tbody>`;

  for (const result of results) {
    const filename = `market_${sanitizeFilename(result.config.name)}.html`;
    matrixTable += `<tr>
      <td><a href="${filename}">${result.config.name}</a></td>
      ${metadataKeysArray.map((k) => `<td>${result.config.metadata?.[k] ?? '-'}</td>`).join('')}
      ${result.signalResults
        .map((s) => {
          const interval = s.takeProfitStats.get(2)?.intervalStats.mean;
          return `<td>${formatNumber(interval ?? null)}</td>`;
        })
        .join('')}
    </tr>`;
  }
  matrixTable += '</tbody></table>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sand Table 实验报告 - 总结</title>
  ${COMMON_STYLES}
  <style>
    .hero {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 40px;
      border-radius: 16px;
      margin-bottom: 30px;
      text-align: center;
    }
    .hero h1 { color: white; font-size: 32px; margin-bottom: 15px; }
    .hero p { opacity: 0.9; font-size: 16px; max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <h1>Sand Table 实验报告</h1>
      <p>新范式：关注止盈事件的时间间隔，而非概率或期望值</p>
    </div>
    
    <div class="card">
      <h2>实验总览</h2>
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="value">${totalMarkets}</div>
          <div class="label">市场条件</div>
        </div>
        <div class="metric-card">
          <div class="value">${totalSignals}</div>
          <div class="label">信号策略</div>
        </div>
        <div class="metric-card">
          <div class="value">${totalRuns}</div>
          <div class="label">总MC运行</div>
        </div>
        <div class="metric-card">
          <div class="value">-</div>
          <div class="label">总耗时</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>全局最佳策略</h2>
      <p style="color: #666; margin-bottom: 20px;">在所有市场条件下，达到各止盈目标最快的策略</p>
      <div class="grid grid-3">
        ${Array.from(globalBest.entries())
          .map(
            ([target, best]) => `
          <div class="metric-card">
            <div class="value" style="font-size: 18px; color: #27ae60;">${best.signal}</div>
            <div class="label">M_T=${target}x 最佳 | ${best.market}</div>
            <div class="label">间隔: ${formatNumber(best.interval)} K线</div>
          </div>
        `
          )
          .join('')}
      </div>
    </div>
    
    <div class="card">
      <h2>市场条件报告</h2>
      <p style="color: #666; margin-bottom: 20px;">点击卡片查看各市场条件下的详细分析</p>
      <div class="grid grid-2">
        ${marketCards}
      </div>
    </div>
    
    <div class="card">
      <h2>综合对比矩阵</h2>
      <p style="color: #666; margin-bottom: 15px;">M_T=2x 止盈的平均间隔对比 (K线数)</p>
      ${matrixTable}
    </div>
    
    <div class="card">
      <h2>投资者指南</h2>
      <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
        <h4 style="margin-bottom: 15px;">如何使用此报告</h4>
        <ul style="margin-left: 20px; line-height: 2;">
          <li><strong>选择市场条件</strong>：根据您交易的资产波动率选择对应的市场报告</li>
          <li><strong>比较策略</strong>：在市场报告中查看各信号策略的止盈间隔对比</li>
          <li><strong>选择止盈线</strong>：较低的 M_T 间隔更短但收益更少，较高的 M_T 收益更多但需等待更久</li>
          <li><strong>深入分析</strong>：点击策略详情查看完整的统计分布和历史数据</li>
        </ul>
      </div>
    </div>
    
    <footer>
      Sand Table (新范式 v2) | 总结报告 | ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>`;
}
