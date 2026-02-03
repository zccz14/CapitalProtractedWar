/**
 * Tracker Curves - 曲线数据管理
 *
 * 负责管理多账户追踪器的曲线数据，用于可视化
 */

import type { VirtualAccount } from './virtual-account.js';

/**
 * 曲线数据管理器
 */
export class TrackerCurves {
  /** 已实现盈亏曲线 */
  private realizedPnLCurves: Map<number, number[]> = new Map();

  /** 未实现盈亏曲线 */
  private unrealizedPnLCurves: Map<number, number[]> = new Map();

  /** 总盈亏 PnL 曲线 */
  private pnlCurves: Map<number, number[]> = new Map();

  /** 风控线曲线 */
  private riskLineCurves: Map<number, number[]> = new Map();

  /** VC 曲线 */
  private vcCurves: Map<number, number[]> = new Map();

  /** 仓位曲线 */
  private positionCurves: Map<number, number[]> = new Map();

  /** C 值曲线 */
  private estimatedCCurves: Map<number, number[]> = new Map();

  /** StopLoss 值曲线 */
  private stopLossCurves: Map<number, number[]> = new Map();

  /** 总K线数 */
  private totalCandles: number = 0;

  /** 最后更新的K线索引 */
  private lastCandleIndex: number = -1;

  /** 是否记录样本数据 */
  private recordSample: boolean = false;

  /**
   * 初始化曲线数组
   */
  initialize(targets: number[], count: number, recordSample: boolean): void {
    this.totalCandles = count;
    this.recordSample = recordSample;

    if (recordSample) {
      for (const target of targets) {
        this.realizedPnLCurves.set(target, new Array(count).fill(0));
        this.unrealizedPnLCurves.set(target, new Array(count).fill(0));
        this.pnlCurves.set(target, new Array(count).fill(0));
        this.riskLineCurves.set(target, new Array(count).fill(0));
        this.vcCurves.set(target, new Array(count).fill(0));
        this.positionCurves.set(target, new Array(count).fill(0));
        this.estimatedCCurves.set(target, new Array(count).fill(0));
        this.stopLossCurves.set(target, new Array(count).fill(0));
      }
    }
  }

  /**
   * 更新曲线数据
   */
  update(
    target: number,
    account: VirtualAccount,
    candleIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    if (!this.recordSample) return;

    const realizedPnLCurve = this.realizedPnLCurves.get(target);
    const unrealizedPnLCurve = this.unrealizedPnLCurves.get(target);
    const pnlCurve = this.pnlCurves.get(target);
    const riskLineCurve = this.riskLineCurves.get(target);
    const vcCurve = this.vcCurves.get(target);
    const positionCurve = this.positionCurves.get(target);
    const cCurve = this.estimatedCCurves.get(target);
    const stopLossCurve = this.stopLossCurves.get(target);

    if (realizedPnLCurve && candleIndex < realizedPnLCurve.length) {
      realizedPnLCurve[candleIndex] = account.getRealizedPnL();
    }
    if (unrealizedPnLCurve && candleIndex < unrealizedPnLCurve.length) {
      unrealizedPnLCurve[candleIndex] = account.getUnrealizedPnL();
    }
    if (pnlCurve && candleIndex < pnlCurve.length) {
      pnlCurve[candleIndex] = account.getPnL();
    }
    if (riskLineCurve && candleIndex < riskLineCurve.length) {
      riskLineCurve[candleIndex] = account.getRiskLine();
    }
    if (vcCurve && candleIndex < vcCurve.length) {
      vcCurve[candleIndex] = account.getVentureCapital();
    }
    if (positionCurve && candleIndex < positionCurve.length) {
      positionCurve[candleIndex] = account.getPositionSize();
    }
    if (cCurve && candleIndex < cCurve.length) {
      cCurve[candleIndex] = externalC;
    }
    if (stopLossCurve && candleIndex < stopLossCurve.length && externalStopLoss > 0) {
      stopLossCurve[candleIndex] = externalStopLoss;
    }

    this.lastCandleIndex = candleIndex;
  }

