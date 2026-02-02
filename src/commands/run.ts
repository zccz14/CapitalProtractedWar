import { Command, Option } from 'clipanion';
import { NewParadigmExperimentRunner } from '../engine/index.js';
import { printReport, exportToJSON } from '../analysis/index.js';
import { saveReport } from '../visualization/index.js';
import type { ExperimentConfig, MarketType, SignalStrategyType } from '../types.js';
import { DEFAULT_TAKE_PROFIT_TARGETS, VOLATILITY_SCENARIOS } from '../types.js';
import * as fs from 'fs';

function getSignalParams(signalType: string, seed?: number): Record<string, number | string | boolean> {
  switch (signalType) {
    case 'trend_following':
      return { shortPeriod: 5, longPeriod: 20 };
    case 'mean_reversion':
      return { period: 20, deviationThreshold: 0.02 };
    case 'breakout':
      return { lookbackPeriod: 20, breakoutThreshold: 0.01 };
    case 'breakout_4':
      return { lookbackCount: 4 };
    case 'random':
    default:
      return { 
        tradeProbability: 0.1, 
        avgHoldingPeriod: 10,
        ...(seed !== undefined ? { seed } : {}),
      };
  }
}

export class RunCommand extends Command {
  static paths = [['run']];

  static usage = Command.Usage({
    description: '运行单次实验',
    examples: [
      ['运行默认实验', 'cpw run'],
      ['指定波动率和市场类型', 'cpw run -v 0.2 -m garch'],
      ['完整参数示例', 'cpw run -v 0.1 -m gbm -s random -c 2000 -r 100'],
    ],
  });

  volatility = Option.String('-v,--volatility', '0.1', {
    description: '等效波动率 (0-1)',
  });

  market = Option.String('-m,--market', 'gbm', {
    description: '市场类型 (gbm|garch|trending|mean_reverting)',
  });

  signal = Option.String('-s,--signal', 'random', {
    description: '信号策略 (trend_following|mean_reversion|breakout|breakout_4|random)',
  });

  candles = Option.String('-c,--candles', '2000', {
    description: 'K线数量',
  });

  runs = Option.String('-r,--runs', '100', {
    description: '蒙特卡洛次数',
  });

  output = Option.String('-o,--output', './results/custom', {
    description: '输出目录',
  });

  seed = Option.String('--seed', {
    description: '随机种子',
  });

  async execute() {
    const volatility = parseFloat(this.volatility);
    const candleCount = parseInt(this.candles);
    const monteCarloRuns = parseInt(this.runs);
    const seed = this.seed ? parseInt(this.seed) : undefined;
    
    const scenarioDesc = VOLATILITY_SCENARIOS[volatility] || `σ=${(volatility * 100).toFixed(1)}%`;
    
    console.log('='.repeat(60));
    console.log('资本持久战实验 (新范式)');
    console.log('='.repeat(60));
    console.log(`市场类型: ${this.market}`);
    console.log(`波动率: ${(volatility * 100).toFixed(1)}% (${scenarioDesc})`);
    console.log(`信号策略: ${this.signal}`);
    console.log(`K线数量: ${candleCount}`);
    console.log(`蒙特卡洛次数: ${monteCarloRuns}`);
    console.log(`止盈线: ${DEFAULT_TAKE_PROFIT_TARGETS.join(', ')}`);
    console.log('='.repeat(60));
    
    const config: ExperimentConfig = {
      name: `custom_${this.market}_${this.signal}_v${(volatility * 100).toFixed(0)}`,
      market: {
        type: this.market as MarketType,
        volatility,
        candleCount,
        seed,
        // GARCH 默认参数
        ...(this.market === 'garch' ? {
          garchOmega: 0.00001,
          garchAlpha: 0.1,
          garchBeta: 0.85,
        } : {}),
        // 趋势市场默认参数
        ...(this.market === 'trending' ? {
          drift: 0.0005,
        } : {}),
        // 均值回归市场默认参数
        ...(this.market === 'mean_reverting' ? {
          meanReversionSpeed: 0.1,
          meanReversionTarget: 100,
        } : {}),
      },
      signals: [{
        type: this.signal as SignalStrategyType,
        params: getSignalParams(this.signal, seed),
      }],
      betting: {
        takeProfitTargets: DEFAULT_TAKE_PROFIT_TARGETS,
        tradingCostRate: 0.0003,  // 0.03%
      },
      monteCarloRuns,
    };
    
    const runner = new NewParadigmExperimentRunner();
    console.log('\n运行中...');
    const result = await runner.run(config);
    
    printReport(result);
    
    // 保存结果
    if (!fs.existsSync(this.output)) {
      fs.mkdirSync(this.output, { recursive: true });
    }
    await saveReport(result, this.output);
    fs.writeFileSync(`${this.output}/result.json`, exportToJSON(result), 'utf-8');
    console.log(`\n结果已保存到: ${this.output}`);
  }
}
