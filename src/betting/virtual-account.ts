/**
 * Virtual Account - 单个虚拟账户
 * 
 * 核心功能：
 * 1. 追踪特定 M_T 的止盈/止损事件
 * 2. 管理 RealizedPnL、UnrealizedPnL、RiskLine、VC 状态
 * 3. 计算仓位 Position = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 * 
 * 核心变量：
 * - RealizedPnL(t): 已实现盈亏（止盈时锁定）
 * - UnrealizedPnL(t): 未实现盈亏（当前轮次累计）
 * - PnL(t) = RealizedPnL(t) + UnrealizedPnL(t): 总盈亏
 * - RiskLine(t): 风控线，每K线下降 C(t)，止盈后重置为0
 * - VC(t) = UnrealizedPnL(t) - RiskLine(t): 风险资金
 * - Position(t): 仓位（非负整数）
 * 
 * 事件触发（盘中检查）：
 * - 止盈：持仓期间最高浮盈 >= M_T（做多用最高价，做空用最低价）
 * - 止损：持仓期间 VC <= 0（做多用最低价，做空用最高价）
 * 
 * 止盈后：
 * - RealizedPnL += M_T（只计入 M_T，不超过）
 * - UnrealizedPnL = 0
 * - RiskLine = 0
 * 
 * 止损后：
 * - UnrealizedPnL 限制到 RiskLine（即 VC = 0）
 * - RealizedPnL 不变
 * - RiskLine 不变，继续下降
 * - 随着时间推移，RiskLine 下降，VC 得到补充
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

/**
 * 盘中检查结果
 */