  /**
   * 更新 StopLoss 曲线
   */
  updateStopLoss(target: number, candleIndex: number, externalStopLoss: number): void {
    if (!this.recordSample) return;

    const stopLossCurve = this.stopLossCurves.get(target);
    if (stopLossCurve && candleIndex >= 0 && candleIndex < stopLossCurve.length) {
      stopLossCurve[candleIndex] = externalStopLoss;
    }
  }

  /**
   * 填充曲线间隙到末尾
   */
  finalize(accounts: Map<number, VirtualAccount>): void {
    if (!this.recordSample || this.lastCandleIndex < 0) return;

    for (const [target, _account] of accounts) {
      const realizedPnLCurve = this.realizedPnLCurves.get(target);
      const unrealizedPnLCurve = this.unrealizedPnLCurves.get(target);
      const pnlCurve = this.pnlCurves.get(target);
      const riskLineCurve = this.riskLineCurves.get(target);
      const vcCurve = this.vcCurves.get(target);
      const positionCurve = this.positionCurves.get(target);
      const cCurve = this.estimatedCCurves.get(target);
      const stopLossCurve = this.stopLossCurves.get(target);

      if (!pnlCurve) continue;

      const lastRealizedPnL = realizedPnLCurve?.[this.lastCandleIndex] ?? 0;
      const lastUnrealizedPnL = unrealizedPnLCurve?.[this.lastCandleIndex] ?? 0;
      const lastPnL = pnlCurve[this.lastCandleIndex] ?? 0;
      const lastRiskLine = riskLineCurve?.[this.lastCandleIndex] ?? 0;
      const lastPosition = positionCurve?.[this.lastCandleIndex] ?? 0;
      const lastC = cCurve?.[this.lastCandleIndex] ?? 0;
      const lastStopLoss = stopLossCurve?.[this.lastCandleIndex] ?? 0;

      for (let i = this.lastCandleIndex + 1; i < pnlCurve.length; i++) {
        if (realizedPnLCurve) realizedPnLCurve[i] = lastRealizedPnL;
        if (unrealizedPnLCurve) unrealizedPnLCurve[i] = lastUnrealizedPnL;
        pnlCurve[i] = lastPnL;
        // 风控线继续下降
        if (riskLineCurve) riskLineCurve[i] = lastRiskLine - lastC * (i - this.lastCandleIndex);
        // VC = UnrealizedPnL - RiskLine
        if (vcCurve && unrealizedPnLCurve && riskLineCurve) {
          vcCurve[i] = unrealizedPnLCurve[i] - riskLineCurve[i];
        }
        if (positionCurve) positionCurve[i] = lastPosition;
        if (cCurve) cCurve[i] = lastC;
        if (stopLossCurve) stopLossCurve[i] = lastStopLoss;
      }
    }
  }

  /**
   * 设置最后更新的K线索引
   */
  setLastCandleIndex(index: number): void {
    this.lastCandleIndex = index;
  }

  /**
   * 获取最后更新的K线索引
   */
  getLastCandleIndex(): number {
    return this.lastCandleIndex;
  }

  /**
   * 是否正在记录
   */
  isRecording(): boolean {
    return this.recordSample;
  }

  // Getters
  getRealizedPnLCurves(): Map<number, number[]> {
    return this.realizedPnLCurves;
  }

  getUnrealizedPnLCurves(): Map<number, number[]> {
    return this.unrealizedPnLCurves;
  }

  getPnLCurves(): Map<number, number[]> {
    return this.pnlCurves;
  }

  getRiskLineCurves(): Map<number, number[]> {
    return this.riskLineCurves;
  }

  getVCCurves(): Map<number, number[]> {
    return this.vcCurves;
  }

  getPositionCurves(): Map<number, number[]> {
    return this.positionCurves;
  }

  getEstimatedCCurves(): Map<number, number[]> {
    return this.estimatedCCurves;
  }

  getStopLossCurves(): Map<number, number[]> {
    return this.stopLossCurves;
  }

  /**
   * 重置
   */
  reset(): void {
    this.totalCandles = 0;
    this.lastCandleIndex = -1;
    this.realizedPnLCurves.clear();
    this.unrealizedPnLCurves.clear();
    this.pnlCurves.clear();
    this.riskLineCurves.clear();
    this.vcCurves.clear();
    this.positionCurves.clear();
    this.estimatedCCurves.clear();
    this.stopLossCurves.clear();
  }
}
