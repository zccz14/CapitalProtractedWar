/**
 * Capital Protracted War - Core Type Definitions
 * 资本持久战实验框架 - 核心类型定义
 */

// ============================================
// K线数据类型
// ============================================

export interface Candle {
  time: number;       // Unix timestamp (ms)
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
  | 'gbm'             // 几何布朗运动 (独立同分布波动)
  | 'garch'           // GARCH模型 (波动率聚集)
  | 'trending'        // 趋势市场 (有正向漂移)
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
   * 
   * 例如：BTC 现货波动率 50%，使用 10x 杠杆
   * - volatility = 0.50 (或已经是等效的 5.00)
   * - leverage = 10
   * - 交易成本按 10x 放大
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

export type SignalDirection = 'long' | 'short' | 'close' | 'hold';

export interface Signal {
  direction: SignalDirection;
  /** 信号强度 0-1 (可选, 用于加权) */
  strength?: number;
}

export type SignalStrategyType = 
  | 'trend_following'   // 趋势跟踪 (动量策略)
  | 'mean_reversion'    // 均值回归
  | 'breakout'          // 突破策略
  | 'random';           // 随机策略 (对照组)

export interface SignalStrategyConfig {
  type: SignalStrategyType;
  /** 策略特定参数 */
  params?: Record<string, number>;
}

export interface SignalStrategy {
  readonly type: SignalStrategyType;
  /** 生成交易信号 */
  generate(candles: Candle[], currentIndex: number): Signal;
  /** 重置策略状态 */
  reset(): void;
}

// ============================================
// 仓位管理类型
// ============================================

export interface PositionState {
  /** 当前资产倍率 m(t), 初始=1, 下限=1 */
  assetMultiplier: number;
  /** 当前仓位大小 (相对于基础仓位的倍数) */
  positionSize: number;
  /** 连胜次数 */
  consecutiveWins: number;
  /** 历史峰值倍率 M */
  peakMultiplier: number;
  /** 基础仓位 (固定为1) */
  baseSize: number;
  /** 当前持仓方向 */
  currentDirection: SignalDirection;
  /** 入场价格 */
  entryPrice: number | null;
}

export interface PositionManager {
  /** 获取当前状态 */
  getState(): PositionState;
  /** 计算下一次交易的仓位大小 */
  getPositionSize(): number;
  /** 处理交易结果 */
  processTradeResult(pnlPercent: number): void;
  /** 重置状态 */
  reset(): void;
}

// ============================================
// 回测引擎类型
// ============================================

export interface TradeRecord {
  index: number;          // K线索引
  direction: SignalDirection;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  pnlPercent: number;
  assetMultiplierAfter: number;
  /** 成交额 = 价格 × 仓位大小 (开仓+平仓) */
  turnover: number;
  /** 交易成本 = 成交额 × 成本率 */
  tradingCost: number;
}

export interface BacktestResult {
  /** 最高资产倍率 M = max{m(t)} */
  peakMultiplier: number;
  /** 最终资产倍率 */
  finalMultiplier: number;
  /** 总交易次数 */
  tradeCount: number;
  /** 盈利交易次数 */
  winCount: number;
  /** 胜率 */
  winRate: number;
  /** 最大连胜次数 */
  maxConsecutiveWins: number;
  /** 最大连败次数 */
  maxConsecutiveLosses: number;
  /** 资产倍率历史曲线 */
  multiplierHistory: number[];
  /** 交易记录 */
  trades: TradeRecord[];
  /** 达到各目标倍率的K线索引 (null表示未达到) */
  reachTargetIndices: Map<number, number | null>;
  /** 总成交额 */
  totalTurnover: number;
  /** 总交易成本 */
  totalTradingCost: number;
}

// ============================================
// 实验配置类型
// ============================================

export interface ExperimentConfig {
  /** 实验名称 */
  name: string;
  /** 实验描述 */
  description?: string;
  
  /** 市场配置 */
  market: MarketConfig;
  /** 信号策略配置 */
  signal: SignalStrategyConfig;
  
  /** 蒙特卡洛模拟次数 */
  monteCarloRuns: number;
  /** 目标倍率列表 (用于计算P(M≥k)和T_S) */
  targetMultipliers: number[];
  
  /** 交易成本率 (成交额的固定比例, 如 0.0003 = 0.03%) */
  tradingCostRate?: number;
  
  /** 并行度 (默认1) */
  parallelism?: number;
  /** 输出目录 */
  outputDir?: string;
}

// ============================================
// 分析结果类型
// ============================================

export interface MDistributionStats {
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    p99: number;
  };
}

export interface ExperimentResult {
  config: ExperimentConfig;
  
  /** M 分布统计 */
  mDistribution: MDistributionStats;
  
  /** 所有模拟的峰值倍率 */
  peakMultipliers: number[];
  
  /** 达到特定倍率的概率 P(M ≥ k) */
  reachProbabilities: Map<number, number>;
  
  /** 达到特定倍率的平均交易次数 (条件期望) */
  avgTradesToReach: Map<number, number | null>;
  
  /** 达到特定倍率的平均K线数 (T_S 等价) */
  avgCandlesToReach: Map<number, number | null>;
  
  /** 平均胜率 */
  avgWinRate: number;
  /** 平均最大连胜 */
  avgMaxConsecutiveWins: number;
  
  /** 平均总成交额 */
  avgTotalTurnover: number;
  
  /** 平均总交易成本 */
  avgTotalTradingCost: number;
  
  /** 运行时间 (ms) */
  elapsedMs: number;
  
  /** 样本数据 (用于可视化) */
  sampleRuns?: Array<{
    candles: Candle[];
    multiplierHistory: number[];
    peakMultiplier: number;
  }>;
}

// ============================================
// 等效波动率场景映射
// ============================================

export const VOLATILITY_SCENARIOS: Record<number, string> = {
  0.005: "股票1x杠杆 / 低波动债券",
  0.01:  "股票2x杠杆 / 外汇10x杠杆",
  0.02:  "股票5x杠杆 / 加密货币现货",
  0.05:  "股票10x杠杆 / BTC现货",
  0.10:  "BTC 2x杠杆 / 山寨币现货",
  0.20:  "BTC 5x杠杆 / MEME币",
  0.50:  "BTC 10x杠杆 / 极端MEME",
  1.00:  "BTC 20x杠杆",
  2.00:  "BTC 50x杠杆",
};

// ============================================
// 默认目标倍率
// ============================================

export const DEFAULT_TARGET_MULTIPLIERS = [2, 5, 10, 20, 50, 100, 500, 1000];
