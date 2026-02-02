/**
 * Histogram Chart - 直方图 SVG 生成
 */

import { calculateHistogram } from '../../analysis/index.js';
import { formatNumber } from '../utils.js';

/**
 * 生成止盈间隔直方图 SVG
 */
export function generateIntervalHistogramSVG(
  intervals: number[],
  targetMultiplier: number,
  signalType: string,
  width: number = 600,
  height: number = 300
): string {
  if (intervals.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width / 2}" y="40" text-anchor="middle" fill="#999" font-size="14">M_T=${targetMultiplier}x 无止盈事件数据</text>
    </svg>`;
  }

  const padding = { top: 40, right: 30, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const { binEdges, counts } = calculateHistogram(intervals, 25);
  const maxCount = Math.max(...counts);

  const barWidth = chartWidth / counts.length;
  const bars = counts
    .map((count, i) => {
      const x = padding.left + i * barWidth;
      const barHeight = maxCount > 0 ? (count / maxCount) * chartHeight : 0;
      const y = padding.top + chartHeight - barHeight;
      return `<rect x="${x}" y="${y}" width="${Math.max(barWidth - 1, 1)}" height="${barHeight}" fill="#4a90d9" opacity="0.85"/>`;
    })
    .join('\n');

  const xTicks = [0, 0.5, 1]
    .map((p) => {
      const index = Math.floor(p * (binEdges.length - 1));
      const value = binEdges[index];
      const x = padding.left + p * chartWidth;
      return `<text x="${x}" y="${height - 15}" text-anchor="middle" font-size="11" fill="#666">${formatNumber(value)}</text>`;
    })
    .join('\n');

  const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const meanX =
    padding.left +
    ((mean - binEdges[0]) / (binEdges[binEdges.length - 1] - binEdges[0] || 1)) * chartWidth;

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
