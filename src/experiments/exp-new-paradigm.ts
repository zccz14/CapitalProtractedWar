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

import {
  DEFAULT_TAKE_PROFIT_TARGETS,
  type SignalStrategyConfig,
  type BettingStrategyConfig,
} from '../types.js';
import type { ExperimentOptions, FullExperimentConfig } from '../cache/types.js';
import { runPhase1, runPhase2, runPhase3, runPhase4 } from './phases/index.js';

// ============================================
// 实验配置
// ============================================

// 测试的信号策略（循序渐进：基线 → 单指标 → 双指标 → 门控/参数微调）
const SIGNAL_STRATEGIES: SignalStrategyConfig[] = [
  // 对照组（基准噪声）
  { type: 'random', params: { tradeProbability: 0.1, avgHoldingPeriod: 10, seed: 42 } },

  // 基线：线性回归趋势
  { type: 'regression_trend', params: { lookbackPeriod: 20, minSlopeRatio: 0.00028 } },

  // 单指标：MFI 资金流确认
  {
    type: 'regression_trend_mfi',
    params: {
      lookbackPeriod: 20,
      minSlopeRatio: 0.00025,
      mfiPeriod: 14,
      mfiBullThreshold: 60,
      mfiBearThreshold: 40,
    },
  },

  // 双指标：RSI + MFI 动量一致性
  {
    type: 'regression_trend_rsi_mfi',
    params: {
      lookbackPeriod: 20,
      minSlopeRatio: 0.00024,
      rsiPeriod: 14,
      rsiBullThreshold: 54,
      rsiBearThreshold: 46,
      mfiPeriod: 14,
      mfiBullThreshold: 58,
      mfiBearThreshold: 42,
    },
  },

  // 门控/参数微调：RSI + MFI + MFI斜率门控
  {
    type: 'regression_trend_rsi_mfi_gate',
    params: {
      lookbackPeriod: 20,
      minSlopeRatio: 0.00023,
      rsiPeriod: 14,
      rsiBullThreshold: 55,
      rsiBearThreshold: 45,
      mfiPeriod: 14,
      mfiBullThreshold: 60,
      mfiBearThreshold: 40,
      mfiLookback: 12,
      minMfiSlope: 0.2,
    },
  },
];

// 测试的波动率场景
const VOLATILITY_SCENARIOS = [
  0.05, // 5% - 股票10x / BTC现货
  0.1, // 10% - BTC 2x / 山寨币现货
  0.2, // 20% - BTC 5x / MEME币
  0.5, // 50% - BTC 10x / 极端MEME
  1.0, // 100% - BTC 20x
];

// 测试的漂移率场景
const DRIFT_SCENARIOS = [
  0, // 中性市场
  0.05, // 5% 年化
  0.1, // 10% 年化
  0.2, // 20% 年化
  0.5, // 50% 年化（强牛市）
];

// 完整实验参数 - 优化版本
const FULL_CANDLE_COUNT = 5000; // K线数量（5千根）
const FULL_MONTE_CARLO_RUNS = 100; // 蒙特卡洛运行次数

// 快速测试参数 - 针对新策略优化
const QUICK_CANDLE_COUNT = 2000; // K线数量（减少以加快速度）
const QUICK_MONTE_CARLO_RUNS = 20; // 蒙特卡洛运行次数（减少以加快速度）
const QUICK_VOLATILITY_SCENARIOS = [0.05];
const QUICK_DRIFT_SCENARIOS = [0];

// 投注策略配置
const BETTING_CONFIG: BettingStrategyConfig = {
  takeProfitTargets: DEFAULT_TAKE_PROFIT_TARGETS,
  tradingCostRate: 0.0003, // 交易成本 0.03%
};

// 基础种子
const BASE_SEED = 42;

// ============================================
// 主实验函数
// ============================================

/**
 * 运行新范式实验
 */
export async function runExperiment(options: ExperimentOptions): Promise<string> {
  const { quick, force, phases, marketGroup, outputDir, noOpen, verbose } = options;

  // 打印实验信息
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║          资本持久战实验 - 新范式：止盈间隔评估                   ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');

  // 构建实验配置
  const config: FullExperimentConfig = quick
    ? {
        volatilities: QUICK_VOLATILITY_SCENARIOS,
        drifts: QUICK_DRIFT_SCENARIOS,
        candleCount: QUICK_CANDLE_COUNT,
        monteCarloRuns: QUICK_MONTE_CARLO_RUNS,
        baseSeed: BASE_SEED,
        signals: SIGNAL_STRATEGIES,
        betting: BETTING_CONFIG,
        outputDir,
      }
    : {
        volatilities: VOLATILITY_SCENARIOS,
        drifts: DRIFT_SCENARIOS,
        candleCount: FULL_CANDLE_COUNT,
        monteCarloRuns: FULL_MONTE_CARLO_RUNS,
        baseSeed: BASE_SEED,
        signals: SIGNAL_STRATEGIES,
        betting: BETTING_CONFIG,
        outputDir,
      };

  // 打印配置
  console.log(`\n模式: ${quick ? '快速测试' : '完整实验'}`);
  console.log(`K线数: ${config.candleCount} | MC次数: ${config.monteCarloRuns}`);
  console.log(
    `波动率场景: ${config.volatilities.map((v) => `${(v * 100).toFixed(0)}%`).join(', ')}`
  );
  console.log(`漂移率场景: ${config.drifts.map((d) => `${(d * 100).toFixed(0)}%`).join(', ')}`);
  console.log(`信号策略: ${config.signals.map((s) => s.type).join(', ')}`);
  console.log(`止盈线: ${config.betting.takeProfitTargets.join(', ')}`);
  console.log(`输出目录: ${outputDir}`);
  if (marketGroup) {
    console.log(`指定市场组: ${marketGroup}`);
  }
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
    await runPhase1({ config, force, verbose, marketGroup });
    console.log('');
  }

  // Phase 2: 聚合结果
  if (phases.includes(2)) {
    console.log('═'.repeat(70));
    await runPhase2({ config, force, verbose, marketGroup });
    console.log('');
  }

  // Phase 3: 生成代表性样本详细数据
  if (phases.includes(3)) {
    console.log('═'.repeat(70));
    await runPhase3({ config, force, verbose, marketGroup });
    console.log('');
  }

  // Phase 4: 生成 HTML 报告
  if (phases.includes(4)) {
    console.log('═'.repeat(70));
    const result = await runPhase4({ config, force, verbose, marketGroup, noOpen });
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
