/**
 * Visualization Module - 可视化模块
 * 
 * 生成HTML图表用于分析结果展示
 * 使用内联SVG,无需外部依赖
 */

import type { ExperimentResult, Candle } from '../types.js';
import { calculateHistogram, calculateCDF } from '../analysis/index.js';
import * as fs from 'fs';
import * as path from 'path';

// ============================================
// SVG 图表生成
// ============================================

interface ChartConfig {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

const DEFAULT_CONFIG: ChartConfig = {
  width: 800,
  height: 400,
  padding: { top: 40, right: 40, bottom: 60, left: 80 },
};

/**
 * 计算对数刻度的直方图
 */
function calculateLogHistogram(values: number[], bins: number = 40): { binEdges: number[]; counts: number[] } {
  const logValues = values.map(v => Math.log10(Math.max(v, 1e-10)));
  const minLog = Math.min(...logValues);
  const maxLog = Math.max(...logValues);
  const binWidth = (maxLog - minLog) / bins;
  
  const binEdges: number[] = [];
  const counts: number[] = new Array(bins).fill(0);
  
  for (let i = 0; i <= bins; i++) {
    binEdges.push(Math.pow(10, minLog + i * binWidth));
  }
  
  for (const logVal of logValues) {
    const binIndex = Math.min(Math.floor((logVal - minLog) / binWidth), bins - 1);
    counts[binIndex]++;
  }
  
  return { binEdges, counts };
}

/**
 * 格式化成交额 (HTML版本)
 */
function formatTurnoverHTML(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toFixed(2);
}

/**
 * 格式化对数刻度标签
 */
function formatLogLabel(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(0)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  if (value >= 100) return `${value.toFixed(0)}`;
  if (value >= 10) return `${value.toFixed(1)}`;
  if (value >= 1) return `${value.toFixed(2)}`;
  return value.toExponential(1);
}

/**
 * 生成直方图 SVG (对数X轴)
 */
function generateHistogramSVG(
  values: number[],
  title: string,
  xlabel: string,
  config: ChartConfig = DEFAULT_CONFIG
): string {
  const { width, height, padding } = config;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 使用对数直方图
  const { binEdges, counts } = calculateLogHistogram(values, 40);
  const maxCount = Math.max(...counts);
  
  const minLog = Math.log10(Math.max(binEdges[0], 1e-10));
  const maxLog = Math.log10(binEdges[binEdges.length - 1]);
  const logRange = maxLog - minLog;
  
  // 生成柱状图 (对数X轴)
  const bars = counts.map((count, i) => {
    const logStart = Math.log10(Math.max(binEdges[i], 1e-10));
    const logEnd = Math.log10(binEdges[i + 1]);
    const x = padding.left + ((logStart - minLog) / logRange) * chartWidth;
    const barWidth = ((logEnd - logStart) / logRange) * chartWidth;
    const barHeight = (count / maxCount) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    return `<rect x="${x}" y="${y}" width="${Math.max(barWidth - 1, 1)}" height="${barHeight}" fill="#4a90d9" opacity="0.8"/>`;
  }).join('\n');
  
  // X轴标签 (对数刻度)
  const logTicks: number[] = [];
  const minPow = Math.floor(minLog);
  const maxPow = Math.ceil(maxLog);
  for (let p = minPow; p <= maxPow; p++) {
    const tickValue = Math.pow(10, p);
    if (tickValue >= binEdges[0] && tickValue <= binEdges[binEdges.length - 1]) {
      logTicks.push(tickValue);
    }
    // 添加中间刻度 2x, 5x
    for (const mult of [2, 5]) {
      const midTick = tickValue * mult;
      if (midTick >= binEdges[0] && midTick <= binEdges[binEdges.length - 1] && midTick < Math.pow(10, maxPow)) {
        logTicks.push(midTick);
      }
    }
  }
  logTicks.sort((a, b) => a - b);
  
  const xLabels = logTicks.map(tick => {
    const logTick = Math.log10(tick);
    const x = padding.left + ((logTick - minLog) / logRange) * chartWidth;
    return `<text x="${x}" y="${height - 20}" text-anchor="middle" font-size="11">${formatLogLabel(tick)}x</text>`;
  }).join('\n');
  
  const xGridLines = logTicks.map(tick => {
    const logTick = Math.log10(tick);
    const x = padding.left + ((logTick - minLog) / logRange) * chartWidth;
    return `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>`;
  }).join('\n');
  
  // Y轴标签
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const value = Math.round((1 - p) * maxCount);
    const y = padding.top + p * chartHeight;
    return `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${value}</text>`;
  }).join('\n');
  
  const yGridLines = [0.25, 0.5, 0.75].map(p => {
    const y = padding.top + p * chartHeight;
    return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#eee" stroke-width="1"/>`;
  }).join('\n');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; fill: #333; }
  </style>
  
  <!-- 标题 -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="16" font-weight="bold">${title} (对数坐标)</text>
  
  <!-- 网格线 -->
  ${xGridLines}
  ${yGridLines}
  
  <!-- X轴 -->
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1"/>
  <text x="${width / 2}" y="${height - 5}" text-anchor="middle" font-size="14">${xlabel}</text>
  ${xLabels}
  
  <!-- Y轴 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1"/>
  <text x="15" y="${height / 2}" text-anchor="middle" font-size="14" transform="rotate(-90, 15, ${height / 2})">频数</text>
  ${yLabels}
  
  <!-- 柱状图 -->
  ${bars}
