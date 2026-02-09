/**
 * 缓存工具函数
 *
 * 提供 ID 生成、缓存验证、文件读写等功能
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ENGINE_VERSION } from './version.js';
import type { RunResultFile, AggregatedResultFile, RunStats, AggregatedResult } from './types.js';
import type { MarketConfig, SignalStrategyConfig, BettingStrategyConfig } from '../types.js';

// ============================================
// ID 生成函数
// ============================================

/**
 * 生成市场 ID（包含种子，唯一确定一个市场序列）
 */
export function generateMarketId(config: MarketConfig): string {
  const vol = (config.volatility * 100).toFixed(0);
  const drift = ((config.drift ?? 0) * 100).toFixed(0);
  const seed = config.seed ?? 0;
  return `${config.type}_vol${vol}_drift${drift}_n${config.candleCount}_s${seed}`;
}

/**
 * 生成市场组 ID（不含种子，用于聚合）
 */
export function generateMarketGroupId(config: MarketConfig): string {
  const vol = (config.volatility * 100).toFixed(0);
  const drift = ((config.drift ?? 0) * 100).toFixed(0);
  return `${config.type}_vol${vol}_drift${drift}_n${config.candleCount}`;
}

/**
 * 生成 CSV 市场序列 ID
 *
 * 基于名称 + 文件内容哈希，确保同一文件内容产生稳定 ID
 */
export function generateCSVMarketId(name: string, filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `csv_${name}_h${hash}`;
}

/**
 * 生成 CSV 市场组 ID
 */
export function generateCSVMarketGroupId(name: string): string {
  return `csv_${name}`;
}

/**
 * 从市场 ID 解析出配置
 */
export function parseMarketId(marketId: string): MarketConfig {
  // 格式: {type}_vol{volatility}_drift{drift}_n{candleCount}_s{seed}
  const match = marketId.match(/^(\w+)_vol(\d+)_drift(-?\d+)_n(\d+)_s(\d+)$/);
  if (!match) {
    throw new Error(`Invalid market ID: ${marketId}`);
  }

  const [, type, vol, drift, candleCount, seed] = match;
  return {
    type: type as MarketConfig['type'],
    volatility: parseInt(vol) / 100,
    drift: parseInt(drift) / 100,
    candleCount: parseInt(candleCount),
    seed: parseInt(seed),
  };
}

/**
 * 生成信号策略 ID
 */
