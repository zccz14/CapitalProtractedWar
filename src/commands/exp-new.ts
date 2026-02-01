import { Command, Option } from 'clipanion';

export class ExpNewCommand extends Command {
  static paths = [['exp-new']];

  static usage = Command.Usage({
    description: '运行新范式实验 (止盈间隔分析)',
  });

  quick = Option.Boolean('--quick', false, {
    description: '快速模式 (少量MC运行)',
  });

  async execute() {
    await import('../experiments/exp-new-paradigm.js');
  }
}
