/**
 * Price Chart - K线走势图 SVG 生成
 */

/**
 * 生成 K 线走势图 SVG
 */
export function generatePriceChartSVG(
  prices: number[],
  width: number = 800,
  height: number = 200,
  title: string = 'K线走势'
): string {
  if (prices.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width / 2}" y="40" text-anchor="middle" fill="#999" font-size="14">无价格数据</text>
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
  const yTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((p) => {
      const price = minPrice + p * priceRange;
      const y = padding.top + chartHeight - p * chartHeight;
      return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${price.toFixed(1)}</text>
    `;
    })
    .join('');

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
