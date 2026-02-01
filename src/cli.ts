#!/usr/bin/env node
/**
 * CLI - 命令行接口（新范式）
 * 
 * 用法:
 *   npx tsx src/cli.ts run --volatility 0.1 --signal random --market gbm --runs 100
 *   npx tsx src/cli.ts exp-new   # 运行新范式实验
 *   npx tsx src/cli.ts scenarios # 查看波动率场景
 */

import { Cli, Builtins } from 'clipanion';
import { RunCommand, ExpNewCommand, ScenariosCommand, TargetsCommand } from './commands/index.js';

// 创建 CLI 实例
const cli = new Cli({
  binaryLabel: 'cpw',
  binaryName: 'cpw',
  binaryVersion: '2.0.0',
});

// 注册内置命令 (帮助和版本)
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

// 注册命令
cli.register(RunCommand);
cli.register(ExpNewCommand);
cli.register(ScenariosCommand);
cli.register(TargetsCommand);

// 运行 CLI
cli.runExit(process.argv.slice(2));
