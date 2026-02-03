/**
 * Capital Protracted War - Core Type Definitions
 * 资本持久战实验框架 - 核心类型定义
 *
 * 新范式：实验 = 市场序列 × 信号策略 × 投注策略
 *
 * 核心概念：
 * - 市场序列：由市场生成器根据特征参数生成
 * - 信号策略：底层策略对市场序列的反应
 * - 投注策略：反马丁格尔投注 + 止盈线 M_T
 *
 * 评估指标：
 * - 不再关注 E[M]（易被极端值影响）
 * - 不再关注 P(M >= k)（时间拉长总能成功）
 * - 核心关注：止盈事件的平均时间间隔
 */

// ============================================
// K线数据类型
// ============================================

export interface Candle {
  time: number; // Unix timestamp (ms)
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

// ============================================
// 市场生成器类型
// ============================================

export type MarketType =
  | 'gbm' // 几何布朗运动 (独立同分布波动)
  | 'garch' // GARCH模型 (波动率聚集)
  | 'trending' // 趋势市场 (有正向漂移)
  | 'mean_reverting'; // 均值回归市场

export interface MarketConfig {
  type: MarketType;
  /** 年化波动率 σ (会自动转换为日波动率) */
  volatility: number;
  /**
   * 杠杆倍数 (默认1)
   *
   * 用于计算等效场景：
   * - 等效波动率 = baseVolatility × leverage (已体现在 volatility 字段)
   * - 交易成本放大 = baseCostRate × leverage
   */
  leverage?: number;
  /** 年化漂移率 μ (默认0) */
  drift?: number;
  /** 初始价格 (默认100) */
  initialPrice?: number;
  /** K线数量 */
  candleCount: number;
  /** 随机种子 (可选, 用于复现) */
  seed?: number;
  /** 每年交易日数 (默认252) */
  tradingDaysPerYear?: number;

  // GARCH 特有参数
  /** GARCH omega参数 (长期方差常数) */
  garchOmega?: number;
  /** GARCH alpha参数 (对昨日收益平方的敏感度) */
  garchAlpha?: number;
  /** GARCH beta参数 (对昨日方差的记忆) */
  garchBeta?: number;

