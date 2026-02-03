/**
 * Virtual Account Types - 虚拟账户类型定义
 */

import type { TakeProfitEvent, StopLossEvent, AccountSnapshot } from '../types.js';

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

/**
 * 虚拟账户内部状态
 */
export interface VirtualAccountInternalState {
  /** 已实现盈亏 */
  realizedPnL: number;
  /** 未实现盈亏 */
  unrealizedPnL: number;
  /** 风控线 */
  riskLine: number;
  /** 仓位大小 */
  positionSize: number;
  /** 本轮开始索引 */
  roundStartIndex: number;
  /** 本轮交易次数 */
  roundTradeCount: number;
  /** 当前K线索引 */
  currentCandleIndex: number;
  /** 外部 C 值 */
  externalC: number;
  /** 外部 StopLoss 值 */
  externalStopLoss: number;
  /** 是否在观察期 */
  isObserving: boolean;
  /** 观察期结束索引 */
  observationEndIndex: number;
  /** 观察期跳过的交易数 */
  skippedTradesInObservation: number;
  /** 止盈事件 */
  takeProfitEvents: TakeProfitEvent[];
  /** 止损事件 */
  stopLossEvents: StopLossEvent[];
  /** 实盘期止盈次数 */
  realTakeProfitCount: number;
  /** 账户快照 */
  accountSnapshots: AccountSnapshot[];
}

/**
 * 记录止盈事件
 */
export function recordTakeProfitEvent(
  state: VirtualAccountInternalState,
  candleIndex: number,
  targetMultiplier: number
): void {
  const event: TakeProfitEvent = {
    roundIndex: state.takeProfitEvents.length + state.stopLossEvents.length,
    startCandleIndex: state.roundStartIndex,
    endCandleIndex: candleIndex,
    intervalCandles: candleIndex - state.roundStartIndex,
    finalVC: targetMultiplier, // 止盈时 UnrealizedPnL = M_T
    tradeCount: state.roundTradeCount,
  };
  state.takeProfitEvents.push(event);
}

/**
 * 记录止损事件
 */
export function recordStopLossEvent(
  state: VirtualAccountInternalState,
  candleIndex: number,
  externalC: number,
  externalStopLoss: number
): void {
  const pnl = state.realizedPnL + state.unrealizedPnL;
  const event: StopLossEvent = {
    roundIndex: state.takeProfitEvents.length + state.stopLossEvents.length,
    startCandleIndex: state.roundStartIndex,
    endCandleIndex: candleIndex,
    intervalCandles: candleIndex - state.roundStartIndex,
    finalVC: 0, // 止损时 VC = 0
    finalPnL: pnl,
    finalRiskLine: state.riskLine,
    estimatedC: externalC,
    stopLoss: externalStopLoss,
    tradeCount: state.roundTradeCount,
  };
  state.stopLossEvents.push(event);
}

/**
 * 止盈后重置轮次
 */
export function resetRoundForTakeProfit(
  state: VirtualAccountInternalState,
  candleIndex: number,
  targetMultiplier: number,
  calculatePosition: () => number
): void {
  // 止盈时只计入 M_T
  state.realizedPnL += targetMultiplier;
  // 清零未实现盈亏
  state.unrealizedPnL = 0;
  // 重置风控线
  state.riskLine = 0;
  // 重置轮次状态
  state.roundStartIndex = candleIndex;
  state.roundTradeCount = 0;
  // 重新计算仓位
  state.positionSize = calculatePosition();
}

/**
 * 记录账户快照
 */
export function recordSnapshot(
  state: VirtualAccountInternalState,
  candleIndex: number,
  tradeIndex: number,
  eventType: AccountSnapshot['eventType'],
  pnlPercent: number,
  actualPnl: number,
  overrides?: Partial<AccountSnapshot>
): void {
  const snapshot: AccountSnapshot = {
    candleIndex,
    tradeIndex,
    eventType,
    realizedPnL: state.realizedPnL,
    unrealizedPnL: state.unrealizedPnL,
    pnl: state.realizedPnL + state.unrealizedPnL,
    riskLine: state.riskLine,
    ventureCapital: state.unrealizedPnL - state.riskLine,
    stopLoss: state.externalStopLoss,
    estimatedC: state.externalC,
    positionSize: state.positionSize,
    pnlPercent,
    actualPnl,
    isObserving: state.isObserving,
    ...overrides,
  };
  state.accountSnapshots.push(snapshot);
}
