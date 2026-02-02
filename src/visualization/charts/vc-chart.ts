/**
 * VC Chart - 风险资金 VC 曲线图 SVG 生成（新风控框架）
 */

/**
 * 生成风险资金 VC 曲线图 SVG
 */
export function generateVCChartSVG(
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
      <text x="${width / 2}" y="40" text-anchor="middle" fill="#999" font-size="14">无数据</text>
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
  const allValues = [
    ...sampledVC,
    ...sampledUnrealizedPnL,
    ...sampledRiskLine,
    ...(sampledPnL ?? []),
    targetMultiplier,
    0,
  ];
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
  const unrealizedPnLPoints = sampledUnrealizedPnL.map(
    (v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`
  );
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
    .filter((idx) => idx < vcCurve.length)
    .map((idx) => {
      const sampledIdx = Math.floor(idx / sampleRate);
      const x = toX(sampledIdx);
      const vc = sampledVC[sampledIdx] ?? 0;
      const y = toY(vc);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#27ae60" stroke="white" stroke-width="1.5"/>`;
    })
    .join('\n');

  // 止损标记点（红色叉号）
  const slMarkersSVG = stopLossMarkers
    .filter((idx) => idx < vcCurve.length)
    .map((idx) => {
      const sampledIdx = Math.floor(idx / sampleRate);
      const x = toX(sampledIdx);
      const vc = sampledVC[sampledIdx] ?? 0;
      const y = toY(vc);
      const size = 5;
      return `
        <line x1="${x - size}" y1="${y - size}" x2="${x + size}" y2="${y + size}" stroke="#e74c3c" stroke-width="2.5"/>
        <line x1="${x - size}" y1="${y + size}" x2="${x + size}" y2="${y - size}" stroke="#e74c3c" stroke-width="2.5"/>
      `;
    })
    .join('\n');

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
  const yTickValues = [minY, 0, targetMultiplier / 2, targetMultiplier, maxY].filter(
    (v) => v >= minY && v <= maxY
  );
  const uniqueYTicks = [...new Set(yTickValues.map((v) => v.toFixed(2)))].map((s) => parseFloat(s));
  const yTicks = uniqueYTicks
    .map((val) => {
      const y = toY(val);
      return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 8}" y="${y + 4}" text-anchor="end" font-size="9" fill="#666">${val.toFixed(2)}</text>
    `;
    })
    .join('');

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
