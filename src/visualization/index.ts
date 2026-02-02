/**
 * Visualization Module - 可视化模块（新范式）
 * 
 * 多层级报告系统：
 * 1. 总结报告 (index.html) - 实验总览，带链接导航到详细报告
 * 2. 市场报告 (market_xxx.html) - 特定市场条件下的信号策略对比
 * 3. 策略报告 (signal_xxx.html) - 特定信号策略的详细分析
 * 4. 详细报告 (detail_xxx.html) - 市场×信号×M_T 的完整分析
 */

import type { ExperimentResult, AggregatedSignalResult, SignalEvaluationResult, SampleRunData } from '../types.js';
import { calculateHistogram } from '../analysis/index.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 通用样式和工具
// ============================================

const COMMON_STYLES = `
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    background: #f5f5f5;
    color: #333;
    line-height: 1.6;
    padding: 20px;
  }
  .container { max-width: 1400px; margin: 0 auto; }
  h1 { text-align: center; margin-bottom: 10px; color: #2c3e50; font-size: 28px; }
  h2 { margin: 30px 0 15px; color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
  h3 { margin: 20px 0 10px; color: #2c3e50; }
  .subtitle { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
  
  .card {
    background: white;
    border-radius: 12px;
    padding: 24px;
    margin-bottom: 24px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  }
  
  .nav-breadcrumb {
    background: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    margin-bottom: 20px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .nav-breadcrumb a { color: #3498db; text-decoration: none; }
  .nav-breadcrumb a:hover { text-decoration: underline; }
  .nav-breadcrumb span { color: #7f8c8d; margin: 0 8px; }
  
  .grid { display: grid; gap: 20px; }
  .grid-2 { grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); }
  .grid-3 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }
  .grid-4 { grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 15px 0;
    font-size: 14px;
  }
  th, td {
    padding: 12px;
    text-align: center;
    border-bottom: 1px solid #eee;
  }
  th { background: #3498db; color: white; font-weight: 600; }
  tr:hover { background: #f8f9fa; }
  
  .link-card {
    display: block;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 12px;
    text-decoration: none;
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .link-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.4);
  }
  .link-card h4 { font-size: 18px; margin-bottom: 8px; }
  .link-card p { opacity: 0.9; font-size: 14px; }
  
  .metric-card {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }
  .metric-card .value { font-size: 28px; font-weight: bold; color: #2c3e50; }
  .metric-card .label { font-size: 12px; color: #7f8c8d; margin-top: 4px; }
  
  .chart-container { text-align: center; margin: 20px 0; overflow-x: auto; }
  
  .tag {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }
  .tag-green { background: #d4edda; color: #155724; }
  .tag-blue { background: #cce5ff; color: #004085; }
  .tag-yellow { background: #fff3cd; color: #856404; }
  .tag-red { background: #f8d7da; color: #721c24; }
  
  footer {
    text-align: center;
    color: #7f8c8d;
    margin-top: 40px;
    padding: 20px;
    border-top: 1px solid #eee;
  }
</style>
`;

function formatNumber(value: number | null, decimals: number = 0): string {
  if (value === null) return 'N/A';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toFixed(decimals);
}

function getHeatmapColor(value: number, min: number, max: number): string {
  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const hue = (1 - normalized) * 120;
  return `hsl(${hue}, 70%, 50%)`;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ============================================
// SVG 图表生成
// ============================================

function generateIntervalHistogramSVG(
  intervals: number[],
  targetMultiplier: number,
  signalType: string,
  width: number = 600,
  height: number = 300
): string {
  if (intervals.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width/2}" y="40" text-anchor="middle" fill="#999" font-size="14">M_T=${targetMultiplier}x 无止盈事件数据</text>
    </svg>`;
  }

  const padding = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const { binEdges, counts } = calculateHistogram(intervals, 25);
  const maxCount = Math.max(...counts);
  
  const barWidth = chartWidth / counts.length;
  const bars = counts.map((count, i) => {
    const x = padding.left + i * barWidth;
    const barHeight = maxCount > 0 ? (count / maxCount) * chartHeight : 0;
    const y = padding.top + chartHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${Math.max(barWidth - 1, 1)}" height="${barHeight}" fill="#4a90d9" opacity="0.85"/>`;
  }).join('\n');
  
  const xTicks = [0, 0.5, 1].map(p => {
    const index = Math.floor(p * (binEdges.length - 1));
    const value = binEdges[index];
    const x = padding.left + p * chartWidth;
    return `<text x="${x}" y="${height - 15}" text-anchor="middle" font-size="11" fill="#666">${formatNumber(value)}</text>`;
  }).join('\n');
  
  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  
  const meanX = padding.left + ((mean - binEdges[0]) / (binEdges[binEdges.length-1] - binEdges[0] || 1)) * chartWidth;
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="barGrad${targetMultiplier}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#5dade2;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#2e86de;stop-opacity:1" />
    </linearGradient>
  </defs>
  <style>text { font-family: -apple-system, sans-serif; }</style>
  
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#2c3e50">
    ${signalType} | M_T=${targetMultiplier}x
  </text>
  <text x="${width / 2}" y="34" text-anchor="middle" font-size="10" fill="#7f8c8d">
    均值=${formatNumber(mean)} | 中位数=${formatNumber(median)} | 样本=${intervals.length}
  </text>
  
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#ddd" stroke-width="1"/>
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#ddd" stroke-width="1"/>
  
  ${bars}
  ${xTicks}
  
  <line x1="${meanX}" y1="${padding.top}" x2="${meanX}" y2="${height - padding.bottom}" stroke="#e74c3c" stroke-width="2" stroke-dasharray="4,4"/>
  <text x="${meanX}" y="${padding.top - 5}" text-anchor="middle" font-size="9" fill="#e74c3c">均值</text>
</svg>`;
}

function generateHeatmapSVG(result: ExperimentResult): string {
  const targets = result.config.betting.takeProfitTargets;
  const signals = result.signalResults;
  
  const cellWidth = 70;
  const cellHeight = 36;
  const labelWidth = 140;
  const labelHeight = 40;
  
  const width = labelWidth + targets.length * cellWidth + 60;
  const height = labelHeight + signals.length * cellHeight + 80;
  
  const allValues: number[] = [];
  for (const signal of signals) {
    for (const [_, stats] of signal.takeProfitStats) {
      if (stats.intervalStats.mean !== null) {
        allValues.push(stats.intervalStats.mean);
      }
    }
  }
  
  if (allValues.length === 0) {
    return `<svg width="${width}" height="100">
      <text x="${width/2}" y="50" text-anchor="middle" fill="#999">无有效数据</text>
    </svg>`;
  }
  
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  
  const cells: string[] = [];
  signals.forEach((signal, si) => {
    targets.forEach((target, ti) => {
      const stats = signal.takeProfitStats.get(target);
      const value = stats?.intervalStats.mean;
      const x = labelWidth + ti * cellWidth;
      const y = labelHeight + si * cellHeight;
      
      if (value !== null && value !== undefined) {
        const color = getHeatmapColor(value, minVal, maxVal);
        cells.push(`
          <rect x="${x}" y="${y}" width="${cellWidth - 2}" height="${cellHeight - 2}" fill="${color}" rx="4"/>
          <text x="${x + cellWidth/2}" y="${y + cellHeight/2 + 4}" text-anchor="middle" font-size="11" fill="white" font-weight="500">${formatNumber(value)}</text>
        `);
      } else {
        cells.push(`
          <rect x="${x}" y="${y}" width="${cellWidth - 2}" height="${cellHeight - 2}" fill="#e9ecef" rx="4"/>
          <text x="${x + cellWidth/2}" y="${y + cellHeight/2 + 4}" text-anchor="middle" font-size="11" fill="#adb5bd">-</text>
        `);
      }
    });
  });
  
  const rowLabels = signals.map((signal, i) => {
    const y = labelHeight + i * cellHeight + cellHeight / 2 + 4;
    return `<text x="${labelWidth - 10}" y="${y}" text-anchor="end" font-size="12" fill="#495057">${signal.signalType}</text>`;
  }).join('\n');
  
  const colLabels = targets.map((target, i) => {
    const x = labelWidth + i * cellWidth + cellWidth / 2;
    return `<text x="${x}" y="${labelHeight - 10}" text-anchor="middle" font-size="10" fill="#495057">${target}x</text>`;
  }).join('\n');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: -apple-system, sans-serif; }</style>
  
  <text x="${width / 2}" y="22" text-anchor="middle" font-size="15" font-weight="600" fill="#2c3e50">
    平均止盈间隔热力图 (K线数)
  </text>
  
  ${colLabels}
  ${rowLabels}
  ${cells.join('\n')}
  
  <defs>
    <linearGradient id="heatmapGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:hsl(120,70%,50%)" />
      <stop offset="100%" style="stop-color:hsl(0,70%,50%)" />
    </linearGradient>
  </defs>
  <rect x="${labelWidth}" y="${height - 35}" width="180" height="12" fill="url(#heatmapGrad)" rx="3"/>
  <text x="${labelWidth}" y="${height - 8}" font-size="9" fill="#666">快 (${formatNumber(minVal)})</text>
  <text x="${labelWidth + 180}" y="${height - 8}" text-anchor="end" font-size="9" fill="#666">慢 (${formatNumber(maxVal)})</text>
</svg>`;
}