  // 均值回归特有参数
  /** 均值回归速度 (年化) */
  meanReversionSpeed?: number;
  /** 均值回归目标价格 */
  meanReversionTarget?: number;
}

// ============================================
// 信号策略类型
// ============================================

/**
 * 交易信号 - 目标仓位
 *
 * 使用带符号的数值表示:
 * -  1 = 满仓做多
 * -  0 = 空仓 (平仓)
 * - -1 = 满仓做空
 */
export type Signal = number;

export type SignalStrategyType =
  | 'trend_following' // 趋势跟踪 (动量策略)
  | 'mean_reversion' // 均值回归
  | 'breakout' // 突破策略
  | 'breakout_4' // 4根K线突破策略
  | 'random' // 随机策略 (对照组)
  | 'adaptive_volatility' // 自适应波动率策略
  | 'boll_reversion'; // 布林带回归策略

export interface SignalStrategyConfig {
  type: SignalStrategyType;
  /** 策略特定参数 */
  params?: Record<string, number | string | boolean>;
}

export interface SignalStrategy {
  readonly type: SignalStrategyType;
  /** 生成交易信号 */
  generate(candles: Candle[], currentIndex: number): Signal;
  /** 重置策略状态 */
  reset(): void;
}

// ============================================
// 投注策略类型（新增）
// ============================================

/**
 * 默认止盈线序列
 * M_T ∈ {2, 4, 8, 16, 32, 64, 128, 256, 512, 1024}
 */
export const DEFAULT_TAKE_PROFIT_TARGETS = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

/**
 * 投注策略配置
 *
 * 新风控框架：
 * - Position(t) = StopLoss > 0 ? max(1, floor(VC / StopLoss)) : 0
 * - VC(t) = PnL(t) - RiskLine(t)
 * - RiskLine(t+1) = RiskLine(t) - C(t)
 */
export interface BettingStrategyConfig {
  /** 止盈线序列 M_T */
  takeProfitTargets: number[];
  /** 交易成本率 (成交额的固定比例, 如 0.0003 = 0.03%) */
  tradingCostRate?: number;
  /** 是否启用风控止损 (默认 true) */
  enableRiskControl?: boolean;
}

/**
 * 止盈事件记录
 *
 * 止盈条件：VC(t) >= M_T
 */
export interface TakeProfitEvent {
  /** 第几轮（从0开始） */
  roundIndex: number;
  /** 本轮开始的K线索引 */
  startCandleIndex: number;
  /** 止盈时的K线索引 */
  endCandleIndex: number;
  /** 本轮间隔K线数 */
  intervalCandles: number;
  /** 止盈时的风险资金 VC（>= M_T） */
  finalVC: number;
  /** 本轮交易次数 */
  tradeCount: number;
}

/**
 * 止损事件记录
 *
 * 止损条件：VC(t) <= 0
 * 即 PnL(t) <= RiskLine(t)
 */
export interface StopLossEvent {
  /** 第几轮（从0开始） */
  roundIndex: number;
  /** 本轮开始的K线索引 */
  startCandleIndex: number;
  /** 止损时的K线索引 */
  endCandleIndex: number;
  /** 本轮间隔K线数 */
  intervalCandles: number;
  /** 止损时的风险资金 VC（<= 0） */
  finalVC: number;
  /** 止损时的 PnL */
  finalPnL: number;
  /** 止损时的风控线 RiskLine */
  finalRiskLine: number;
  /** 触发时的 C 值 */
  estimatedC: number;
  /** 触发时的 StopLoss 值 */
  stopLoss: number;
  /** 本轮交易次数 */
  tradeCount: number;
}

/**
 * 风控统计结果
 *
 * 核心变量：
 * - C(t): 基准现金流速度 = max(亏损额/交易时间)
 * - StopLoss(t): 基准止损额 = 历史单笔最大浮亏
 * - Position(t) = StopLoss > 0 ? max(1, floor(VC/StopLoss/L)) : 0
 */
export interface RiskControlStats {
  /** 观察期结束的 K 线索引（C 和 StopLoss 首次都 > 0 的位置） */
  observationEndIndex: number;
  /** 观察期内跳过的交易次数 */
  skippedTradesInObservation: number;
  /** 最终学习到的 C 值 */
  learnedC: number;
  /** 最终学习到的 StopLoss 值 */
  learnedStopLoss: number;
  /** 止损事件列表 */
  stopLossEvents: StopLossEvent[];
  /** 止损次数 */
  stopLossCount: number;
  /** 止盈次数（实盘期内） */
  takeProfitCount: number;
  /** 风控胜率 = 止盈 / (止盈 + 止损) */
  riskAdjustedWinRate: number;
}

/**
 * 单个 M_T 的统计结果
 */
export interface TakeProfitTargetStats {
  /** 止盈线 M_T */
  targetMultiplier: number;
  /** 所有止盈事件 */
  events: TakeProfitEvent[];
  /** 完成的轮数 */
  roundCount: number;
  /** 平均间隔 (K线数) */
  avgInterval: number | null;
  /** 中位数间隔 */
  medianInterval: number | null;
  /** 最短间隔 */
  minInterval: number | null;
  /** 最长间隔 */
  maxInterval: number | null;
  /** 间隔标准差 */
  stdInterval: number | null;
  /** 间隔分位数 */
  intervalPercentiles: {
    p25: number | null;
    p50: number | null;
    p75: number | null;
    p95: number | null;
  };
  /** 总K线数（用于计算频率） */
  totalCandles: number;
  /** 止盈频率 = roundCount / totalCandles */
  frequency: number;
}

// ============================================
// 回测结果类型（重构）
// ============================================

/**
 * 虚拟账户状态（用于多账户并行追踪）
 *
 * 新风控框架核心状态：
 * - RealizedPnL(t): 已实现盈亏（止盈/止损时锁定）
 * - UnrealizedPnL(t): 未实现盈亏（当前轮次累计，止盈/止损时清零）
 * - PnL(t) = RealizedPnL(t) + UnrealizedPnL(t): 总盈亏
 * - RiskLine(t): 风控线，每K线下降 C(t)，止盈/止损后重置为0
 * - VC(t) = UnrealizedPnL(t) - RiskLine(t): 风险资金
 * - Position(t): 仓位（非负整数）
 *
 * 止盈条件：UnrealizedPnL(t) >= M_T
 * 止损条件：VC(t) <= 0
 */
export interface VirtualAccountState {
  /** 已实现盈亏 RealizedPnL(t) */
  realizedPnL: number;
  /** 未实现盈亏 UnrealizedPnL(t) */
  unrealizedPnL: number;
  /** 总盈亏 PnL(t) = RealizedPnL + UnrealizedPnL */
  pnl: number;
  /** 风控线 RiskLine(t) */
  riskLine: number;
  /** 风险资金 VC(t) = UnrealizedPnL - RiskLine */
  ventureCapital: number;
  /** 当前仓位大小 Position(t)（非负整数） */
  positionSize: number;
  /** 本轮开始的K线索引 */
  roundStartIndex: number;
  /** 本轮交易次数 */
  roundTradeCount: number;
}

/**
 * 单个信号策略在特定市场下的评估结果
 */
export interface SignalEvaluationResult {
  /** 信号策略类型 */
  signalType: SignalStrategyType;
  /** 各 M_T 的统计结果 */
  takeProfitStats: Map<number, TakeProfitTargetStats>;
  /** 总交易次数 */
  totalTradeCount: number;
  /** 总K线数 */
  totalCandles: number;
  /** 胜率 */
  winRate: number;
  /** 基准账户最终 PnL（固定仓位=1 的累计收益） */
  baselineFinalPnL: number;
}

// ============================================
// 交易记录类型（用于样本详细报告）
// ============================================

/**
 * 单笔交易记录
 *
 * 记录交易的完整信息，用于审计和调试
 */
export interface TradeRecord {
  /** 交易序号（从0开始） */
  tradeIndex: number;
  /** 信号变化的K线索引 */
  signalIndex: number;
  /** 实际开仓K线索引（signalIndex + 1，使用该K线开盘价） */
  entryIndex: number;
  /** 平仓信号的K线索引 */
  exitSignalIndex: number;
  /** 实际平仓K线索引（exitSignalIndex + 1，使用该K线开盘价） */
  exitIndex: number;
  /** 方向：1=做多, -1=做空 */
  direction: 1 | -1;
  /** 开仓价格（下一K线开盘价） */
  entryPrice: number;
  /** 平仓价格（下一K线开盘价） */
  exitPrice: number;
  /** 持仓周期(K线数) = exitIndex - entryIndex */
  holdingPeriod: number;
  /** 单位仓位的PnL百分比 */
  pnlPercent: number;
  /** 是否盈利 */
  isWin: boolean;
  /** 持仓期间最大浮亏（正数表示亏损） */
  maxDrawdown: number;
}

/**
 * 基准账户快照
 *
 * 基准账户特点：
 * - 固定仓位 = 1
 * - 连续运行，不止盈/止损
 * - 用于计算 C 值和 StopLoss 值
 *
 * 核心变量：
 * - C(t) = max(亏损额/交易时间)：基准现金流速度
 * - StopLoss(t) = 历史单笔最大浮亏：基准止损额
 */
export interface BaselineSnapshot {
  /** K线索引 */
  candleIndex: number;
  /** 对应的交易序号 */
  tradeIndex: number;
  /** 单位仓位PnL百分比 */
  pnlPercent: number;
  /** 基准累计净值 BasePnL(t) = Σ(pnl × 1) */
  cumulativeEquity: number;
  /** 当前 C(t) 值（基准现金流速度） */
  estimatedC: number;
  /** 该笔交易的最大浮亏 */
  maxDrawdown: number;
  /** 当前 StopLoss(t) = 历史单笔最大浮亏 */
  stopLoss: number;
}

/**
 * 投注账户状态快照
 *
 * 记录每笔交易后的账户状态变化，用于审计
 *
 * 核心变量：
 * - RealizedPnL(t): 已实现盈亏
 * - UnrealizedPnL(t): 未实现盈亏
 * - PnL(t) = RealizedPnL + UnrealizedPnL: 总盈亏
 * - RiskLine(t): 风控线
 * - VC(t) = UnrealizedPnL(t) - RiskLine(t): 风险资金
 * - Position(t) = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 *
 * 止盈条件：UnrealizedPnL >= M_T
 * 止损条件：VC <= 0
 */
export interface AccountSnapshot {
  /** K线索引 */
  candleIndex: number;
  /** 对应的交易序号 */
  tradeIndex: number;
  /** 事件类型 */
  eventType: 'trade_close' | 'take_profit' | 'stop_loss' | 'observing';

