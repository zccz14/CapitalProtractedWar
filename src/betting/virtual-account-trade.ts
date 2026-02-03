/**
 * Virtual Account Trade Processing - 交易处理逻辑
 */

import {
  type TradeResultType,
  type VirtualAccountInternalState,
  recordTakeProfitEvent,
  recordStopLossEvent,
  resetRoundForTakeProfit,
  recordSnapshot,
} from './virtual-account-types.js';

/**
 * 处理盘中止盈
 */
export function processIntradayTakeProfitLogic(
  state: VirtualAccountInternalState,
  candleIndex: number,
  tradeIndex: number,
  externalC: number,
  externalStopLoss: number,
  targetMultiplier: number,
  recordSnapshots: boolean,
  calculatePosition: () => number
): void {
  state.currentCandleIndex = candleIndex;
  state.roundTradeCount++;

  if (recordSnapshots) {
    recordSnapshot(
      state,
      candleIndex,
      tradeIndex,
      'take_profit',
      0,
      targetMultiplier - state.unrealizedPnL,
      {
        unrealizedPnL: targetMultiplier,
        pnl: state.realizedPnL + targetMultiplier,
        ventureCapital: targetMultiplier - state.riskLine,
        stopLoss: externalStopLoss,
        estimatedC: externalC,
        isObserving: false,
      }
    );
  }

  recordTakeProfitEvent(state, candleIndex, targetMultiplier);
  state.realTakeProfitCount++;
  resetRoundForTakeProfit(state, candleIndex, targetMultiplier, calculatePosition);
}

/**
 * 处理盘中止损
 */
export function processIntradayStopLossLogic(
  state: VirtualAccountInternalState,
  candleIndex: number,
  tradeIndex: number,
  externalC: number,
  externalStopLoss: number,
  recordSnapshots: boolean,
  calculatePosition: () => number
): void {
  state.currentCandleIndex = candleIndex;
  state.roundTradeCount++;
  state.unrealizedPnL = state.riskLine;

  if (recordSnapshots) {
    recordSnapshot(state, candleIndex, tradeIndex, 'stop_loss', 0, 0, {
      ventureCapital: 0,
      stopLoss: externalStopLoss,
      estimatedC: externalC,
      isObserving: false,
    });
  }

  recordStopLossEvent(state, candleIndex, externalC, externalStopLoss);
  state.positionSize = calculatePosition();
}

/**
 * 处理交易结果
 */
export function processTradeResultLogic(
  state: VirtualAccountInternalState,
  pnlPercent: number,
  candleIndex: number,
  tradeIndex: number,
  externalC: number,
  externalStopLoss: number,
  targetMultiplier: number,
  enableRiskControl: boolean,
  recordSnapshots: boolean,
  calculatePosition: () => number,
  getVentureCapital: () => number
): TradeResultType {
  state.currentCandleIndex = candleIndex;
  state.externalC = externalC;
  state.externalStopLoss = externalStopLoss;

  // 观察期判断
  if (enableRiskControl) {
    if (externalC <= 0 || externalStopLoss <= 0) {
      state.isObserving = true;
    } else if (state.isObserving) {
      state.isObserving = false;
      state.observationEndIndex = candleIndex;
      state.positionSize = calculatePosition();
    }
  }

  // 观察期处理
  if (enableRiskControl && state.isObserving) {
    state.skippedTradesInObservation++;

    if (recordSnapshots) {
      recordSnapshot(state, candleIndex, tradeIndex, 'observing', pnlPercent, 0, {
        positionSize: 0,
        isObserving: true,
      });
    }

    return 'observing';
  }

  // 实盘期处理
  state.roundTradeCount++;
  const actualPnl = pnlPercent * state.positionSize;
  state.unrealizedPnL += actualPnl;

  const vc = getVentureCapital();

  // 止损检查
  if (enableRiskControl && vc <= 0) {
    state.unrealizedPnL = state.riskLine;

    if (recordSnapshots) {
      recordSnapshot(state, candleIndex, tradeIndex, 'stop_loss', pnlPercent, actualPnl, {
        ventureCapital: 0,
        isObserving: false,
      });
    }

    recordStopLossEvent(state, candleIndex, externalC, externalStopLoss);
    state.positionSize = calculatePosition();
    return 'stop_loss';
  }

  // 止盈检查
  if (state.unrealizedPnL >= targetMultiplier) {
    if (recordSnapshots) {
      recordSnapshot(state, candleIndex, tradeIndex, 'take_profit', pnlPercent, actualPnl, {
        unrealizedPnL: targetMultiplier,
        pnl: state.realizedPnL + targetMultiplier,
        ventureCapital: targetMultiplier - state.riskLine,
        isObserving: false,
      });
    }

    recordTakeProfitEvent(state, candleIndex, targetMultiplier);
    state.realTakeProfitCount++;
    resetRoundForTakeProfit(state, candleIndex, targetMultiplier, calculatePosition);
    return 'take_profit';
  }

  // 普通交易
  if (recordSnapshots) {
    recordSnapshot(state, candleIndex, tradeIndex, 'trade_close', pnlPercent, actualPnl, {
      isObserving: false,
    });
  }

  state.positionSize = calculatePosition();
  return 'none';
}

/**
 * 盘中检查止盈/止损
 */
export function checkIntradayLogic(
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
