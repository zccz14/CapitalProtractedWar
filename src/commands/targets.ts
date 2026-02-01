import { Command } from 'clipanion';
import { DEFAULT_TAKE_PROFIT_TARGETS } from '../types.js';

export class TargetsCommand extends Command {
  static paths = [['targets']];

  static usage = Command.Usage({
    description: '列出默认止盈线序列',
  });

  async execute() {
    console.log('\n默认止盈线序列 (M_T):');
    console.log('='.repeat(50));
    for (const target of DEFAULT_TAKE_PROFIT_TARGETS) {
      console.log(`  M_T = ${target}x`);
    }
    console.log('\n核心指标: 达到各止盈线的平均K线间隔');
  }
}
