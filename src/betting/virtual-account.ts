/**
 * Virtual Account - 单个虚拟账户
 * 
 * 核心功能：
 * 1. 追踪特定 M_T 的止盈/止损事件
 * 2. 管理 RealizedPnL、UnrealizedPnL、RiskLine、VC 状态
 * 3. 计算仓位 Position = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 * 
 * 核心变量：
 * - RealizedPnL(t): 已实现盈亏（止盈/止损时锁定）
 * - UnrealizedPnL(t): 未实现盈亏（当前轮次累计，止盈/止损时清零）
 * - PnL(t) = RealizedPnL(t) + UnrealizedPnL(t): 总盈亏
 * - RiskLine(t): 风控线，每K线下降 C(t)，止盈/止损后重置为0
 * - VC(t) = UnrealizedPnL(t) - RiskLine(t): 风险资金
 * - Position(t): 仓位（非负整数）
 * 
 * 事件触发：
 * - 止盈：UnrealizedPnL(t) >= M_T
 * - 止损：VC(t) <= 0
 * 
 * 止盈/止损后：
 * - RealizedPnL += UnrealizedPnL
 * - UnrealizedPnL = 0
 * - RiskLine = 0
 */

import type {
  TakeProfitEvent,
  StopLossEvent,
  VirtualAccountState,
  RiskControlStats,
  AccountSnapshot,
} from '../types.js';

/**
 * 交易结果类型
 */
export type TradeResultType = 'none' | 'take_profit' | 'stop_loss' | 'observing';

export class VirtualAccount {
  /** 止盈线 M_T */
  readonly targetMultiplier: number;
  
  /** 是否启用风控 */
  private enableRiskControl: boolean;
  
  // ============================================
  // 核心状态
  // ============================================
  
  /** 已实现盈亏 RealizedPnL(t) */
  private realizedPnL: number = 0;
  
  /** 未实现盈亏 UnrealizedPnL(t) */
  private unrealizedPnL: number = 0;
  
  /** 风控线 RiskLine(t) */
  private riskLine: number = 0;
  
  /** 当前仓位 Position(t)（非负整数） */
  private positionSize: number = 0;
  
  /** 本轮开始的K线索引 */
  private roundStartIndex: number = 0;
  
  /** 本轮交易次数 */
  private roundTradeCount: number = 0;
  
  /** 当前K线索引 */
  private currentCandleIndex: number = 0;
  
  // ============================================
  // 外部参数（由 BaselineTracker 提供）
  // ============================================
  
  /** 当前 C(t) 值 */
  private externalC: number = 0;
  
  /** 当前 StopLoss(t) 值 */
  private externalStopLoss: number = 0;
  
  // ============================================
  // 观察期状态
  // ============================================
  
  /** 是否在观察期 */
  private isObserving: boolean = true;
  
  /** 观察期结束的K线索引 */
  private observationEndIndex: number = 0;
  
  /** 观察期内跳过的交易次数 */
  private skippedTradesInObservation: number = 0;
  
  // ============================================
  // 事件记录
  // ============================================
  
  /** 止盈事件记录 */
  private takeProfitEvents: TakeProfitEvent[] = [];
  
  /** 止损事件记录 */
  private stopLossEvents: StopLossEvent[] = [];
  
  /** 实盘期内的止盈次数 */
  private realTakeProfitCount: number = 0;
  
  // ============================================
  // 快照记录
  // ============================================
  
  /** 是否记录详细快照 */
  private recordSnapshots: boolean = false;
  
  /** 账户快照序列 */
  private accountSnapshots: AccountSnapshot[] = [];

  constructor(
    targetMultiplier: number,
    enableRiskControl: boolean = true
  ) {
    this.targetMultiplier = targetMultiplier;
    this.enableRiskControl = enableRiskControl;
  }

  /**
   * 启用详细快照记录
   */
  enableSnapshotRecording(): void {
    this.recordSnapshots = true;
  }

  // ============================================
  // 核心计算方法
  // ============================================

  /**
   * 获取总盈亏 PnL(t) = RealizedPnL + UnrealizedPnL
   */
  getPnL(): number {
    return this.realizedPnL + this.unrealizedPnL;
  }

  /**
   * 获取已实现盈亏
   */
  getRealizedPnL(): number {
    return this.realizedPnL;
  }

  /**
   * 获取未实现盈亏
   */
  getUnrealizedPnL(): number {
    return this.unrealizedPnL;
  }

  /**
   * 计算风险资金 VC(t) = UnrealizedPnL(t) - RiskLine(t)
   */
  getVentureCapital(): number {
    return this.unrealizedPnL - this.riskLine;
  }

  /**
   * 获取风控线
   */
  getRiskLine(): number {
    return this.riskLine;
  }

