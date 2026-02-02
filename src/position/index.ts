/**
 * Anti-Martingale Position Manager - 反马丁格尔仓位管理
 *
 * 核心规则:
 * 1. 盈利后加仓 (仓位翻倍)
 * 2. 亏损后重置到基础仓位
 * 3. 触底保护: 资产倍率不能低于1 (floor protection)
 *
 * 关键指标:
 * - m(t): 当前资产倍率, 初始=1, 下限=1
 * - M: 峰值倍率 = max{m(t)}
 * - positionSize: 当前仓位大小
 */

import type { PositionState, PositionManager } from '../types.js';

// ============================================
// 配置类型
// ============================================

export interface AntiMartingaleConfig {
  /** 盈利后仓位乘数 (默认2, 即翻倍) */
  winMultiplier: number;
  /** 亏损后仓位乘数 (默认0, 即重置到基础仓位; 0.5表示减半) */
  loseMultiplier: number;
  /** 最大仓位大小 (相对于基础仓位, 默认无限) */
  maxPositionSize: number;
  /** 基础仓位大小 (默认1) */
  baseSize: number;
  /** 触底保护: 资产倍率下限 (默认1) */
  floorMultiplier: number;
}

// ============================================
// Anti-Martingale Position Manager
// ============================================

export class AntiMartingalePositionManager implements PositionManager {
  private config: AntiMartingaleConfig;
  private state: PositionState;

  constructor(config?: Partial<AntiMartingaleConfig>) {
    this.config = {
      winMultiplier: config?.winMultiplier ?? 2,
      loseMultiplier: config?.loseMultiplier ?? 0,
      maxPositionSize: config?.maxPositionSize ?? Infinity,
      baseSize: config?.baseSize ?? 1,
      floorMultiplier: config?.floorMultiplier ?? 1,
    };

    this.state = this.createInitialState();
  }

  private createInitialState(): PositionState {
    return {
      assetMultiplier: 1,
      positionSize: this.config.baseSize,
      consecutiveWins: 0,
      peakMultiplier: 1,
      baseSize: this.config.baseSize,
      currentPosition: 0,
      entryPrice: null,
    };
  }

  getState(): PositionState {
    return { ...this.state };
  }

  /**
   * 获取当前仓位大小
   *
   * 重要: 仓位大小必须确保在最坏情况下资产倍率不会低于 floorMultiplier
   *
   * 设当前资产倍率为 m, 最大可能亏损为 L (如100%亏损时 L=1)
   * 则仓位 p 需满足: m - p * L >= floorMultiplier
   * => p <= (m - floorMultiplier) / L
   *
   * 但这个约束在 m=1 且 floorMultiplier=1 时会导致 p=0
   * 所以我们采用另一种策略: 允许开仓,但计算盈亏时应用触底保护
   */
  getPositionSize(): number {
    // 当前仓位大小受最大仓位限制
    return Math.min(this.state.positionSize, this.config.maxPositionSize);
  }

  /**
   * 处理交易结果
   *
   * @param pnlPercent - 单位仓位的盈亏百分比 (如 0.05 表示盈利5%, -0.03 表示亏损3%)
   */
  processTradeResult(pnlPercent: number): void {
    const positionSize = this.getPositionSize();

    // 计算资产变化
    // 资产变化 = 仓位大小 * 盈亏百分比
    const assetChange = positionSize * pnlPercent;

    // 更新资产倍率
    let newMultiplier = this.state.assetMultiplier + assetChange;

    // 触底保护: 资产倍率不能低于 floorMultiplier
    newMultiplier = Math.max(newMultiplier, this.config.floorMultiplier);

    this.state.assetMultiplier = newMultiplier;

    // 更新峰值倍率
    this.state.peakMultiplier = Math.max(this.state.peakMultiplier, newMultiplier);

    // 根据盈亏调整下一次仓位
    if (pnlPercent > 0) {
      // 盈利: 增加连胜计数, 放大仓位
      this.state.consecutiveWins++;

      if (this.config.winMultiplier === 0) {
        // 0 表示重置到基础仓位
        this.state.positionSize = this.config.baseSize;
      } else {
        this.state.positionSize = Math.min(
          this.state.positionSize * this.config.winMultiplier,
          this.config.maxPositionSize
        );
      }
    } else if (pnlPercent < 0) {
      // 亏损: 重置连胜计数, 缩小/重置仓位
      this.state.consecutiveWins = 0;

      if (this.config.loseMultiplier === 0) {
        // 0 表示重置到基础仓位
        this.state.positionSize = this.config.baseSize;
      } else {
        this.state.positionSize = Math.max(
          this.config.baseSize,
          this.state.positionSize * this.config.loseMultiplier
        );
      }
    }
    // 平局 (pnlPercent === 0) 时仓位不变
  }

