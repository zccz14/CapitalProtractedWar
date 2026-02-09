/**
 * Phase 0: 生成市场序列
 *
 * 唯一遍历 config.markets 模板，展开 volatilities × drifts × seeds 笛卡尔积。
 * 唯一知道 volatility/drift 语义的地方。
 *
 * 支持两种市场来源：
 * - 生成器模板（GBM/GARCH/...）：展开参数笛卡尔积，生成 CSV
 * - CSV 文件引用：硬链接外部 CSV 到输出目录
 *
 * 输出：
 * - {outputDir}/markets/{seriesId}.csv（每个市场序列一个文件）
 * - {outputDir}/markets/manifest.json
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  generateMarketId,
  generateMarketGroupId,
  generateCSVMarketId,
  generateCSVMarketGroupId,
} from '../../cache/index.js';
import { generateMarket } from '../../market/generator.js';
import { writeCandlesCSV, readCandlesCSV, getMarketCSVPath } from '../../market/csv.js';
import {
  writeManifest,
  type MarketManifest,
  type MarketGroupEntry,
} from '../../market/manifest.js';
import type { FullExperimentConfig } from '../../cache/types.js';
import type { MarketConfig, MarketTemplate, CSVMarketSource } from '../../types.js';

export interface Phase0Options {
  config: FullExperimentConfig;
  force: boolean;
  verbose: boolean;
  /** 配置文件所在目录（用于解析 CSV 相对路径） */
  configDir?: string;
}

export interface Phase0Result {
  totalSeries: number;
  cachedSeries: number;
  newSeries: number;
  groupCount: number;
}

/**
 * 处理生成器模板（GBM/GARCH/...）
 */
function processGeneratorTemplate(
  template: MarketTemplate,
  outputDir: string,
  force: boolean,
  verbose: boolean,
  groups: MarketGroupEntry[],
  counters: { totalSeries: number; cachedSeries: number; newSeries: number }
): void {
  for (const volatility of template.volatilities) {
    for (const drift of template.drifts) {
      const groupId = generateMarketGroupId({
        type: template.type,
        volatility,
        drift,
        candleCount: template.candleCount,
      });

      const name = `vol${(volatility * 100).toFixed(0)}_drift${((drift ?? 0) * 100).toFixed(0)}`;
      const description = `${template.type.toUpperCase()} | σ=${(volatility * 100).toFixed(1)}% | μ=${((drift ?? 0) * 100).toFixed(1)}%`;
      const metadata: Record<string, string> = {
        市场类型: template.type.toUpperCase(),
        波动率: `${(volatility * 100).toFixed(1)}%`,
        漂移率: `${((drift ?? 0) * 100).toFixed(1)}%`,
      };

      const seriesIds: string[] = [];

      for (let seedOffset = 0; seedOffset < template.monteCarloRuns; seedOffset++) {
        const marketConfig: MarketConfig = {
          type: template.type,
          volatility,
          drift,
          candleCount: template.candleCount,
          seed: template.baseSeed + seedOffset,
        };
        const seriesId = generateMarketId(marketConfig);
        seriesIds.push(seriesId);

        const csvPath = getMarketCSVPath(outputDir, seriesId);
        counters.totalSeries++;

        // 缓存：CSV 文件存在即跳过（--force 时重新生成）
        if (!force && fs.existsSync(csvPath)) {
          counters.cachedSeries++;
          if (verbose) {
            console.log(`  缓存命中: ${seriesId}`);
          }
          continue;
        }

        // 生成市场序列
        const candles = generateMarket(marketConfig);
        writeCandlesCSV(csvPath, candles);
        counters.newSeries++;

        if (verbose) {
          console.log(`  生成: ${seriesId}`);
        }
      }

      groups.push({
        groupId,
        name,
        description,
        metadata,
        candleCount: template.candleCount,
        monteCarloRuns: template.monteCarloRuns,
        seriesIds,
      });

      if (!verbose) {
        console.log(
          `  市场组 ${groupId}: ${counters.newSeries} 新生成, ${counters.cachedSeries} 缓存命中`
        );
      }
    }
  }
}

