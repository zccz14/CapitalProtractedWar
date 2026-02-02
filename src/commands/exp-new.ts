import { Command, Option } from 'clipanion';
import { runExperiment } from '../experiments/exp-new-paradigm.js';

export class ExpNewCommand extends Command {
  static paths = [['exp-new']];

  static usage = Command.Usage({
    description: '运行新范式实验 (止盈间隔分析)',
    examples: [
      ['运行完整实验', 'cpw exp-new'],
      ['快速模式', 'cpw exp-new --quick'],
      ['强制重跑', 'cpw exp-new --force'],
      ['只运行 Phase 1', 'cpw exp-new --phase=1'],
      ['只处理指定市场组', 'cpw exp-new --market-group=gbm_vol5_drift0_n20000'],
    ],
  });

  // 快速模式
  quick = Option.Boolean('--quick,-q', false, {
    description: '快速模式 (减少 MC 次数和 K 线数)',
  });

  // 强制重跑
  force = Option.Boolean('--force,-f', false, {
    description: '强制重跑，忽略所有缓存',
  });

  // 指定运行阶段
  phase = Option.String('--phase,-p', {
    description: '只运行指定阶段 (1=运行, 2=聚合, 3=样本, 4=报告)，可用逗号分隔',
  });

  // 指定市场组
  marketGroup = Option.String('--market-group,-g', {
    description: '只处理指定市场组 (如 gbm_vol5_drift0_n20000)',
  });

  // 输出目录
  output = Option.String('--output,-o', './results/new_paradigm', {
    description: '输出目录',
  });

  // 不自动打开报告
  noOpen = Option.Boolean('--no-open', false, {
    description: '不自动打开报告',
  });

  // 详细输出
  verbose = Option.Boolean('--verbose,-v', false, {
    description: '详细输出',
  });

  async execute() {
    const phases = this.phase ? this.phase.split(',').map((p) => parseInt(p.trim())) : [1, 2, 3, 4];

    await runExperiment({
      quick: this.quick,
      force: this.force,
      phases,
      marketGroup: this.marketGroup,
      outputDir: this.output,
      noOpen: this.noOpen,
      verbose: this.verbose,
    });
  }
}