</svg>`;
}

/**
 * 生成CDF曲线 SVG (对数X轴)
 */
function generateCDFSVG(
  values: number[],
  title: string,
  xlabel: string,
  config: ChartConfig = DEFAULT_CONFIG
): string {
  const { width, height, padding } = config;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const { x, y } = calculateCDF(values);
  const minX = Math.max(x[0], 1e-10);
  const maxX = x[x.length - 1];
  
  // 对数坐标转换
  const minLog = Math.log10(minX);
  const maxLog = Math.log10(maxX);
  const logRange = maxLog - minLog;
  
  // 生成路径 (对数X轴)
  const points = x.map((xVal, i) => {
    const logX = Math.log10(Math.max(xVal, 1e-10));
    const px = padding.left + ((logX - minLog) / logRange) * chartWidth;
    const py = padding.top + (1 - y[i]) * chartHeight;
    return `${px},${py}`;
  }).join(' ');
  
  // X轴对数刻度
  const logTicks: number[] = [];
  const minPow = Math.floor(minLog);
  const maxPow = Math.ceil(maxLog);
  for (let p = minPow; p <= maxPow; p++) {
    const tickValue = Math.pow(10, p);
    if (tickValue >= minX && tickValue <= maxX) {
      logTicks.push(tickValue);
    }
    for (const mult of [2, 5]) {
      const midTick = tickValue * mult;
      if (midTick >= minX && midTick <= maxX && midTick < Math.pow(10, maxPow)) {
        logTicks.push(midTick);
      }
    }
  }
  logTicks.sort((a, b) => a - b);
  
  const xLabels = logTicks.map(tick => {
    const logTick = Math.log10(tick);
    const px = padding.left + ((logTick - minLog) / logRange) * chartWidth;
    return `<text x="${px}" y="${height - 20}" text-anchor="middle" font-size="11">${formatLogLabel(tick)}x</text>`;
  }).join('\n');
  
  const xGridLines = logTicks.map(tick => {
    const logTick = Math.log10(tick);
    const px = padding.left + ((logTick - minLog) / logRange) * chartWidth;
    return `<line x1="${px}" y1="${padding.top}" x2="${px}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>`;
  }).join('\n');
  
  // Y轴标签
  const yLabels = [0, 0.25, 0.5, 0.75, 1].map(p => {
    const py = padding.top + (1 - p) * chartHeight;
    return `<text x="${padding.left - 10}" y="${py + 4}" text-anchor="end" font-size="12">${(p * 100).toFixed(0)}%</text>`;
  }).join('\n');
  
  // Y网格线
  const yGridLines = [0.25, 0.5, 0.75].map(p => {
    const py = padding.top + (1 - p) * chartHeight;
    return `<line x1="${padding.left}" y1="${py}" x2="${width - padding.right}" y2="${py}" stroke="#ddd" stroke-width="1"/>`;
  }).join('\n');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; fill: #333; }
  </style>
  
  <!-- 标题 -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="16" font-weight="bold">${title} (对数坐标)</text>
  
  <!-- 网格 -->
  ${xGridLines}
  ${yGridLines}
  
  <!-- X轴 -->
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1"/>
  <text x="${width / 2}" y="${height - 5}" text-anchor="middle" font-size="14">${xlabel}</text>
  ${xLabels}
  
  <!-- Y轴 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1"/>
  <text x="15" y="${height / 2}" text-anchor="middle" font-size="14" transform="rotate(-90, 15, ${height / 2})">累积概率 P(M ≤ x)</text>
  ${yLabels}
  
  <!-- CDF曲线 -->
  <polyline points="${points}" fill="none" stroke="#e74c3c" stroke-width="2"/>
