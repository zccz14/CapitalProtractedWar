/**
 * Multi-Account Tracker - 多账户并行追踪器
 * 
 * 核心功能：
 * 1. 为每个止盈线 M_T 创建独立的虚拟账户
 * 2. 统一处理交易结果，同时更新所有账户
 * 3. 各账户独立止盈、独立重置
 * 4. 收集所有账户的止盈事件统计
 * 5. 【重构】C 值由外部 BaselineTracker 提供，不再自行计算
 * 
 * 新架构（双账户并行）：
 * - 基准账户（BaselineTracker）：固定仓位=1，计算 C 值
 * - 反马丁账户（VirtualAccount）：参考外部 C 值
 * - 观察期判断：externalC === 0 时为观察期，实际仓位=0
 * 
 * 风控机制：
 * - C 值由 BaselineTracker 基于历史亏损速度计算
 * - 风控线：riskLine(t) = 1 - C * (t - roundStart)
 * - 当 m(t) <= riskLine(t) 时触发止损重置
 * 
 * 设计哲学：
 * - 市场序列生成一次，复用于所有信号策略
 * - 信号序列生成一次，复用于所有投注策略（不同 M_T）
 * - 多个虚拟账户并行追踪，共享交易结果但独立止盈/止损
 */

import type {
  TakeProfitEvent,
  TakeProfitTargetStats,
  VirtualAccountState,
  BettingStrategyConfig,
  StopLossEvent,
  RiskControlStats,
  AccountSnapshot,
} from '../types.js';

/**
 * 交易结果的返回类型
 */
export type TradeResultType = 'none' | 'take_profit' | 'stop_loss' | 'observing';

// ============================================
// 虚拟账户
// ============================================

/**
 * 单个虚拟账户 - 追踪特定 M_T 的止盈/止损事件
 * 
 * 重构说明：
 * - C 值不再自行计算，由外部 BaselineTracker 提供
 * - 观察期判断：externalC === 0 时为观察期
 * - 观察期内：实际仓位=0，不累计到反马丁净值，但记录快照
 */
export class VirtualAccount {
  /** 止盈线 */
  readonly targetMultiplier: number;
  
  /** 盈利后仓位乘数 */
  private winMultiplier: number;
  
  /** 亏损后仓位乘数 (0 = 重置到基础仓位) */
  private loseMultiplier: number;
  
  /** 是否启用风控止损 */
  private enableRiskControl: boolean;
  
  /** 当前状态 */
  private state: VirtualAccountState;
  
  /** 止盈事件记录 */
  private takeProfitEvents: TakeProfitEvent[] = [];
  
  /** 止损事件记录 */
  private stopLossEvents: StopLossEvent[] = [];
  
  /** 当前K线索引 */
  private currentCandleIndex: number = 0;
  
  // ============================================
  // 净值曲线相关字段
  // ============================================
  
  /** 
   * 累计净值（不因止盈/止损重置）
   * 计算方式: Σ (pnl × positionSize)
   * 
   * 重要变化：观察期内实际仓位=0，不累计！
   */
  private cumulativeEquity: number = 0;
  
  // ============================================
  // 风控相关字段（重构：C 值由外部提供）
  // ============================================
  
  /** 当前 C 估计值（由外部 BaselineTracker 提供） */
  private externalC: number = 0;
  
  /** 是否在观察期（externalC === 0 时为观察期） */
  private isObserving: boolean = true;
  
  /** 观察期结束的 K 线索引 */
  private observationEndIndex: number = 0;
  
  /** 观察期内跳过的交易次数 */
  private skippedTradesInObservation: number = 0;
  
  /** 本轮最低资金倍率（用于计算最大回撤） */
  private roundMinMultiplier: number = 1;
  
  /** 实盘期内的止盈次数（不含观察期） */
  private realTakeProfitCount: number = 0;
  
  // ============================================
  // 账户快照记录（用于样本详细报告）
  // ============================================
  
  /** 是否记录详细快照 */
  private recordSnapshots: boolean = false;
  
  /** 账户快照序列 */
  private accountSnapshots: AccountSnapshot[] = [];