// ============================================
// 净值曲线图 SVG（累计盈亏）
// ============================================

/**
 * 生成净值曲线图 SVG
 * 
 * 特点：
 * - 初始值为 0（累计盈亏）
 * - y=0 基线用灰色虚线标记
 * - 正值区域绿色填充，负值区域红色填充
 * - 曲线颜色根据最终值正负变化
 */
function generateEquityChartSVG(
  equities: number[],
  width: number = 800,
  height: number = 200,
  title: string = '净值曲线',
  targetMultiplier?: number
): string {
  if (equities.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width/2}" y="40" text-anchor="middle" fill="#999" font-size="14">无净值数据</text>
    </svg>`;
  }

  const padding = { top: 35, right: 40, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 降采样以提高性能（最多1000个点）
  const sampleRate = Math.max(1, Math.floor(equities.length / 1000));
  const sampledEquities = equities.filter((_, i) => i % sampleRate === 0);
  
  const minE = Math.min(0, ...sampledEquities);
  const maxE = Math.max(0, ...sampledEquities);
  const eRange = maxE - minE || 1;
  
  // 计算 y=0 的位置
  const zeroY = padding.top + chartHeight - ((0 - minE) / eRange) * chartHeight;
  
  // 生成路径点
  const points = sampledEquities.map((e, i) => {
    const x = padding.left + (i / (sampledEquities.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((e - minE) / eRange) * chartHeight;
    return { x, y, equity: e };
  });
  
  // 主曲线路径
  const pathD = `M ${points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;
  
  // 创建正值区域和负值区域的填充路径
  // 使用剪切路径来分别填充正负区域
  const fillPathD = `${pathD} L ${width - padding.right},${zeroY} L ${padding.left},${zeroY} Z`;
  
  // 最终值决定曲线颜色
  const finalEquity = equities[equities.length - 1] ?? 0;
  const curveColor = finalEquity >= 0 ? '#27ae60' : '#e74c3c';
  
  // Y轴刻度
  const yValues = [minE, 0, maxE].filter((v, i, arr) => arr.indexOf(v) === i);
  const yTicks = yValues.map(val => {
    const y = padding.top + chartHeight - ((val - minE) / eRange) * chartHeight;
    const isZero = val === 0;
    return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="${isZero ? '#666' : '#ccc'}" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="${isZero ? '#666' : '#999'}">${val.toFixed(2)}</text>
    `;
  }).join('');
  
  const displayTitle = title + (targetMultiplier ? ` (M_T=${targetMultiplier}x)` : '');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: -apple-system, sans-serif; }</style>
  <defs>
    <!-- 正值区域渐变（绿色） -->
    <linearGradient id="equityPosGrad${targetMultiplier ?? 0}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#27ae60;stop-opacity:0.4" />
      <stop offset="100%" style="stop-color:#27ae60;stop-opacity:0.05" />
    </linearGradient>
    <!-- 负值区域渐变（红色） -->
    <linearGradient id="equityNegGrad${targetMultiplier ?? 0}" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" style="stop-color:#e74c3c;stop-opacity:0.4" />
      <stop offset="100%" style="stop-color:#e74c3c;stop-opacity:0.05" />
    </linearGradient>
    <!-- 剪切路径：仅显示零线以上 -->
    <clipPath id="clipAboveZero${targetMultiplier ?? 0}">
      <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${zeroY - padding.top}"/>
    </clipPath>
    <!-- 剪切路径：仅显示零线以下 -->
    <clipPath id="clipBelowZero${targetMultiplier ?? 0}">
      <rect x="${padding.left}" y="${zeroY}" width="${chartWidth}" height="${height - padding.bottom - zeroY}"/>
    </clipPath>
  </defs>
  
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#2c3e50">${displayTitle}</text>
  <text x="${width / 2}" y="30" text-anchor="middle" font-size="9" fill="#7f8c8d">最终净值: ${finalEquity.toFixed(4)}</text>
  
  <!-- 网格线 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  
  ${yTicks}
  
  <!-- y=0 基线（灰色虚线） -->
  <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" 
        stroke="#888" stroke-width="1" stroke-dasharray="4,2"/>
  
  <!-- 正值区域填充（绿色） -->
  <g clip-path="url(#clipAboveZero${targetMultiplier ?? 0})">
    <path d="${fillPathD}" fill="url(#equityPosGrad${targetMultiplier ?? 0})"/>
  </g>
  
  <!-- 负值区域填充（红色） -->
  <g clip-path="url(#clipBelowZero${targetMultiplier ?? 0})">
    <path d="${fillPathD}" fill="url(#equityNegGrad${targetMultiplier ?? 0})"/>
  </g>
  
  <!-- 净值曲线 -->
  <path d="${pathD}" fill="none" stroke="${curveColor}" stroke-width="1.5"/>
  
  <!-- X轴标签 -->
  <text x="${padding.left}" y="${height - 8}" font-size="9" fill="#666">0</text>
  <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" font-size="9" fill="#666">${equities.length}</text>
</svg>`;
}

// ============================================
// K线走势图 SVG
// ============================================

function generatePriceChartSVG(
  prices: number[],
  width: number = 800,
  height: number = 200,
  title: string = 'K线走势'
): string {
  if (prices.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width/2}" y="40" text-anchor="middle" fill="#999" font-size="14">无价格数据</text>
    </svg>`;
  }

  const padding = { top: 30, right: 40, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 降采样以提高性能（最多1000个点）
  const sampleRate = Math.max(1, Math.floor(prices.length / 1000));
  const sampledPrices = prices.filter((_, i) => i % sampleRate === 0);
  
  const minPrice = Math.min(...sampledPrices);
  const maxPrice = Math.max(...sampledPrices);
  const priceRange = maxPrice - minPrice || 1;
  
  // 生成路径
  const points = sampledPrices.map((price, i) => {
    const x = padding.left + (i / (sampledPrices.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  
  // Y轴刻度
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const price = minPrice + p * priceRange;
    const y = padding.top + chartHeight - p * chartHeight;
    return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${price.toFixed(1)}</text>
    `;
  }).join('');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: -apple-system, sans-serif; }</style>
  <defs>
    <linearGradient id="priceGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3498db;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#3498db;stop-opacity:0.05" />
    </linearGradient>
  </defs>
  
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#2c3e50">${title}</text>
  
  <!-- 网格线 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  
  ${yTicks}
  
  <!-- 填充区域 -->
  <path d="${pathD} L ${width - padding.right},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z" fill="url(#priceGrad)"/>
  
  <!-- 价格线 -->
  <path d="${pathD}" fill="none" stroke="#3498db" stroke-width="1.5"/>
  
  <!-- X轴标签 -->
  <text x="${padding.left}" y="${height - 8}" font-size="9" fill="#666">0</text>
  <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" font-size="9" fill="#666">${prices.length}</text>
</svg>`;
}

// ============================================
// 风险资金 VC 曲线图 SVG（新风控框架）
// ============================================

function generateVCChartSVG(
  vcCurve: number[],
  unrealizedPnLCurve: number[],
  riskLineCurve: number[],
  takeProfitMarkers: number[],
  stopLossMarkers: number[],
  targetMultiplier: number,
  width: number = 800,
  height: number = 250,
  title?: string,
  observationEndIndex?: number,
  pnlCurve?: number[]
): string {
  if (vcCurve.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width/2}" y="40" text-anchor="middle" fill="#999" font-size="14">无数据</text>
    </svg>`;
  }

  const padding = { top: 35, right: 50, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 降采样以提高性能（最多1000个点）
  const sampleRate = Math.max(1, Math.floor(vcCurve.length / 1000));
  const sampledVC = vcCurve.filter((_, i) => i % sampleRate === 0);
  const sampledUnrealizedPnL = unrealizedPnLCurve.filter((_, i) => i % sampleRate === 0);
  const sampledRiskLine = riskLineCurve.filter((_, i) => i % sampleRate === 0);
  const sampledPnL = pnlCurve?.filter((_, i) => i % sampleRate === 0);
  
  // 计算 Y 轴范围（包含 UnrealizedPnL、RiskLine、VC、PnL、止盈线）
  const allValues = [...sampledVC, ...sampledUnrealizedPnL, ...sampledRiskLine, ...(sampledPnL ?? []), targetMultiplier, 0];
  const minY = Math.min(...allValues);
  const maxY = Math.max(...allValues);
  const yRange = maxY - minY || 1;
  
  // 坐标转换函数
  const toX = (i: number) => padding.left + (i / (sampledVC.length - 1)) * chartWidth;
  const toY = (v: number) => padding.top + chartHeight - ((v - minY) / yRange) * chartHeight;
  
  // 生成 VC 曲线路径（蓝色）
  const vcPoints = sampledVC.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const vcPathD = `M ${vcPoints.join(' L ')}`;
  
  // 生成 UnrealizedPnL 曲线路径（绿色虚线）
  const unrealizedPnLPoints = sampledUnrealizedPnL.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const unrealizedPnLPathD = `M ${unrealizedPnLPoints.join(' L ')}`;
  
  // 生成 PnL 曲线路径（绿色实线）
  let pnlPathD = '';
  if (sampledPnL && sampledPnL.length > 0) {
    const pnlPoints = sampledPnL.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
    pnlPathD = `M ${pnlPoints.join(' L ')}`;
  }
  
  // 生成 RiskLine 曲线路径（红色）
  const riskLinePoints = sampledRiskLine.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`);
  const riskLinePathD = `M ${riskLinePoints.join(' L ')}`;
  
  // 止盈线位置
  const targetY = toY(targetMultiplier);
  
  // 零线位置
  const zeroY = toY(0);
  
  // 止盈标记点（绿色圆点）
  const tpMarkersSVG = takeProfitMarkers
    .filter(idx => idx < vcCurve.length)
    .map(idx => {
      const sampledIdx = Math.floor(idx / sampleRate);
      const x = toX(sampledIdx);
      const vc = sampledVC[sampledIdx] ?? 0;
      const y = toY(vc);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#27ae60" stroke="white" stroke-width="1.5"/>`;
    }).join('\n');
  
  // 止损标记点（红色叉号）
  const slMarkersSVG = stopLossMarkers
    .filter(idx => idx < vcCurve.length)
    .map(idx => {
      const sampledIdx = Math.floor(idx / sampleRate);
      const x = toX(sampledIdx);
      const vc = sampledVC[sampledIdx] ?? 0;
      const y = toY(vc);
      const size = 5;
      return `
        <line x1="${x - size}" y1="${y - size}" x2="${x + size}" y2="${y + size}" stroke="#e74c3c" stroke-width="2.5"/>
        <line x1="${x - size}" y1="${y + size}" x2="${x + size}" y2="${y - size}" stroke="#e74c3c" stroke-width="2.5"/>
      `;
    }).join('\n');
  
  // 观察期区域（灰色半透明）
  let observationArea = '';
  if (observationEndIndex && observationEndIndex > 0) {
    const obsEndX = toX(Math.floor(observationEndIndex / sampleRate));
    observationArea = `
      <rect x="${padding.left}" y="${padding.top}" 
            width="${obsEndX - padding.left}" height="${chartHeight}" 
            fill="rgba(128, 128, 128, 0.15)"/>
      <text x="${(padding.left + obsEndX) / 2}" y="${padding.top + 15}" 
            text-anchor="middle" font-size="10" fill="#888">观察期</text>
    `;
  }
  
  // Y轴刻度
  const yTickValues = [minY, 0, targetMultiplier / 2, targetMultiplier, maxY].filter(v => v >= minY && v <= maxY);
  const uniqueYTicks = [...new Set(yTickValues.map(v => v.toFixed(2)))].map(s => parseFloat(s));
  const yTicks = uniqueYTicks.map(val => {
    const y = toY(val);
    return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="9" fill="#666">${val.toFixed(2)}</text>
    `;
  }).join('');
  
  const displayTitle = title || `风险资金 VC 曲线 M_T=${targetMultiplier}`;
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: -apple-system, sans-serif; }</style>
  <defs>
    <linearGradient id="vcGrad${targetMultiplier}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3498db;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#3498db;stop-opacity:0.05" />
    </linearGradient>
  </defs>
  
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#2c3e50">${displayTitle}</text>
  <text x="${width / 2}" y="30" text-anchor="middle" font-size="9" fill="#7f8c8d">止盈: ${takeProfitMarkers.length} | 止损: ${stopLossMarkers.length}</text>
  
  <!-- 坐标轴 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#ddd" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#ddd" stroke-width="1"/>
  
  ${yTicks}
  
  <!-- 观察期区域 -->
  ${observationArea}
  
  <!-- 零线（灰色虚线） -->
  <line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}" 
        stroke="#999" stroke-width="1" stroke-dasharray="4,4"/>
  
  <!-- 止盈线（绿色虚线） -->
  <line x1="${padding.left}" y1="${targetY}" x2="${width - padding.right}" y2="${targetY}" 
        stroke="#27ae60" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="${width - padding.right + 5}" y="${targetY + 4}" font-size="9" fill="#27ae60">M_T=${targetMultiplier}</text>
  
  <!-- RiskLine 曲线（红色） -->
  <path d="${riskLinePathD}" fill="none" stroke="#e74c3c" stroke-width="1.5"/>
  
  <!-- UnrealizedPnL 曲线（浅绿色虚线） -->
  <path d="${unrealizedPnLPathD}" fill="none" stroke="#2ecc71" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>
  
  <!-- PnL 曲线（绿色实线） -->
  ${pnlPathD ? `<path d="${pnlPathD}" fill="none" stroke="#27ae60" stroke-width="2"/>` : ''}
  
  <!-- VC 填充区域 -->
  <path d="${vcPathD} L ${width - padding.right},${zeroY} L ${padding.left},${zeroY} Z" fill="url(#vcGrad${targetMultiplier})"/>
  
  <!-- VC 曲线（蓝色） -->
  <path d="${vcPathD}" fill="none" stroke="#3498db" stroke-width="2"/>
  
  <!-- 止盈标记 -->
  ${tpMarkersSVG}
  
  <!-- 止损标记 -->
  ${slMarkersSVG}
  
  <!-- X轴标签 -->
  <text x="${padding.left}" y="${height - 8}" font-size="9" fill="#666">0</text>
  <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" font-size="9" fill="#666">${vcCurve.length}</text>
  
  <!-- 图例 -->
  <g transform="translate(${padding.left + 10}, ${padding.top + 10})">
    <line x1="0" y1="0" x2="20" y2="0" stroke="#3498db" stroke-width="2"/>
    <text x="25" y="4" font-size="9" fill="#666">VC</text>
    
    <line x1="55" y1="0" x2="75" y2="0" stroke="#27ae60" stroke-width="2"/>
    <text x="80" y="4" font-size="9" fill="#666">PnL</text>
    
    <line x1="115" y1="0" x2="135" y2="0" stroke="#2ecc71" stroke-width="1.5" stroke-dasharray="3,2" opacity="0.7"/>
    <text x="140" y="4" font-size="9" fill="#666">UnrealizedPnL</text>
    
    <line x1="220" y1="0" x2="240" y2="0" stroke="#e74c3c" stroke-width="1.5"/>
    <text x="245" y="4" font-size="9" fill="#666">RiskLine</text>
  </g>
</svg>`;
}

// ============================================
// 资金曲线图 SVG（含风控线）- 旧版保留
// ============================================

function generateMultiplierChartSVG(
  multipliers: number[],
  takeProfitMarkers: number[],
  targetMultiplier: number,
  width: number = 800,
  height: number = 200,
  title?: string,
  riskLine?: number[],
  stopLossMarkers?: number[],
  observationEndIndex?: number
): string {
  if (multipliers.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width/2}" y="40" text-anchor="middle" fill="#999" font-size="14">无资金数据</text>
    </svg>`;
  }

  const padding = { top: 35, right: 40, bottom: 30, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 降采样以提高性能（最多1000个点）
  const sampleRate = Math.max(1, Math.floor(multipliers.length / 1000));
  const sampledMultipliers = multipliers.filter((_, i) => i % sampleRate === 0);
  const sampledRiskLine = riskLine?.filter((_, i) => i % sampleRate === 0);
  
  const minM = Math.min(0, ...sampledMultipliers, ...(sampledRiskLine ?? []));
  const maxM = Math.max(...sampledMultipliers, targetMultiplier * 1.1);
  const mRange = maxM - minM || 1;
  
  // 生成资金曲线路径
  const points = sampledMultipliers.map((m, i) => {
    const x = padding.left + (i / (sampledMultipliers.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((m - minM) / mRange) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pathD = `M ${points.join(' L ')}`;
  
  // 生成风控线路径（红色实线）
  let riskLinePathD = '';
  if (sampledRiskLine && sampledRiskLine.length > 0) {
    const riskPoints = sampledRiskLine.map((m, i) => {
      const x = padding.left + (i / (sampledRiskLine.length - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((Math.max(0, m) - minM) / mRange) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    riskLinePathD = `M ${riskPoints.join(' L ')}`;
  }
  
  // 止盈线位置
  const targetY = padding.top + chartHeight - ((targetMultiplier - minM) / mRange) * chartHeight;
  
  // 止盈标记点（绿色圆点）
  const tpMarkers = takeProfitMarkers
    .filter(idx => idx < multipliers.length)
    .map(idx => {
      const sampledIdx = Math.floor(idx / sampleRate);
      const x = padding.left + (sampledIdx / (sampledMultipliers.length - 1)) * chartWidth;
      return `<circle cx="${x.toFixed(1)}" cy="${targetY.toFixed(1)}" r="4" fill="#27ae60" stroke="white" stroke-width="1"/>`;
    }).join('\n');
  
  // 止损标记点（红色叉号）
  let slMarkers = '';
  if (stopLossMarkers && stopLossMarkers.length > 0) {
    slMarkers = stopLossMarkers
      .filter(idx => idx < multipliers.length)
      .map(idx => {
        const sampledIdx = Math.floor(idx / sampleRate);
        const x = padding.left + (sampledIdx / (sampledMultipliers.length - 1)) * chartWidth;
        const m = multipliers[idx] ?? 1;
        const y = padding.top + chartHeight - ((m - minM) / mRange) * chartHeight;
        // 红色叉号
        const size = 4;
        return `
          <line x1="${x - size}" y1="${y - size}" x2="${x + size}" y2="${y + size}" stroke="#e74c3c" stroke-width="2"/>
          <line x1="${x - size}" y1="${y + size}" x2="${x + size}" y2="${y - size}" stroke="#e74c3c" stroke-width="2"/>
        `;
      }).join('\n');
  }
  
  // 观察期区域（灰色半透明）
  let observationArea = '';
  if (observationEndIndex && observationEndIndex > 0) {
    const obsEndX = padding.left + (Math.floor(observationEndIndex / sampleRate) / (sampledMultipliers.length - 1)) * chartWidth;
    observationArea = `
      <rect x="${padding.left}" y="${padding.top}" 
            width="${obsEndX - padding.left}" height="${chartHeight}" 
            fill="rgba(128, 128, 128, 0.15)"/>
      <text x="${(padding.left + obsEndX) / 2}" y="${padding.top + 12}" 
            text-anchor="middle" font-size="9" fill="#888">观察期</text>
    `;
  }
  
  // Y轴刻度
  const yValues = [minM < 0 ? minM : 0, 1, targetMultiplier / 2, targetMultiplier, maxM].filter(v => v >= minM && v <= maxM);
  const yTicks = [...new Set(yValues)].map(val => {
    const y = padding.top + chartHeight - ((val - minM) / mRange) * chartHeight;
    return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${val.toFixed(1)}x</text>
    `;
  }).join('');
  
  const displayTitle = title || `资金曲线 M_T=${targetMultiplier}x`;
  const slCount = stopLossMarkers?.length ?? 0;
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: -apple-system, sans-serif; }</style>
  <defs>
    <linearGradient id="multGrad${targetMultiplier}" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#27ae60;stop-opacity:0.3" />
      <stop offset="100%" style="stop-color:#27ae60;stop-opacity:0.05" />
    </linearGradient>
  </defs>
  
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600" fill="#2c3e50">${displayTitle}</text>
  <text x="${width / 2}" y="30" text-anchor="middle" font-size="9" fill="#7f8c8d">止盈: ${takeProfitMarkers.length} | 止损: ${slCount}</text>
  
  <!-- 网格线 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  
  ${yTicks}
  
  <!-- 观察期区域 -->
  ${observationArea}
  
  <!-- 止盈线（绿色虚线） -->
  <line x1="${padding.left}" y1="${targetY}" x2="${width - padding.right}" y2="${targetY}" 
        stroke="#27ae60" stroke-width="1.5" stroke-dasharray="6,3"/>
  <text x="${width - padding.right + 5}" y="${targetY + 4}" font-size="9" fill="#27ae60">${targetMultiplier}x</text>
  
  <!-- 风控线（红色实线） -->
  ${riskLinePathD ? `<path d="${riskLinePathD}" fill="none" stroke="#e74c3c" stroke-width="1.5"/>` : ''}
  
  <!-- 填充区域 -->
  <path d="${pathD} L ${width - padding.right},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z" fill="url(#multGrad${targetMultiplier})"/>
  
  <!-- 资金曲线 -->
  <path d="${pathD}" fill="none" stroke="#27ae60" stroke-width="1.5"/>
  
  <!-- 止盈标记 -->
  ${tpMarkers}
  
  <!-- 止损标记 -->
  ${slMarkers}
  
  <!-- X轴标签 -->
  <text x="${padding.left}" y="${height - 8}" font-size="9" fill="#666">0</text>
  <text x="${width - padding.right}" y="${height - 8}" text-anchor="end" font-size="9" fill="#666">${multipliers.length}</text>