</svg>`;
}

/**
 * 生成达到概率柱状图 SVG
 */
function generateReachProbabilityBarSVG(
  result: ExperimentResult,
  config: ChartConfig = DEFAULT_CONFIG
): string {
  const { width, height, padding } = config;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  const targets = result.config.targetMultipliers;
  const probs = targets.map(t => result.reachProbabilities.get(t) ?? 0);
  
  const barWidth = chartWidth / targets.length * 0.7;
  const gap = chartWidth / targets.length * 0.3;
  
  const bars = probs.map((prob, i) => {
    const x = padding.left + i * (barWidth + gap) + gap / 2;
    const barHeight = prob * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    const color = prob > 0.5 ? '#27ae60' : prob > 0.1 ? '#f39c12' : '#e74c3c';
    return `
      <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${color}" opacity="0.8"/>
      <text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" font-size="11">${(prob * 100).toFixed(0)}%</text>
    `;
  }).join('\n');
  
  // X轴标签
  const xLabels = targets.map((target, i) => {
    const x = padding.left + i * (barWidth + gap) + gap / 2 + barWidth / 2;
    return `<text x="${x}" y="${height - 25}" text-anchor="middle" font-size="12">${target}x</text>`;
  }).join('\n');
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; fill: #333; }
  </style>
  
  <!-- 标题 -->
  <text x="${width / 2}" y="25" text-anchor="middle" font-size="16" font-weight="bold">P(M ≥ k) 达到目标概率</text>
  
  <!-- X轴 -->
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1"/>
  <text x="${width / 2}" y="${height - 5}" text-anchor="middle" font-size="14">目标倍率</text>
  ${xLabels}
  
  <!-- Y轴 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#333" stroke-width="1"/>
  
  <!-- 网格线 -->
  ${[0.25, 0.5, 0.75, 1].map(p => {
    const y = padding.top + (1 - p) * chartHeight;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#ddd" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="12">${(p * 100).toFixed(0)}%</text>
    `;
  }).join('\n')}
  
  <!-- 柱状图 -->
  ${bars}
