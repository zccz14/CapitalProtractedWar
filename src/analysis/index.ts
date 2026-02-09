/**
 * Analysis Module - 分析模块（新范式）
 *
 * 功能：
 * 1. 格式化实验结果
 * 2. 生成控制台报告
 * 3. 导出 JSON/CSV 数据
 *
 * 核心指标变化：
 * - 不再关注 E[M]、P(M >= k)
 * - 核心关注：各 M_T 下止盈事件的平均时间间隔
 */

import type { ExperimentResult } from '../types.js';

// ============================================
// 报告格式化
// ============================================

export interface FormattedReport {
  title: string;
  summary: string;
  intervalMatrix: string;
  raw: ExperimentResult;
}

/**
 * 格式化数字（带千分位）
 */
function formatNumber(value: number | null, decimals: number = 2): string {
  if (value === null) return 'N/A';
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(decimals);
}

/**
 * 格式化单个实验结果为可读报告
 */
export function formatReport(result: ExperimentResult): FormattedReport {
  const { config } = result;

  // 标题 - 使用 description 或 name
  const marketDesc = config.description ?? config.name;
  const signalNames = config.signals.map((s) => s.type).join(', ');
  const title = `实验: ${config.name}
市场: ${marketDesc}
信号: ${signalNames} | K线数: ${config.candleCount} | MC次数: ${config.monteCarloRuns}`;

  // 摘要
  const summary = generateSummary(result);

  // 间隔矩阵
  const intervalMatrix = generateIntervalMatrix(result);

  return {
    title,
    summary,
    intervalMatrix,
    raw: result,
  };
}

/**
 * 生成摘要
 */
