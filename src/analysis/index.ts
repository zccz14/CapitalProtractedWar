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

import { VOLATILITY_SCENARIOS, type ExperimentResult } from '../types.js';

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

  // 标题
  const volatilityDesc =
    VOLATILITY_SCENARIOS[config.market.volatility] ||
    `σ=${(config.market.volatility * 100).toFixed(1)}%`;
  const signalNames = config.signals.map((s) => s.type).join(', ');
  const title = `实验: ${config.name}
市场: ${config.market.type.toUpperCase()} | ${volatilityDesc}
信号: ${signalNames} | K线数: ${config.market.candleCount} | MC次数: ${config.monteCarloRuns}`;

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
        const avgInt = stats.intervalStats.mean;
        const rounds = stats.avgRoundsPerRun;
        lines.push(
          `  M_T=${target}: 平均间隔=${formatNumber(avgInt)}K线, 平均轮数=${rounds.toFixed(2)}`
        );
      }
    }
  }

  lines.push(`\n运行时间: ${result.elapsedMs}ms`);

  return lines.join('\n');
}

/**
 * 生成止盈间隔矩阵
 */
function generateIntervalMatrix(result: ExperimentResult): string {
  const targets = result.config.betting.takeProfitTargets;
  const signals = result.signalResults;

  // 表头
  const header = ['M_T', ...signals.map((s) => s.signalType)];
  const separator = header.map(() => '--------').join('+');

  let output = '\n====== 平均止盈间隔 (K线数) ======\n';
  output += `${header.map((h) => h.padStart(12)).join(' | ')}\n`;
  output += `${separator}\n`;

  // 数据行
  for (const target of targets) {
    const row = [target.toString()];
    for (const signal of signals) {
      const stats = signal.takeProfitStats.get(target);
      const avg = stats?.intervalStats.mean ?? null;
      row.push(formatNumber(avg, 0));
    }
    output += `${row.map((v) => v.padStart(12)).join(' | ')}\n`;
  }

  return output;
}

/**
 * 打印完整报告
 */
export function printReport(result: ExperimentResult): void {
  const report = formatReport(result);
  console.log(`\n${'='.repeat(70)}`);
  console.log(report.title);
  console.log('='.repeat(70));
  console.log(report.summary);
  console.log(report.intervalMatrix);

  // 打印详细统计（可选）
  printDetailedStats(result);
}

/**
 * 打印详细统计
 */
function printDetailedStats(result: ExperimentResult): void {
  console.log('\n====== 详细统计 ======');

  for (const signalResult of result.signalResults) {
    console.log(`\n>>> ${signalResult.signalType} <<<`);
    console.log(
      'M_T'.padStart(8) +
        '轮数'.padStart(10) +
        '平均间隔'.padStart(12) +
        '中位数'.padStart(10) +
        '标准差'.padStart(10) +
        'P25'.padStart(10) +
        'P75'.padStart(10) +
        '频率'.padStart(12)
    );
    console.log('-'.repeat(82));

    for (const [target, stats] of signalResult.takeProfitStats) {
      const { intervalStats } = stats;
      console.log(
        target.toString().padStart(8) +
          stats.avgRoundsPerRun.toFixed(2).padStart(10) +
          formatNumber(intervalStats.mean, 0).padStart(12) +
          formatNumber(intervalStats.median, 0).padStart(10) +
          formatNumber(intervalStats.std, 0).padStart(10) +
          formatNumber(intervalStats.p25, 0).padStart(10) +
          formatNumber(intervalStats.p75, 0).padStart(10) +
          (stats.avgFrequency * 1000).toFixed(4).padStart(12)
      );
    }
  }
}

// ============================================
// 多实验比较
// ============================================

export interface ComparisonRow {
  signalType: string;
  targetMultiplier: number;
  avgInterval: number | null;
  medianInterval: number | null;
  avgRoundsPerRun: number;
  frequency: number;
}

/**
 * 提取比较数据
 */
export function extractComparisonData(result: ExperimentResult): ComparisonRow[] {
  const rows: ComparisonRow[] = [];

  for (const signalResult of result.signalResults) {
    for (const [target, stats] of signalResult.takeProfitStats) {
      rows.push({
        signalType: signalResult.signalType,
        targetMultiplier: target,
        avgInterval: stats.intervalStats.mean,
        medianInterval: stats.intervalStats.median,
        avgRoundsPerRun: stats.avgRoundsPerRun,
        frequency: stats.avgFrequency,
      });
    }
  }

  return rows;
}

/**
 * 打印比较表格
 */
export function printComparisonTable(result: ExperimentResult): void {
  const rows = extractComparisonData(result);

  console.log(`\n${'='.repeat(100)}`);
  console.log('信号策略 × 止盈线 对比表');
  console.log('='.repeat(100));

  console.log(
    '策略'.padEnd(20) +
      'M_T'.padStart(8) +
      '平均间隔'.padStart(12) +
      '中位间隔'.padStart(12) +
      '平均轮数'.padStart(12) +
      '频率(‰)'.padStart(12)
  );
  console.log('-'.repeat(100));

  for (const row of rows) {
    console.log(
      row.signalType.slice(0, 18).padEnd(20) +
        row.targetMultiplier.toString().padStart(8) +
        formatNumber(row.avgInterval, 0).padStart(12) +
        formatNumber(row.medianInterval, 0).padStart(12) +
        row.avgRoundsPerRun.toFixed(2).padStart(12) +
        (row.frequency * 1000).toFixed(4).padStart(12)
    );
  }
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
        market: result.config.market,
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
  const rows = extractComparisonData(result);

  const header = [
    'signal_type',
    'target_multiplier',
    'avg_interval',
    'median_interval',
    'avg_rounds_per_run',
    'frequency',
  ].join(',');

  const dataRows = rows.map((row) =>
    [
      `"${row.signalType}"`,
      row.targetMultiplier,
      row.avgInterval ?? '',
      row.medianInterval ?? '',
      row.avgRoundsPerRun.toFixed(4),
      row.frequency.toFixed(8),
    ].join(',')
  );

  return [header, ...dataRows].join('\n');
}

// ============================================
// 统计工具函数
// ============================================

/**
 * 计算直方图数据
 */
export function calculateHistogram(
  values: number[],
  bins: number = 50
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
