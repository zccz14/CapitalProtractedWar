/**
 * Analysis Module - 分析模块
 * 
 * 功能:
 * 1. 格式化实验结果
 * 2. 生成报告
 * 3. 比较多个实验结果
 */

import type { 
  ExperimentResult, 
  MDistributionStats 
} from '../types.js';
import { VOLATILITY_SCENARIOS } from '../types.js';

// ============================================
// 报告格式化
// ============================================

/**
 * 格式化成交额显示
 */
function formatTurnover(value: number): string {
  if (value >= 1e9) return (value / 1e9).toFixed(2) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(2) + 'K';
  return value.toFixed(2);
}

export interface FormattedReport {
  title: string;
  summary: string;
  mDistribution: string;
  reachProbabilities: string;
  tsMetrics: string;
  raw: ExperimentResult;
}

/**
 * 格式化单个实验结果为可读报告
 */
export function formatReport(result: ExperimentResult): FormattedReport {
  const { config, mDistribution, reachProbabilities, avgCandlesToReach, avgTradesToReach } = result;
  
  // 标题
  const volatilityDesc = VOLATILITY_SCENARIOS[config.market.volatility] || `σ=${(config.market.volatility * 100).toFixed(1)}%`;
  const title = `实验: ${config.name}
市场: ${config.market.type.toUpperCase()} | ${volatilityDesc}
信号: ${config.signal.type} | K线数: ${config.market.candleCount} | 模拟次数: ${config.monteCarloRuns}`;

  // 摘要
  const tradingCostRate = config.tradingCostRate ?? 0;
  const costRateStr = tradingCostRate > 0 ? `交易成本率: ${(tradingCostRate * 100).toFixed(4)}%\n` : '';
  const avgCostStr = tradingCostRate > 0 ? `平均总交易成本: ${formatTurnover(result.avgTotalTradingCost)}\n` : '';
  
  const summary = `
====== 摘要 ======
平均峰值倍率 M: ${mDistribution.mean.toFixed(2)}x
中位数峰值倍率: ${mDistribution.median.toFixed(2)}x
最大峰值倍率: ${mDistribution.max.toFixed(2)}x
平均胜率: ${(result.avgWinRate * 100).toFixed(1)}%
平均最大连胜: ${result.avgMaxConsecutiveWins.toFixed(1)}
平均总成交额: ${formatTurnover(result.avgTotalTurnover)}
${costRateStr}${avgCostStr}运行时间: ${result.elapsedMs}ms`;

  // M分布详情
  const mDistributionStr = `
====== M 分布统计 ======
均值: ${mDistribution.mean.toFixed(4)}
标准差: ${mDistribution.std.toFixed(4)}
最小值: ${mDistribution.min.toFixed(4)}
最大值: ${mDistribution.max.toFixed(4)}

分位数:
  P5:  ${mDistribution.percentiles.p5.toFixed(4)}
  P25: ${mDistribution.percentiles.p25.toFixed(4)}
  P50: ${mDistribution.percentiles.p50.toFixed(4)}
  P75: ${mDistribution.percentiles.p75.toFixed(4)}
  P95: ${mDistribution.percentiles.p95.toFixed(4)}
  P99: ${mDistribution.percentiles.p99.toFixed(4)}`;

  // 达到概率
  let reachProbStr = '\n====== P(M ≥ k) 达到概率 ======\n';
  for (const target of config.targetMultipliers) {
    const prob = reachProbabilities.get(target);
    if (prob !== undefined) {
      const bar = '█'.repeat(Math.round(prob * 20));
      const empty = '░'.repeat(20 - Math.round(prob * 20));
      reachProbStr += `  ${target.toString().padStart(4)}x: ${(prob * 100).toFixed(1).padStart(5)}% ${bar}${empty}\n`;
    }
  }

  // T_S 指标
  let tsStr = '\n====== T_S 指标 (达到目标的平均时间) ======\n';
  tsStr += '目标倍率 | 平均K线数 | 平均交易数\n';
  tsStr += '---------+----------+-----------\n';
  for (const target of config.targetMultipliers) {
    const candles = avgCandlesToReach.get(target);
    const trades = avgTradesToReach.get(target);
    const candlesStr = candles !== null && candles !== undefined ? candles.toFixed(0).padStart(8) : '     N/A';
    const tradesStr = trades !== null && trades !== undefined ? trades.toFixed(1).padStart(9) : '      N/A';
    tsStr += `  ${target.toString().padStart(5)}x |${candlesStr} |${tradesStr}\n`;
  }

  return {
    title,
    summary,
    mDistribution: mDistributionStr,
    reachProbabilities: reachProbStr,
    tsMetrics: tsStr,
    raw: result,
  };
}

/**
 * 打印完整报告
 */
export function printReport(result: ExperimentResult): void {
  const report = formatReport(result);
  console.log('\n' + '='.repeat(60));
  console.log(report.title);
  console.log('='.repeat(60));
  console.log(report.summary);
  console.log(report.mDistribution);
  console.log(report.reachProbabilities);
  console.log(report.tsMetrics);
}

// ============================================
// 多实验比较
// ============================================

export interface ComparisonRow {
  name: string;
  volatility: number;
  signalType: string;
  marketType: string;
  meanM: number;
  maxM: number;
  p95M: number;
  probReach2x: number;
  probReach10x: number;
  probReach100x: number;
  avgCandlesTo2x: number | null;
  avgCandlesTo10x: number | null;
  avgTotalTurnover: number;
  avgTotalTradingCost: number;
  tradingCostRate: number;
}