  constructor(
    targetMultiplier: number,
    winMultiplier: number = 2,
    loseMultiplier: number = 0,
    enableRiskControl: boolean = true
  ) {
    this.targetMultiplier = targetMultiplier;
    this.winMultiplier = winMultiplier;
    this.loseMultiplier = loseMultiplier;
    this.enableRiskControl = enableRiskControl;
    this.state = this.createInitialState();
  }

  /**
   * 启用详细快照记录（用于样本详细报告）
   */
  enableSnapshotRecording(): void {
    this.recordSnapshots = true;
  }

  private createInitialState(): VirtualAccountState {
    return {
      currentMultiplier: 1,
      positionSize: 1,
      consecutiveWins: 0,
      roundStartIndex: 0,
      roundTradeCount: 0,
    };
  }

  /**
   * 处理交易结果
   * 
   * 重构说明：
   * - C 值由外部 BaselineTracker 提供，不再自行计算
   * - 观察期判断：externalC === 0 时为观察期
   * - 观察期内：实际仓位=0，不累计净值，但记录快照
   * 
   * @param pnlPercent - 单位仓位的盈亏百分比
   * @param candleIndex - 当前K线索引
   * @param tradeStartIndex - 本次交易开仓的K线索引
   * @param tradeIndex - 交易序号（用于快照记录）
   * @param externalC - 外部提供的 C 值（来自 BaselineTracker）
   * @returns 交易结果类型
   */
  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    tradeStartIndex: number,
    tradeIndex: number = 0,
    externalC: number = 0
  ): TradeResultType {
    this.currentCandleIndex = candleIndex;
    
    // 保存交易前状态（用于快照）
    const prevState = { ...this.state };
    
    // 更新外部 C 值
    this.externalC = externalC;
    
    // ============================================
    // 观察期判断：externalC === 0 时为观察期
    // ============================================
    const wasObserving = this.isObserving;
    
    if (this.enableRiskControl) {
      if (externalC === 0) {
        // 仍在观察期
        this.isObserving = true;
      } else if (this.isObserving) {
        // 观察期结束（C 值首次变为非零）
        this.isObserving = false;
        this.observationEndIndex = candleIndex;
      }
    }
    
    // ============================================
    // 观察期处理：记录快照但不执行实际交易
    // ============================================
    if (this.enableRiskControl && this.isObserving) {
      this.skippedTradesInObservation++;
      
      // 记录观察期快照（实际仓位=0，不累计净值）
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'observing',
          prevMultiplier: prevState.currentMultiplier,
          prevPositionSize: prevState.positionSize,
          prevConsecutiveWins: prevState.consecutiveWins,
          pnlPercent,
          actualPnl: 0,  // 观察期实际仓位=0
          newMultiplier: this.state.currentMultiplier,
          newPositionSize: this.state.positionSize,
          newConsecutiveWins: this.state.consecutiveWins,
          estimatedC: externalC,
          riskLineValue: this.calculateRiskLine(candleIndex),
          isObserving: true,
          cumulativeEquity: this.cumulativeEquity,
        });
      }
      
      return 'observing';
    }
    
    // ============================================
    // 实盘期：正常处理交易
    // ============================================
    this.state.roundTradeCount++;
    
    const positionSize = this.state.positionSize;
    
    // 计算资产变化
    const assetChange = positionSize * pnlPercent;
    let newMultiplier = this.state.currentMultiplier + assetChange;
    
    // 触底保护：资产倍率不能低于某个极小值（避免负数）
    newMultiplier = Math.max(newMultiplier, 0.001);
    this.state.currentMultiplier = newMultiplier;
    
    // ============================================
    // 净值累计：仅在实盘期累计
    // ============================================
    this.cumulativeEquity += assetChange;
    
    // 更新本轮最低倍率
    this.roundMinMultiplier = Math.min(this.roundMinMultiplier, newMultiplier);
    
    // 根据盈亏调整下一次仓位
    if (pnlPercent > 0) {
      // 盈利：增加连胜计数，放大仓位
      this.state.consecutiveWins++;
      if (this.winMultiplier === 0) {
        this.state.positionSize = 1;
      } else {
        this.state.positionSize *= this.winMultiplier;
      }
    } else if (pnlPercent < 0) {
      // 亏损：重置连胜计数，缩小/重置仓位
      this.state.consecutiveWins = 0;
      if (this.loseMultiplier === 0) {
        this.state.positionSize = 1;
      } else {
        this.state.positionSize = Math.max(1, this.state.positionSize * this.loseMultiplier);
      }
    }
    
    // ============================================
    // 风控止损检查（在止盈检查之前）
    // ============================================
    if (this.enableRiskControl && this.shouldStopLoss()) {
      // 记录快照
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'stop_loss',
          prevMultiplier: prevState.currentMultiplier,
          prevPositionSize: prevState.positionSize,
          prevConsecutiveWins: prevState.consecutiveWins,
          pnlPercent,
          actualPnl: assetChange,
          newMultiplier: this.state.currentMultiplier,
          newPositionSize: this.state.positionSize,
          newConsecutiveWins: this.state.consecutiveWins,
          estimatedC: externalC,
          riskLineValue: this.calculateRiskLine(candleIndex),
          isObserving: false,
          cumulativeEquity: this.cumulativeEquity,
        });
      }
      
      this.recordStopLossEvent();
      this.resetForNewRound();
      return 'stop_loss';
    }
    
    // ============================================
    // 止盈检查
    // ============================================
    if (this.shouldTakeProfit()) {
      // 记录快照
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'take_profit',
          prevMultiplier: prevState.currentMultiplier,
          prevPositionSize: prevState.positionSize,
          prevConsecutiveWins: prevState.consecutiveWins,
          pnlPercent,
          actualPnl: assetChange,
          newMultiplier: this.state.currentMultiplier,
          newPositionSize: this.state.positionSize,
          newConsecutiveWins: this.state.consecutiveWins,
          estimatedC: externalC,
          riskLineValue: this.calculateRiskLine(candleIndex),
          isObserving: false,
          cumulativeEquity: this.cumulativeEquity,
        });
      }
      
      this.recordTakeProfitEvent();
      this.realTakeProfitCount++;
      this.resetForNewRound();
      return 'take_profit';
    }
    
    // 记录普通交易快照
    if (this.recordSnapshots) {
      this.accountSnapshots.push({
        candleIndex,
        tradeIndex,
        eventType: 'trade_close',
        prevMultiplier: prevState.currentMultiplier,
        prevPositionSize: prevState.positionSize,
        prevConsecutiveWins: prevState.consecutiveWins,
        pnlPercent,
        actualPnl: assetChange,
        newMultiplier: this.state.currentMultiplier,
        newPositionSize: this.state.positionSize,
        newConsecutiveWins: this.state.consecutiveWins,
        estimatedC: externalC,
        riskLineValue: this.calculateRiskLine(candleIndex),
        isObserving: false,
        cumulativeEquity: this.cumulativeEquity,
      });
    }
    
    return 'none';
  }

  /**
   * 计算当前风控线位置
   * riskLine(t) = 1 - C * (t - roundStart)
   * 
   * 注意：使用外部提供的 C 值
   */
  calculateRiskLine(candleIndex?: number): number {
    const idx = candleIndex ?? this.currentCandleIndex;
    const candlesSinceRoundStart = idx - this.state.roundStartIndex;
    return Math.max(0, 1 - this.externalC * candlesSinceRoundStart);
  }

  /**
   * 检查是否应该止损
   */
  shouldStopLoss(): boolean {
    if (!this.enableRiskControl || this.externalC === 0) {
      return false;
    }
    const riskLine = this.calculateRiskLine();
    return this.state.currentMultiplier <= riskLine;
  }

  /**
   * 扣除交易成本
   */
  deductCost(cost: number): void {
    // 观察期内不扣除成本
    if (this.isObserving) return;
    
    let newMultiplier = this.state.currentMultiplier - cost;
    newMultiplier = Math.max(newMultiplier, 0.001);
    this.state.currentMultiplier = newMultiplier;
    
    // 更新本轮最低倍率
    this.roundMinMultiplier = Math.min(this.roundMinMultiplier, newMultiplier);
  }

  /**
   * 检查是否应该止盈
   */
  shouldTakeProfit(): boolean {
    return this.state.currentMultiplier >= this.targetMultiplier;
  }

  /**
   * 记录止盈事件
   */
  private recordTakeProfitEvent(): void {
    const event: TakeProfitEvent = {
      roundIndex: this.takeProfitEvents.length + this.stopLossEvents.length,
      startCandleIndex: this.state.roundStartIndex,
      endCandleIndex: this.currentCandleIndex,
      intervalCandles: this.currentCandleIndex - this.state.roundStartIndex,
      finalMultiplier: this.state.currentMultiplier,
      tradeCount: this.state.roundTradeCount,
    };
    this.takeProfitEvents.push(event);
  }

  /**
   * 记录止损事件
   */
  private recordStopLossEvent(): void {
    const riskLine = this.calculateRiskLine();
    const maxDrawdown = 1 - this.roundMinMultiplier;
    
    const event: StopLossEvent = {
      roundIndex: this.takeProfitEvents.length + this.stopLossEvents.length,
      startCandleIndex: this.state.roundStartIndex,
      endCandleIndex: this.currentCandleIndex,
      intervalCandles: this.currentCandleIndex - this.state.roundStartIndex,
      finalMultiplier: this.state.currentMultiplier,
      riskLineValue: riskLine,
      estimatedC: this.externalC,  // 使用外部 C 值
      maxDrawdown,
      tradeCount: this.state.roundTradeCount,
    };
    this.stopLossEvents.push(event);
  }

  /**
   * 重置状态开始新一轮（止盈/止损后调用）
   * 注意：只重置资产倍率和仓位，信号策略保持连续性
   */
  private resetForNewRound(): void {
    this.state = {
      currentMultiplier: 1,
      positionSize: 1,
      consecutiveWins: 0,
      roundStartIndex: this.currentCandleIndex,
      roundTradeCount: 0,
    };
    this.roundMinMultiplier = 1;
  }

  /**
   * 获取当前状态
   */
  getState(): VirtualAccountState {
    return { ...this.state };
  }

  /**
   * 获取所有止盈事件
   */
  getTakeProfitEvents(): TakeProfitEvent[] {
    return [...this.takeProfitEvents];
  }

  /**
   * 获取所有止损事件
   */
  getStopLossEvents(): StopLossEvent[] {
    return [...this.stopLossEvents];
  }

  /**
   * 获取风控统计
   */
  getRiskControlStats(): RiskControlStats {
    const takeProfitCount = this.realTakeProfitCount;
    const stopLossCount = this.stopLossEvents.length;
    const total = takeProfitCount + stopLossCount;
    
    return {
      observationEndIndex: this.observationEndIndex,
      skippedTradesInObservation: this.skippedTradesInObservation,
      learnedC: this.externalC,  // 使用外部 C 值
      stopLossEvents: this.getStopLossEvents(),
      stopLossCount,
      takeProfitCount,
      riskAdjustedWinRate: total > 0 ? takeProfitCount / total : 0,
    };
  }

  /**
   * 获取当前 C 估计值（外部提供）
   */
  getEstimatedC(): number {
    return this.externalC;
  }

  /**
   * 是否在观察期
   */
  isInObservationPeriod(): boolean {
    return this.isObserving;
  }

  /**
   * 获取累计净值
   */
  getCumulativeEquity(): number {
    return this.cumulativeEquity;
  }

  /**
   * 获取账户快照序列（用于样本详细报告）
   */
  getAccountSnapshots(): AccountSnapshot[] {
    return [...this.accountSnapshots];
  }

  /**
   * 完全重置（新的蒙特卡洛运行）
   */
  reset(): void {
    this.state = this.createInitialState();
    this.takeProfitEvents = [];
    this.stopLossEvents = [];
    this.currentCandleIndex = 0;
    this.externalC = 0;
    this.isObserving = this.enableRiskControl;
    this.observationEndIndex = 0;
    this.skippedTradesInObservation = 0;
    this.roundMinMultiplier = 1;
    this.realTakeProfitCount = 0;
    this.cumulativeEquity = 0;
    this.accountSnapshots = [];  // 重置快照
  }
}