</svg>`;
}

// ============================================
// 底层详细报告 - 单个信号策略
// ============================================

function generateSignalDetailHTML(
  result: ExperimentResult,
  signalResult: AggregatedSignalResult,
  baseDir: string
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
        const sr = run.signalResults.find(s => s.signalType === signalType);
        const stats = sr?.takeProfitStats.get(target);
        if (stats) {
          for (const event of stats.events) {
            intervals.push(event.intervalCandles);
          }
        }
      }
      if (intervals.length > 0) {
        distributionCharts.push(generateIntervalHistogramSVG(intervals, target, signalType, 380, 250));
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
      const chartTargets = [2, 4, 8, 16].filter(t => sampleData.unrealizedPnLCurves.has(t));
      if (chartTargets.length > 0) {
        const multiplierCharts = chartTargets.map(target => {
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
        }).filter(Boolean);
        
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
      const equityTargets = [2, 4, 8, 16].filter(t => sampleData.pnlCurves?.has(t));
      if (equityTargets.length > 0) {
        const equityCharts = equityTargets.map(target => {
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
        }).filter(Boolean);
        
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
        ${distributionCharts.map(chart => `<div class="chart-container">${chart}</div>`).join('')}
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
function generateSampleLinksHTML(
  result: ExperimentResult,
  signalType: string,
  marketName: string
): string {
  if (!result.sampleRuns || result.sampleRuns.length === 0) {
    return '';
  }
  
  // 检查是否有完整的样本数据
  const hasTradeData = result.sampleRuns[0].sampleData?.get(signalType)?.trades;
  if (!hasTradeData) {
    return '';
  }
  
  const links = result.sampleRuns.slice(0, 3).map((run, i) => {
    const sampleFilename = `sample_${sanitizeFilename(marketName)}_${sanitizeFilename(signalType)}_run${i + 1}.html`;
    return `
      <a href="${sampleFilename}" class="link-card" style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);">
        <h4>样本运行 #${i + 1}</h4>
        <p>查看完整交易记录和账户状态变化</p>
      </a>
    `;
  }).join('');
  
  return `
    <div class="card">
      <h2>样本详情报告</h2>
      <p style="color: #666; margin-bottom: 15px;">
        查看样本级别的详细数据，包含完整交易记录、账户状态变化、K线数据等
      </p>
      <div class="grid grid-3">
        ${links}
      </div>
    </div>
  `;
}

// ============================================
// 中层报告 - 市场条件下的策略对比
// ============================================

function generateMarketReportHTML(result: ExperimentResult, baseDir: string): string {
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
        ${Array.from(bestByTarget.entries()).map(([target, best]) => `
          <div class="metric-card">
            <div class="value" style="font-size: 20px;">${best.signal}</div>
            <div class="label">M_T=${target}x 最短间隔: ${formatNumber(best.interval)}</div>
          </div>
        `).join('')}
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
        ${result.signalResults.map(signal => {
          const filename = `signal_${sanitizeFilename(config.name)}_${sanitizeFilename(signal.signalType)}.html`;
          return `
            <a href="${filename}" class="link-card">
              <h4>${signal.signalType}</h4>
              <p>胜率 ${(signal.avgWinRate * 100).toFixed(1)}% | M_T=2 间隔 ${formatNumber(signal.takeProfitStats.get(2)?.intervalStats.mean ?? null)}</p>
            </a>
          `;
        }).join('')}
      </div>
    </div>
    
    <footer>
      资本持久战实验框架 | 市场报告 | ${new Date().toLocaleString('zh-CN')} | 耗时 ${result.elapsedMs}ms
    </footer>
  </div>
</body>
</html>`;
}

