/**
 * Sample Charts - 样本报告图表生成
 */

import type { TradeRecord } from '../../types.js';

/**
 * 生成价格与信号图 SVG（带交易标记）
 */
export function generatePriceSignalChartSVG(
  prices: number[],
  signals: number[],
  trades: TradeRecord[],
  width: number = 800,
  height: number = 280
): string {
  if (prices.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width / 2}" y="40" text-anchor="middle" fill="#999" font-size="14">无价格数据</text>
    </svg>`;
  }

  const padding = { top: 30, right: 40, bottom: 50, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const sampleRate = Math.max(1, Math.floor(prices.length / 800));
  const sampledPrices = prices.filter((_, i) => i % sampleRate === 0);

  const minPrice = Math.min(...sampledPrices);
  const maxPrice = Math.max(...sampledPrices);
  const priceRange = maxPrice - minPrice || 1;

  const pricePoints = sampledPrices.map((price, i) => {
    const x = padding.left + (i / (sampledPrices.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const pricePathD = `M ${pricePoints.join(' L ')}`;

  const tradeMarkers = trades
    .map((trade) => {
      const entryIdx = Math.floor(trade.entryIndex / sampleRate);
      const entryX = padding.left + (entryIdx / (sampledPrices.length - 1)) * chartWidth;
      const entryY =
        padding.top + chartHeight - ((trade.entryPrice - minPrice) / priceRange) * chartHeight;

      const exitIdx = Math.floor(trade.exitIndex / sampleRate);
      const exitX = padding.left + (exitIdx / (sampledPrices.length - 1)) * chartWidth;
      const exitY =
        padding.top + chartHeight - ((trade.exitPrice - minPrice) / priceRange) * chartHeight;

      const isLong = trade.direction === 1;
      const arrowColor = isLong ? '#27ae60' : '#e74c3c';

      const arrowPath = isLong
        ? `M ${entryX} ${entryY + 15} L ${entryX} ${entryY} L ${entryX - 5} ${entryY + 8} M ${entryX} ${entryY} L ${entryX + 5} ${entryY + 8}`
        : `M ${entryX} ${entryY - 15} L ${entryX} ${entryY} L ${entryX - 5} ${entryY - 8} M ${entryX} ${entryY} L ${entryX + 5} ${entryY - 8}`;

      const crossSize = 4;
      const crossPath = `M ${exitX - crossSize} ${exitY - crossSize} L ${exitX + crossSize} ${exitY + crossSize} M ${exitX - crossSize} ${exitY + crossSize} L ${exitX + crossSize} ${exitY - crossSize}`;

      return `
      <path d="${arrowPath}" stroke="${arrowColor}" stroke-width="2" fill="none"/>
      <path d="${crossPath}" stroke="#888" stroke-width="2"/>
    `;
    })
    .join('');

  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((p) => {
      const price = minPrice + p * priceRange;
      const y = padding.top + chartHeight - p * chartHeight;
      return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${price.toFixed(2)}</text>
    `;
    })
    .join('');

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
  
  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#eee" stroke-width="1"/>
  
  ${yTicks}
  
  <path d="${pricePathD} L ${width - padding.right},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z" fill="url(#priceGradDetail)"/>
  <path d="${pricePathD}" fill="none" stroke="#3498db" stroke-width="1.5"/>
  
  ${tradeMarkers}
  
  <text x="${padding.left}" y="${height - 25}" font-size="9" fill="#666">0</text>
  <text x="${width - padding.right}" y="${height - 25}" text-anchor="end" font-size="9" fill="#666">${prices.length}</text>
  
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
