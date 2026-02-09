import { Command, Option } from 'clipanion';
import * as fs from 'fs';
import * as path from 'path';
import { runExperiment } from '../experiments/exp-new-paradigm.js';
import type { ISandTableConfig } from '../types.js';
import type { ExperimentOptions, FullExperimentConfig } from '../cache/types.js';

const DEFAULT_CONFIG_FILENAME = 'sandt.config.json';

/**
 * 加载并验证配置文件
 */
function loadConfig(configPath: string): { config?: ISandTableConfig; error?: string } {
  if (!fs.existsSync(configPath)) {
    return {
      error:
        `配置文件不存在: ${configPath}\n` +
        `请创建配置文件或使用 -c 参数指定配置文件路径。\n` +
        `参考 sandt.config.example.json 创建配置文件。`,
    };
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  let config: ISandTableConfig;

  try {
    config = JSON.parse(content);
  } catch {
    return { error: `配置文件解析失败: ${configPath}\n请检查 JSON 格式是否正确。` };
  }

  // 基本验证：三足鼎立 markets / signals / betting + outputDir
  const requiredFields = ['markets', 'signals', 'betting', 'outputDir'] as const;

  for (const field of requiredFields) {
    if (config[field] === undefined) {
      return { error: `配置文件缺少必需字段: ${field}` };
    }
  }

  if (!Array.isArray(config.markets) || config.markets.length === 0) {
    return { error: 'markets 必须是非空数组' };
  }

  // 验证每个市场配置条目
  for (let i = 0; i < config.markets.length; i++) {
    const m = config.markets[i];
    const prefix = `markets[${i}]`;

    if (!m.type) {
      return { error: `${prefix}.type 是必需字段` };
    }

    if (m.type === 'csv') {
      // CSV 文件引用校验
      if (!m.file || typeof m.file !== 'string') {
        return { error: `${prefix}.file 是必需字段（CSV 文件路径）` };
      }
      if (!m.name || typeof m.name !== 'string') {
        return { error: `${prefix}.name 是必需字段（市场名称）` };
      }
    } else {
      // 生成器模板校验
      if (!Array.isArray(m.volatilities) || m.volatilities.length === 0) {
        return { error: `${prefix}.volatilities 必须是非空数组` };
      }
      if (!Array.isArray(m.drifts) || m.drifts.length === 0) {
        return { error: `${prefix}.drifts 必须是非空数组` };
      }
      if (!m.candleCount || m.candleCount <= 0) {
        return { error: `${prefix}.candleCount 必须是正整数` };
      }
      if (!m.monteCarloRuns || m.monteCarloRuns <= 0) {
        return { error: `${prefix}.monteCarloRuns 必须是正整数` };
      }
      if (m.baseSeed === undefined) {
        return { error: `${prefix}.baseSeed 是必需字段` };
      }
    }
  }

  if (!Array.isArray(config.signals) || config.signals.length === 0) {
    return { error: 'signals 必须是非空数组' };
  }

  if (!config.betting.takeProfitTargets || config.betting.takeProfitTargets.length === 0) {
    return { error: 'betting.takeProfitTargets 必须是非空数组' };
  }

  return { config };
}

/**
 * 将 ISandTableConfig 转换为 FullExperimentConfig
 */
function toFullExperimentConfig(
  config: ISandTableConfig,
  resolvedOutputDir: string
): FullExperimentConfig {
  return {
    markets: config.markets,
    signals: config.signals,
    betting: config.betting,
    outputDir: resolvedOutputDir,
  };
}

export class RunCommand extends Command {
  static paths = [['run']];

  static usage = Command.Usage({
    description: '运行实验集合',
    examples: [
      ['使用默认配置文件运行', 'sandt run'],
      ['指定配置文件', 'sandt run -c ./my-config.json'],
      ['强制重跑，忽略缓存', 'sandt run -f'],
      ['只运行特定阶段', 'sandt run -p 1 -p 2'],
      ['运行并生成报告但不自动打开', 'sandt run --no-open'],
    ],
  });

  config = Option.String('-c,--config', DEFAULT_CONFIG_FILENAME, {
    description: '配置文件路径 (默认: ./sandt.config.json)',
  });

  force = Option.Boolean('-f,--force', false, {
    description: '强制重跑，忽略缓存',
  });

  phases = Option.Array('-p,--phase', {
    description: '指定运行阶段 (0=生成市场, 1=运行, 2=聚合, 3=样本, 4=报告)，可多次指定',
  });

  noOpen = Option.Boolean('--no-open', false, {
    description: '不自动打开报告',
  });

  verbose = Option.Boolean('-v,--verbose', false, {
    description: '详细输出',
  });

  async execute(): Promise<number> {
    // 解析配置文件路径
    const configPath = path.resolve(process.cwd(), this.config);

    // 加载配置
    const result = loadConfig(configPath);
    if (result.error) {
      console.error(`错误: ${result.error}`);
      return 1;
    }
    const sandTableConfig = result.config!;

    // 解析输出目录（相对于配置文件位置）
    const configDir = path.dirname(configPath);
    const resolvedOutputDir = path.resolve(configDir, sandTableConfig.outputDir);

    // 转换为 FullExperimentConfig
    const fullConfig = toFullExperimentConfig(sandTableConfig, resolvedOutputDir);

    // 解析阶段参数
    const phasesToRun = this.phases ? this.phases.map((p) => parseInt(p, 10)) : [0, 1, 2, 3, 4];

    // 验证阶段参数
    for (const phase of phasesToRun) {
      if (phase < 0 || phase > 4 || isNaN(phase)) {
        console.error(`错误: 无效的阶段参数: ${phase}，有效值为 0-4`);
        return 1;
      }
    }

    // 构建实验选项
    const options: ExperimentOptions = {
      force: this.force,
      phases: phasesToRun,
      outputDir: resolvedOutputDir,
      noOpen: this.noOpen,
      verbose: this.verbose,
      configDir,
    };

    // 运行实验
    await runExperiment(fullConfig, options);
    return 0;
  }
}