function generateSummary(result: ExperimentResult): string {
  const lines: string[] = ['\n====== 摘要 ======'];

  for (const signalResult of result.signalResults) {
    lines.push(`\n[${signalResult.signalType}]`);
    lines.push(`  平均胜率: ${(signalResult.avgWinRate * 100).toFixed(1)}%`);
    lines.push(`  平均交易数: ${signalResult.avgTradeCount.toFixed(1)}`);

    // 显示几个关键 M_T 的统计
    const keyTargets = [2, 8, 64, 512];
    for (const target of keyTargets) {
      const stats = signalResult.takeProfitStats.get(target);
      if (stats) {
        lines.push(
          `  M_T=${target}: 平均间隔=${formatNumber(stats.intervalStats.mean)} | 中位数=${formatNumber(stats.intervalStats.median)} | 频率=${(stats.avgFrequency * 1000).toFixed(4)}‰`
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * 生成间隔矩阵
 */
function generateIntervalMatrix(result: ExperimentResult): string {
  const lines: string[] = ['\n====== 止盈间隔矩阵 ======'];

  // 收集所有 M_T 值
  const allTargets = new Set<number>();
  for (const signal of result.signalResults) {
    for (const [target] of signal.takeProfitStats) {
      allTargets.add(target);
    }
  }
  const targets = Array.from(allTargets).sort((a, b) => a - b);

  // 表头
  const header = ['M_T', ...result.signalResults.map((s) => s.signalType)];
  lines.push(header.join('\t'));

  // 数据行
  for (const target of targets) {
    const row = [`${target}x`];
    for (const signal of result.signalResults) {
      const stats = signal.takeProfitStats.get(target);
      if (stats && stats.intervalStats.mean !== null) {
        row.push(formatNumber(stats.intervalStats.mean));
      } else {
        row.push('N/A');
      }
    }
    lines.push(row.join('\t'));
  }

  return lines.join('\n');
}

/**
 * 打印格式化报告到控制台
 */
export function printReport(result: ExperimentResult): void {
  const report = formatReport(result);
  console.log(`\n${'='.repeat(70)}`);
  console.log(report.title);
  console.log('='.repeat(70));
  console.log(report.summary);
  console.log(report.intervalMatrix);
  console.log(`${'='.repeat(70)}\n`);
}

/**
 * 打印多个实验结果的对比报告
 */
export function printComparisonReport(results: ExperimentResult[]): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log('实验对比报告');
  console.log('='.repeat(70));

  // 收集所有 M_T 值
  const allTargets = new Set<number>();
  for (const result of results) {
    for (const signal of result.signalResults) {
      for (const [target] of signal.takeProfitStats) {
        allTargets.add(target);
      }
    }
  }
  const targets = Array.from(allTargets).sort((a, b) => a - b);

  // 对比表
  for (const target of targets.slice(0, 5)) {
    console.log(`\n--- M_T = ${target}x ---`);
    for (const result of results) {
      const desc = result.config.description ?? result.config.name;
      for (const signal of result.signalResults) {
        const stats = signal.takeProfitStats.get(target);
        if (stats) {
          console.log(
            `  ${desc} | ${signal.signalType}: 平均间隔=${formatNumber(stats.intervalStats.mean)} | 频率=${(stats.avgFrequency * 1000).toFixed(4)}‰`
          );
        }
      }
    }
  }

  console.log(`\n${'='.repeat(70)}\n`);
}

// ============================================
// JSON/CSV 导出
// ============================================

/**
 * 导出为JSON
 */
export function exportToJSON(result: ExperimentResult): string {
  // 转换 Map 为普通对象
  const signalResults = result.signalResults.map((sr) => ({
    signalType: sr.signalType,
    avgWinRate: sr.avgWinRate,
    avgTradeCount: sr.avgTradeCount,
    takeProfitStats: Object.fromEntries(
      Array.from(sr.takeProfitStats.entries()).map(([k, v]) => [
        k,
        {
          ...v,
          // 不包含原始事件数据，太大
          events: undefined,
        },
      ])
    ),
  }));

  return JSON.stringify(
    {
      config: {
        name: result.config.name,
        description: result.config.description,
        metadata: result.config.metadata,
        candleCount: result.config.candleCount,
        signals: result.config.signals,
        betting: result.config.betting,
        monteCarloRuns: result.config.monteCarloRuns,
      },
      signalResults,
      monteCarloRuns: result.monteCarloRuns,
      candlesPerRun: result.candlesPerRun,
      elapsedMs: result.elapsedMs,
    },
    null,
    2
  );
}

/**
 * 导出为CSV
 */
export function exportToCSV(result: ExperimentResult): string {
  const lines: string[] = [];

  // 表头
  const headers = [
    'signal_type',
    'target_multiplier',
    'avg_interval',
    'median_interval',
    'std_interval',
    'min_interval',
    'max_interval',
    'avg_rounds_per_run',
    'avg_frequency',
    'total_round_count',
  ];
  lines.push(headers.join(','));

  // 数据行
  for (const signal of result.signalResults) {
    for (const [target, stats] of signal.takeProfitStats) {
      const row = [
        signal.signalType,
        target,
        stats.intervalStats.mean ?? '',
        stats.intervalStats.median ?? '',
        stats.intervalStats.std ?? '',
        stats.intervalStats.min ?? '',
        stats.intervalStats.max ?? '',
        stats.avgRoundsPerRun,
        stats.avgFrequency,
        stats.totalRoundCount,
      ];
      lines.push(row.join(','));
    }
  }

  return lines.join('\n');
}

// ============================================
// 统计工具
// ============================================

/**
 * 计算直方图数据
 */
export function calculateHistogram(
  values: number[],
  bins: number = 20
): { binEdges: number[]; counts: number[] } {
  if (values.length === 0) {
    return { binEdges: [], counts: [] };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / bins || 1;

  const binEdges: number[] = [];
  const counts: number[] = new Array(bins).fill(0);

  for (let i = 0; i <= bins; i++) {
    binEdges.push(min + i * binWidth);
  }

  for (const value of values) {
    const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
    counts[binIndex]++;
  }

  return { binEdges, counts };
}

/**
 * 计算累积分布函数 (CDF)
 */
export function calculateCDF(values: number[]): { x: number[]; y: number[] } {
  if (values.length === 0) {
    return { x: [], y: [] };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  const x: number[] = [];
  const y: number[] = [];

  for (let i = 0; i < n; i++) {
    x.push(sorted[i]);
    y.push((i + 1) / n);
  }

  return { x, y };
}