// ============================================
// 顶层总结报告
// ============================================

export interface ReportSuite {
  results: ExperimentResult[];
  outputDir: string;
}

function generateIndexHTML(suite: ReportSuite): string {
  const { results, outputDir } = suite;
  
  // 汇总统计
  const totalRuns = results.reduce((sum, r) => sum + r.monteCarloRuns, 0);
  const totalSignals = new Set(results.flatMap(r => r.signalResults.map(s => s.signalType))).size;
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
  
  // 市场条件列表
  const marketCards = results.map(result => {
    const filename = `market_${sanitizeFilename(result.config.name)}.html`;
    const bestSignal = result.signalResults.reduce((best, curr) => {
      const bestInt = best.takeProfitStats.get(2)?.intervalStats.mean ?? Infinity;
      const currInt = curr.takeProfitStats.get(2)?.intervalStats.mean ?? Infinity;
      return currInt < bestInt ? curr : best;
    });
    
    return `
      <a href="${filename}" class="link-card">
        <h4>${result.config.name}</h4>
        <p>σ=${(result.config.market.volatility * 100).toFixed(1)}% | μ=${((result.config.market.drift ?? 0) * 100).toFixed(1)}%</p>
        <p style="margin-top: 8px; font-size: 12px; opacity: 0.8;">
          最佳: ${bestSignal.signalType} (M_T=2 间隔 ${formatNumber(bestSignal.takeProfitStats.get(2)?.intervalStats.mean ?? null)})
        </p>
      </a>
    `;
  }).join('');
  
  // 综合矩阵表格
  let matrixTable = `<table>
    <thead>
      <tr>
        <th>市场条件</th>
        <th>波动率</th>
        <th>漂移率</th>
        ${results[0]?.signalResults.map(s => `<th>${s.signalType}<br/><small>M_T=2 间隔</small></th>`).join('') ?? ''}
      </tr>
    </thead>
    <tbody>`;
  
  for (const result of results) {
    const filename = `market_${sanitizeFilename(result.config.name)}.html`;
    matrixTable += `<tr>
      <td><a href="${filename}">${result.config.name}</a></td>
      <td>${(result.config.market.volatility * 100).toFixed(1)}%</td>
      <td>${((result.config.market.drift ?? 0) * 100).toFixed(1)}%</td>
      ${result.signalResults.map(s => {
        const interval = s.takeProfitStats.get(2)?.intervalStats.mean;
        return `<td>${formatNumber(interval ?? null)}</td>`;
      }).join('')}
    </tr>`;
  }
  matrixTable += '</tbody></table>';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>资本持久战实验报告 - 总结</title>
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
      <h1>资本持久战实验报告</h1>
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
          <div class="value">${results.reduce((sum, r) => sum + r.elapsedMs, 0)}ms</div>
          <div class="label">总耗时</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>全局最佳策略</h2>
      <p style="color: #666; margin-bottom: 20px;">在所有市场条件下，达到各止盈目标最快的策略</p>
      <div class="grid grid-3">
        ${Array.from(globalBest.entries()).map(([target, best]) => `
          <div class="metric-card">
            <div class="value" style="font-size: 18px; color: #27ae60;">${best.signal}</div>
            <div class="label">M_T=${target}x 最佳 | ${best.market}</div>
            <div class="label">间隔: ${formatNumber(best.interval)} K线</div>
          </div>
        `).join('')}
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
      资本持久战实验框架 (新范式 v2) | 总结报告 | ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>`;
}

// ============================================
// 保存报告套件
// ============================================

export async function saveReportSuite(suite: ReportSuite): Promise<string> {
  const { results, outputDir } = suite;
  
  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // 1. 生成并保存总结报告
  const indexPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(indexPath, generateIndexHTML(suite), 'utf-8');
  console.log(`已生成: ${indexPath}`);
  
  // 2. 为每个实验结果生成市场报告和策略详细报告
  for (const result of results) {
    const marketFilename = `market_${sanitizeFilename(result.config.name)}.html`;
    const marketPath = path.join(outputDir, marketFilename);
    fs.writeFileSync(marketPath, generateMarketReportHTML(result, outputDir), 'utf-8');
    console.log(`已生成: ${marketPath}`);
    
    // 3. 为每个信号策略生成详细报告
    for (const signalResult of result.signalResults) {
      const signalFilename = `signal_${sanitizeFilename(result.config.name)}_${sanitizeFilename(signalResult.signalType)}.html`;
      const signalPath = path.join(outputDir, signalFilename);
      fs.writeFileSync(signalPath, generateSignalDetailHTML(result, signalResult, outputDir), 'utf-8');
      console.log(`已生成: ${signalPath}`);
      
      // 4. 生成样本详情页面（为前3个样本运行生成）
      if (result.sampleRuns && result.sampleRuns.length > 0) {
        for (let runIndex = 0; runIndex < Math.min(3, result.sampleRuns.length); runIndex++) {
          const run = result.sampleRuns[runIndex];
          const sampleData = run.sampleData?.get(signalResult.signalType);
          
          // 只为有完整样本数据的运行生成报告
          if (sampleData && sampleData.trades && sampleData.trades.length > 0) {
            const sampleFilename = `sample_${sanitizeFilename(result.config.name)}_${sanitizeFilename(signalResult.signalType)}_run${runIndex + 1}.html`;
            const samplePath = path.join(outputDir, sampleFilename);
            
            const sampleHTML = generateSampleDetailHTML(
              sampleData,
              signalResult.signalType,
              result.config.name,
              runIndex,
              {
                volatility: result.config.market.volatility,
                drift: result.config.market.drift,
                candleCount: result.config.market.candleCount,
              },
              outputDir
            );
            
            fs.writeFileSync(samplePath, sampleHTML, 'utf-8');
            console.log(`已生成: ${samplePath}`);
          }
        }
      }
    }
    
    // 5. 保存 JSON 数据
    const { exportToJSON } = await import('../analysis/index.js');
    const jsonPath = path.join(outputDir, `${sanitizeFilename(result.config.name)}_data.json`);
    fs.writeFileSync(jsonPath, exportToJSON(result), 'utf-8');
  }
  
  return indexPath;
}

// ============================================
// 单个结果的简化保存（向后兼容）
// ============================================

export function generateHTMLReport(result: ExperimentResult): string {
  return generateMarketReportHTML(result, '');
}

export async function saveReport(
  result: ExperimentResult,
  outputDir: string
): Promise<void> {
  const suite: ReportSuite = {
    results: [result],
    outputDir,
  };
  await saveReportSuite(suite);
}

export async function saveComparisonReport(
  results: ExperimentResult[],
  outputDir: string
): Promise<string> {
  const suite: ReportSuite = {
    results,
    outputDir,
  };
  return await saveReportSuite(suite);
}

// ============================================
// 样本级别详细报告
// ============================================

import type { TradeRecord, BaselineSnapshot, AccountSnapshot } from '../types.js';

/**
 * 生成样本级别详细报告 HTML
 * 
 * 用于审查交易系统的正确性，包含：
 * 1. 运行概览卡片
 * 2. 价格与信号图（标记开平仓点）
 * 3. 基准净值曲线
 * 4. 资金曲线图（含风控线）
 * 5. 交易记录表（完整列表）
 * 6. 账户状态变化表
 * 7. K线级别数据表（分页，支持下载CSV）
 */
export function generateSampleDetailHTML(
  sampleData: SampleRunData,
  signalType: string,
  marketName: string,
  runIndex: number,
  config: {
    volatility: number;
    drift?: number;
    candleCount: number;
  },
  baseDir: string = ''
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
  
  // ============================================
  // 1. 运行概览
  // ============================================
  const totalTrades = trades?.length ?? 0;
  const winTrades = trades?.filter(t => t.isWin).length ?? 0;
  const winRate = totalTrades > 0 ? (winTrades / totalTrades * 100).toFixed(1) : 'N/A';
  const avgHoldingPeriod = totalTrades > 0 
    ? (trades!.reduce((sum, t) => sum + t.holdingPeriod, 0) / totalTrades).toFixed(1) 
    : 'N/A';
  const totalPnl = trades?.reduce((sum, t) => sum + t.pnlPercent, 0) ?? 0;
  const finalBaselineEquity = baselineEquityCurve?.[baselineEquityCurve.length - 1] ?? 0;
  const finalLearnedC = baselineSnapshots?.[baselineSnapshots.length - 1]?.estimatedC ?? 0;
  
  // ============================================
  // 2. 价格与信号图（带开平仓标记）
  // ============================================
  const priceSignalChartSVG = generatePriceSignalChartSVG(
    prices,
    signals ?? [],
    trades ?? [],
    900,
    280
  );
  
  // ============================================
  // 3. 基准净值曲线图
  // ============================================
  const baselineEquityChartSVG = baselineEquityCurve 
    ? generateEquityChartSVG(baselineEquityCurve, 900, 200, '基准账户净值曲线 (仓位=1)') 
    : '';
  
  // ============================================
  // 4. 投注账户曲线图（选择 M_T=2 作为示例）
  // ============================================
  const targetForChart = 2;
  const pnlCurve = pnlCurves?.get(targetForChart);
  const unrealizedPnLCurve = unrealizedPnLCurves?.get(targetForChart);
  const vcCurve = vcCurves?.get(targetForChart);
  const riskCurve = riskLineCurves?.get(targetForChart);
  const tpMarkers = takeProfitMarkers?.get(targetForChart) ?? [];
  const slMarkers = stopLossMarkers?.get(targetForChart) ?? [];
  const obsEndIdx = observationEndIndices?.get(targetForChart) ?? 0;
  
  const multiplierChartSVG = (unrealizedPnLCurve && vcCurve && riskCurve)
    ? generateVCChartSVG(
        vcCurve,
        unrealizedPnLCurve,
        riskCurve,
        tpMarkers,
        slMarkers,
        targetForChart,
        900,
        280,
        `投注账户曲线 M_T=${targetForChart}`,
        obsEndIdx,
        pnlCurve
      )
    : '';
  
  // ============================================
  // 5. 交易记录表
  // ============================================
  const tradesTable = generateTradesTable(trades ?? []);
  
  // ============================================
  // 6. 基准账户快照表
  // ============================================
  const baselineTable = generateBaselineTable(baselineSnapshots ?? []);
  
  // ============================================
  // 7. 账户状态变化表（选择 M_T=2）
  // ============================================
  const accountSnapshotsForTarget = accountSnapshots?.get(targetForChart) ?? [];
  const accountTable = generateAccountSnapshotsTable(accountSnapshotsForTarget, targetForChart);
  
  // ============================================
  // 8. K线数据表（前100条，支持CSV下载）
  // ============================================
  const candleDataTable = generateCandleDataTable(candles ?? [], signals ?? [], trades ?? []);
  
  // ============================================
  // 生成 HTML
  // ============================================
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>样本详情 - ${signalType} - Run #${runIndex + 1}</title>
  ${COMMON_STYLES}
  <style>
    .scrollable-table {
      max-height: 500px;
      overflow-y: auto;
      margin: 15px 0;
    }
    .scrollable-table table {
      margin: 0;
    }
    .scrollable-table thead th {
      position: sticky;
      top: 0;
      z-index: 10;
      background: #3498db;
    }
    .trade-win { background: rgba(39, 174, 96, 0.1); }
    .trade-loss { background: rgba(231, 76, 60, 0.1); }
    .observing { background: rgba(128, 128, 128, 0.15); }
    .event-tp { color: #27ae60; font-weight: bold; }
    .event-sl { color: #e74c3c; font-weight: bold; }
    .event-obs { color: #888; }
    .csv-download {
      display: inline-block;
      padding: 8px 16px;
      background: #3498db;
      color: white;
      border-radius: 6px;
      text-decoration: none;
      font-size: 14px;
      margin: 10px 0;
    }
    .csv-download:hover { background: #2980b9; }
    .collapsible {
      cursor: pointer;
      padding: 10px;
      background: #f8f9fa;
      border-radius: 8px;
      margin-top: 15px;
    }
    .collapsible:hover { background: #e9ecef; }
    .content { display: none; }
    .content.active { display: block; }
    .signal-long { color: #27ae60; font-weight: bold; }
    .signal-short { color: #e74c3c; font-weight: bold; }
    .signal-flat { color: #888; }
  </style>
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
      <span>样本 #${runIndex + 1}</span>
    </nav>
    
    <h1>样本级别详细报告</h1>
    <p class="subtitle">
      ${signalType} | ${marketName} | Run #${runIndex + 1} | 
      σ=${(config.volatility * 100).toFixed(1)}% | μ=${((config.drift ?? 0) * 100).toFixed(1)}%
    </p>
    
    <!-- 运行概览 -->
    <div class="card">
      <h2>运行概览</h2>
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="value">${config.candleCount}</div>
          <div class="label">K线数量</div>
        </div>
        <div class="metric-card">
          <div class="value">${totalTrades}</div>
          <div class="label">总交易数</div>
        </div>
        <div class="metric-card">
          <div class="value">${winRate}%</div>
          <div class="label">胜率</div>
        </div>
        <div class="metric-card">
          <div class="value">${avgHoldingPeriod}</div>
          <div class="label">平均持仓周期</div>
        </div>
      </div>
      <div class="grid grid-4" style="margin-top: 15px;">
        <div class="metric-card">
          <div class="value">${(totalPnl * 100).toFixed(2)}%</div>
          <div class="label">累计PnL (单位仓位)</div>
        </div>
        <div class="metric-card">
          <div class="value">${(finalBaselineEquity * 100).toFixed(2)}%</div>
          <div class="label">基准净值 (仓位=1)</div>
        </div>
        <div class="metric-card">
          <div class="value">${(finalLearnedC * 100).toFixed(4)}%</div>
          <div class="label">学习到的 C 值</div>
        </div>
        <div class="metric-card">
          <div class="value">${obsEndIdx}</div>
          <div class="label">观察期结束索引</div>
        </div>
      </div>
    </div>
    
    <!-- 价格与信号图 -->
    <div class="card">
      <h2>价格与信号图</h2>
      <p style="color: #666; margin-bottom: 15px;">
        蓝线: 价格 | 绿色箭头↑: 做多开仓 | 红色箭头↓: 做空开仓 | ×: 平仓
      </p>
      <div class="chart-container">
        ${priceSignalChartSVG}
      </div>
    </div>
    
    <!-- 基准净值曲线 -->
    ${baselineEquityChartSVG ? `
    <div class="card">
      <h2>基准账户净值曲线</h2>
      <p style="color: #666; margin-bottom: 15px;">
        基准账户特点: 固定仓位=1 | 连续运行，不止盈/止损 | 用于计算 C 值
      </p>
      <div class="chart-container">
        ${baselineEquityChartSVG}
      </div>
    </div>
    ` : ''}
    
    <!-- 反马丁资金曲线 -->
    ${multiplierChartSVG ? `
    <div class="card">
      <h2>反马丁账户资金曲线</h2>
      <p style="color: #666; margin-bottom: 15px;">
        绿色曲线: 资金倍率 | 绿色虚线: 止盈线 | 红色实线: 风控线 |
        绿点: 止盈 | 红叉: 止损 | 灰色区域: 观察期（实际仓位=0）
      </p>
      <div class="chart-container">
        ${multiplierChartSVG}
      </div>
    </div>
    ` : ''}
    
    <!-- 交易记录表 -->
    <div class="card">
      <h2>交易记录 (${totalTrades} 笔)</h2>
      <p style="color: #666; margin-bottom: 10px;">
        成交价格: 下一K线开盘价 | 绿色行: 盈利 | 红色行: 亏损
      </p>
      <div class="scrollable-table">
        ${tradesTable}
      </div>
    </div>
    
    <!-- 基准账户快照表 -->
    ${baselineSnapshots && baselineSnapshots.length > 0 ? `
    <div class="card">
      <h2>基准账户快照 (${baselineSnapshots.length} 条)</h2>
      <p style="color: #666; margin-bottom: 10px;">
        显示每笔交易后基准账户的状态变化
      </p>
      <div class="scrollable-table">
        ${baselineTable}
      </div>
    </div>
    ` : ''}
    
    <!-- 账户状态变化表 -->
    ${accountSnapshotsForTarget.length > 0 ? `
    <div class="card">
      <h2>反马丁账户快照 M_T=${targetForChart}x (${accountSnapshotsForTarget.length} 条)</h2>
      <p style="color: #666; margin-bottom: 10px;">
        显示每笔交易后账户的状态变化 | 灰色行: 观察期（实际仓位=0）
      </p>
      <div class="scrollable-table">
        ${accountTable}
      </div>
    </div>
    ` : ''}
    
    <!-- K线数据表 -->
    <div class="card">
      <div class="collapsible" onclick="toggleContent('candleData')">
        <h2 style="display: inline;">K线级别数据（点击展开）</h2>
      </div>
      <div id="candleData" class="content">
        <p style="color: #666; margin: 15px 0;">
          显示前100根K线的详细数据（包含信号和交易状态）
        </p>
        <div class="scrollable-table">
          ${candleDataTable}
        </div>
      </div>
    </div>
    
    <footer>
      资本持久战实验框架 | 样本详情报告 | ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
  
  <script>
    function toggleContent(id) {
      const content = document.getElementById(id);
      content.classList.toggle('active');
    }
  </script>
</body>
</html>`;
}

