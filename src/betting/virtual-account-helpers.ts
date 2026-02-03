/**
 * Virtual Account Helpers - 虚拟账户辅助函数
 *
 * 提供事件记录和快照相关的辅助函数
 */

import type { TakeProfitEvent, StopLossEvent, AccountSnapshot } from '../types.js';

/**
 * 创建止盈事件
 */
export function createTakeProfitEvent(
  roundStartIndex: number,
  candleIndex: number,
  roundTradeCount: number,
  targetMultiplier: number,
  existingEventsCount: number
): TakeProfitEvent {
  return {
    roundIndex: existingEventsCount,
    startCandleIndex: roundStartIndex,
    endCandleIndex: candleIndex,
    intervalCandles: candleIndex - roundStartIndex,
    finalVC: targetMultiplier,
    tradeCount: roundTradeCount,
  };
}

/**
 * 创建止损事件
 */
export function createStopLossEvent(
  roundStartIndex: number,
  candleIndex: number,
  roundTradeCount: number,
  realizedPnL: number,
  unrealizedPnL: number,
  riskLine: number,
  externalC: number,
  externalStopLoss: number,
  existingEventsCount: number
): StopLossEvent {
  return {
    roundIndex: existingEventsCount,
    startCandleIndex: roundStartIndex,
    endCandleIndex: candleIndex,
    intervalCandles: candleIndex - roundStartIndex,
    finalVC: 0,
    finalPnL: realizedPnL + unrealizedPnL,
    finalRiskLine: riskLine,
    estimatedC: externalC,
    stopLoss: externalStopLoss,
    tradeCount: roundTradeCount,
  };
}

/**
 * 创建账户快照
 */
export function createAccountSnapshot(
  candleIndex: number,
  tradeIndex: number,
  eventType: AccountSnapshot['eventType'],
  realizedPnL: number,
  unrealizedPnL: number,
  riskLine: number,
  externalStopLoss: number,
  externalC: number,
  positionSize: number,
  pnlPercent: number,
  actualPnl: number,
  isObserving: boolean,
  overrides?: Partial<AccountSnapshot>
): AccountSnapshot {
  return {
    candleIndex,
    tradeIndex,
    eventType,
    realizedPnL,
    unrealizedPnL,
    pnl: realizedPnL + unrealizedPnL,
    riskLine,
    ventureCapital: unrealizedPnL - riskLine,
    stopLoss: externalStopLoss,
    estimatedC: externalC,
    positionSize,
    pnlPercent,
    actualPnl,
    isObserving,
    ...overrides,
  };
}

/**
 * 盘中检查止盈/止损
 */
export function checkIntradayConditions(
  direction: 1 | -1,
  entryPrice: number,
  high: number,
  low: number,
  unrealizedPnL: number,
  riskLine: number,
  positionSize: number,
  targetMultiplier: number,
  enableRiskControl: boolean,
  isObserving: boolean
): {
  takeProfitTriggered: boolean;
  stopLossTriggered: boolean;
  peakProfit?: number;
  maxDrawdown?: number;
} {
  if (enableRiskControl && isObserving) {
    return { takeProfitTriggered: false, stopLossTriggered: false };
  }

  const bestPrice = direction > 0 ? high : low;
  const worstPrice = direction > 0 ? low : high;

  const peakProfitPerUnit = (direction * (bestPrice - entryPrice)) / entryPrice;
  const maxDrawdownPerUnit = (-direction * (worstPrice - entryPrice)) / entryPrice;

  const peakProfit = peakProfitPerUnit * positionSize;
  const maxDrawdown = maxDrawdownPerUnit * positionSize;

  const peakUnrealizedPnL = unrealizedPnL + peakProfit;
  const worstUnrealizedPnL = unrealizedPnL - maxDrawdown;
  const worstVC = worstUnrealizedPnL - riskLine;

  if (peakUnrealizedPnL >= targetMultiplier) {
    return { takeProfitTriggered: true, stopLossTriggered: false, peakProfit: peakUnrealizedPnL };
  }

  if (enableRiskControl && worstVC <= 0) {
    return { takeProfitTriggered: false, stopLossTriggered: true, maxDrawdown };
  }

  return { takeProfitTriggered: false, stopLossTriggered: false };
}
