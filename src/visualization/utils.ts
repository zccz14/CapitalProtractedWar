/**
 * Visualization Module Utils - 工具函数
 */

/**
 * 格式化数字显示
 */
export function formatNumber(value: number | null, decimals: number = 0): string {
  if (value === null) return 'N/A';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(decimals);
}

/**
 * 获取热力图颜色
 */
export function getHeatmapColor(value: number, min: number, max: number): string {
  const normalized = Math.min(1, Math.max(0, (value - min) / (max - min)));
  const hue = (1 - normalized) * 120;
  return `hsl(${hue}, 70%, 50%)`;
}

/**
 * 清理文件名，移除非法字符
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