  // 核心风控变量
  /** 已实现盈亏 RealizedPnL(t) */
  realizedPnL: number;
  /** 未实现盈亏 UnrealizedPnL(t) */
  unrealizedPnL: number;
  /** 总盈亏 PnL(t) = RealizedPnL + UnrealizedPnL */
  pnl: number;
  /** 风控线 RiskLine(t) */
  riskLine: number;
  /** 风险资金 VC(t) = UnrealizedPnL - RiskLine */
  ventureCapital: number;
  /** 基准止损额 StopLoss(t) */
  stopLoss: number;
  /** 基准现金流速度 C(t) */
  estimatedC: number;
  /** 仓位大小 Position(t)（非负整数） */
  positionSize: number;

  // 交易详情
  /** 单位仓位PnL百分比 */
  pnlPercent: number;
  /** 实际PnL = pnlPercent × positionSize */
  actualPnl: number;
  /** 是否在观察期 */
  isObserving: boolean;
}

/**
 * 样本数据 - 用于可视化
 *
 * 新风控框架的核心曲线：
 * - RealizedPnL 曲线：已实现盈亏
 * - UnrealizedPnL 曲线：未实现盈亏（当前轮次）
 * - PnL 曲线：总盈亏 = RealizedPnL + UnrealizedPnL
 * - RiskLine 曲线：风控线（每K线下降 C，止盈/止损后重置为0）
 * - VC 曲线：风险资金 = UnrealizedPnL - RiskLine
 * - Position 曲线：仓位大小
 */
export interface SampleRunData {
  /** 价格序列（收盘价） */
  prices: number[];
  /** 已实现盈亏曲线（针对特定 M_T） */
  realizedPnLCurves: Map<number, number[]>;
  /** 未实现盈亏曲线（针对特定 M_T） */
  unrealizedPnLCurves: Map<number, number[]>;
  /** 总盈亏 PnL 曲线（针对特定 M_T） */
  pnlCurves: Map<number, number[]>;
  /** 风控线曲线（针对特定 M_T） */
  riskLineCurves: Map<number, number[]>;
  /** 风险资金 VC 曲线（针对特定 M_T） */
  vcCurves: Map<number, number[]>;
  /** 仓位曲线（针对特定 M_T） */
  positionCurves: Map<number, number[]>;
  /** 止盈事件标记（K线索引） */
  takeProfitMarkers: Map<number, number[]>;
  /** 止损事件标记（K线索引） */
  stopLossMarkers: Map<number, number[]>;
  /** 观察期结束索引（针对特定 M_T） */
  observationEndIndices: Map<number, number>;
  /** C 值曲线（针对特定 M_T） */
  estimatedCCurves: Map<number, number[]>;
  /** StopLoss 值曲线（针对特定 M_T） */
  stopLossCurves: Map<number, number[]>;

