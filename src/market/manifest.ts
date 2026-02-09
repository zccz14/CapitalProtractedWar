/**
 * 市场清单 (Manifest) 类型定义与读写
 *
 * Manifest 是 Phase 0 的输出，描述所有市场组及其序列。
 * 后续 Phase 1-4 只消费 manifest 中的预计算字符串，不再知道 volatility/drift 语义。
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================
// 类型定义
// ============================================

/** 市场组条目 */
export interface MarketGroupEntry {
  /** 组 ID，用于文件路径和缓存键 */
  groupId: string;
  /** 短名称，用于文件名和标题 */
  name: string;
  /** 人类可读描述 */
  description: string;
  /** 展示用的键值对元数据 */
  metadata: Record<string, string>;
  /** K 线数量 */
  candleCount: number;
  /** 蒙特卡洛运行次数 */
  monteCarloRuns: number;
  /** 该组下所有市场序列的 ID 列表 */
  seriesIds: string[];
}

/** 市场清单 */
export interface MarketManifest {
  version: string;
  createdAt: number;
  groups: MarketGroupEntry[];
}

// ============================================
// 读写函数
// ============================================

/**
 * 获取 manifest 文件路径
 */
export function getManifestPath(outputDir: string): string {
  return path.join(outputDir, 'markets', 'manifest.json');
}

/**
 * 写入 manifest
 */
export function writeManifest(outputDir: string, manifest: MarketManifest): void {
  const manifestPath = getManifestPath(outputDir);
  const dir = path.dirname(manifestPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * 读取 manifest
 */
export function readManifest(outputDir: string): MarketManifest {
  const manifestPath = getManifestPath(outputDir);
  const content = fs.readFileSync(manifestPath, 'utf-8');
  return JSON.parse(content);
}
