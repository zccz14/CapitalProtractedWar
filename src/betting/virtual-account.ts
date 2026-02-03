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
import type { TradeResultType, IntradayCheckResult } from './virtual-account-types.js';
import {
  createTakeProfitEvent,
  createStopLossEvent,
  createAccountSnapshot,
  checkIntradayConditions,
} from './virtual-account-helpers.js';

export class VirtualAccount {
  readonly targetMultiplier: number;
  private enableRiskControl: boolean;
  private realizedPnL: number = 0;
  private unrealizedPnL: number = 0;
  private riskLine: number = 0;
  private positionSize: number = 0;
  private roundStartIndex: number = 0;
  private roundTradeCount: number = 0;
  private currentCandleIndex: number = 0;
  private externalC: number = 0;
  private externalStopLoss: number = 0;
  private isObserving: boolean = true;
  private observationEndIndex: number = 0;
  private skippedTradesInObservation: number = 0;
  private takeProfitEvents: TakeProfitEvent[] = [];
  private stopLossEvents: StopLossEvent[] = [];
  private realTakeProfitCount: number = 0;
  private recordSnapshots: boolean = false;
  private accountSnapshots: AccountSnapshot[] = [];

  constructor(targetMultiplier: number, enableRiskControl: boolean = true) {
    this.targetMultiplier = targetMultiplier;
    this.enableRiskControl = enableRiskControl;
  }

  enableSnapshotRecording(): void {
    this.recordSnapshots = true;
  }

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
  getPositionSize(): number {
    return this.positionSize;
  }
  isInObservationPeriod(): boolean {
    return this.isObserving;
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

  calculatePosition(): number {
    if (this.externalStopLoss <= 0 || this.externalC <= 0) return 0;
    const vc = this.getVentureCapital();
    return vc <= 0 ? 0 : Math.max(1, Math.floor(vc / this.externalStopLoss));
  }

  updateRiskLine(candleIndex: number, externalC: number): void {
    this.currentCandleIndex = candleIndex;
    this.externalC = externalC;
    if (externalC > 0 && !this.isObserving) this.riskLine -= externalC;
  }

  preparePosition(externalStopLoss: number): void {
    this.externalStopLoss = externalStopLoss;
    this.positionSize = this.calculatePosition();
  }

  checkIntraday(
    direction: 1 | -1,
    entryPrice: number,
    high: number,
    low: number
  ): IntradayCheckResult {
    return checkIntradayConditions(
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
    this.currentCandleIndex = candleIndex;
    this.roundTradeCount++;
    if (this.recordSnapshots) {
      this.accountSnapshots.push(
        createAccountSnapshot(
          candleIndex,
          tradeIndex,
          'take_profit',
          this.realizedPnL,
          this.targetMultiplier,
          this.riskLine,
          externalStopLoss,
          externalC,
          this.positionSize,
          0,
          this.targetMultiplier - this.unrealizedPnL,
          false
        )
      );
    }
    this.recordTakeProfit(candleIndex);
  }

  processIntradayStopLoss(
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    this.currentCandleIndex = candleIndex;
    this.roundTradeCount++;
    this.unrealizedPnL = this.riskLine;
    if (this.recordSnapshots) {
      this.accountSnapshots.push(
        createAccountSnapshot(
          candleIndex,
          tradeIndex,
          'stop_loss',
          this.realizedPnL,
          this.unrealizedPnL,
          this.riskLine,
          externalStopLoss,
          externalC,
          this.positionSize,
          0,
          0,
          false,
          { ventureCapital: 0 }
        )
      );
    }
    this.recordStopLoss(candleIndex, externalC, externalStopLoss);
  }

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

    if (this.enableRiskControl) {
      if (externalC <= 0 || externalStopLoss <= 0) {
        this.isObserving = true;
      } else if (this.isObserving) {
        this.isObserving = false;
        this.observationEndIndex = candleIndex;
        this.positionSize = this.calculatePosition();
      }
    }

    if (this.enableRiskControl && this.isObserving) {
      this.skippedTradesInObservation++;
      if (this.recordSnapshots) {
        this.accountSnapshots.push(
          createAccountSnapshot(
            candleIndex,
            tradeIndex,
            'observing',
            this.realizedPnL,
            this.unrealizedPnL,
            this.riskLine,
            externalStopLoss,
            externalC,
            0,
            pnlPercent,
            0,
            true
          )
        );
      }
      return 'observing';
    }

    this.roundTradeCount++;
    const actualPnl = pnlPercent * this.positionSize;
    this.unrealizedPnL += actualPnl;

    if (this.enableRiskControl && this.getVentureCapital() <= 0) {
      this.unrealizedPnL = this.riskLine;
      if (this.recordSnapshots) {
        this.accountSnapshots.push(
          createAccountSnapshot(
            candleIndex,
            tradeIndex,
            'stop_loss',
            this.realizedPnL,
            this.unrealizedPnL,
            this.riskLine,
            externalStopLoss,
            externalC,
            this.positionSize,
            pnlPercent,
            actualPnl,
            false,
            { ventureCapital: 0 }
          )
        );
      }
      this.recordStopLoss(candleIndex, externalC, externalStopLoss);
      return 'stop_loss';
    }

    if (this.unrealizedPnL >= this.targetMultiplier) {
      if (this.recordSnapshots) {
        this.accountSnapshots.push(
          createAccountSnapshot(
            candleIndex,
            tradeIndex,
            'take_profit',
            this.realizedPnL,
            this.targetMultiplier,
            this.riskLine,
            externalStopLoss,
            externalC,
            this.positionSize,
            pnlPercent,
            actualPnl,
            false,
            {
              pnl: this.realizedPnL + this.targetMultiplier,
              ventureCapital: this.targetMultiplier - this.riskLine,
            }
          )
        );
      }
      this.recordTakeProfit(candleIndex);
      return 'take_profit';
    }

    if (this.recordSnapshots) {
      this.accountSnapshots.push(
        createAccountSnapshot(
          candleIndex,
          tradeIndex,
          'trade_close',
          this.realizedPnL,
          this.unrealizedPnL,
          this.riskLine,
          externalStopLoss,
          externalC,
          this.positionSize,
          pnlPercent,
          actualPnl,
          false
        )
      );
    }
    this.positionSize = this.calculatePosition();
    return 'none';
  }

  private recordTakeProfit(candleIndex: number): void {
    this.takeProfitEvents.push(
      createTakeProfitEvent(
        this.roundStartIndex,
        candleIndex,
        this.roundTradeCount,
        this.targetMultiplier,
        this.takeProfitEvents.length + this.stopLossEvents.length
      )
    );
    this.realTakeProfitCount++;
    this.realizedPnL += this.targetMultiplier;
    this.unrealizedPnL = 0;
    this.riskLine = 0;
    this.roundStartIndex = candleIndex;
    this.roundTradeCount = 0;
    this.positionSize = this.calculatePosition();
  }

  private recordStopLoss(candleIndex: number, externalC: number, externalStopLoss: number): void {
    this.stopLossEvents.push(
      createStopLossEvent(
        this.roundStartIndex,
        candleIndex,
        this.roundTradeCount,
        this.realizedPnL,
        this.unrealizedPnL,
        this.riskLine,
        externalC,
        externalStopLoss,
        this.takeProfitEvents.length + this.stopLossEvents.length
      )
    );
    this.positionSize = this.calculatePosition();
  }

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