  /**
   * 计算仓位 Position(t) = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
   */
  calculatePosition(): number {
    if (this.externalStopLoss <= 0 || this.externalC <= 0) {
      return 0;  // 观察期
    }
    const vc = this.getVentureCapital();
    if (vc <= 0) {
      return 0;  // 无风险资金
    }
    return Math.max(1, Math.floor(vc / this.externalStopLoss));
  }

  // ============================================
  // 每K线更新
  // ============================================

  /**
   * 每根K线调用，更新风控线
   * RiskLine(t+1) = RiskLine(t) - C(t)
   */
  updateRiskLine(candleIndex: number, externalC: number): void {
    this.currentCandleIndex = candleIndex;
    this.externalC = externalC;
    
    // 风控线每K线下降 C（仅在实盘期）
    if (externalC > 0 && !this.isObserving) {
      this.riskLine -= externalC;
    }
  }

  // ============================================
  // 交易处理
  // ============================================

  /**
   * 开仓前准备仓位
   */
  preparePosition(externalStopLoss: number): void {
    this.externalStopLoss = externalStopLoss;
    this.positionSize = this.calculatePosition();
  }

  /**
   * 处理交易结果
   * 
   * @param pnlPercent - 单位仓位的盈亏百分比
   * @param candleIndex - 当前K线索引
   * @param tradeIndex - 交易序号
   * @param externalC - 外部提供的 C 值
   * @param externalStopLoss - 外部提供的 StopLoss 值
   * @returns 交易结果类型
   */
  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): TradeResultType {
    this.currentCandleIndex = candleIndex;
    this.externalC = externalC;
    this.externalStopLoss = externalStopLoss;
    
    // ============================================
    // 观察期判断：C = 0 或 StopLoss = 0 时为观察期
    // ============================================
    
    if (this.enableRiskControl) {
      if (externalC <= 0 || externalStopLoss <= 0) {
        // 仍在观察期
        this.isObserving = true;
      } else if (this.isObserving) {
        // 观察期结束
        this.isObserving = false;
        this.observationEndIndex = candleIndex;
        // 观察期结束后，准备第一笔仓位
        this.positionSize = this.calculatePosition();
      }
    }
    
    // ============================================
    // 观察期处理：记录快照但不执行实际交易
    // ============================================
    if (this.enableRiskControl && this.isObserving) {
      this.skippedTradesInObservation++;
      
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'observing',
          realizedPnL: this.realizedPnL,
          unrealizedPnL: this.unrealizedPnL,
          pnl: this.getPnL(),
          riskLine: this.riskLine,
          ventureCapital: this.getVentureCapital(),
          stopLoss: externalStopLoss,
          estimatedC: externalC,
          positionSize: 0,
          pnlPercent,
          actualPnl: 0,
          isObserving: true,
        });
      }
      
      return 'observing';
    }
    
    // ============================================
    // 实盘期：正常处理交易
    // ============================================
    this.roundTradeCount++;
    
    // 计算实际 PnL 并累加到未实现盈亏
    const actualPnl = pnlPercent * this.positionSize;
    this.unrealizedPnL += actualPnl;
    
    const vc = this.getVentureCapital();
    
    // ============================================
    // 止损检查：VC <= 0
    // ============================================
    if (this.enableRiskControl && vc <= 0) {
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'stop_loss',
          realizedPnL: this.realizedPnL,
          unrealizedPnL: this.unrealizedPnL,
          pnl: this.getPnL(),
          riskLine: this.riskLine,
          ventureCapital: vc,
          stopLoss: externalStopLoss,
          estimatedC: externalC,
          positionSize: this.positionSize,
          pnlPercent,
          actualPnl,
          isObserving: false,
        });
      }
      
      this.recordStopLossEvent(candleIndex, externalC, externalStopLoss);
      this.resetRound(candleIndex);
      return 'stop_loss';
    }
    
    // ============================================
    // 止盈检查：UnrealizedPnL >= M_T
    // ============================================
    if (this.unrealizedPnL >= this.targetMultiplier) {
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'take_profit',
          realizedPnL: this.realizedPnL,
          unrealizedPnL: this.unrealizedPnL,
          pnl: this.getPnL(),
          riskLine: this.riskLine,
          ventureCapital: vc,
          stopLoss: externalStopLoss,
          estimatedC: externalC,
          positionSize: this.positionSize,
          pnlPercent,
          actualPnl,
          isObserving: false,
        });
      }
      
      this.recordTakeProfitEvent(candleIndex);
      this.realTakeProfitCount++;
      this.resetRound(candleIndex);
      return 'take_profit';
    }
    
    // ============================================
    // 普通交易：更新下一笔仓位
    // ============================================
    if (this.recordSnapshots) {
      this.accountSnapshots.push({
        candleIndex,
        tradeIndex,
        eventType: 'trade_close',
        realizedPnL: this.realizedPnL,
        unrealizedPnL: this.unrealizedPnL,
        pnl: this.getPnL(),
        riskLine: this.riskLine,
        ventureCapital: vc,
        stopLoss: externalStopLoss,
        estimatedC: externalC,
        positionSize: this.positionSize,
        pnlPercent,
        actualPnl,
        isObserving: false,
      });
    }
    
    // 更新下一笔交易的仓位
    this.positionSize = this.calculatePosition();
    
    return 'none';
  }

  // ============================================
  // 事件记录
  // ============================================

  /**
   * 记录止盈事件
   */
  private recordTakeProfitEvent(candleIndex: number): void {
    const event: TakeProfitEvent = {
      roundIndex: this.takeProfitEvents.length + this.stopLossEvents.length,
      startCandleIndex: this.roundStartIndex,
      endCandleIndex: candleIndex,
      intervalCandles: candleIndex - this.roundStartIndex,
      finalVC: this.unrealizedPnL,  // 止盈时 UnrealizedPnL >= M_T
      tradeCount: this.roundTradeCount,
    };
    this.takeProfitEvents.push(event);
  }

  /**
   * 记录止损事件
   */
  private recordStopLossEvent(
    candleIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    const event: StopLossEvent = {
      roundIndex: this.takeProfitEvents.length + this.stopLossEvents.length,
      startCandleIndex: this.roundStartIndex,
      endCandleIndex: candleIndex,
      intervalCandles: candleIndex - this.roundStartIndex,
      finalVC: this.getVentureCapital(),
      finalPnL: this.getPnL(),
      finalRiskLine: this.riskLine,
      estimatedC: externalC,
      stopLoss: externalStopLoss,
      tradeCount: this.roundTradeCount,
    };
    this.stopLossEvents.push(event);
  }

  /**
   * 止盈/止损后重置
   * - RealizedPnL += UnrealizedPnL
   * - UnrealizedPnL = 0
   * - RiskLine = 0
   */
  private resetRound(candleIndex: number): void {
    // 锁定已实现盈亏
    this.realizedPnL += this.unrealizedPnL;
    // 清零未实现盈亏
    this.unrealizedPnL = 0;
    // 重置风控线
    this.riskLine = 0;
    // 重置轮次状态
    this.roundStartIndex = candleIndex;
    this.roundTradeCount = 0;
    // 重新计算仓位（VC = 0 - 0 = 0，所以 Position 会是 0 或 1）
    this.positionSize = this.calculatePosition();
  }

  // ============================================
  // Getters
  // ============================================

  getState(): VirtualAccountState {
    return {
      realizedPnL: this.realizedPnL,
      unrealizedPnL: this.unrealizedPnL,
      pnl: this.getPnL(),
      riskLine: this.riskLine,
      ventureCapital: this.getVentureCapital(),
      positionSize: this.positionSize,
      roundStartIndex: this.roundStartIndex,
      roundTradeCount: this.roundTradeCount,
    };
  }

  getPositionSize(): number {
    return this.positionSize;
  }

  getTakeProfitEvents(): TakeProfitEvent[] {
    return [...this.takeProfitEvents];
  }

  getStopLossEvents(): StopLossEvent[] {
    return [...this.stopLossEvents];
  }

  getAccountSnapshots(): AccountSnapshot[] {
    return [...this.accountSnapshots];
  }

  isInObservationPeriod(): boolean {
    return this.isObserving;
  }

  getRiskControlStats(): RiskControlStats {
    const takeProfitCount = this.realTakeProfitCount;
    const stopLossCount = this.stopLossEvents.length;
    const total = takeProfitCount + stopLossCount;
    
    return {
      observationEndIndex: this.observationEndIndex,
      skippedTradesInObservation: this.skippedTradesInObservation,
      learnedC: this.externalC,
      learnedStopLoss: this.externalStopLoss,
      stopLossEvents: this.getStopLossEvents(),
      stopLossCount,
      takeProfitCount,
      riskAdjustedWinRate: total > 0 ? takeProfitCount / total : 0,
    };
  }

  // ============================================
  // 重置
  // ============================================

  reset(): void {
    this.realizedPnL = 0;
    this.unrealizedPnL = 0;
    this.riskLine = 0;
    this.positionSize = 0;
    this.roundStartIndex = 0;
    this.roundTradeCount = 0;
    this.currentCandleIndex = 0;
    this.externalC = 0;
    this.externalStopLoss = 0;
    this.isObserving = this.enableRiskControl;
    this.observationEndIndex = 0;
    this.skippedTradesInObservation = 0;
    this.takeProfitEvents = [];
    this.stopLossEvents = [];
    this.realTakeProfitCount = 0;
    this.accountSnapshots = [];
  }
}