  // ============================================
  // 以下为样本详细报告所需的字段
  // ============================================

  /** 完整K线数据 */
  candles?: Candle[];
  /** 每根K线的信号值 */
  signals?: number[];
  /** 所有交易记录 */
  trades?: TradeRecord[];
  /** 基准账户快照序列 */
  baselineSnapshots?: BaselineSnapshot[];
  /** 基准净值曲线（固定仓位=1） */
  baselineEquityCurve?: number[];
  /** 投注账户快照序列（M_T -> 快照列表） */
  accountSnapshots?: Map<number, AccountSnapshot[]>;
}

/**
 * 样本元数据
 *
 * 记录代表性样本的选择信息
 */
export interface SampleMetadata {
  /** 原始运行索引（0-based） */
  runIndex: number;
  /** 基准账户最终 PnL */
  baselinePnL: number;
  /** 样本类型：最佳/中位/最差 */
  sampleType: 'best' | 'median' | 'worst';
}

/**
 * 单次蒙特卡洛运行的结果
 */
export interface MonteCarloRunResult {
  /** 运行索引 */
  runIndex: number;
  /** 各信号策略的评估结果 */
  signalResults: SignalEvaluationResult[];
  /** 样本数据（可选，仅用于可视化） */
  sampleData?: Map<string, SampleRunData>; // key = signalType
  /** 样本元数据（可选，记录代表性样本的选择信息） */
  sampleMetadata?: Map<string, SampleMetadata>; // key = signalType
}

// ============================================
// 实验配置类型（重构）
// ============================================

export interface ExperimentConfig {
  /** 实验名称 */
  name: string;
  /** 实验描述 */
  description?: string;