// ============================================
// 多账户追踪器
// ============================================

/**
 * 多账户追踪器 - 并行管理多个 M_T 的虚拟账户
 */
export class MultiAccountTracker {
  /** 虚拟账户映射：M_T -> VirtualAccount */
  private accounts: Map<number, VirtualAccount>;
  
  /** 交易成本率 */
  private tradingCostRate: number;
  
  /** 杠杆倍数（用于放大交易成本） */
  private leverage: number;
  
  /** 是否启用风控 */
  private enableRiskControl: boolean;
  
  /** 总K线数 */
  private totalCandles: number = 0;
  
  /** 是否记录样本数据 */
  private recordSample: boolean = false;
  
  /** 资金曲线（用于可视化） */
  private multiplierCurves: Map<number, number[]> = new Map();
  
  /** 风控线曲线（用于可视化） */
  private riskLineCurves: Map<number, number[]> = new Map();
  
  /** C 估计值曲线（用于可视化） */
  private estimatedCCurves: Map<number, number[]> = new Map();
  
  /** 最后更新的K线索引 */
  private lastCandleIndex: number = -1;
  
  /** 净值曲线（用于可视化） */
  private equityCurves: Map<number, number[]> = new Map();

  constructor(config: BettingStrategyConfig, leverage: number = 1) {
    this.accounts = new Map();
    this.tradingCostRate = config.tradingCostRate ?? 0;
    this.leverage = leverage;
    this.enableRiskControl = config.enableRiskControl ?? true;
    
    const winMultiplier = config.winMultiplier ?? 2;
    const loseMultiplier = config.loseMultiplier ?? 0;
    
    // 为每个止盈线创建独立账户
    for (const target of config.takeProfitTargets) {
      this.accounts.set(
        target,
        new VirtualAccount(target, winMultiplier, loseMultiplier, this.enableRiskControl)
      );
    }
  }

