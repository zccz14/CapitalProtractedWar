/**
 * 随机数生成工具
 * 支持可复现的伪随机数生成
 */

/**
 * Mulberry32 伪随机数生成器
 * 简单快速且可复现
 */
export class Random {
  private state: number;

  constructor(seed?: number) {
    this.state = seed ?? Date.now();
  }

  /** 生成 [0, 1) 均匀分布随机数 */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 生成标准正态分布随机数 (Box-Muller变换) */
  nextGaussian(): number {
    const u1 = this.next();
    const u2 = this.next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  /** 生成指定范围的整数 [min, max] */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** 生成指定范围的浮点数 [min, max) */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** 获取当前种子状态 */
  getSeed(): number {
    return this.state;
  }

  /** 设置种子 */
  setSeed(seed: number): void {
    this.state = seed;
  }
}

/** 全局默认随机数生成器 */
export const globalRandom = new Random();

/** SeededRandom 类型别名 */
export type SeededRandom = Random;

/** 创建随机数生成器 */
export function createRandom(seed?: number): Random {
  return new Random(seed);
}
