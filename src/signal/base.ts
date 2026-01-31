/**
 * 信号策略基类和注册机制
 * 
 * 提供：
 * 1. BaseStrategy 抽象基类 - 管理通用状态和行为
 * 2. 策略注册器 - 自动发现和注册策略
 * 3. 策略元信息 - 描述策略特性
 */

import type { 
  Candle, 
  Signal, 
  SignalStrategy, 
  SignalStrategyConfig,
  SignalStrategyType 
} from '../types.js';

// ============================================
// 策略元信息
// ============================================

/** 策略分类 */
export type StrategyCategory = 
  | 'trend'           // 趋势类
  | 'mean_reversion'  // 均值回归类
  | 'breakout'        // 突破类
  | 'volatility'      // 波动率类
  | 'composite'       // 组合策略
  | 'other';          // 其他

/** 策略元信息 */
export interface StrategyMeta {
  /** 策略类型标识 */
  type: SignalStrategyType;
  /** 策略名称 */
  name: string;
  /** 策略描述 */
  description: string;
  /** 策略分类 */
  category: StrategyCategory;
  /** 默认参数 */
  defaultParams: Record<string, any>;
  /** 参数描述 */
  paramDescriptions?: Record<string, string>;
}

// ============================================
// 策略基类
// ============================================

/** 基础策略参数 */
export interface BaseStrategyParams {
  [key: string]: any;
}

/**
 * 信号策略抽象基类
 * 
 * 提供通用功能：
 * - 持仓状态管理 (position: -1, 0, 1)
 * - 信号生成框架
 * - 参数验证
 */
export abstract class BaseStrategy<P extends BaseStrategyParams = BaseStrategyParams> 
  implements SignalStrategy {
  
  abstract readonly type: SignalStrategyType;
  
  protected params: P;
  /** 当前持仓: 1=多, 0=空仓, -1=空 */
  protected currentPosition: number = 0;
  
  constructor(params: P) {
    this.params = params;
  }
  
  /**
   * 生成交易信号（子类实现）
   */
  abstract generate(candles: Candle[], currentIndex: number): Signal;
  
  /**
   * 重置策略状态
   */
  reset(): void {
    this.currentPosition = 0;
    this.onReset();
  }
  
  /**
   * 子类可重写的重置钩子
   */
  protected onReset(): void {
    // 子类可重写
  }
  
  /**
   * 获取当前持仓
   */
  protected getPosition(): number {
    return this.currentPosition;
  }
  
  /**
   * 设置持仓
   */
  protected setPosition(position: number): void {
    this.currentPosition = position;
  }
  
  /**
   * 辅助方法：生成做多信号
   */
  protected long(): Signal {
    this.currentPosition = 1;
    return 1;
  }
  
  /**
   * 辅助方法：生成做空信号
   */
  protected short(): Signal {
    this.currentPosition = -1;
    return -1;
  }
  
  /**
   * 辅助方法：生成平仓信号
   */
  protected close(): Signal {
    this.currentPosition = 0;
    return 0;
  }
  
  /**
   * 辅助方法：保持当前仓位（不发出新信号）
   */
  protected hold(): Signal {
    return this.currentPosition;
  }
  
  /**
   * 检查是否有足够的历史数据
   */
  protected hasEnoughData(currentIndex: number, required: number): boolean {
    return currentIndex >= required;
  }
}

// ============================================
// 策略注册器
// ============================================

/** 策略构造函数类型 */
export type StrategyConstructor<P = any> = new (params?: Partial<P>) => SignalStrategy;

/** 注册的策略信息 */
interface RegisteredStrategy {
  meta: StrategyMeta;
  constructor: StrategyConstructor;
}

/** 策略注册表 */
const strategyRegistry = new Map<SignalStrategyType, RegisteredStrategy>();

/**
 * 注册策略
 * @param meta 策略元信息
 * @param constructor 策略构造函数
 */
export function registerStrategy(
  meta: StrategyMeta,
  constructor: StrategyConstructor
): void {
  if (strategyRegistry.has(meta.type)) {
    console.warn(`Strategy "${meta.type}" is already registered, overwriting.`);
  }
  strategyRegistry.set(meta.type, { meta, constructor });
}

/**
 * 获取已注册的策略列表
 */
export function getRegisteredStrategies(): StrategyMeta[] {
  return Array.from(strategyRegistry.values()).map(s => s.meta);
}

/**
 * 检查策略是否已注册
 */
export function isStrategyRegistered(type: SignalStrategyType): boolean {
  return strategyRegistry.has(type);
}

/**
 * 获取策略元信息
 */
export function getStrategyMeta(type: SignalStrategyType): StrategyMeta | undefined {
  return strategyRegistry.get(type)?.meta;
}

/**
 * 创建策略实例
 * @param config 策略配置
 */
export function createStrategy(config: SignalStrategyConfig): SignalStrategy {
  const registered = strategyRegistry.get(config.type);
  
  if (!registered) {
    throw new Error(
      `Unknown strategy type: "${config.type}". ` +
      `Available types: ${Array.from(strategyRegistry.keys()).join(', ')}`
    );
  }
  
  // 合并默认参数和用户参数
  const params = {
    ...registered.meta.defaultParams,
    ...config.params,
  };
  
  return new registered.constructor(params);
}

/**
 * 策略装饰器 - 用于自动注册策略
 * 
 * @example
 * ```typescript
 * @Strategy({
 *   type: 'my_strategy',
 *   name: 'My Strategy',
 *   description: 'A custom strategy',
 *   category: 'trend',
 *   defaultParams: { period: 20 },
 * })
 * export class MyStrategy extends BaseStrategy<MyParams> {
 *   // ...
 * }
 * ```
 */
export function Strategy(meta: StrategyMeta) {
  return function <T extends StrategyConstructor>(constructor: T): T {
    registerStrategy(meta, constructor);
    return constructor;
  };
}

// ============================================
// 辅助类型
// ============================================

/** 策略参数提取器 */
export type ExtractParams<T> = T extends BaseStrategy<infer P> ? P : never;

/** 策略配置生成器 */
export function strategyConfig<T extends SignalStrategyType>(
  type: T,
  params?: Record<string, any>
): SignalStrategyConfig {
  return { type, params };
}
