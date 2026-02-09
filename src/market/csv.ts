/**
 * 市场序列 CSV 读写
 *
 * 格式：
 * time,open,high,low,close
 * 2025-01-01T00:00:00.000Z,100,101.5023847,99.2183745,100.8294756
 *
 * - time: RFC 3339 with timezone (UTC Z 后缀)
 * - 价格字段: String(number) 完整精度
 * - 无 volume 列
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Candle } from '../types.js';

const CSV_HEADER = 'time,open,high,low,close';

/**
 * 将 Candle[] 写入 CSV 文件
 */
export function writeCandlesCSV(filePath: string, candles: Candle[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines = [CSV_HEADER];
  for (const c of candles) {
    const time = new Date(c.time).toISOString();
    lines.push(`${time},${c.open},${c.high},${c.low},${c.close}`);
  }

  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf-8');
}

/**
 * 从 CSV 文件读取 Candle[]
 */
export function readCandlesCSV(filePath: string): Candle[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');

  if (lines.length < 2) {
    return [];
  }

  // 跳过 header
  const candles: Candle[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(',');
    if (parts.length < 5) continue;

    candles.push({
      time: new Date(parts[0]).getTime(),
      open: Number(parts[1]),
      high: Number(parts[2]),
      low: Number(parts[3]),
      close: Number(parts[4]),
    });
  }

  return candles;
}

/**
 * 获取市场序列 CSV 文件路径
 */
export function getMarketCSVPath(outputDir: string, seriesId: string): string {
  return path.join(outputDir, 'markets', `${seriesId}.csv`);
}