/**
 * 生成价格与信号图 SVG（带交易标记）
 */
function generatePriceSignalChartSVG(
  prices: number[],
  signals: number[],
  trades: TradeRecord[],
  width: number = 800,
  height: number = 280
): string {
  if (prices.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width/2}" y="40" text-anchor="middle" fill="#999" font-size="14">无价格数据</text>
    </svg>`;
  }

  const padding = { top: 30, right: 40, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 降采样
  const sampleRate = Math.max(1, Math.floor(prices.length / 800));
  const sampledPrices = prices.filter((_, i) => i % sampleRate === 0);
  
  const minPrice = Math.min(...sampledPrices);
  const maxPrice = Math.max(...sampledPrices);
  const priceRange = maxPrice - minPrice || 1;
  
  // 生成价格路径
  const pricePoints = sampledPrices.map((price, i) => {
    const x = padding.left + (i / (sampledPrices.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pricePathD = `M ${pricePoints.join(' L ')}`;
  
  // 生成交易标记
  const tradeMarkers = trades.map(trade => {
    // 开仓标记
    const entryIdx = Math.floor(trade.entryIndex / sampleRate);
    const entryX = padding.left + (entryIdx / (sampledPrices.length - 1)) * chartWidth;
    const entryY = padding.top + chartHeight - ((trade.entryPrice - minPrice) / priceRange) * chartHeight;
    
    // 平仓标记
    const exitIdx = Math.floor(trade.exitIndex / sampleRate);
    const exitX = padding.left + (exitIdx / (sampledPrices.length - 1)) * chartWidth;
    const exitY = padding.top + chartHeight - ((trade.exitPrice - minPrice) / priceRange) * chartHeight;
    
    const isLong = trade.direction === 1;
    const arrowColor = isLong ? '#27ae60' : '#e74c3c';
    
    // 开仓箭头
    const arrowPath = isLong 
      ? `M ${entryX} ${entryY + 15} L ${entryX} ${entryY} L ${entryX - 5} ${entryY + 8} M ${entryX} ${entryY} L ${entryX + 5} ${entryY + 8}`
      : `M ${entryX} ${entryY - 15} L ${entryX} ${entryY} L ${entryX - 5} ${entryY - 8} M ${entryX} ${entryY} L ${entryX + 5} ${entryY - 8}`;
    
    // 平仓叉号
    const crossSize = 4;
    const crossPath = `M ${exitX - crossSize} ${exitY - crossSize} L ${exitX + crossSize} ${exitY + crossSize} M ${exitX - crossSize} ${exitY + crossSize} L ${exitX + crossSize} ${exitY - crossSize}`;
    
    return `
      <path d="${arrowPath}" stroke="${arrowColor}" stroke-width="2" fill="none"/>
      <path d="${crossPath}" stroke="#888" stroke-width="2"/>
    `;
  }).join('');
  
  // Y轴刻度
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const price = minPrice + p * priceRange;
    const y = padding.top + chartHeight - p * chartHeight;
    return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${price.toFixed(2)}</text>
    `;
  }).join('');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>text { font-family: -apple-system, sans-serif; }</style>
  <defs>
    <linearGradient id="priceGradDetail" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#3498db;stop-opacity:0.2" />
      <stop offset="100%" style="stop-color:#3498db;stop-opacity:0.02" />
    </linearGradient>
  </defs>
  
  <text x="${width / 2}" y="18" text-anchor="middle" font-size="13" font-weight="600" fill="#2c3e50">
    价格与信号 (${prices.length} K线, ${trades.length} 笔交易)
  </text>
  
  <!-- 网格线 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  
  ${yTicks}
  
  <!-- 填充区域 -->
  <path d="${pricePathD} L ${width - padding.right},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z" fill="url(#priceGradDetail)"/>
  
  <!-- 价格线 -->
  <path d="${pricePathD}" fill="none" stroke="#3498db" stroke-width="1.5"/>
  
  <!-- 交易标记 -->
  ${tradeMarkers}
  
  <!-- X轴标签 -->
  <text x="${padding.left}" y="${height - 25}" font-size="9" fill="#666">0</text>
  <text x="${width - padding.right}" y="${height - 25}" text-anchor="end" font-size="9" fill="#666">${prices.length}</text>
  
  <!-- 图例 -->
  <g transform="translate(${padding.left}, ${height - 15})">
    <path d="M 0 0 L 0 -10 L -3 -5 M 0 -10 L 3 -5" stroke="#27ae60" stroke-width="1.5" fill="none"/>
    <text x="8" y="0" font-size="9" fill="#666">做多开仓</text>
    
    <path d="M 80 0 L 80 10 L 77 5 M 80 10 L 83 5" stroke="#e74c3c" stroke-width="1.5" fill="none"/>
    <text x="88" y="0" font-size="9" fill="#666">做空开仓</text>
    
    <path d="M 160 -3 L 166 3 M 160 3 L 166 -3" stroke="#888" stroke-width="1.5"/>
    <text x="172" y="0" font-size="9" fill="#666">平仓</text>
  </g>
