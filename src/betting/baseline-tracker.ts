/**
 * Baseline Tracker - 基准账户追踪器
 *
 * 核心功能：
 * 1. 始终使用固定仓位 = 1
 * 2. 连续运行，不受止盈/止损影响
 * 3. 计算和更新 C(t) 值（基准现金流速度）
 * 4. 计算和更新 StopLoss(t) 值（基准止损额）
 * 5. 记录基准净值曲线 BasePnL(t)
 *
 * 核心变量：
 * - BasePnL(t): 基准账户累计盈亏，固定仓位=1
 * - C(t) = max(亏损额/交易时间): 基准现金流速度
 * - StopLoss(t) = 历史单笔最大浮亏: 基准止损额
 *
 * 设计目的：
 * - C 和 StopLoss 由基准账户统一计算，供所有投注账户参考
 * - 投注账户在 C=0 或 StopLoss=0 时为观察期，Position=0
 */

import type { BaselineSnapshot } from '../types.js';

export class BaselineTracker {
  /** 基准累计净值 BasePnL(t) = Σ(pnl × 1) */
  private cumulativeEquity: number = 0;

  /** 当前 C(t) 估计值（基准现金流速度） */
  private estimatedC: number = 0;

  /** 当前 StopLoss(t) = 历史单笔最大浮亏 */
  private stopLoss: number = 0;

  /** 基准账户快照序列 */
  private snapshots: BaselineSnapshot[] = [];

  /** 基准净值曲线（每根K线一个值） */
  private equityCurve: number[] = [];

  /** C 值曲线（每根K线一个值） */
  private cCurve: number[] = [];

  /** StopLoss 值曲线（每根K线一个值） */
  private stopLossCurve: number[] = [];

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
    this.cCurve = new Array(count).fill(0);
    this.stopLossCurve = new Array(count).fill(0);
  }

  /**
   * 处理交易结果
   *
   * @param pnlPercent - 单位仓位的PnL百分比
   * @param candleIndex - 当前K线索引（平仓时的K线）
   * @param holdingPeriod - 持仓周期（K线数）
   * @param tradeIndex - 交易序号
   * @param tradeMaxDrawdown - 该笔交易的最大浮亏（正数表示亏损）
   */
  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    holdingPeriod: number,
    tradeIndex: number,
    tradeMaxDrawdown: number
  ): void {
    // 填充间隙（从上次到当前K线）
    this.fillCurveGaps(candleIndex);

    // 更新基准净值（固定仓位=1）
    this.cumulativeEquity += pnlPercent;

    // 更新 C 值（仅在亏损时）
    // C(t) = max(亏损额/交易时间)
    if (pnlPercent < 0 && holdingPeriod > 0) {
      const lossSpeed = Math.abs(pnlPercent) / holdingPeriod;
      this.estimatedC = Math.max(this.estimatedC, lossSpeed);
    }

    // 更新 StopLoss（历史单笔最大浮亏）
    if (tradeMaxDrawdown > this.stopLoss) {
      this.stopLoss = tradeMaxDrawdown;
    }

    // 更新曲线
    if (candleIndex < this.equityCurve.length) {
      this.equityCurve[candleIndex] = this.cumulativeEquity;
      this.cCurve[candleIndex] = this.estimatedC;
      this.stopLossCurve[candleIndex] = this.stopLoss;
    }

    // 记录快照
    if (this.recordDetails) {
      this.snapshots.push({
        candleIndex,
        tradeIndex,
        pnlPercent,
        cumulativeEquity: this.cumulativeEquity,
        estimatedC: this.estimatedC,
        maxDrawdown: tradeMaxDrawdown,
        stopLoss: this.stopLoss,
      });
    }

    this.lastCandleIndex = candleIndex;
  }

  /**
   * 填充曲线的间隙
   */
  private fillCurveGaps(currentIndex: number): void {
    if (this.lastCandleIndex < 0) return;

    for (let i = this.lastCandleIndex + 1; i < currentIndex && i < this.equityCurve.length; i++) {
      this.equityCurve[i] = this.cumulativeEquity;
      this.cCurve[i] = this.estimatedC;
      this.stopLossCurve[i] = this.stopLoss;
    }
  }

  /**
   * 填充曲线到末尾
   */
  finalize(): void {
    if (this.lastCandleIndex >= 0) {
      for (let i = this.lastCandleIndex + 1; i < this.equityCurve.length; i++) {
        this.equityCurve[i] = this.cumulativeEquity;
        this.cCurve[i] = this.estimatedC;
        this.stopLossCurve[i] = this.stopLoss;
      }
    }
  }

  /**
   * 获取当前 C(t) 估计值
   */
  getEstimatedC(): number {
    return this.estimatedC;
  }

  /**
   * 获取当前 StopLoss(t) 值
   */
  getStopLoss(): number {
    return this.stopLoss;
  }

  /**
   * 获取基准累计净值 BasePnL(t)
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
   * 获取 C 值曲线
   */
  getCCurve(): number[] {
    this.finalize();
    return [...this.cCurve];
  }

  /**
   * 获取 StopLoss 值曲线
   */
  getStopLossCurve(): number[] {
    this.finalize();
    return [...this.stopLossCurve];
  }

  /**
   * 检查是否在观察期
   * 观察期：C = 0 或 StopLoss = 0
   */
  isInObservationPeriod(): boolean {
    return this.estimatedC <= 0 || this.stopLoss <= 0;
  }

  /**
   * 重置
   */
  reset(): void {
    this.cumulativeEquity = 0;
    this.estimatedC = 0;
    this.stopLoss = 0;
    this.snapshots = [];
    this.equityCurve = [];
    this.cCurve = [];
    this.stopLossCurve = [];
    this.totalCandles = 0;
    this.lastCandleIndex = -1;
  }
}
