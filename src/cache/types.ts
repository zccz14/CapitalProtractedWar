/**
 * 缓存相关类型定义
 */

import type {
  MarketConfig,
  MarketTemplate,
  SignalStrategyConfig,
  BettingStrategyConfig,
  SignalStrategyType,
} from '../types.js';

// ============================================
// 运行结果文件类型 (Level 0)
// ============================================

/**
 * 单个 M_T 的统计摘要（用于缓存）
 */
export interface TakeProfitStatsSummary {
  /** 止盈线 M_T */
  targetMultiplier: number;
  /** 完成的轮数 */
  roundCount: number;
  /** 所有止盈间隔（用于聚合时计算分位数） */
  intervals: number[];
  /** 止盈频率 */
  frequency: number;
}

/**
 * 单次运行的统计结果（不含曲线数据）
 */
export interface RunStats {
  /** 信号策略类型 */
  signalType: SignalStrategyType;
  /** 总交易次数 */
  totalTradeCount: number;
  /** 总 K 线数 */
  totalCandles: number;
  /** 胜率 */
  winRate: number;
  /** 各 M_T 的统计 */
  takeProfitStats: TakeProfitStatsSummary[];
  /** 基准账户最终 PnL（用于选择代表性样本） */
  baselineFinalPnL: number;
}

/**
 * 运行结果文件结构
 */
export interface RunResultFile {
  /** 引擎版本 */
  version: string;
  /** 配置哈希 */
  configHash: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 配置快照 */
  config: {
    market: MarketConfig;
    signal: SignalStrategyConfig;
    betting: BettingStrategyConfig;
  };
  /** 运行结果 */
  result: RunStats;
}

// ============================================
// 聚合结果文件类型 (Level 1)
// ============================================

/**
 * 聚合后的止盈统计
 */
export interface AggregatedTakeProfitStatsSummary {
  /** 止盈线 M_T */
  targetMultiplier: number;
  /** 总止盈事件数 */
  totalRoundCount: number;
  /** 平均每次运行的轮数 */
  avgRoundsPerRun: number;
  /** 间隔统计 */
  intervalStats: {
    mean: number | null;
    median: number | null;
    std: number | null;
    min: number | null;
    max: number | null;
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p95: number | null;
  };
  /** 平均止盈频率 */
  avgFrequency: number;
}

/**
 * 代表性样本索引
 */
export interface SampleIndex {
  /** 市场 ID */
  marketId: string;
  /** 基准账户最终 PnL */
  baselinePnL: number;
}

/**
 * 聚合结果
 */
export interface AggregatedResult {
  /** 市场组 ID */
  marketGroupId: string;
  /** 信号策略 ID */
  signalId: string;
  /** 投注策略 ID */
  bettingId: string;
  /** 聚合的运行次数 */
  runCount: number;
  /** 平均胜率 */
  avgWinRate: number;
  /** 平均交易次数 */
  avgTradeCount: number;
  /** 各 M_T 的聚合统计 */
  takeProfitStats: AggregatedTakeProfitStatsSummary[];
  /** 代表性样本索引 */
  sampleIndices: {
    best: SampleIndex;
    median: SampleIndex;
    worst: SampleIndex;
  };
}

/**
 * 聚合结果文件结构
 */
export interface AggregatedResultFile {
  /** 引擎版本 */
  version: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 聚合结果 */
  result: AggregatedResult;
}

// ============================================
// 实验选项类型
// ============================================

/**
 * 实验运行选项
 */
export interface ExperimentOptions {
  /** 强制重跑 */
  force: boolean;
  /** 运行的阶段 */
  phases: number[];
  /** 输出目录 */
  outputDir: string;
  /** 不自动打开报告 */
  noOpen: boolean;
  /** 详细输出 */
  verbose: boolean;
}

/**
 * 实验配置（完整）
 *
 * 三足鼎立：markets × signals × betting
 */
export interface FullExperimentConfig {
  /** 市场生成模板列表 */
  markets: MarketTemplate[];
  /** 信号策略列表 */
  signals: SignalStrategyConfig[];
  /** 投注策略配置 */
  betting: BettingStrategyConfig;
  /** 输出目录 */
  outputDir: string;
}