</svg>`;
}

/**
 * 生成交易记录表格
 */
function generateTradesTable(trades: TradeRecord[]): string {
  if (trades.length === 0) {
    return '<p style="color: #999; text-align: center;">无交易记录</p>';
  }
  
  const rows = trades.map(t => {
    const rowClass = t.isWin ? 'trade-win' : 'trade-loss';
    const directionText = t.direction === 1 
      ? '<span class="signal-long">多</span>' 
      : '<span class="signal-short">空</span>';
    const pnlText = t.pnlPercent >= 0 
      ? `<span style="color: #27ae60;">+${(t.pnlPercent * 100).toFixed(3)}%</span>`
      : `<span style="color: #e74c3c;">${(t.pnlPercent * 100).toFixed(3)}%</span>`;
    
    return `<tr class="${rowClass}">
      <td>${t.tradeIndex}</td>
      <td>${directionText}</td>
      <td>${t.signalIndex}</td>
      <td>${t.entryIndex}</td>
      <td>${t.entryPrice.toFixed(4)}</td>
      <td>${t.exitSignalIndex}</td>
      <td>${t.exitIndex}</td>
      <td>${t.exitPrice.toFixed(4)}</td>
      <td>${t.holdingPeriod}</td>
      <td>${pnlText}</td>
      <td>${(t.maxDrawdown * 100).toFixed(3)}%</td>
    </tr>`;
  }).join('');
  
  return `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>方向</th>
        <th>信号索引</th>
        <th>开仓索引</th>
        <th>开仓价</th>
        <th>平仓信号</th>
        <th>平仓索引</th>
        <th>平仓价</th>
        <th>持仓周期</th>
        <th>PnL</th>
        <th>最大浮亏</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 生成基准账户快照表格
 */
