/**
 * Heatmap Chart - 热力图 SVG 生成
 */

import type { ExperimentResult } from '../../types.js';
import { formatNumber, getHeatmapColor } from '../utils.js';

/**
 * 生成平均止盈间隔热力图 SVG
 */
export function generateHeatmapSVG(result: ExperimentResult): string {
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
      <text x="${width / 2}" y="50" text-anchor="middle" fill="#999">无有效数据</text>
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
          <text x="${x + cellWidth / 2}" y="${y + cellHeight / 2 + 4}" text-anchor="middle" font-size="11" fill="white" font-weight="500">${formatNumber(value)}</text>
        `);
      } else {
        cells.push(`
          <rect x="${x}" y="${y}" width="${cellWidth - 2}" height="${cellHeight - 2}" fill="#e9ecef" rx="4"/>
          <text x="${x + cellWidth / 2}" y="${y + cellHeight / 2 + 4}" text-anchor="middle" font-size="11" fill="#adb5bd">-</text>
        `);
      }
    });
  });

  const rowLabels = signals
    .map((signal, i) => {
      const y = labelHeight + i * cellHeight + cellHeight / 2 + 4;
      return `<text x="${labelWidth - 10}" y="${y}" text-anchor="end" font-size="12" fill="#495057">${signal.signalType}</text>`;
    })
    .join('\n');

  const colLabels = targets
    .map((target, i) => {
      const x = labelWidth + i * cellWidth + cellWidth / 2;
      return `<text x="${x}" y="${labelHeight - 10}" text-anchor="middle" font-size="10" fill="#495057">${target}x</text>`;
    })
    .join('\n');

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
