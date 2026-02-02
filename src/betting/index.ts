/**
 * Betting Module - 投注策略模块
 * 
 * 本模块负责：
 * 1. 多账户并行追踪不同止盈线 M_T
 * 2. 基于风险资金的仓位管理
 * 3. 止盈/止损事件记录和统计
 * 
 * 核心公式：
 * - Position(t) = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 * - VC(t) = PnL(t) - RiskLine(t)
 * - RiskLine(t+1) = RiskLine(t) - C(t)
 */

export { VirtualAccount } from './virtual-account.js';
export type { TradeResultType, IntradayCheckResult } from './virtual-account.js';
export { MultiAccountTracker } from './multi-account-tracker.js';
export { BaselineTracker } from './baseline-tracker.js';
