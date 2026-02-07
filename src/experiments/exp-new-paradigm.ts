/**
 * 新范式实验 - 止盈间隔评估
 *
 * 实验架构：市场序列 × 信号策略 × 投注策略(M_T)
 *
 * 核心变化：
 * - 不再关注 E[M]（易被极端值影响）
 * - 不再关注 P(M >= k)（时间拉长总能成功）
 * - 核心关注：各 M_T 下止盈事件的平均时间间隔
 *
 * 内存优化：
 * - 基于文件系统的缓存，支持断点续跑
 * - 分阶段执行，每阶段完成后释放内存
 * - 只为代表性样本生成完整曲线数据
 */

import type { ExperimentOptions, FullExperimentConfig } from '../cache/types.js';
import { runPhase1, runPhase2, runPhase3, runPhase4 } from './phases/index.js';

// ============================================
// 主实验函数
// ============================================

/**
 * 运行新范式实验
 */
export async function runExperiment(
  config: FullExperimentConfig,
  options: ExperimentOptions
): Promise<string> {
  const { force, phases, outputDir, noOpen, verbose } = options;

  // 打印实验信息
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          Sand Table 实验 - 新范式：止盈间隔评估                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // 打印配置
  console.log(`\nK线数: ${config.candleCount} | MC次数: ${config.monteCarloRuns}`);
  console.log(
    `波动率场景: ${config.volatilities.map((v) => `${(v * 100).toFixed(0)}%`).join(', ')}`
  );
  console.log(`漂移率场景: ${config.drifts.map((d) => `${(d * 100).toFixed(0)}%`).join(', ')}`);
  console.log(`信号策略: ${config.signals.map((s) => s.type).join(', ')}`);
  console.log(`止盈线: ${config.betting.takeProfitTargets.join(', ')}`);
  console.log(`输出目录: ${outputDir}`);
  if (force) {
    console.log(`强制模式: 忽略所有缓存`);
  }
  console.log(`运行阶段: ${phases.join(', ')}`);
  console.log('\n');

  const startTime = Date.now();
  let reportPath = '';

  // Phase 1: 运行所有组合
  if (phases.includes(1)) {
    console.log('═'.repeat(70));
    await runPhase1({ config, force, verbose });
    console.log('');
  }

  // Phase 2: 聚合结果
  if (phases.includes(2)) {
    console.log('═'.repeat(70));
    await runPhase2({ config, force, verbose });
    console.log('');
  }

  // Phase 3: 生成代表性样本详细数据
  if (phases.includes(3)) {
    console.log('═'.repeat(70));
    await runPhase3({ config, force, verbose });
    console.log('');
  }

  // Phase 4: 生成 HTML 报告
  if (phases.includes(4)) {
    console.log('═'.repeat(70));
    const result = await runPhase4({ config, force, verbose, noOpen });
    reportPath = result.reportPath;
    console.log('');
  }

  const elapsedMs = Date.now() - startTime;

  // 打印总结
  console.log('═'.repeat(70));
  console.log('实验完成!');
  console.log('═'.repeat(70));
  console.log(`总耗时: ${(elapsedMs / 1000).toFixed(1)}s`);
  if (reportPath) {
    console.log(`报告路径: ${reportPath}`);
  }

  return reportPath;
}
