import { Command } from 'clipanion';
import { VOLATILITY_SCENARIOS } from '../types.js';

export class ScenariosCommand extends Command {
  static paths = [['scenarios']];

  static usage = Command.Usage({
    description: '列出等效波动率场景映射',
  });

  async execute(): Promise<void> {
    console.log('\n等效波动率场景映射:');
    console.log('='.repeat(50));
    for (const [vol, desc] of Object.entries(VOLATILITY_SCENARIOS)) {
      console.log(`  σ=${(parseFloat(vol) * 100).toFixed(1).padStart(5)}%  ->  ${desc}`);
    }
    console.log('\n提示: 杠杆可归一化为波动率');
    console.log('      L倍杠杆 + σ波动率 = 等效 L×σ 波动率');
  }
}
