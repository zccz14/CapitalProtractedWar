/**
 * Sample Report - 样本级别详细报告生成
 */

import type { SampleRunData } from '../../types.js';
import { COMMON_STYLES } from '../styles.js';
import { sanitizeFilename } from '../utils.js';
import { generateEquityChartSVG, generateVCChartSVG } from '../charts/index.js';
import { generatePriceSignalChartSVG } from './sample-charts.js';
import {
  generateTradesTable,
  generateBaselineTable,
  generateAccountSnapshotsTable,
  generateCandleDataTable,
} from './sample-tables.js';
import { SAMPLE_REPORT_STYLES, SAMPLE_REPORT_SCRIPT } from './sample-styles.js';
import { extractOverviewData, generateOverviewHTML } from './sample-overview.js';

/**
 * 生成样本级别详细报告 HTML
 */
export function generateSampleDetailHTML(
  sampleData: SampleRunData,
  signalType: string,
  marketName: string,
  runIndex: number,
  config: { name: string; description?: string; candleCount: number },
  _baseDir: string = '',
  targetMT: number = 2
): string {
  const {
    prices,
    candles,
    signals,
    trades,
    baselineSnapshots,
    baselineEquityCurve,
    accountSnapshots,
    vcCurves,
    takeProfitMarkers,
    stopLossMarkers,
    riskLineCurves,
    observationEndIndices,
    pnlCurves,
    unrealizedPnLCurves,
  } = sampleData;

  // 提取概览数据
  const overviewData = extractOverviewData(sampleData, targetMT);
  const overviewHTML = generateOverviewHTML(
    overviewData,
    { candleCount: config.candleCount },
    targetMT
  );

  // 图表
  const priceSignalChartSVG = generatePriceSignalChartSVG(
    prices,
    signals ?? [],
    trades ?? [],
    900,
    280
  );
  const baselineEquityChartSVG = baselineEquityCurve
    ? generateEquityChartSVG(baselineEquityCurve, 900, 200, '基准账户净值曲线 (仓位=1)')
    : '';

  // 投注账户曲线图
  const pnlCurve = pnlCurves?.get(targetMT);
  const unrealizedPnLCurve = unrealizedPnLCurves?.get(targetMT);
  const vcCurve = vcCurves?.get(targetMT);
  const riskCurve = riskLineCurves?.get(targetMT);
  const tpMarkers = takeProfitMarkers?.get(targetMT) ?? [];
  const slMarkers = stopLossMarkers?.get(targetMT) ?? [];
  const obsEndIdx = observationEndIndices?.get(targetMT) ?? 0;

  const multiplierChartSVG =
    unrealizedPnLCurve && vcCurve && riskCurve
      ? generateVCChartSVG(
          vcCurve,
          unrealizedPnLCurve,
          riskCurve,
          tpMarkers,
          slMarkers,
          targetMT,
          900,
          280,
          `投注账户曲线 M_T=${targetMT}`,
          obsEndIdx,
          pnlCurve
        )
      : '';

  // 表格
  const tradesTable = generateTradesTable(trades ?? []);
  const baselineTable = generateBaselineTable(baselineSnapshots ?? []);
  const accountSnapshotsForTarget = accountSnapshots?.get(targetMT) ?? [];
  const accountTable = generateAccountSnapshotsTable(accountSnapshotsForTarget, targetMT);
  const candleDataTable = generateCandleDataTable(candles ?? [], signals ?? [], trades ?? []);

  const totalTrades = trades?.length ?? 0;

  const subtitle = config.description ?? config.name;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>样本详情 - ${signalType} - Run #${runIndex + 1} - M_T=${targetMT}</title>
  ${COMMON_STYLES}
  ${SAMPLE_REPORT_STYLES}
</head>
<body>
  <div class="container">
    <nav class="nav-breadcrumb">
      <a href="index.html">总结报告</a>
      <span>›</span>
      <a href="market_${sanitizeFilename(marketName)}.html">市场报告</a>
      <span>›</span>
      <a href="signal_${sanitizeFilename(marketName)}_${sanitizeFilename(signalType)}.html">${signalType}</a>
      <span>›</span>
      <span>样本 #${runIndex + 1} | M_T=${targetMT}</span>
    </nav>
    
    <h1>样本级别详细报告 (M_T=${targetMT})</h1>
    <p class="subtitle">
      ${signalType} | ${marketName} | Run #${runIndex + 1} | M_T=${targetMT} |
      ${subtitle}
    </p>
    
    ${overviewHTML}
    
    <div class="card">
      <h2>价格与信号图</h2>
      <p style="color: #666; margin-bottom: 15px;">蓝线: 价格 | 绿色箭头↑: 做多开仓 | 红色箭头↓: 做空开仓 | ×: 平仓</p>
      <div class="chart-container">${priceSignalChartSVG}</div>
    </div>
    
    ${baselineEquityChartSVG ? `<div class="card"><h2>基准账户净值曲线</h2><p style="color: #666; margin-bottom: 15px;">基准账户特点: 固定仓位=1 | 连续运行，不止盈/止损 | 用于计算 C 值</p><div class="chart-container">${baselineEquityChartSVG}</div></div>` : ''}
    
    ${multiplierChartSVG ? `<div class="card"><h2>反马丁账户资金曲线</h2><p style="color: #666; margin-bottom: 15px;">绿色曲线: 资金倍率 | 绿色虚线: 止盈线 | 红色实线: 风控线 | 绿点: 止盈 | 红叉: 止损 | 灰色区域: 观察期</p><div class="chart-container">${multiplierChartSVG}</div></div>` : ''}
    
    <div class="card">
      <h2>交易记录 (${totalTrades} 笔)</h2>
      <p style="color: #666; margin-bottom: 10px;">成交价格: 下一K线开盘价 | 绿色行: 盈利 | 红色行: 亏损</p>
      <div class="scrollable-table">${tradesTable}</div>
    </div>
    
    ${baselineSnapshots && baselineSnapshots.length > 0 ? `<div class="card"><h2>基准账户快照 (${baselineSnapshots.length} 条)</h2><p style="color: #666; margin-bottom: 10px;">显示每笔交易后基准账户的状态变化</p><div class="scrollable-table">${baselineTable}</div></div>` : ''}
    
    ${accountSnapshotsForTarget.length > 0 ? `<div class="card"><h2>反马丁账户快照 M_T=${targetMT}x (${accountSnapshotsForTarget.length} 条)</h2><p style="color: #666; margin-bottom: 10px;">显示每笔交易后账户的状态变化 | 灰色行: 观察期</p><div class="scrollable-table">${accountTable}</div></div>` : ''}
    
    <div class="card">
      <div class="collapsible" onclick="toggleContent('candleData')"><h2 style="display: inline;">K线级别数据（点击展开）</h2></div>
      <div id="candleData" class="content"><p style="color: #666; margin: 15px 0;">显示前100根K线的详细数据</p><div class="scrollable-table">${candleDataTable}</div></div>
    </div>
    
    <footer>Sand Table | 样本详情报告 | ${new Date().toLocaleString('zh-CN')}</footer>
  </div>
  ${SAMPLE_REPORT_SCRIPT}
</body>
</html>`;
}