  /** 市场配置 */
  market: MarketConfig;

  /** 信号策略配置列表（同一市场下测试多个策略） */
  signals: SignalStrategyConfig[];

  /** 投注策略配置 */
  betting: BettingStrategyConfig;

  /** 蒙特卡洛模拟次数 */
  monteCarloRuns: number;

  /** 输出目录 */
  outputDir?: string;
}

// ============================================
// 实验结果类型（重构）
// ============================================

/**
 * 聚合后的止盈统计（跨多次MC运行）
 */
export interface AggregatedTakeProfitStats {
  /** 止盈线 M_T */
  targetMultiplier: number;
  /** 总止盈事件数（所有MC运行的总和） */
  totalRoundCount: number;
  /** 平均每次MC运行的轮数 */
  avgRoundsPerRun: number;
  /** 所有止盈间隔的聚合统计 */
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
 * 信号策略的聚合结果（跨多次MC运行）
 */
export interface AggregatedSignalResult {
  /** 信号策略类型 */
  signalType: SignalStrategyType;
  /** 各 M_T 的聚合统计 */
  takeProfitStats: Map<number, AggregatedTakeProfitStats>;
  /** 平均胜率 */
  avgWinRate: number;
  /** 平均每次运行的交易数 */
  avgTradeCount: number;
}

/**
 * 完整实验结果
 */
export interface ExperimentResult {
  /** 实验配置 */
  config: ExperimentConfig;
  /** 各信号策略的聚合结果 */
  signalResults: AggregatedSignalResult[];
  /** 蒙特卡洛运行次数 */
  monteCarloRuns: number;
  /** 总K线数（每次运行） */
  candlesPerRun: number;
  /** 运行时间 (ms) */
  elapsedMs: number;
  /** 样本数据（用于可视化，可选） */
  sampleRuns?: MonteCarloRunResult[];
}

// ============================================
// 等效波动率场景映射
// ============================================

export const VOLATILITY_SCENARIOS: Record<number, string> = {
  0.005: '股票1x杠杆 / 低波动债券',
  0.01: '股票2x杠杆 / 外汇10x杠杆',
  0.02: '股票5x杠杆 / 加密货币现货',
  0.05: '股票10x杠杆 / BTC现货',
  0.1: 'BTC 2x杠杆 / 山寨币现货',
  0.2: 'BTC 5x杠杆 / MEME币',
  0.5: 'BTC 10x杠杆 / 极端MEME',
  1.0: 'BTC 20x杠杆',
  2.0: 'BTC 50x杠杆',
};
