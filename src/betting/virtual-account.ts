/**
 * Virtual Account - 单个虚拟账户
 *
 * 核心功能：
 * 1. 追踪特定 M_T 的止盈/止损事件
 * 2. 管理 RealizedPnL、UnrealizedPnL、RiskLine、VC 状态
 * 3. 计算仓位 Position = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 */

import type {
  TakeProfitEvent,
  StopLossEvent,
  VirtualAccountState,
  RiskControlStats,
  AccountSnapshot,
} from '../types.js';

import type {
  TradeResultType,
  IntradayCheckResult,
  VirtualAccountInternalState,
} from './virtual-account-types.js';
import {
  processIntradayTakeProfitLogic,
  processIntradayStopLossLogic,
  processTradeResultLogic,
  checkIntradayLogic,
} from './virtual-account-trade.js';

export type { TradeResultType, IntradayCheckResult };

export class VirtualAccount {
  readonly targetMultiplier: number;
  private enableRiskControl: boolean;

  // 核心状态
  private realizedPnL: number = 0;
  private unrealizedPnL: number = 0;
  private riskLine: number = 0;
  private positionSize: number = 0;
  private roundStartIndex: number = 0;
  private roundTradeCount: number = 0;
  private currentCandleIndex: number = 0;

  // 外部参数
  private externalC: number = 0;
  private externalStopLoss: number = 0;

  // 观察期状态
  private isObserving: boolean = true;
  private observationEndIndex: number = 0;
  private skippedTradesInObservation: number = 0;

  // 事件记录
  private takeProfitEvents: TakeProfitEvent[] = [];
  private stopLossEvents: StopLossEvent[] = [];
  private realTakeProfitCount: number = 0;

  // 快照记录
  private recordSnapshots: boolean = false;
  private accountSnapshots: AccountSnapshot[] = [];

  constructor(targetMultiplier: number, enableRiskControl: boolean = true) {
    this.targetMultiplier = targetMultiplier;
    this.enableRiskControl = enableRiskControl;
  }

  enableSnapshotRecording(): void {
    this.recordSnapshots = true;
  }

  // 核心计算方法
  getPnL(): number {
    return this.realizedPnL + this.unrealizedPnL;
  }

  getRealizedPnL(): number {
    return this.realizedPnL;
  }

  getUnrealizedPnL(): number {
    return this.unrealizedPnL;
  }

  getVentureCapital(): number {
    return this.unrealizedPnL - this.riskLine;
  }

  getRiskLine(): number {
    return this.riskLine;
  }

  calculatePosition(): number {
    if (this.externalStopLoss <= 0 || this.externalC <= 0) return 0;
    const vc = this.getVentureCapital();
    if (vc <= 0) return 0;
    return Math.max(1, Math.floor(vc / this.externalStopLoss));
  }

  updateRiskLine(candleIndex: number, externalC: number): void {
    this.currentCandleIndex = candleIndex;
    this.externalC = externalC;
    if (externalC > 0 && !this.isObserving) {
      this.riskLine -= externalC;
    }
  }

  preparePosition(externalStopLoss: number): void {
    this.externalStopLoss = externalStopLoss;
    this.positionSize = this.calculatePosition();
  }

  checkIntraday(
    direction: 1 | -1,
    entryPrice: number,
    high: number,
    low: number,
    _candleIndex: number,
    _tradeIndex: number,
    _externalC: number,
    _externalStopLoss: number
  ): IntradayCheckResult {
    return checkIntradayLogic(
      direction,
      entryPrice,
      high,
      low,
      this.unrealizedPnL,
      this.riskLine,
      this.positionSize,
      this.targetMultiplier,
      this.enableRiskControl,
      this.isObserving
    );
  }

  processIntradayTakeProfit(
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    const state = this.getInternalState();
    processIntradayTakeProfitLogic(
      state,
      candleIndex,
      tradeIndex,
      externalC,
      externalStopLoss,
      this.targetMultiplier,
      this.recordSnapshots,
      () => this.calculatePosition()
    );
    this.syncFromState(state);
  }

  processIntradayStopLoss(
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    const state = this.getInternalState();
    processIntradayStopLossLogic(
      state,
      candleIndex,
      tradeIndex,
      externalC,
      externalStopLoss,
      this.recordSnapshots,
      () => this.calculatePosition()
    );
    this.syncFromState(state);
  }

  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): TradeResultType {
    const state = this.getInternalState();
    const result = processTradeResultLogic(
      state,
      pnlPercent,
      candleIndex,
      tradeIndex,
      externalC,
      externalStopLoss,
      this.targetMultiplier,
      this.enableRiskControl,
      this.recordSnapshots,
      () => this.calculatePosition(),
      () => this.getVentureCapital()
    );
    this.syncFromState(state);
    return result;
  }

  private getInternalState(): VirtualAccountInternalState {
    return {
      realizedPnL: this.realizedPnL,
      unrealizedPnL: this.unrealizedPnL,
      riskLine: this.riskLine,
      positionSize: this.positionSize,
      roundStartIndex: this.roundStartIndex,
      roundTradeCount: this.roundTradeCount,
      currentCandleIndex: this.currentCandleIndex,
      externalC: this.externalC,
      externalStopLoss: this.externalStopLoss,
      isObserving: this.isObserving,
      observationEndIndex: this.observationEndIndex,
      skippedTradesInObservation: this.skippedTradesInObservation,
      takeProfitEvents: this.takeProfitEvents,
      stopLossEvents: this.stopLossEvents,
      realTakeProfitCount: this.realTakeProfitCount,
      accountSnapshots: this.accountSnapshots,
    };
  }

  private syncFromState(state: VirtualAccountInternalState): void {
    this.realizedPnL = state.realizedPnL;
    this.unrealizedPnL = state.unrealizedPnL;
    this.riskLine = state.riskLine;
    this.positionSize = state.positionSize;
    this.roundStartIndex = state.roundStartIndex;
    this.roundTradeCount = state.roundTradeCount;
    this.currentCandleIndex = state.currentCandleIndex;
    this.externalC = state.externalC;
    this.externalStopLoss = state.externalStopLoss;
    this.isObserving = state.isObserving;
    this.observationEndIndex = state.observationEndIndex;
    this.skippedTradesInObservation = state.skippedTradesInObservation;
    this.takeProfitEvents = state.takeProfitEvents;
    this.stopLossEvents = state.stopLossEvents;
    this.realTakeProfitCount = state.realTakeProfitCount;
    this.accountSnapshots = state.accountSnapshots;
  }

  // Getters
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
