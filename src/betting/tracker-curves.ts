/**
 * Tracker Curves - 曲线数据管理
 *
 * 负责管理多账户追踪器的曲线数据，用于可视化
 */

import type { VirtualAccount } from './virtual-account.js';

/** 曲线类型 */
export type CurveType =
  | 'realizedPnL'
  | 'unrealizedPnL'
  | 'pnl'
  | 'riskLine'
  | 'vc'
  | 'position'
  | 'estimatedC'
  | 'stopLoss';

/** 所有曲线类型列表 */
const ALL_CURVE_TYPES: CurveType[] = [
  'realizedPnL',
  'unrealizedPnL',
  'pnl',
  'riskLine',
  'vc',
  'position',
  'estimatedC',
  'stopLoss',
];

/**
 * 曲线数据管理器
 *
 * 使用泛型结构存储所有曲线类型
 */
export class TrackerCurves {
  /** 曲线数据：CurveType -> (M_T -> number[]) */
  private curves = new Map<CurveType, Map<number, number[]>>();

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
      for (const curveType of ALL_CURVE_TYPES) {
        const targetMap = new Map<number, number[]>();
        for (const target of targets) {
          targetMap.set(target, new Array(count).fill(0));
        }
        this.curves.set(curveType, targetMap);
      }
    }
  }

  /**
   * 获取指定曲线
   */
  private getCurve(type: CurveType, target: number): number[] | undefined {
    return this.curves.get(type)?.get(target);
  }

  /**
   * 更新单个曲线值
   */
  private setCurveValue(type: CurveType, target: number, index: number, value: number): void {
    const curve = this.getCurve(type, target);
    if (curve && index >= 0 && index < curve.length) {
      curve[index] = value;
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

    this.setCurveValue('realizedPnL', target, candleIndex, account.getRealizedPnL());
    this.setCurveValue('unrealizedPnL', target, candleIndex, account.getUnrealizedPnL());
    this.setCurveValue('pnl', target, candleIndex, account.getPnL());
    this.setCurveValue('riskLine', target, candleIndex, account.getRiskLine());
    this.setCurveValue('vc', target, candleIndex, account.getVentureCapital());
    this.setCurveValue('position', target, candleIndex, account.getPositionSize());
    this.setCurveValue('estimatedC', target, candleIndex, externalC);

    if (externalStopLoss > 0) {
      this.setCurveValue('stopLoss', target, candleIndex, externalStopLoss);
    }

    this.lastCandleIndex = candleIndex;
  }

  /**
   * 更新 StopLoss 曲线
   */
  updateStopLoss(target: number, candleIndex: number, externalStopLoss: number): void {
    if (!this.recordSample) return;
    this.setCurveValue('stopLoss', target, candleIndex, externalStopLoss);
  }

  /**
   * 填充曲线间隙到末尾
   */
  finalize(accounts: Map<number, VirtualAccount>): void {
    if (!this.recordSample || this.lastCandleIndex < 0) return;

    for (const [target] of accounts) {
      const pnlCurve = this.getCurve('pnl', target);
      if (!pnlCurve) continue;

      const lastRealizedPnL = this.getCurve('realizedPnL', target)?.[this.lastCandleIndex] ?? 0;
      const lastUnrealizedPnL = this.getCurve('unrealizedPnL', target)?.[this.lastCandleIndex] ?? 0;
      const lastPnL = pnlCurve[this.lastCandleIndex] ?? 0;
      const lastRiskLine = this.getCurve('riskLine', target)?.[this.lastCandleIndex] ?? 0;
      const lastPosition = this.getCurve('position', target)?.[this.lastCandleIndex] ?? 0;
      const lastC = this.getCurve('estimatedC', target)?.[this.lastCandleIndex] ?? 0;
      const lastStopLoss = this.getCurve('stopLoss', target)?.[this.lastCandleIndex] ?? 0;

      for (let i = this.lastCandleIndex + 1; i < pnlCurve.length; i++) {
        this.setCurveValue('realizedPnL', target, i, lastRealizedPnL);
        this.setCurveValue('unrealizedPnL', target, i, lastUnrealizedPnL);
        this.setCurveValue('pnl', target, i, lastPnL);
        // 风控线继续下降
        const newRiskLine = lastRiskLine - lastC * (i - this.lastCandleIndex);
        this.setCurveValue('riskLine', target, i, newRiskLine);
        // VC = UnrealizedPnL - RiskLine
        this.setCurveValue('vc', target, i, lastUnrealizedPnL - newRiskLine);
        this.setCurveValue('position', target, i, lastPosition);
        this.setCurveValue('estimatedC', target, i, lastC);
        this.setCurveValue('stopLoss', target, i, lastStopLoss);
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

  // ============================================
  // Getters - 返回指定类型的所有曲线
  // ============================================

  private getCurvesOfType(type: CurveType): Map<number, number[]> {
    return this.curves.get(type) ?? new Map();
  }

  getRealizedPnLCurves(): Map<number, number[]> {
    return this.getCurvesOfType('realizedPnL');
  }

  getUnrealizedPnLCurves(): Map<number, number[]> {
    return this.getCurvesOfType('unrealizedPnL');
  }

  getPnLCurves(): Map<number, number[]> {
    return this.getCurvesOfType('pnl');
  }

  getRiskLineCurves(): Map<number, number[]> {
    return this.getCurvesOfType('riskLine');
  }

  getVCCurves(): Map<number, number[]> {
    return this.getCurvesOfType('vc');
  }

  getPositionCurves(): Map<number, number[]> {
    return this.getCurvesOfType('position');
  }

  getEstimatedCCurves(): Map<number, number[]> {
    return this.getCurvesOfType('estimatedC');
  }

  getStopLossCurves(): Map<number, number[]> {
    return this.getCurvesOfType('stopLoss');
  }

  /**
   * 重置
   */
  reset(): void {
    this.totalCandles = 0;
    this.lastCandleIndex = -1;
    this.curves.clear();
  }
}
