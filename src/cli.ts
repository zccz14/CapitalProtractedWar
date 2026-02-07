#!/usr/bin/env node
/**
 * CLI - 命令行接口
 *
 * 用法:
 *   sandt run                    # 使用默认配置文件运行实验
 *   sandt run -c ./config.json   # 使用指定配置文件
 *   sandt scenarios              # 查看波动率场景
 *   sandt targets                # 查看止盈线序列
 */

import { Cli, Builtins } from 'clipanion';
import { RunCommand, ScenariosCommand, TargetsCommand } from './commands/index.js';

// 创建 CLI 实例
const cli = new Cli({
  binaryLabel: 'sandt',
  binaryName: 'sandt',
  binaryVersion: '2.0.0',
});

// 注册内置命令 (帮助和版本)
cli.register(Builtins.HelpCommand);
cli.register(Builtins.VersionCommand);

// 注册命令
cli.register(RunCommand);
cli.register(ScenariosCommand);
cli.register(TargetsCommand);

// 运行 CLI
cli.runExit(process.argv.slice(2));
