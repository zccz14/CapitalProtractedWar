/**
 * Equity Chart - 净值曲线图 SVG 生成
 */

/**
 * 生成净值曲线图 SVG
 *
 * 特点：
 * - 初始值为 0（累计盈亏）
 * - y=0 基线用灰色虚线标记
 * - 正值区域绿色填充，负值区域红色填充
 * - 曲线颜色根据最终值正负变化
 */
export function generateEquityChartSVG(
  equities: number[],
  width: number = 800,
  height: number = 200,
  title: string = '净值曲线',
  targetMultiplier?: number
): string {
  if (equities.length === 0) {
    return `<svg width="${width}" height="80">
      <text x="${width / 2}" y="40" text-anchor="middle" fill="#999" font-size="14">无净值数据</text>
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
  const pathD = `M ${points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`;

  // 创建正值区域和负值区域的填充路径
  // 使用剪切路径来分别填充正负区域
  const fillPathD = `${pathD} L ${width - padding.right},${zeroY} L ${padding.left},${zeroY} Z`;

  // 最终值决定曲线颜色
  const finalEquity = equities[equities.length - 1] ?? 0;
  const curveColor = finalEquity >= 0 ? '#27ae60' : '#e74c3c';

  // Y轴刻度
  const yValues = [minE, 0, maxE].filter((v, i, arr) => arr.indexOf(v) === i);
  const yTicks = yValues
    .map((val) => {
      const y = padding.top + chartHeight - ((val - minE) / eRange) * chartHeight;
      const isZero = val === 0;
      return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="${isZero ? '#666' : '#ccc'}" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="${isZero ? '#666' : '#999'}">${val.toFixed(2)}</text>
    `;
    })
    .join('');

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