function generateBaselineTable(snapshots: BaselineSnapshot[]): string {
  if (snapshots.length === 0) {
    return '<p style="color: #999; text-align: center;">无基准账户快照</p>';
  }
  
  const rows = snapshots.map(s => {
    const pnlText = s.pnlPercent >= 0 
      ? `<span style="color: #27ae60;">+${(s.pnlPercent * 100).toFixed(3)}%</span>`
      : `<span style="color: #e74c3c;">${(s.pnlPercent * 100).toFixed(3)}%</span>`;
    const equityText = s.cumulativeEquity >= 0
      ? `<span style="color: #27ae60;">${(s.cumulativeEquity * 100).toFixed(3)}%</span>`
      : `<span style="color: #e74c3c;">${(s.cumulativeEquity * 100).toFixed(3)}%</span>`;
    
    return `<tr>
      <td>${s.tradeIndex}</td>
      <td>${s.candleIndex}</td>
      <td>${pnlText}</td>
      <td>${equityText}</td>
      <td>${(s.estimatedC * 100).toFixed(4)}%</td>
      <td>${(s.maxDrawdown * 100).toFixed(3)}%</td>
      <td>${(s.stopLoss * 100).toFixed(3)}%</td>
    </tr>`;
  }).join('');
  
  return `<table>
    <thead>
      <tr>
        <th>交易#</th>
        <th>K线索引</th>
        <th>PnL</th>
        <th>累计净值</th>
        <th>C 值</th>
        <th>浮亏</th>
        <th>StopLoss</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 生成账户状态快照表格
 */
function generateAccountSnapshotsTable(snapshots: AccountSnapshot[], targetMultiplier: number): string {
  if (snapshots.length === 0) {
    return '<p style="color: #999; text-align: center;">无账户快照</p>';
  }
  
  // 格式化百分比数值，带颜色
  const formatPnl = (value: number, isObserving = false): string => {
    if (value === 0 && isObserving) {
      return '<span style="color: #888;">0</span>';
    }
    const color = value >= 0 ? '#27ae60' : '#e74c3c';
    const sign = value >= 0 ? '+' : '';
    return `<span style="color: ${color};">${sign}${(value * 100).toFixed(3)}%</span>`;
  };

  const rows = snapshots.map(s => {
    let rowClass = '';
    let eventText = '';
    
    switch (s.eventType) {
      case 'observing':
        rowClass = 'observing';
        eventText = '<span class="event-obs">观察期</span>';
        break;
      case 'take_profit':
        eventText = '<span class="event-tp">止盈</span>';
        break;
      case 'stop_loss':
        eventText = '<span class="event-sl">止损</span>';
        break;
      default:
        eventText = '交易';
    }
    
    const vcText = s.ventureCapital >= 0
      ? `<span style="color: #27ae60;">${s.ventureCapital.toFixed(4)}</span>`
      : `<span style="color: #e74c3c;">${s.ventureCapital.toFixed(4)}</span>`;
    
    return `<tr class="${rowClass}">
      <td>${s.tradeIndex}</td>
      <td>${s.candleIndex}</td>
      <td>${eventText}</td>
      <td>${formatPnl(s.pnlPercent, s.isObserving)}</td>
      <td>${s.positionSize}</td>
      <td>${formatPnl(s.actualPnl, s.isObserving)}</td>
      <td>${formatPnl(s.unrealizedPnL)}</td>
      <td>${formatPnl(s.realizedPnL)}</td>
      <td>${formatPnl(s.pnl)}</td>
      <td>${s.riskLine.toFixed(4)}</td>
      <td>${vcText}</td>
      <td>${s.estimatedC.toFixed(6)}</td>
      <td>${s.stopLoss.toFixed(4)}</td>
    </tr>`;
  }).join('');
  
  return `<table>
    <thead>
      <tr>
        <th>交易#</th>
        <th>K线</th>
        <th>事件</th>
        <th>单笔PnL</th>
        <th>仓位</th>
        <th>本笔盈亏</th>
        <th>未实现盈亏</th>
        <th>已实现盈亏</th>
        <th>总盈亏</th>
        <th>风控线</th>
        <th>VC</th>
        <th>C值</th>
        <th>StopLoss</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 生成K线数据表格（前100条）
 */
function generateCandleDataTable(
  candles: import('../types.js').Candle[],
  signals: number[],
  trades: TradeRecord[]
): string {
  if (candles.length === 0) {
    return '<p style="color: #999; text-align: center;">无K线数据</p>';
  }
  
  // 创建交易索引映射
  const tradeEntryMap = new Map<number, TradeRecord>();
  const tradeExitMap = new Map<number, TradeRecord>();
  for (const t of trades) {
    tradeEntryMap.set(t.entryIndex, t);
    tradeExitMap.set(t.exitIndex, t);
  }
  
  // 只显示前100条
  const displayCandles = candles.slice(0, 100);
  
  const rows = displayCandles.map((c, i) => {
    const signal = signals[i] ?? 0;
    let signalText = '<span class="signal-flat">-</span>';
    if (signal === 1) signalText = '<span class="signal-long">多</span>';
    else if (signal === -1) signalText = '<span class="signal-short">空</span>';
    
    let action = '-';
    const entryTrade = tradeEntryMap.get(i);
    const exitTrade = tradeExitMap.get(i);
    if (entryTrade) {
      action = entryTrade.direction === 1 ? '开多' : '开空';
    }
    if (exitTrade) {
      action += (action !== '-' ? ' / ' : '') + '平仓';
    }
    
    return `<tr>
      <td>${i}</td>
      <td>${c.open.toFixed(4)}</td>
      <td>${c.high.toFixed(4)}</td>
      <td>${c.low.toFixed(4)}</td>
      <td>${c.close.toFixed(4)}</td>
      <td>${signalText}</td>
      <td>${action}</td>
    </tr>`;
  }).join('');
  
  return `<table>
    <thead>
      <tr>
        <th>索引</th>
        <th>开盘</th>
        <th>最高</th>
        <th>最低</th>
        <th>收盘</th>
        <th>信号</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color: #888; font-size: 12px; margin-top: 10px;">
    显示前 ${displayCandles.length} / ${candles.length} 条数据
  </p>`;
}

