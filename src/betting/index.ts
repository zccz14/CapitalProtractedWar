/**
 * Betting Module - 投注策略模块
 * 
 * 本模块负责：
 * 1. 多账户并行追踪不同止盈线 M_T
 * 2. 反马丁格尔仓位管理
 * 3. 止盈事件记录和统计
 */

export {
  VirtualAccount,
  MultiAccountTracker,
} from './multi-account-tracker.js';
