/**
 * Phases 模块导出
 */

export { runPhase0, type Phase0Options, type Phase0Result } from './phase0-generate.js';
export { runPhase1, type Phase1Options, type Phase1Result } from './phase1-run.js';
export { runPhase2, type Phase2Options, type Phase2Result } from './phase2-aggregate.js';
export { runPhase3, type Phase3Options, type Phase3Result } from './phase3-samples.js';
export { runPhase4, type Phase4Options, type Phase4Result } from './phase4-report.js';

import type { SignalStrategyConfig } from '../../types.js';
import type { MarketGroupEntry } from '../../market/manifest.js';

/**
 * 检查信号策略是否适用于指定市场组
 *
 * 如果 signalConfig.markets 未设置或为空，则适用于所有市场。
 * 否则，检查市场组名称或 groupId 是否在列表中。
 */
export function isSignalApplicableToGroup(
  signalConfig: SignalStrategyConfig,
  group: MarketGroupEntry
): boolean {
  if (!signalConfig.markets || signalConfig.markets.length === 0) return true;
  return signalConfig.markets.some((m) => group.name === m || group.groupId === m);
}
