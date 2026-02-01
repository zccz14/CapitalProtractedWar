/**
 * Baseline Tracker - 基准账户追踪器
 * 
 * 核心功能：
 * 1. 始终使用固定仓位 = 1
 * 2. 连续运行，不受止盈/止损影响
 * 3. 计算和更新 C 值（最大亏损速度）
 * 4. 记录基准净值曲线（用于对比信号策略的纯表现）
 * 
 * 设计目的：
 * - C 值由基准账户统一计算，供所有反马丁账户参考
 * - 反马丁账户在 C 值确定前（观察期）实际仓位 = 0
 * - 基准净值曲线反映信号策略的"真实表现"（不含仓位管理）
 */

import type { BaselineSnapshot } from '../types.js';

export class BaselineTracker {
  /** 基准累计净值 = Σ(pnl × 1) */
  private cumulativeEquity: number = 0;
  
  /** 当前 C 估计值（最大亏损速度） */
  private estimatedC: number = 0;
  
  /** 基准账户快照序列 */
  private snapshots: BaselineSnapshot[] = [];
  
  /** 基准净值曲线（每根K线一个值） */
  private equityCurve: number[] = [];
  
  /** 总K线数 */
  private totalCandles: number = 0;
  
  /** 最后更新的K线索引 */
  private lastCandleIndex: number = -1;
  
  /** 是否记录详细数据 */
  private recordDetails: boolean = false;

  /**
   * 启用详细数据记录
   */
  enableDetailRecording(): void {
    this.recordDetails = true;
  }

  /**
   * 设置总K线数（初始化曲线数组）
   */
  setTotalCandles(count: number): void {
    this.totalCandles = count;
    this.equityCurve = new Array(count).fill(0);
  }

  /**
   * 处理交易结果
   * 
   * @param pnlPercent - 单位仓位的PnL百分比
   * @param candleIndex - 当前K线索引（平仓时的K线）
   * @param holdingPeriod - 持仓周期（K线数）
   * @param tradeIndex - 交易序号
   */
  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    holdingPeriod: number,
    tradeIndex: number
  ): void {
    // 填充间隙（从上次到当前K线）
    this.fillEquityCurveGaps(candleIndex);
    
    // 更新基准净值（固定仓位=1）
    this.cumulativeEquity += pnlPercent;
    
    // 更新 C 值（仅在亏损时）
    if (pnlPercent < 0 && holdingPeriod > 0) {
      const lossSpeed = Math.abs(pnlPercent) / holdingPeriod;
      this.estimatedC = Math.max(this.estimatedC, lossSpeed);
    }
    
    // 更新净值曲线
    if (candleIndex < this.equityCurve.length) {
      this.equityCurve[candleIndex] = this.cumulativeEquity;
    }
    
    // 记录快照
    if (this.recordDetails) {
      this.snapshots.push({
        candleIndex,
        tradeIndex,
        pnlPercent,
        cumulativeEquity: this.cumulativeEquity,
        estimatedC: this.estimatedC,
      });
    }
    
    this.lastCandleIndex = candleIndex;
  }

  /**
   * 填充净值曲线的间隙
   */
  private fillEquityCurveGaps(currentIndex: number): void {
    if (this.lastCandleIndex < 0) return;
    
    for (let i = this.lastCandleIndex + 1; i < currentIndex && i < this.equityCurve.length; i++) {
      this.equityCurve[i] = this.cumulativeEquity;
    }
  }

  /**
   * 填充净值曲线到末尾
   */
  finalize(): void {
    if (this.lastCandleIndex >= 0) {
      for (let i = this.lastCandleIndex + 1; i < this.equityCurve.length; i++) {
        this.equityCurve[i] = this.cumulativeEquity;
      }
    }
  }

  /**
   * 获取当前 C 估计值
   */
  getEstimatedC(): number {
    return this.estimatedC;
  }

  /**
   * 获取基准累计净值
   */
  getCumulativeEquity(): number {
    return this.cumulativeEquity;
  }

  /**
   * 获取基准账户快照序列
   */
  getSnapshots(): BaselineSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * 获取基准净值曲线
   */
  getEquityCurve(): number[] {
    this.finalize();
    return [...this.equityCurve];
  }

  /**
   * 重置
   */
  reset(): void {
    this.cumulativeEquity = 0;
    this.estimatedC = 0;
    this.snapshots = [];
    this.equityCurve = [];
    this.totalCandles = 0;
    this.lastCandleIndex = -1;
  }
}
