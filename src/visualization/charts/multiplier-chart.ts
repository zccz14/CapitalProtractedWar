/**
 * Multiplier Chart - 资金曲线图 SVG 生成（含风控线）- 旧版保留
 */

/**
 * 生成资金曲线图 SVG（含风控线）
 */

export function generateMultiplierChartSVG(
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
      <text x="${width / 2}" y="40" text-anchor="middle" fill="#999" font-size="14">无资金数据</text>
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
    .filter((idx) => idx < multipliers.length)
    .map((idx) => {
      const sampledIdx = Math.floor(idx / sampleRate);
      const x = padding.left + (sampledIdx / (sampledMultipliers.length - 1)) * chartWidth;
      return `<circle cx="${x.toFixed(1)}" cy="${targetY.toFixed(1)}" r="4" fill="#27ae60" stroke="white" stroke-width="1"/>`;
    })
    .join('\n');

  // 止损标记点（红色叉号）
  let slMarkers = '';
  if (stopLossMarkers && stopLossMarkers.length > 0) {
    slMarkers = stopLossMarkers
      .filter((idx) => idx < multipliers.length)
      .map((idx) => {
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
      })
      .join('\n');
  }

  // 观察期区域（灰色半透明）
  let observationArea = '';
  if (observationEndIndex && observationEndIndex > 0) {
    const obsEndX =
      padding.left +
      (Math.floor(observationEndIndex / sampleRate) / (sampledMultipliers.length - 1)) * chartWidth;
    observationArea = `
      <rect x="${padding.left}" y="${padding.top}" 
            width="${obsEndX - padding.left}" height="${chartHeight}" 
            fill="rgba(128, 128, 128, 0.15)"/>
      <text x="${(padding.left + obsEndX) / 2}" y="${padding.top + 12}" 
            text-anchor="middle" font-size="9" fill="#888">观察期</text>
    `;
  }

  // Y轴刻度
  const yValues = [minM < 0 ? minM : 0, 1, targetMultiplier / 2, targetMultiplier, maxM].filter(
    (v) => v >= minM && v <= maxM
  );
  const yTicks = [...new Set(yValues)]
    .map((val) => {
      const y = padding.top + chartHeight - ((val - minM) / mRange) * chartHeight;
      return `
      <line x1="${padding.left - 5}" y1="${y}" x2="${padding.left}" y2="${y}" stroke="#ccc" stroke-width="1"/>
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="10" fill="#666">${val.toFixed(1)}x</text>
    `;
    })
    .join('');

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
