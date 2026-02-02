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
  const keyTargets = config.betting.takeProfitTargets.slice(0, 6); // 前6个 M_T

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

  // 生成价格走势图和资金曲线图（使用第一个样本运行的数据）
  let priceChartHTML = '';
  let multiplierChartsHTML = '';

  if (result.sampleRuns && result.sampleRuns.length > 0) {
    const firstRun = result.sampleRuns[0];
    const sampleData = firstRun.sampleData?.get(signalType);

    if (sampleData) {
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

      // 资金曲线图（选取几个关键的 M_T）
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

      // 净值曲线图（累计盈亏）
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
    }
  }

  // 统计表格
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
    <p class="subtitle">${config.name} | σ=${(config.market.volatility * 100).toFixed(1)}% | μ=${((config.market.drift ?? 0) * 100).toFixed(1)}%</p>
    
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
      <p style="color: #666; margin-bottom: 20px;">基于 ${result.sampleRuns?.length ?? 0} 次样本运行的分布数据</p>
      <div class="grid grid-2">
        ${distributionCharts.map((chart) => `<div class="chart-container">${chart}</div>`).join('')}
      </div>
    </div>
    
    ${generateSampleLinksHTML(result, signalType, config.name)}
    
    <footer>
      资本持久战实验框架 | ${signalType} 策略详细报告 | ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>`;
}

/**
 * 生成样本详情链接 HTML
 */
export function generateSampleLinksHTML(
  result: ExperimentResult,
  signalType: string,
  marketName: string
): string {
  if (!result.sampleRuns || result.sampleRuns.length === 0) {
    return '';
  }

  // 筛选出有该信号策略样本数据的运行
  const runsWithData = result.sampleRuns.filter((run) => {
    const sampleData = run.sampleData?.get(signalType);
    return sampleData && sampleData.trades && sampleData.trades.length > 0;
  });

  if (runsWithData.length === 0) {
    return '';
  }

  const takeProfitTargets = result.config.betting.takeProfitTargets;
  const totalRuns = result.monteCarloRuns;

  // 按样本类型排序：best -> median -> worst
  const typeOrder: Record<string, number> = { best: 0, median: 1, worst: 2 };
  const sortedRuns = [...runsWithData].sort((a, b) => {
    const typeA = a.sampleMetadata?.get(signalType)?.sampleType ?? 'median';
    const typeB = b.sampleMetadata?.get(signalType)?.sampleType ?? 'median';
    return typeOrder[typeA] - typeOrder[typeB];
  });

  // 为每个样本运行生成一个卡片
  const runCards = sortedRuns
    .map((run) => {
      const meta = run.sampleMetadata?.get(signalType);
      const originalRunIndex = meta?.runIndex ?? run.runIndex;
      const sampleType = meta?.sampleType ?? 'median';
      const baselinePnL = meta?.baselinePnL ?? 0;

      const typeLabel = sampleType === 'best' ? '最佳' : sampleType === 'worst' ? '最差' : '中位';
      const typeColor =
        sampleType === 'best' ? '#27ae60' : sampleType === 'worst' ? '#e74c3c' : '#3498db';
      const pnlStr = (baselinePnL * 100).toFixed(2);
      const pnlColor = baselinePnL >= 0 ? '#27ae60' : '#e74c3c';

      const mtLinks = takeProfitTargets
        .map((mt) => {
          const sampleFilename = `sample_${sanitizeFilename(marketName)}_${sanitizeFilename(signalType)}_run${originalRunIndex + 1}_mt${mt}.html`;
          return `<a href="${sampleFilename}" class="mt-link">M_T=${mt}</a>`;
        })
        .join('');

      return `
      <div class="sample-run-card" style="border-left: 4px solid ${typeColor};">
        <h4>
          <span class="sample-type-badge" style="background: ${typeColor};">${typeLabel}</span>
          Run #${originalRunIndex + 1} | 基准PnL: <span style="color: ${pnlColor};">${pnlStr}%</span>
        </h4>
        <div class="mt-links-grid">
          ${mtLinks}
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div class="card">
      <h2>样本详情报告</h2>
      <p style="color: #666; margin-bottom: 15px;">
        从 <strong>${totalRuns}</strong> 次蒙特卡洛运行中选择 <strong>3</strong> 个代表性样本（基于基准账户 PnL 排序）。
        每个 M_T 值有独立的报告文件。
      </p>
      <style>
        .sample-run-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 15px;
          margin-bottom: 15px;
          color: white;
        }
        .sample-run-card h4 {
          margin: 0 0 10px 0;
          font-size: 16px;
        }
        .sample-type-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 4px;
          margin-right: 10px;
          font-size: 13px;
        }
        .mt-links-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .mt-link {
          display: inline-block;
          padding: 6px 12px;
          background: rgba(255,255,255,0.2);
          border-radius: 6px;
          color: white;
          text-decoration: none;
          font-size: 13px;
          transition: background 0.2s;
        }
        .mt-link:hover {
          background: rgba(255,255,255,0.4);
        }
      </style>
      ${runCards}
    </div>
  `;
}
