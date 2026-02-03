/**
 * Virtual Account Types - 虚拟账户类型定义
 */

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