export interface IntradayCheckResult {
  /** 是否触发止盈 */
  takeProfitTriggered: boolean;
  /** 是否触发止损 */
  stopLossTriggered: boolean;
  /** 触发时的浮盈（用于止盈） */
  peakProfit?: number;
  /** 触发时的浮亏（用于止损） */
  maxDrawdown?: number;
}

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
   * 盘中检查止盈/止损（在持仓期间每根K线调用）
   * 
   * 止盈条件：持仓期间最高浮盈 >= M_T
   * - 做多：(最高价 - 开仓价) / 开仓价 * 仓位 + 已有未实现盈亏 >= M_T
   * - 做空：(开仓价 - 最低价) / 开仓价 * 仓位 + 已有未实现盈亏 >= M_T
   * 
   * 止损条件：持仓期间最大浮亏使得 VC <= 0
   * - 做多：用最低价计算浮亏
   * - 做空：用最高价计算浮亏
   * 
   * @param direction - 持仓方向：1=做多, -1=做空
   * @param entryPrice - 开仓价格
   * @param high - 当前K线最高价
   * @param low - 当前K线最低价
   * @param candleIndex - 当前K线索引
   * @param tradeIndex - 交易序号
   * @param externalC - 外部提供的 C 值
   * @param externalStopLoss - 外部提供的 StopLoss 值
   * @returns 盘中检查结果
   */
  checkIntraday(
    direction: 1 | -1,
    entryPrice: number,
    high: number,
    low: number,
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): IntradayCheckResult {
    // 观察期不检查
    if (this.enableRiskControl && this.isObserving) {
      return { takeProfitTriggered: false, stopLossTriggered: false };
    }
    
    // 计算盘中最高浮盈和最大浮亏
    // 做多：最高浮盈用最高价，最大浮亏用最低价
    // 做空：最高浮盈用最低价，最大浮亏用最高价
    const bestPrice = direction > 0 ? high : low;
    const worstPrice = direction > 0 ? low : high;
    
    // 盘中最高浮盈（单位仓位）
    const peakProfitPerUnit = direction * (bestPrice - entryPrice) / entryPrice;
    // 盘中最大浮亏（单位仓位，正数表示亏损）
    const maxDrawdownPerUnit = -direction * (worstPrice - entryPrice) / entryPrice;
    
    // 计算仓位放大后的浮盈/浮亏
    const peakProfit = peakProfitPerUnit * this.positionSize;
    const maxDrawdown = maxDrawdownPerUnit * this.positionSize;
    
    // 计算盘中最高 UnrealizedPnL
    const peakUnrealizedPnL = this.unrealizedPnL + peakProfit;
    
    // 计算盘中最低 UnrealizedPnL（最大亏损时）
    const worstUnrealizedPnL = this.unrealizedPnL - maxDrawdown;
    
    // 计算盘中最低 VC
    const worstVC = worstUnrealizedPnL - this.riskLine;
    
    // 检查止盈：盘中最高浮盈 >= M_T
    if (peakUnrealizedPnL >= this.targetMultiplier) {
      return {
        takeProfitTriggered: true,
        stopLossTriggered: false,
        peakProfit: peakUnrealizedPnL,
      };
    }
    
    // 检查止损：盘中最低 VC <= 0
    if (this.enableRiskControl && worstVC <= 0) {
      return {
        takeProfitTriggered: false,
        stopLossTriggered: true,
        maxDrawdown: maxDrawdown,
      };
    }
    
    return { takeProfitTriggered: false, stopLossTriggered: false };
  }

  /**
   * 处理盘中止盈
   * 
   * 止盈时：RealizedPnL += M_T（只计入 M_T，不超过）
   */
  processIntradayTakeProfit(
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    this.currentCandleIndex = candleIndex;
    this.roundTradeCount++;
    
    if (this.recordSnapshots) {
      this.accountSnapshots.push({
        candleIndex,
        tradeIndex,
        eventType: 'take_profit',
        realizedPnL: this.realizedPnL,
        unrealizedPnL: this.targetMultiplier,  // 止盈时限制为 M_T
        pnl: this.realizedPnL + this.targetMultiplier,
        riskLine: this.riskLine,
        ventureCapital: this.targetMultiplier - this.riskLine,
        stopLoss: externalStopLoss,
        estimatedC: externalC,
        positionSize: this.positionSize,
        pnlPercent: 0,  // 盘中止盈，不使用收盘价计算
        actualPnl: this.targetMultiplier - this.unrealizedPnL,  // 本次交易贡献
        isObserving: false,
      });
    }
    
    this.recordTakeProfitEvent(candleIndex);
    this.realTakeProfitCount++;
    this.resetRoundForTakeProfit(candleIndex);
  }

  /**
   * 处理盘中止损
   * 
   * 止损时：UnrealizedPnL 限制到 RiskLine（即 VC = 0）
   * - RealizedPnL 不变
   * - RiskLine 不变，继续下降
   * - 随着时间推移，VC 得到补充
   */
  processIntradayStopLoss(
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    this.currentCandleIndex = candleIndex;
    this.roundTradeCount++;
    
    // 止损时 UnrealizedPnL 限制到 RiskLine（VC = 0）
    this.unrealizedPnL = this.riskLine;
    
    if (this.recordSnapshots) {
      this.accountSnapshots.push({
        candleIndex,
        tradeIndex,
        eventType: 'stop_loss',
        realizedPnL: this.realizedPnL,
        unrealizedPnL: this.unrealizedPnL,
        pnl: this.getPnL(),
        riskLine: this.riskLine,
        ventureCapital: 0,  // 止损时 VC = 0
        stopLoss: externalStopLoss,
        estimatedC: externalC,
        positionSize: this.positionSize,
        pnlPercent: 0,  // 盘中止损
        actualPnl: 0,   // 止损后限制，实际贡献为0
        isObserving: false,
      });
    }
    
    this.recordStopLossEvent(candleIndex, externalC, externalStopLoss);
    // 止损后不重置轮次，只是记录事件
    // 仓位变为0（因为 VC = 0）
    this.positionSize = this.calculatePosition();
  }

  /**
   * 处理交易结果（交易正常结束，未触发盘中止盈/止损）
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
    // 实盘期：正常处理交易（未触发盘中止盈/止损）
    // ============================================
    this.roundTradeCount++;
    
    // 计算实际 PnL 并累加到未实现盈亏
    const actualPnl = pnlPercent * this.positionSize;
    this.unrealizedPnL += actualPnl;
    
    const vc = this.getVentureCapital();
    
    // ============================================
    // 交易结束时的止损检查：VC <= 0
    // （作为盘中检查的补充，处理边界情况）
    // ============================================
    if (this.enableRiskControl && vc <= 0) {
      // 止损时 UnrealizedPnL 限制到 RiskLine
      this.unrealizedPnL = this.riskLine;
      
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'stop_loss',
          realizedPnL: this.realizedPnL,
          unrealizedPnL: this.unrealizedPnL,
          pnl: this.getPnL(),
          riskLine: this.riskLine,
          ventureCapital: 0,
          stopLoss: externalStopLoss,
          estimatedC: externalC,
          positionSize: this.positionSize,
          pnlPercent,
          actualPnl,
          isObserving: false,
        });
      }
      
      this.recordStopLossEvent(candleIndex, externalC, externalStopLoss);
      // 止损后不重置轮次，仓位变为0（因为 VC = 0）
      this.positionSize = this.calculatePosition();
      return 'stop_loss';
    }
    
    // ============================================
    // 交易结束时的止盈检查：UnrealizedPnL >= M_T
    // （作为盘中检查的补充，处理边界情况）
    // ============================================
    if (this.unrealizedPnL >= this.targetMultiplier) {
      if (this.recordSnapshots) {
        this.accountSnapshots.push({
          candleIndex,
          tradeIndex,
          eventType: 'take_profit',
          realizedPnL: this.realizedPnL,
          unrealizedPnL: this.targetMultiplier,  // 限制为 M_T
          pnl: this.realizedPnL + this.targetMultiplier,
          riskLine: this.riskLine,
          ventureCapital: this.targetMultiplier - this.riskLine,
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
      this.resetRoundForTakeProfit(candleIndex);
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
      finalVC: this.targetMultiplier,  // 止盈时 UnrealizedPnL = M_T
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
      finalVC: 0,  // 止损时 VC = 0
      finalPnL: this.getPnL(),  // 止损后 PnL = RealizedPnL + UnrealizedPnL（限制后）
      finalRiskLine: this.riskLine,
      estimatedC: externalC,
      stopLoss: externalStopLoss,
      tradeCount: this.roundTradeCount,
    };
    this.stopLossEvents.push(event);
  }

  /**
   * 止盈后重置
   * - RealizedPnL += M_T（只计入 M_T）
   * - UnrealizedPnL = 0
   * - RiskLine = 0
   */
  private resetRoundForTakeProfit(candleIndex: number): void {
    // 止盈时只计入 M_T
    this.realizedPnL += this.targetMultiplier;
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

  // 注意：止损不再重置轮次，只是限制 UnrealizedPnL 到 RiskLine

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