/**
 * 处理 CSV 文件引用
 *
 * 将外部 CSV 硬链接到输出目录，跨文件系统时回退为拷贝。
 */
function processCSVSource(
  source: CSVMarketSource,
  outputDir: string,
  force: boolean,
  verbose: boolean,
  configDir: string,
  groups: MarketGroupEntry[],
  counters: { totalSeries: number; cachedSeries: number; newSeries: number }
): void {
  // 解析 CSV 文件的绝对路径
  const resolvedPath = path.resolve(configDir, source.file);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`CSV 市场文件不存在: ${resolvedPath} (配置: ${source.file})`);
  }

  const seriesId = generateCSVMarketId(source.name, resolvedPath);
  const groupId = generateCSVMarketGroupId(source.name);
  const csvPath = getMarketCSVPath(outputDir, seriesId);

  counters.totalSeries++;

  // 确保输出目录存在
  const dir = path.dirname(csvPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 缓存：目标文件存在即跳过（--force 时重新链接）
  if (!force && fs.existsSync(csvPath)) {
    counters.cachedSeries++;
    if (verbose) {
      console.log(`  缓存命中: ${seriesId} (CSV: ${source.name})`);
    }
  } else {
    // 先删除旧文件（如果 force）
    if (fs.existsSync(csvPath)) {
      fs.unlinkSync(csvPath);
    }

    // 尝试硬链接，跨文件系统时回退为拷贝
    try {
      fs.linkSync(resolvedPath, csvPath);
    } catch {
      fs.copyFileSync(resolvedPath, csvPath);
    }

    counters.newSeries++;

    if (verbose) {
      console.log(`  链接: ${seriesId} <- ${source.file}`);
    }
  }

  // 读取 CSV 获取 K 线数量
  const candles = readCandlesCSV(csvPath);
  const candleCount = candles.length;

  const description = source.description ?? `CSV | ${source.name}`;
  const metadata: Record<string, string> = {
    市场类型: 'CSV',
    数据源: source.file,
    K线数量: String(candleCount),
  };

  groups.push({
    groupId,
    name: source.name,
    description,
    metadata,
    candleCount,
    monteCarloRuns: 1,
    seriesIds: [seriesId],
  });

  if (!verbose) {
    console.log(`  CSV 市场 ${source.name}: ${seriesId}`);
  }
}

/**
 * 执行 Phase 0: 生成市场序列
 */
export async function runPhase0(options: Phase0Options): Promise<Phase0Result> {
  const { config, force, verbose, configDir = process.cwd() } = options;
  const { outputDir } = config;

  const counters = { totalSeries: 0, cachedSeries: 0, newSeries: 0 };
  const groups: MarketGroupEntry[] = [];

  console.log('Phase 0: 生成市场序列 (CSV + manifest)');

  for (const entry of config.markets) {
    if (entry.type === 'csv') {
      processCSVSource(entry, outputDir, force, verbose, configDir, groups, counters);
    } else {
      processGeneratorTemplate(
        entry as MarketTemplate,
        outputDir,
        force,
        verbose,
        groups,
        counters
      );
    }
  }

  // manifest 每次重新生成（因为可能有新模板加入）
  const manifest: MarketManifest = {
    version: '2.0.0',
    createdAt: Date.now(),
    groups,
  };
  writeManifest(outputDir, manifest);

  console.log(
    `Phase 0 完成: ${counters.newSeries} 新生成, ${counters.cachedSeries} 缓存命中, 共 ${counters.totalSeries} 个序列, ${groups.length} 个组`
  );

  return {
    totalSeries: counters.totalSeries,
    cachedSeries: counters.cachedSeries,
    newSeries: counters.newSeries,
    groupCount: groups.length,
  };
}