  /**
   * 启用样本数据记录（用于可视化）
   */
  enableSampleRecording(): void {
    this.recordSample = true;
    // 同时启用各账户的快照记录
    for (const account of this.accounts.values()) {
      account.enableSnapshotRecording();
    }
  }

  /**
   * 处理交易结果，更新所有账户
   * 
   * 重构说明：
   * - externalC 参数：由外部 BaselineTracker 提供的 C 值
   * - tradeIndex 参数：交易序号，用于快照记录
   * 
   * @param pnlPercent - 单位仓位的盈亏百分比
   * @param candleIndex - 当前K线索引
   * @param entryPrice - 入场价格（用于计算交易成本）
   * @param exitPrice - 出场价格
   * @param tradeStartIndex - 本次交易开仓的K线索引
   * @param tradeIndex - 交易序号（用于快照记录）
   * @param externalC - 外部提供的 C 值（来自 BaselineTracker）
   */
  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    entryPrice: number,
    exitPrice: number,
    tradeStartIndex: number,
    tradeIndex: number = 0,
    externalC: number = 0
  ): void {
    this.totalCandles = Math.max(this.totalCandles, candleIndex + 1);
    
    // 填充样本数据的间隙（从上次到当前K线）
    if (this.recordSample) {
      this.fillMultiplierGaps(candleIndex);
    }
    
    for (const [target, account] of this.accounts) {
      // 先处理交易结果（含风控逻辑），传入外部 C 值
      const resultType = account.processTradeResult(
        pnlPercent, 
        candleIndex, 
        tradeStartIndex, 
        tradeIndex,
        externalC
      );
      
      // 如果在观察期，跳过成本扣除
      if (resultType === 'observing') {
        continue;
      }
      
      // 扣除交易成本（如果有）
      if (this.tradingCostRate > 0) {
        const positionSize = account.getState().positionSize;
        const turnover = (entryPrice + exitPrice) * positionSize;
        const cost = turnover * this.tradingCostRate * this.leverage;
        account.deductCost(cost);
      }
      
      // 记录样本数据
      if (this.recordSample) {
        const curve = this.multiplierCurves.get(target);
        const riskCurve = this.riskLineCurves.get(target);
        const cCurve = this.estimatedCCurves.get(target);
        const equityCurve = this.equityCurves.get(target);
        
        if (curve && candleIndex < curve.length) {
          curve[candleIndex] = account.getState().currentMultiplier;
        }
        if (riskCurve && candleIndex < riskCurve.length) {
          riskCurve[candleIndex] = account.calculateRiskLine(candleIndex);
        }
        if (cCurve && candleIndex < cCurve.length) {
          cCurve[candleIndex] = account.getEstimatedC();
        }
        // 净值曲线：无论观察期与否都记录
        if (equityCurve && candleIndex < equityCurve.length) {
          equityCurve[candleIndex] = account.getCumulativeEquity();
        }
      }
    }
    
    this.lastCandleIndex = candleIndex;
  }
  
  /**
   * 填充资金曲线的间隙（用于持仓期间没有交易的K线）
   */
  private fillMultiplierGaps(currentIndex: number): void {
    if (this.lastCandleIndex < 0) return;
    
    for (const [target, account] of this.accounts) {
      const curve = this.multiplierCurves.get(target);
      const riskCurve = this.riskLineCurves.get(target);
      const cCurve = this.estimatedCCurves.get(target);
      const equityCurve = this.equityCurves.get(target);
      
      if (!curve) continue;
      
      const lastMultiplier = curve[this.lastCandleIndex] ?? 1;
      const lastC = cCurve?.[this.lastCandleIndex] ?? 0;
      const lastEquity = equityCurve?.[this.lastCandleIndex] ?? 0;
      
      for (let i = this.lastCandleIndex + 1; i < currentIndex && i < curve.length; i++) {
        curve[i] = lastMultiplier;
        if (riskCurve) {
          // 风控线随时间下降
          riskCurve[i] = account.calculateRiskLine(i);
        }
        if (cCurve) {
          cCurve[i] = lastC;
        }
        if (equityCurve) {
          // 净值保持不变（没有新交易）
          equityCurve[i] = lastEquity;
        }
      }
    }
  }

  /**
   * 设置总K线数（用于最终统计）
   */
  setTotalCandles(count: number): void {
    this.totalCandles = count;
    
    // 初始化资金曲线数组
    if (this.recordSample) {
      for (const target of this.accounts.keys()) {
        this.multiplierCurves.set(target, new Array(count).fill(1));
        this.riskLineCurves.set(target, new Array(count).fill(1));
        this.estimatedCCurves.set(target, new Array(count).fill(0));
        this.equityCurves.set(target, new Array(count).fill(0));  // 初始净值为 0
      }
    }
  }

  /**
   * 获取所有账户的统计结果
   */
  getStatsByTarget(): Map<number, TakeProfitTargetStats> {
    const result = new Map<number, TakeProfitTargetStats>();
    
    for (const [target, account] of this.accounts) {
      const events = account.getTakeProfitEvents();
      const stats = this.calculateStats(target, events);
      result.set(target, stats);
    }
    
    return result;
  }

  /**
   * 获取所有账户的风控统计
   */
  getRiskControlStatsByTarget(): Map<number, RiskControlStats> {
    const result = new Map<number, RiskControlStats>();
    
    for (const [target, account] of this.accounts) {
      result.set(target, account.getRiskControlStats());
    }
    
    return result;
  }

  /**
   * 计算单个 M_T 的统计数据
   */
  private calculateStats(targetMultiplier: number, events: TakeProfitEvent[]): TakeProfitTargetStats {
    const roundCount = events.length;
    
    if (roundCount === 0) {
      return {
        targetMultiplier,
        events,
        roundCount: 0,
        avgInterval: null,
        medianInterval: null,
        minInterval: null,
        maxInterval: null,
        stdInterval: null,
        intervalPercentiles: { p25: null, p50: null, p75: null, p95: null },
        totalCandles: this.totalCandles,
        frequency: 0,
      };
    }
    
    const intervals = events.map(e => e.intervalCandles);
    const sorted = [...intervals].sort((a, b) => a - b);
    
    const mean = intervals.reduce((sum, v) => sum + v, 0) / roundCount;
    const variance = intervals.reduce((sum, v) => sum + (v - mean) ** 2, 0) / roundCount;
    const std = Math.sqrt(variance);
    
    const percentile = (p: number) => {
      const index = Math.floor(p * roundCount);
      return sorted[Math.min(index, roundCount - 1)];
    };
    
    return {
      targetMultiplier,
      events,
      roundCount,
      avgInterval: mean,
      medianInterval: percentile(0.5),
      minInterval: sorted[0],
      maxInterval: sorted[roundCount - 1],
      stdInterval: std,
      intervalPercentiles: {
        p25: percentile(0.25),
        p50: percentile(0.5),
        p75: percentile(0.75),
        p95: percentile(0.95),
      },
      totalCandles: this.totalCandles,
      frequency: roundCount / this.totalCandles,
    };
  }

  /**
   * 重置所有账户（新的蒙特卡洛运行）
   */
  reset(): void {
    this.totalCandles = 0;
    this.lastCandleIndex = -1;
    this.multiplierCurves.clear();
    this.riskLineCurves.clear();
    this.estimatedCCurves.clear();
    this.equityCurves.clear();
    for (const account of this.accounts.values()) {
      account.reset();
    }
  }

  /**
   * 获取所有止盈线
   */
  getTargets(): number[] {
    return Array.from(this.accounts.keys());
  }
  
  /**
   * 获取资金曲线（用于可视化）
   */
  getMultiplierCurves(): Map<number, number[]> {
    // 填充最后的间隙
    if (this.recordSample && this.lastCandleIndex >= 0) {
      for (const [target, account] of this.accounts) {
        const curve = this.multiplierCurves.get(target);
        const riskCurve = this.riskLineCurves.get(target);
        const cCurve = this.estimatedCCurves.get(target);
        const equityCurve = this.equityCurves.get(target);
        if (!curve) continue;
        
        const lastMultiplier = curve[this.lastCandleIndex] ?? 1;
        const lastC = cCurve?.[this.lastCandleIndex] ?? 0;
        const lastEquity = equityCurve?.[this.lastCandleIndex] ?? 0;
        
        for (let i = this.lastCandleIndex + 1; i < curve.length; i++) {
          curve[i] = lastMultiplier;
          if (riskCurve) {
            riskCurve[i] = account.calculateRiskLine(i);
          }
          if (cCurve) {
            cCurve[i] = lastC;
          }
          if (equityCurve) {
            equityCurve[i] = lastEquity;
          }
        }
      }
    }
    return this.multiplierCurves;
  }
  
  /**
   * 获取风控线曲线（用于可视化）
   */
  getRiskLineCurves(): Map<number, number[]> {
    // 确保先调用 getMultiplierCurves 来填充间隙
    this.getMultiplierCurves();
    return this.riskLineCurves;
  }
  
  /**
   * 获取 C 估计值曲线（用于可视化）
   */
  getEstimatedCCurves(): Map<number, number[]> {
    return this.estimatedCCurves;
  }
  
  /**
   * 获取净值曲线（用于可视化）
   */
  getEquityCurves(): Map<number, number[]> {
    // 确保先调用 getMultiplierCurves 来填充间隙
    this.getMultiplierCurves();
    return this.equityCurves;
  }
  
  /**
   * 获取止盈标记（用于可视化）
   */
  getTakeProfitMarkers(): Map<number, number[]> {
    const markers = new Map<number, number[]>();
    for (const [target, account] of this.accounts) {
      const events = account.getTakeProfitEvents();
      markers.set(target, events.map(e => e.endCandleIndex));
    }
    return markers;
  }
  
  /**
   * 获取止损标记（用于可视化）
   */
  getStopLossMarkers(): Map<number, number[]> {
    const markers = new Map<number, number[]>();
    for (const [target, account] of this.accounts) {
      const events = account.getStopLossEvents();
      markers.set(target, events.map(e => e.endCandleIndex));
    }
    return markers;
  }
  
  /**
   * 获取观察期结束索引（用于可视化）
   */
  getObservationEndIndices(): Map<number, number> {
    const indices = new Map<number, number>();
    for (const [target, account] of this.accounts) {
      const stats = account.getRiskControlStats();
      indices.set(target, stats.observationEndIndex);
    }
    return indices;
  }
  
  /**
   * 获取所有账户的快照序列（用于样本详细报告）
   */
  getAccountSnapshots(): Map<number, AccountSnapshot[]> {
    const result = new Map<number, AccountSnapshot[]>();
    for (const [target, account] of this.accounts) {
      result.set(target, account.getAccountSnapshots());
    }
    return result;
  }
}
