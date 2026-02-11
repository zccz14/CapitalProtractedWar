/**
 * 预计算信号策略
 *
 * 从 CSV 文件加载预计算的信号序列，在回测中按时间戳匹配返回对应信号。
 *
 * CSV 格式：time,position
 * - time: 时间戳（任何 Date 可解析的格式）
 * - position: 信号值（1=做多, 0=空仓, -1=做空）
 *
 * 配置示例：
 * { "type": "precomputed", "params": { "file": "./eth_fmab_positions.csv" }, "markets": ["ETH-5m"] }
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Candle, Signal, SignalStrategyType } from '../../types.js';
import { BaseStrategy, Strategy } from '../base.js';

export interface PrecomputedParams {
  /** CSV 文件路径（相对于 cwd） */
  file: string;
}

@Strategy({
  type: 'precomputed',
  name: 'Precomputed Signal',
  description: '从 CSV 文件加载预计算信号，按时间戳匹配',
  category: 'other',
  defaultParams: { file: '' },
  paramDescriptions: {
    file: 'CSV 文件路径（相对于工作目录），格式：time,position',
  },
})
export class PrecomputedStrategy extends BaseStrategy<PrecomputedParams> {
  readonly type: SignalStrategyType = 'precomputed';

  /** 时间戳 (ms) → 信号值 */
  private signalMap: Map<number, Signal>;

  constructor(params?: Partial<PrecomputedParams>) {
    const merged: PrecomputedParams = {
      file: '',
      ...params,
    };
    super(merged);

    this.signalMap = new Map();
    this.loadCSV();
  }

  private loadCSV(): void {
    const filePath = path.resolve(process.cwd(), this.params.file);

    if (!fs.existsSync(filePath)) {
      throw new Error(`预计算信号 CSV 文件不存在: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.trim().split('\n');

    if (lines.length < 2) {
      throw new Error(`预计算信号 CSV 文件为空: ${filePath}`);
    }

    // 跳过 header
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 2) continue;

      const timestamp = new Date(parts[0]).getTime();
      const position = Number(parts[1]);

      if (!isNaN(timestamp) && !isNaN(position)) {
        this.signalMap.set(timestamp, position);
      }
    }

    if (this.signalMap.size === 0) {
      throw new Error(`预计算信号 CSV 未解析到有效数据: ${filePath}`);
    }
  }

  generate(candles: Candle[], currentIndex: number): Signal {
    const candle = candles[currentIndex];
    const signal = this.signalMap.get(candle.time);

    if (signal !== undefined) {
      this.setPosition(signal);
      return signal;
    }

    // 时间戳不匹配时保持当前仓位
    return this.hold();
  }

  reset(): void {
    super.reset();
    // signalMap 不需要重置，它是静态数据
  }
}