  /**
   * 设置当前持仓和入场价格
   * @param position - 持仓方向: 1=多, 0=空仓, -1=空
   * @param entryPrice - 入场价格
   */
  setPosition(position: number, entryPrice: number | null): void {
    this.state.currentPosition = position;
    this.state.entryPrice = entryPrice;
  }

  /**
   * 获取当前持仓
   * @returns 1=多, 0=空仓, -1=空
   */
  getPosition(): number {
    return this.state.currentPosition;
  }

  /**
   * 获取入场价格
   */
  getEntryPrice(): number | null {
    return this.state.entryPrice;
  }

  /**
   * 扣除交易成本
   * 从资产倍率中直接扣除成本，应用触底保护
   *
   * @param cost - 交易成本 (绝对值)
   */
  deductCost(cost: number): void {
    let newMultiplier = this.state.assetMultiplier - cost;

    // 触底保护: 资产倍率不能低于 floorMultiplier
    newMultiplier = Math.max(newMultiplier, this.config.floorMultiplier);

    this.state.assetMultiplier = newMultiplier;

    // 注意: 扣除成本后不更新峰值倍率,因为这是交易成本而非策略亏损
    // 这样可以更准确地评估策略本身的表现
  }

  reset(): void {
    this.state = this.createInitialState();
  }
}

// ============================================
// 固定仓位管理器 (对照组)
// ============================================

export class FixedPositionManager implements PositionManager {
  private state: PositionState;
  private fixedSize: number;
  private floorMultiplier: number;

  constructor(fixedSize: number = 1, floorMultiplier: number = 1) {
    this.fixedSize = fixedSize;
    this.floorMultiplier = floorMultiplier;
    this.state = this.createInitialState();
  }

  private createInitialState(): PositionState {
    return {
      assetMultiplier: 1,
      positionSize: this.fixedSize,
      consecutiveWins: 0,
      peakMultiplier: 1,
      baseSize: this.fixedSize,
      currentPosition: 0,
      entryPrice: null,
    };
  }

  getState(): PositionState {
    return { ...this.state };
  }

  getPositionSize(): number {
    return this.fixedSize;
  }

  processTradeResult(pnlPercent: number): void {
    const assetChange = this.fixedSize * pnlPercent;
    let newMultiplier = this.state.assetMultiplier + assetChange;

    // 触底保护
    newMultiplier = Math.max(newMultiplier, this.floorMultiplier);

    this.state.assetMultiplier = newMultiplier;
    this.state.peakMultiplier = Math.max(this.state.peakMultiplier, newMultiplier);

    if (pnlPercent > 0) {
      this.state.consecutiveWins++;
    } else if (pnlPercent < 0) {
      this.state.consecutiveWins = 0;
    }
  }

  /**
   * 设置当前持仓和入场价格
   * @param position - 持仓方向: 1=多, 0=空仓, -1=空
   * @param entryPrice - 入场价格
   */
  setPosition(position: number, entryPrice: number | null): void {
    this.state.currentPosition = position;
    this.state.entryPrice = entryPrice;
  }

  /**
   * 获取当前持仓
   * @returns 1=多, 0=空仓, -1=空
   */
  getPosition(): number {
    return this.state.currentPosition;
  }

  getEntryPrice(): number | null {
    return this.state.entryPrice;
  }

  /**
   * 扣除交易成本
   */
  deductCost(cost: number): void {
    let newMultiplier = this.state.assetMultiplier - cost;
    newMultiplier = Math.max(newMultiplier, this.floorMultiplier);
    this.state.assetMultiplier = newMultiplier;
  }

  reset(): void {
    this.state = this.createInitialState();
  }
}

// ============================================
// 工厂函数
// ============================================

export type PositionManagerType = 'anti_martingale' | 'fixed';

export interface PositionManagerConfig {
  type: PositionManagerType;
  params?: Partial<AntiMartingaleConfig> | { fixedSize?: number; floorMultiplier?: number };
}

export function createPositionManager(
  config: PositionManagerConfig
): AntiMartingalePositionManager | FixedPositionManager {
  switch (config.type) {
    case 'anti_martingale':
      return new AntiMartingalePositionManager(config.params as Partial<AntiMartingaleConfig>);

    case 'fixed': {
      const fixedParams = config.params as
        | { fixedSize?: number; floorMultiplier?: number }
        | undefined;
      return new FixedPositionManager(fixedParams?.fixedSize, fixedParams?.floorMultiplier);
    }

    default: {
      const exhaustiveCheck: never = config.type;
      throw new Error(`Unknown position manager type: ${exhaustiveCheck}`);
    }
  }
}