</svg>`;
}

/**
 * 生成K线图 SVG
 * 显示价格走势和资产倍率曲线
 */
function generateCandlestickSVG(
  candles: Candle[],
  multiplierHistory: number[],
  title: string,
  config: ChartConfig = { ...DEFAULT_CONFIG, width: 1000, height: 300 }
): string {
  const { width, height, padding } = config;
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // 采样：如果K线太多，进行区间合并采样
  const maxCandles = 200;
  const step = Math.max(1, Math.ceil(candles.length / maxCandles));
  const sampledCandles: Candle[] = [];
  const sampledMultipliers: number[] = [];
  
  for (let i = 0; i < candles.length; i += step) {
    const end = Math.min(i + step, candles.length);
    // 合并区间内的K线
    let high = -Infinity;
    let low = Infinity;
    for (let j = i; j < end; j++) {
      high = Math.max(high, candles[j].high);
      low = Math.min(low, candles[j].low);
    }
    sampledCandles.push({
      time: candles[i].time,
      open: candles[i].open,
      high,
      low,
      close: candles[end - 1].close,
      volume: 0,
    });
    // 取区间最后一个倍率值
    if (multiplierHistory[end - 1] !== undefined) {
      sampledMultipliers.push(multiplierHistory[end - 1]);
    } else if (multiplierHistory[i] !== undefined) {
      sampledMultipliers.push(multiplierHistory[i]);
    }
  }
  
  const n = sampledCandles.length;
  const candleWidth = chartWidth / n;
  
  // 计算价格范围 (对数坐标)
  let minPrice = Infinity, maxPrice = -Infinity;
  for (const c of sampledCandles) {
    minPrice = Math.min(minPrice, c.low);
    maxPrice = Math.max(maxPrice, c.high);
  }
  const minPriceLog = Math.log10(Math.max(minPrice, 1e-10));
  const maxPriceLog = Math.log10(Math.max(maxPrice, 1e-10));
  const priceLogRange = maxPriceLog - minPriceLog || 1;
  
  // 计算倍率范围 (对数)
  const minMult = Math.min(...sampledMultipliers.filter(m => m > 0));
  const maxMult = Math.max(...sampledMultipliers);
  const minMultLog = Math.log10(Math.max(minMult, 0.1));
  const maxMultLog = Math.log10(Math.max(maxMult, 1));
  const multLogRange = maxMultLog - minMultLog || 1;
  
  // 价格对数坐标转换函数
  const priceToY = (price: number) => {
    const logPrice = Math.log10(Math.max(price, 1e-10));
    return padding.top + (1 - (logPrice - minPriceLog) / priceLogRange) * chartHeight * 0.6;
  };
  
  // 生成K线 (对数坐标)
  const candlesticks = sampledCandles.map((c, i) => {
    const x = padding.left + i * candleWidth + candleWidth / 2;
    const bodyWidth = Math.max(candleWidth * 0.6, 2);
    
    const openY = priceToY(c.open);
    const closeY = priceToY(c.close);
    const highY = priceToY(c.high);
    const lowY = priceToY(c.low);
    
    const isUp = c.close >= c.open;
    const color = isUp ? '#26a69a' : '#ef5350';
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(closeY - openY), 1);
    
    return `
      <line x1="${x}" y1="${highY}" x2="${x}" y2="${lowY}" stroke="${color}" stroke-width="1"/>
      <rect x="${x - bodyWidth/2}" y="${bodyTop}" width="${bodyWidth}" height="${bodyHeight}" fill="${color}"/>
    `;
  }).join('');
  
  // 生成资产倍率曲线 (在下半部分，使用对数坐标)
  const multiplierY0 = padding.top + chartHeight * 0.65;
  const multiplierHeight = chartHeight * 0.3;
  
  const multiplierPoints = sampledMultipliers.map((m, i) => {
    const x = padding.left + i * candleWidth + candleWidth / 2;
    const logM = Math.log10(Math.max(m, 0.1));
    const y = multiplierY0 + multiplierHeight - ((logM - minMultLog) / multLogRange) * multiplierHeight;
    return `${x},${y}`;
  }).join(' ');
  
  // 价格Y轴标签 (对数刻度)
  const priceLabels: string[] = [];
  const priceTicks: number[] = [];
  const minPricePow = Math.floor(minPriceLog);
  const maxPricePow = Math.ceil(maxPriceLog);
  for (let p = minPricePow; p <= maxPricePow; p++) {
    const tickValue = Math.pow(10, p);
    if (tickValue >= minPrice * 0.9 && tickValue <= maxPrice * 1.1) {
      priceTicks.push(tickValue);
    }
    // 添加中间刻度 2x, 5x
    for (const mult of [2, 5]) {
      const midTick = tickValue * mult;
      if (midTick >= minPrice * 0.9 && midTick <= maxPrice * 1.1) {
        priceTicks.push(midTick);
      }
    }
  }
  priceTicks.sort((a, b) => a - b);
  
  for (const tick of priceTicks) {
    const y = priceToY(tick);
    if (y >= padding.top && y <= padding.top + chartHeight * 0.6) {
      priceLabels.push(`<text x="${padding.left - 5}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${formatLogLabel(tick)}</text>`);
    }
  }
  
  // 倍率Y轴标签
  const multLabels: string[] = [];
  const multTicks = [1, 2, 5, 10, 100, 1000, 10000, 100000, 1000000];
  for (const tick of multTicks) {
    if (tick >= minMult * 0.9 && tick <= maxMult * 1.1) {
      const logTick = Math.log10(tick);
      const y = multiplierY0 + multiplierHeight - ((logTick - minMultLog) / multLogRange) * multiplierHeight;
      if (y >= multiplierY0 && y <= multiplierY0 + multiplierHeight) {
        multLabels.push(`<text x="${width - padding.right + 5}" y="${y + 4}" text-anchor="start" font-size="10" fill="#e74c3c">${formatLogLabel(tick)}x</text>`);
      }
    }
  }
  
  return `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  </style>
  
  <!-- 标题 -->
  <text x="${width / 2}" y="20" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">${title}</text>
  
  <!-- 价格区域背景 -->
  <rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight * 0.6}" fill="#fafafa"/>
  
  <!-- 倍率区域背景 -->
  <rect x="${padding.left}" y="${multiplierY0}" width="${chartWidth}" height="${multiplierHeight}" fill="#fff5f5"/>
  
  <!-- K线 -->
  ${candlesticks}
  
  <!-- 资产倍率曲线 -->
  <polyline points="${multiplierPoints}" fill="none" stroke="#e74c3c" stroke-width="1.5" opacity="0.8"/>
  
  <!-- 1x基准线 -->
  ${minMult <= 1 && maxMult >= 1 ? `
    <line x1="${padding.left}" y1="${multiplierY0 + multiplierHeight - ((0 - minMultLog) / multLogRange) * multiplierHeight}" 
          x2="${width - padding.right}" y2="${multiplierY0 + multiplierHeight - ((0 - minMultLog) / multLogRange) * multiplierHeight}" 
          stroke="#999" stroke-width="1" stroke-dasharray="4,4"/>
  ` : ''}
  
  <!-- Y轴 -->
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + chartHeight * 0.6}" stroke="#333" stroke-width="1"/>
  <text x="${padding.left - 40}" y="${padding.top + chartHeight * 0.3}" text-anchor="middle" font-size="11" fill="#333" transform="rotate(-90, ${padding.left - 40}, ${padding.top + chartHeight * 0.3})">价格(log)</text>
  ${priceLabels.join('\n')}
  
  <!-- 倍率Y轴 -->
  <line x1="${width - padding.right}" y1="${multiplierY0}" x2="${width - padding.right}" y2="${multiplierY0 + multiplierHeight}" stroke="#e74c3c" stroke-width="1"/>
  <text x="${width - padding.right + 35}" y="${multiplierY0 + multiplierHeight / 2}" text-anchor="middle" font-size="11" fill="#e74c3c" transform="rotate(90, ${width - padding.right + 35}, ${multiplierY0 + multiplierHeight / 2})">资产倍率</text>
  ${multLabels.join('\n')}
  
  <!-- X轴 -->
  <line x1="${padding.left}" y1="${multiplierY0 + multiplierHeight}" x2="${width - padding.right}" y2="${multiplierY0 + multiplierHeight}" stroke="#333" stroke-width="1"/>
  <text x="${width / 2}" y="${height - 5}" text-anchor="middle" font-size="11" fill="#333">K线 (采样显示 ${n}/${candles.length} 根)</text>
  
  <!-- 图例 -->
  <rect x="${padding.left + 10}" y="${padding.top + 5}" width="12" height="12" fill="#26a69a"/>
  <text x="${padding.left + 27}" y="${padding.top + 15}" font-size="10" fill="#333">上涨</text>
  <rect x="${padding.left + 60}" y="${padding.top + 5}" width="12" height="12" fill="#ef5350"/>
  <text x="${padding.left + 77}" y="${padding.top + 15}" font-size="10" fill="#333">下跌</text>
  <line x1="${padding.left + 115}" y1="${padding.top + 11}" x2="${padding.left + 135}" y2="${padding.top + 11}" stroke="#e74c3c" stroke-width="2"/>
  <text x="${padding.left + 140}" y="${padding.top + 15}" font-size="10" fill="#333">资产倍率</text>
</svg>`;
}