/**
 * 比较多个实验结果
 */
export function compareExperiments(results: ExperimentResult[]): ComparisonRow[] {
  return results.map(result => {
    const { config, mDistribution, reachProbabilities, avgCandlesToReach } = result;
    
    return {
      name: config.name,
      volatility: config.market.volatility,
      signalType: config.signal.type,
      marketType: config.market.type,
      meanM: mDistribution.mean,
      maxM: mDistribution.max,
      p95M: mDistribution.percentiles.p95,
      probReach2x: reachProbabilities.get(2) ?? 0,
      probReach10x: reachProbabilities.get(10) ?? 0,
      probReach100x: reachProbabilities.get(100) ?? 0,
      avgCandlesTo2x: avgCandlesToReach.get(2) ?? null,
      avgCandlesTo10x: avgCandlesToReach.get(10) ?? null,
      avgTotalTurnover: result.avgTotalTurnover,
      avgTotalTradingCost: result.avgTotalTradingCost,
      tradingCostRate: config.tradingCostRate ?? 0,
    };
  });
}

/**
 * 打印比较表格
 */
export function printComparisonTable(results: ExperimentResult[]): void {
  const rows = compareExperiments(results);
  
  console.log('\n' + '='.repeat(140));
  console.log('实验对比表');
  console.log('='.repeat(140));
  
  // 表头
  console.log(
    '实验名称'.padEnd(20) +
    'σ'.padStart(8) +
    '市场'.padStart(12) +
    '信号'.padStart(16) +
    'E[M]'.padStart(10) +
    'P95[M]'.padStart(10) +
    'P(2x)'.padStart(8) +
    'P(10x)'.padStart(8) +
    'P(100x)'.padStart(8) +
    'T(2x)'.padStart(8) +
    'T(10x)'.padStart(8) +
    '成交额'.padStart(12)
  );
  console.log('-'.repeat(140));
  
  // 数据行
  for (const row of rows) {
    console.log(
      row.name.slice(0, 18).padEnd(20) +
      (row.volatility * 100).toFixed(1).padStart(7) + '%' +
      row.marketType.padStart(12) +
      row.signalType.padStart(16) +
      row.meanM.toFixed(2).padStart(10) +
      row.p95M.toFixed(2).padStart(10) +
      (row.probReach2x * 100).toFixed(0).padStart(7) + '%' +
      (row.probReach10x * 100).toFixed(0).padStart(7) + '%' +
      (row.probReach100x * 100).toFixed(0).padStart(7) + '%' +
      (row.avgCandlesTo2x?.toFixed(0) ?? 'N/A').padStart(8) +
      (row.avgCandlesTo10x?.toFixed(0) ?? 'N/A').padStart(8) +
      formatTurnover(row.avgTotalTurnover).padStart(12)
    );
  }
}

// ============================================
// JSON/CSV 导出
// ============================================

/**
 * 导出为JSON
 */
export function exportToJSON(results: ExperimentResult[]): string {
  return JSON.stringify(results.map(r => ({
    config: {
      name: r.config.name,
      market: r.config.market,
      signal: r.config.signal,
      monteCarloRuns: r.config.monteCarloRuns,
      tradingCostRate: r.config.tradingCostRate ?? 0,
    },
    mDistribution: r.mDistribution,
    reachProbabilities: Object.fromEntries(r.reachProbabilities),
    avgCandlesToReach: Object.fromEntries(r.avgCandlesToReach),
    avgTradesToReach: Object.fromEntries(r.avgTradesToReach),
    avgWinRate: r.avgWinRate,
    avgMaxConsecutiveWins: r.avgMaxConsecutiveWins,
    avgTotalTurnover: r.avgTotalTurnover,
    avgTotalTradingCost: r.avgTotalTradingCost,
    elapsedMs: r.elapsedMs,
  })), null, 2);
}

/**
 * 导出为CSV (比较表格)
 */
export function exportToCSV(results: ExperimentResult[]): string {
  const rows = compareExperiments(results);
  
  const header = [
    'name', 'volatility', 'marketType', 'signalType',
    'meanM', 'maxM', 'p95M',
    'probReach2x', 'probReach10x', 'probReach100x',
    'avgCandlesTo2x', 'avgCandlesTo10x', 
    'avgTotalTurnover', 'avgTotalTradingCost', 'tradingCostRate'
  ].join(',');
  
  const dataRows = rows.map(row => [
    `"${row.name}"`,
    row.volatility,
    row.marketType,
    row.signalType,
    row.meanM.toFixed(4),
    row.maxM.toFixed(4),
    row.p95M.toFixed(4),
    row.probReach2x.toFixed(4),
    row.probReach10x.toFixed(4),
    row.probReach100x.toFixed(4),
    row.avgCandlesTo2x ?? '',
    row.avgCandlesTo10x ?? '',
    row.avgTotalTurnover.toFixed(2),
    row.avgTotalTradingCost.toFixed(2),
    row.tradingCostRate.toFixed(6),
  ].join(','));
  
  return [header, ...dataRows].join('\n');
}

// ============================================
// 统计工具函数
// ============================================

/**
 * 计算直方图数据
 */
export function calculateHistogram(values: number[], bins: number = 50): { binEdges: number[]; counts: number[] } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const binWidth = (max - min) / bins;
  
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