export function generateSignalId(config: SignalStrategyConfig): string {
  const params = config.params ?? {};
  const paramStr = Object.entries(params)
    .filter(([k]) => k !== 'seed') // 排除种子
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}${v}`)
    .join('_');
  return paramStr ? `${config.type}_${paramStr}` : config.type;
}

/**
 * 生成投注策略 ID
 */
export function generateBettingId(config: BettingStrategyConfig): string {
  const targets = config.takeProfitTargets;
  const cost = ((config.tradingCostRate ?? 0) * 10000).toFixed(0);
  return `tp${targets[0]}-${targets[targets.length - 1]}_cost${cost}bp`;
}

// ============================================
// 配置哈希
// ============================================

/**
 * 生成配置哈希
 */
export function generateConfigHash(
  seriesId: string,
  signal: SignalStrategyConfig,
  betting: BettingStrategyConfig
): string {
  const content = JSON.stringify(
    { seriesId, signal, betting },
    Object.keys({ seriesId, signal, betting }).sort()
  );
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ============================================
// 缓存验证
// ============================================

/**
 * 检查运行结果缓存是否有效
 */
export function isRunCacheValid(
  filePath: string,
  expectedHash: string,
  force: boolean = false
): boolean {
  if (force) return false;
  if (!fs.existsSync(filePath)) return false;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const cached: RunResultFile = JSON.parse(content);

    // 检查配置哈希
    if (cached.configHash !== expectedHash) {
      return false;
    }

    // 检查引擎版本
    if (cached.version !== ENGINE_VERSION) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * 检查聚合结果缓存是否有效
 *
 * 聚合结果依赖所有源文件，如果任何源文件更新，聚合结果需要重新计算
 */
export function isAggregationCacheValid(
  aggFilePath: string,
  sourceDir: string,
  force: boolean = false
): boolean {
  if (force) return false;
  if (!fs.existsSync(aggFilePath)) return false;

  try {
    const aggStat = fs.statSync(aggFilePath);
    const aggMtime = aggStat.mtimeMs;

    // 检查所有源文件的修改时间
    if (fs.existsSync(sourceDir)) {
      const files = fs.readdirSync(sourceDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(sourceDir, file);
          const fileStat = fs.statSync(filePath);
          if (fileStat.mtimeMs > aggMtime) {
            return false; // 源文件比聚合文件新
          }
        }
      }
    }

    // 检查引擎版本
    const content = fs.readFileSync(aggFilePath, 'utf-8');
    const cached: AggregatedResultFile = JSON.parse(content);
    if (cached.version !== ENGINE_VERSION) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

// ============================================
// 文件读写
// ============================================

/**
 * 确保目录存在
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 写入运行结果文件
 */
export function writeRunResult(
  filePath: string,
  config: {
    seriesId: string;
    signal: SignalStrategyConfig;
    betting: BettingStrategyConfig;
  },
  result: RunStats
): void {
  const configHash = generateConfigHash(config.seriesId, config.signal, config.betting);

  const file: RunResultFile = {
    version: ENGINE_VERSION,
    configHash,
    createdAt: Date.now(),
    config,
    result,
  };

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

/**
 * 读取运行结果文件
 */
export function readRunResult(filePath: string): RunResultFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 写入聚合结果文件
 */
export function writeAggregatedResult(filePath: string, result: AggregatedResult): void {
  const file: AggregatedResultFile = {
    version: ENGINE_VERSION,
    createdAt: Date.now(),
    result,
  };

  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(file, null, 2), 'utf-8');
}

/**
 * 读取聚合结果文件
 */
export function readAggregatedResult(filePath: string): AggregatedResultFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

/**
 * 获取运行结果文件路径
 */
export function getRunResultPath(
  outputDir: string,
  marketId: string,
  signalId: string,
  bettingId: string
): string {
  return path.join(outputDir, 'runs', marketId, signalId, `${bettingId}.json`);
}

/**
 * 获取聚合结果文件路径
 */
export function getAggregatedResultPath(
  outputDir: string,
  marketGroupId: string,
  signalId: string,
  bettingId: string
): string {
  return path.join(outputDir, 'aggregated', marketGroupId, signalId, `${bettingId}.json`);
}

/**
 * 获取样本文件路径
 */
export function getSamplePath(
  outputDir: string,
  marketGroupId: string,
  signalId: string,
  bettingId: string,
  sampleType: 'best' | 'median' | 'worst'
): string {
  return path.join(outputDir, 'samples', marketGroupId, signalId, bettingId, `${sampleType}.json`);
}

// ============================================
// 统计工具函数
// ============================================

/**
 * 计算数组的统计量
 */
export function calculateStats(values: number[]): {
  mean: number | null;
  median: number | null;
  std: number | null;
  min: number | null;
  max: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p95: number | null;
} {
  if (values.length === 0) {
    return {
      mean: null,
      median: null,
      std: null,
      min: null,
      max: null,
      p25: null,
      p50: null,
      p75: null,
      p95: null,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const percentile = (p: number): number => {
    const idx = (p / 100) * (n - 1);
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (upper - idx) + sorted[upper] * (idx - lower);
  };

  return {
    mean,
    median: percentile(50),
    std,
    min: sorted[0],
    max: sorted[n - 1],
    p25: percentile(25),
    p50: percentile(50),
    p75: percentile(75),
    p95: percentile(95),
  };
}

// 导出类型
export type { RunResultFile, AggregatedResultFile, RunStats, AggregatedResult } from './types.js';
export type { ExperimentOptions, FullExperimentConfig } from './types.js';