// ============================================
// HTML 报告生成
// ============================================

/**
 * 生成完整的HTML报告
 */
export function generateHTMLReport(result: ExperimentResult): string {
  const { config, mDistribution, peakMultipliers, sampleRuns } = result;
  
  const histogramSVG = generateHistogramSVG(peakMultipliers, 'M (峰值倍率) 分布直方图', '峰值倍率 M');
  const cdfSVG = generateCDFSVG(peakMultipliers, 'M (峰值倍率) 累积分布函数', '峰值倍率 M');
  const reachProbSVG = generateReachProbabilityBarSVG(result);
  
  // 生成样本K线图
  const sampleCharts = (sampleRuns ?? []).map((sample, i) => {
    const title = `样本 #${i + 1}: 峰值倍率 ${sample.peakMultiplier.toFixed(2)}x`;
    return generateCandlestickSVG(sample.candles, sample.multiplierHistory, title);
  }).join('\n');
  
  // 生成达到概率表格
  const reachProbTable = config.targetMultipliers.map(target => {
    const prob = result.reachProbabilities.get(target) ?? 0;
    const avgCandles = result.avgCandlesToReach.get(target);
    const avgTrades = result.avgTradesToReach.get(target);
    return `
      <tr>
        <td>${target}x</td>
        <td>${(prob * 100).toFixed(2)}%</td>
        <td>${avgCandles !== null && avgCandles !== undefined ? avgCandles.toFixed(0) : 'N/A'}</td>
        <td>${avgTrades !== null && avgTrades !== undefined ? avgTrades.toFixed(1) : 'N/A'}</td>
      </tr>
    `;
  }).join('\n');
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>资本持久战实验报告 - ${config.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: #f5f5f5;
      color: #333;
      line-height: 1.6;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 30px; color: #2c3e50; }
    h2 { margin: 30px 0 15px; color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    .card {
      background: white;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-item {
      background: #ecf0f1;
      padding: 15px;
      border-radius: 6px;
      text-align: center;
    }
    .stat-item .label { font-size: 12px; color: #7f8c8d; text-transform: uppercase; }
    .stat-item .value { font-size: 24px; font-weight: bold; color: #2c3e50; margin-top: 5px; }
    .chart-container { text-align: center; margin: 20px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th { background: #3498db; color: white; }
    tr:hover { background: #f5f5f5; }
    .config-list { list-style: none; }
    .config-list li { padding: 8px 0; border-bottom: 1px solid #eee; }
    .config-list li:last-child { border-bottom: none; }
    .config-list strong { color: #7f8c8d; min-width: 150px; display: inline-block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>资本持久战实验报告</h1>
    
    <div class="card">
      <h2>实验配置</h2>
      <ul class="config-list">
        <li><strong>实验名称:</strong> ${config.name}</li>
        <li><strong>市场类型:</strong> ${config.market.type.toUpperCase()}</li>
        <li><strong>等效波动率:</strong> ${(config.market.volatility * 100).toFixed(1)}%</li>
        <li><strong>信号策略:</strong> ${config.signal.type}</li>
        <li><strong>K线数量:</strong> ${config.market.candleCount}</li>
        <li><strong>蒙特卡洛次数:</strong> ${config.monteCarloRuns}</li>
        <li><strong>交易成本率:</strong> ${((config.tradingCostRate ?? 0) * 100).toFixed(4)}%</li>
        <li><strong>运行时间:</strong> ${result.elapsedMs}ms</li>
      </ul>
    </div>
    
    <div class="card">
      <h2>核心指标</h2>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="label">平均峰值倍率 E[M]</div>
          <div class="value">${mDistribution.mean.toFixed(2)}x</div>
        </div>
        <div class="stat-item">
          <div class="label">中位数峰值倍率</div>
          <div class="value">${mDistribution.median.toFixed(2)}x</div>
        </div>
        <div class="stat-item">
          <div class="label">P95 峰值倍率</div>
          <div class="value">${mDistribution.percentiles.p95.toFixed(2)}x</div>
        </div>
        <div class="stat-item">
          <div class="label">最大峰值倍率</div>
          <div class="value">${mDistribution.max.toFixed(2)}x</div>
        </div>
        <div class="stat-item">
          <div class="label">平均胜率</div>
          <div class="value">${(result.avgWinRate * 100).toFixed(1)}%</div>
        </div>
        <div class="stat-item">
          <div class="label">平均最大连胜</div>
          <div class="value">${result.avgMaxConsecutiveWins.toFixed(1)}</div>
        </div>
        <div class="stat-item">
          <div class="label">平均总成交额</div>
          <div class="value">${formatTurnoverHTML(result.avgTotalTurnover)}</div>
        </div>
        <div class="stat-item">
          <div class="label">平均总交易成本</div>
          <div class="value">${formatTurnoverHTML(result.avgTotalTradingCost)}</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>M 分布分析</h2>
      <div class="chart-container">${histogramSVG}</div>
      <div class="chart-container">${cdfSVG}</div>
    </div>
    
    ${sampleCharts ? `
    <div class="card">
      <h2>样本市场走势 (高峰值样本)</h2>
      <p style="color: #7f8c8d; margin-bottom: 15px;">展示蒙特卡洛模拟中峰值倍率最高的样本，包含K线价格走势和资产倍率曲线。</p>
      ${sampleCharts}
    </div>
    ` : ''}
    
    <div class="card">
      <h2>达到目标概率 P(M ≥ k) 与 T_S 指标</h2>
      <div class="chart-container">${reachProbSVG}</div>
      <table>
        <thead>
          <tr>
            <th>目标倍率</th>
            <th>达到概率 P(M ≥ k)</th>
            <th>平均K线数 T_S</th>
            <th>平均交易数</th>
          </tr>
        </thead>
        <tbody>
          ${reachProbTable}
        </tbody>
      </table>
    </div>
    
    <div class="card">
      <h2>M 分布统计详情</h2>
      <table>
        <tr><th>统计量</th><th>值</th></tr>
        <tr><td>均值</td><td>${mDistribution.mean.toFixed(4)}</td></tr>
        <tr><td>标准差</td><td>${mDistribution.std.toFixed(4)}</td></tr>
        <tr><td>最小值</td><td>${mDistribution.min.toFixed(4)}</td></tr>
        <tr><td>最大值</td><td>${mDistribution.max.toFixed(4)}</td></tr>
        <tr><td>P5</td><td>${mDistribution.percentiles.p5.toFixed(4)}</td></tr>
        <tr><td>P25</td><td>${mDistribution.percentiles.p25.toFixed(4)}</td></tr>
        <tr><td>P50 (中位数)</td><td>${mDistribution.percentiles.p50.toFixed(4)}</td></tr>
        <tr><td>P75</td><td>${mDistribution.percentiles.p75.toFixed(4)}</td></tr>
        <tr><td>P95</td><td>${mDistribution.percentiles.p95.toFixed(4)}</td></tr>
        <tr><td>P99</td><td>${mDistribution.percentiles.p99.toFixed(4)}</td></tr>
      </table>
    </div>
    
    <footer style="text-align: center; color: #7f8c8d; margin-top: 40px; padding: 20px;">
      资本持久战实验框架 | 生成时间: ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>
`;
}

/**
 * 生成多实验对比HTML报告
 */
export function generateComparisonHTMLReport(results: ExperimentResult[]): string {
  const rows = results.map(r => ({
    name: r.config.name,
    market: r.config.market.type,
    volatility: r.config.market.volatility,
    signal: r.config.signal.type,
    meanM: r.mDistribution.mean,
    medianM: r.mDistribution.median,
    p95M: r.mDistribution.percentiles.p95,
    maxM: r.mDistribution.max,
    prob2x: r.reachProbabilities.get(2) ?? 0,
    prob10x: r.reachProbabilities.get(10) ?? 0,
    prob100x: r.reachProbabilities.get(100) ?? 0,
    ts2x: r.avgCandlesToReach.get(2),
    ts10x: r.avgCandlesToReach.get(10),
    winRate: r.avgWinRate,
    avgTurnover: r.avgTotalTurnover,
  }));
  
  // 按波动率分组
  const volatilities = [...new Set(rows.map(r => r.volatility))].sort((a, b) => a - b);
  const signals = [...new Set(rows.map(r => r.signal))];
  
  // 生成主对比表格
  const tableRows = rows.map(r => {
    const reportFileName = `${r.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_report.html`;
    return `
    <tr>
      <td><a href="${reportFileName}">${r.name}</a></td>
      <td>${(r.volatility * 100).toFixed(0)}%</td>
      <td>${r.signal}</td>
      <td>${r.meanM >= 1000 ? r.meanM.toExponential(2) : r.meanM.toFixed(2)}x</td>
      <td>${r.medianM.toFixed(2)}x</td>
      <td>${r.p95M >= 1000 ? r.p95M.toExponential(2) : r.p95M.toFixed(2)}x</td>
      <td style="background: ${r.prob2x > 0.5 ? '#d4edda' : r.prob2x > 0.1 ? '#fff3cd' : '#f8d7da'}">${(r.prob2x * 100).toFixed(0)}%</td>
      <td style="background: ${r.prob10x > 0.5 ? '#d4edda' : r.prob10x > 0.1 ? '#fff3cd' : '#f8d7da'}">${(r.prob10x * 100).toFixed(0)}%</td>
      <td style="background: ${r.prob100x > 0.5 ? '#d4edda' : r.prob100x > 0.1 ? '#fff3cd' : '#f8d7da'}">${(r.prob100x * 100).toFixed(0)}%</td>
      <td>${(r.winRate * 100).toFixed(0)}%</td>
      <td>${r.ts2x?.toFixed(0) ?? 'N/A'}</td>
      <td>${formatTurnoverHTML(r.avgTurnover)}</td>
    </tr>
  `;
  }).join('\n');
  
  // 生成按波动率分组的矩阵表格
  const generateMatrixTable = (metric: 'meanM' | 'prob2x' | 'prob10x' | 'prob100x' | 'avgTurnover' | 'winRate', title: string, format: (v: number) => string) => {
    const headerCells = volatilities.map(v => `<th>${(v * 100).toFixed(0)}%</th>`).join('');
    const bodyRows = signals.map(signal => {
      const cells = volatilities.map(vol => {
        const row = rows.find(r => r.signal === signal && r.volatility === vol);
        if (!row) return '<td>-</td>';
        const value = row[metric];
        const bg = metric.startsWith('prob') 
          ? (value > 0.5 ? '#d4edda' : value > 0.1 ? '#fff3cd' : '#f8d7da')
          : '';
        return `<td style="background: ${bg}">${format(value)}</td>`;
      }).join('');
      return `<tr><td style="font-weight: bold; text-align: left;">${signal}</td>${cells}</tr>`;
    }).join('\n');
    
    return `
    <div class="matrix-card">
      <h3>${title}</h3>
      <table class="matrix-table">
        <thead>
          <tr><th>策略 \\ 波动率</th>${headerCells}</tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
    `;
  };
  
  const matrixTables = `
    <div class="matrix-grid">
      ${generateMatrixTable('meanM', 'E[M] 平均峰值倍率', v => v >= 1000 ? v.toExponential(1) : v.toFixed(2) + 'x')}
      ${generateMatrixTable('prob2x', 'P(M≥2x) 翻倍概率', v => (v * 100).toFixed(0) + '%')}
      ${generateMatrixTable('prob10x', 'P(M≥10x) 10倍概率', v => (v * 100).toFixed(0) + '%')}
      ${generateMatrixTable('prob100x', 'P(M≥100x) 100倍概率', v => (v * 100).toFixed(0) + '%')}
      ${generateMatrixTable('winRate', '平均胜率', v => (v * 100).toFixed(0) + '%')}
      ${generateMatrixTable('avgTurnover', '平均成交额', v => formatTurnoverHTML(v))}
    </div>
  `;
  
  return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>资本持久战实验对比报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f5f5f5;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 10px; color: #2c3e50; }
    h2 { margin: 30px 0 15px; color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
    h3 { margin: 0 0 10px; color: #2c3e50; font-size: 14px; }
    .subtitle { text-align: center; color: #7f8c8d; margin-bottom: 30px; }
    
    /* 主表格 */
    table {
      width: 100%;
      border-collapse: collapse;
      background: white;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      margin-bottom: 20px;
    }
    th, td { padding: 10px 6px; text-align: center; border-bottom: 1px solid #ddd; font-size: 13px; }
    th { background: #3498db; color: white; font-size: 11px; }
    tr:hover { background: #f5f5f5; }
    td a { color: #3498db; text-decoration: none; font-weight: 500; }
    td a:hover { text-decoration: underline; color: #2980b9; }
    
    /* 矩阵表格网格 */
    .matrix-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin: 20px 0;
    }
    .matrix-card {
      background: white;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .matrix-table {
      margin: 0;
      font-size: 12px;
    }
    .matrix-table th, .matrix-table td {
      padding: 8px 10px;
    }
    .matrix-table th:first-child, .matrix-table td:first-child {
      text-align: left;
      min-width: 120px;
    }
    
    /* 图例 */
    .legend { margin-top: 20px; text-align: center; }
    .legend span { margin: 0 15px; padding: 5px 10px; border-radius: 4px; font-size: 12px; }
    .high { background: #d4edda; }
    .medium { background: #fff3cd; }
    .low { background: #f8d7da; }
    
    /* 响应式 */
    @media (max-width: 900px) {
      .matrix-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>资本持久战实验对比报告</h1>
    <p class="subtitle">信号策略 × 波动率 矩阵分析</p>
    
    <h2>策略 × 波动率 矩阵</h2>
    ${matrixTables}
    
    <div class="legend">
      <span class="high">>50%</span>
      <span class="medium">10-50%</span>
      <span class="low">&lt;10%</span>
    </div>
    
    <h2>完整数据表</h2>
    <table>
      <thead>
        <tr>
          <th>实验名称</th>
          <th>波动率</th>
          <th>信号策略</th>
          <th>E[M]</th>
          <th>Median[M]</th>
          <th>P95[M]</th>
          <th>P(2x)</th>
          <th>P(10x)</th>
          <th>P(100x)</th>
          <th>胜率</th>
          <th>T_S(2x)</th>
          <th>成交额</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
    
    <footer style="text-align: center; color: #7f8c8d; margin-top: 40px;">
      生成时间: ${new Date().toLocaleString('zh-CN')}
    </footer>
  </div>
</body>
</html>
`;
}

// ============================================
// 文件保存
// ============================================

/**
 * 保存报告到文件
 */
export async function saveReport(
  result: ExperimentResult,
  outputDir: string
): Promise<void> {
  // 确保目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const baseName = result.config.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  
  // 保存HTML报告
  const htmlPath = path.join(outputDir, `${baseName}_report.html`);
  fs.writeFileSync(htmlPath, generateHTMLReport(result), 'utf-8');
  
  // 保存JSON数据
  const jsonPath = path.join(outputDir, `${baseName}_data.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    config: result.config,
    mDistribution: result.mDistribution,
    reachProbabilities: Object.fromEntries(result.reachProbabilities),
    avgCandlesToReach: Object.fromEntries(result.avgCandlesToReach),
    avgTradesToReach: Object.fromEntries(result.avgTradesToReach),
    avgWinRate: result.avgWinRate,
    avgMaxConsecutiveWins: result.avgMaxConsecutiveWins,
    elapsedMs: result.elapsedMs,
  }, null, 2), 'utf-8');
  
  console.log(`报告已保存: ${htmlPath}`);
  console.log(`数据已保存: ${jsonPath}`);
}

/**
 * 保存对比报告
 */
export async function saveComparisonReport(
  results: ExperimentResult[],
  outputDir: string
): Promise<void> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const htmlPath = path.join(outputDir, 'comparison_report.html');
  fs.writeFileSync(htmlPath, generateComparisonHTMLReport(results), 'utf-8');
  
  console.log(`对比报告已保存: ${htmlPath}`);
}
