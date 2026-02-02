/**
 * Multi-Account Tracker - 多账户并行追踪器
 * 
 * 核心功能：
 * 1. 为每个止盈线 M_T 创建独立的虚拟账户
 * 2. 统一处理交易结果，同时更新所有账户
 * 3. 各账户独立止盈、独立重置
 * 4. 收集所有账户的止盈事件统计
 * 
 * 新风控框架：
 * - C(t) 和 StopLoss(t) 由外部 BaselineTracker 提供
 * - 每根K线更新风控线：RiskLine(t+1) = RiskLine(t) - C(t)
 * - 仓位计算：Position = StopLoss > 0 ? max(1, floor(VC/StopLoss)) : 0
 */

import type {
  TakeProfitTargetStats,
  BettingStrategyConfig,
  RiskControlStats,
  AccountSnapshot,
} from '../types.js';

import { VirtualAccount } from './virtual-account.js';
import type { TradeResultType } from './virtual-account.js';

export type { TradeResultType };

export class MultiAccountTracker {
  /** 虚拟账户映射：M_T -> VirtualAccount */
  private accounts: Map<number, VirtualAccount>;
  
  /** 交易成本率 */
  private tradingCostRate: number;
  
  /** 是否启用风控 */
  private enableRiskControl: boolean;
  
  /** 总K线数 */
  private totalCandles: number = 0;
  
  /** 是否记录样本数据 */
  private recordSample: boolean = false;
  
  /** 最后更新的K线索引 */
  private lastCandleIndex: number = -1;
  
  // ============================================
  // 曲线数据（用于可视化）
  // ============================================
  
  /** PnL 曲线 */
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

  constructor(config: BettingStrategyConfig) {
    this.accounts = new Map();
    this.tradingCostRate = config.tradingCostRate ?? 0;
    this.enableRiskControl = config.enableRiskControl ?? true;
    
    // 为每个止盈线创建独立账户
    for (const target of config.takeProfitTargets) {
      this.accounts.set(
        target,
        new VirtualAccount(target, this.enableRiskControl)
      );
    }
  }

  /**
   * 启用样本数据记录
   */
  enableSampleRecording(): void {
    this.recordSample = true;
    for (const account of this.accounts.values()) {
      account.enableSnapshotRecording();
    }
  }

  /**
   * 设置总K线数（初始化曲线数组）
   */
  setTotalCandles(count: number): void {
    this.totalCandles = count;
    
    if (this.recordSample) {
      for (const target of this.accounts.keys()) {
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
   * 每根K线调用，更新所有账户的风控线
   */
  updateRiskLineForAllAccounts(candleIndex: number, externalC: number): void {
    for (const [target, account] of this.accounts) {
      account.updateRiskLine(candleIndex, externalC);
      
      // 记录曲线数据
      if (this.recordSample) {
        const pnlCurve = this.pnlCurves.get(target);
        const riskLineCurve = this.riskLineCurves.get(target);
        const vcCurve = this.vcCurves.get(target);
        const positionCurve = this.positionCurves.get(target);
        const cCurve = this.estimatedCCurves.get(target);
        
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
      }
    }
    
    this.lastCandleIndex = candleIndex;
  }

  /**
   * 开仓前为所有账户准备仓位
   */
  preparePositionForAllAccounts(externalStopLoss: number): void {
    for (const [target, account] of this.accounts) {
      account.preparePosition(externalStopLoss);
      
      // 更新 StopLoss 曲线
      if (this.recordSample) {
        const stopLossCurve = this.stopLossCurves.get(target);
        if (stopLossCurve && this.lastCandleIndex >= 0 && this.lastCandleIndex < stopLossCurve.length) {
          stopLossCurve[this.lastCandleIndex] = externalStopLoss;
        }
      }
    }
  }

  /**
   * 处理交易结果，更新所有账户
   */
  processTradeResult(
    pnlPercent: number,
    candleIndex: number,
    tradeIndex: number,
    externalC: number,
    externalStopLoss: number
  ): void {
    for (const [target, account] of this.accounts) {
      account.processTradeResult(
        pnlPercent,
        candleIndex,
        tradeIndex,
        externalC,
        externalStopLoss
      );
      
      // 更新曲线数据
      if (this.recordSample) {
        const pnlCurve = this.pnlCurves.get(target);
        const riskLineCurve = this.riskLineCurves.get(target);
        const vcCurve = this.vcCurves.get(target);
        const positionCurve = this.positionCurves.get(target);
        const stopLossCurve = this.stopLossCurves.get(target);
        
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
        if (stopLossCurve && candleIndex < stopLossCurve.length) {
          stopLossCurve[candleIndex] = externalStopLoss;
        }
      }
    }
    
    this.lastCandleIndex = candleIndex;
  }

  // ============================================
  // 统计方法
  // ============================================

  /**
   * 获取所有账户的统计结果
   */
  getStatsByTarget(): Map<number, TakeProfitTargetStats> {
    const result = new Map<number, TakeProfitTargetStats>();
    
    for (const [target, account] of this.accounts) {
      const events = account.getTakeProfitEvents();
      const stats = this.calculateStats(target, events);
      result.set(target, stats);
    }
    
    return result;
  }

  /**
   * 获取所有账户的风控统计
   */
  getRiskControlStatsByTarget(): Map<number, RiskControlStats> {
    const result = new Map<number, RiskControlStats>();
    
    for (const [target, account] of this.accounts) {
      result.set(target, account.getRiskControlStats());
    }
    
    return result;
  }

  /**
   * 计算单个 M_T 的统计数据
   */
  private calculateStats(targetMultiplier: number, events: any[]): TakeProfitTargetStats {
    const roundCount = events.length;
    
    if (roundCount === 0) {
      return {
        targetMultiplier,
        events,
        roundCount: 0,
        avgInterval: null,
        medianInterval: null,
        minInterval: null,
        maxInterval: null,
        stdInterval: null,
        intervalPercentiles: { p25: null, p50: null, p75: null, p95: null },
        totalCandles: this.totalCandles,
        frequency: 0,
      };
    }
    
    const intervals = events.map((e: any) => e.intervalCandles);
    const sorted = [...intervals].sort((a, b) => a - b);
    
    const mean = intervals.reduce((sum: number, v: number) => sum + v, 0) / roundCount;
    const variance = intervals.reduce((sum: number, v: number) => sum + (v - mean) ** 2, 0) / roundCount;
    const std = Math.sqrt(variance);
    
    const percentile = (p: number) => {
      const index = Math.floor(p * roundCount);
      return sorted[Math.min(index, roundCount - 1)];
    };
    
    return {
      targetMultiplier,
      events,
      roundCount,
      avgInterval: mean,
      medianInterval: percentile(0.5),
      minInterval: sorted[0],
      maxInterval: sorted[roundCount - 1],
      stdInterval: std,
      intervalPercentiles: {
        p25: percentile(0.25),
        p50: percentile(0.5),
        p75: percentile(0.75),
        p95: percentile(0.95),
      },
      totalCandles: this.totalCandles,
      frequency: roundCount / this.totalCandles,
    };
  }

  // ============================================
  // 曲线数据获取
  // ============================================

  /**
   * 填充曲线间隙到末尾
   */
  private finalizeCurves(): void {
    if (!this.recordSample || this.lastCandleIndex < 0) return;
    
    for (const [target, account] of this.accounts) {
      const pnlCurve = this.pnlCurves.get(target);
      const riskLineCurve = this.riskLineCurves.get(target);
      const vcCurve = this.vcCurves.get(target);
      const positionCurve = this.positionCurves.get(target);
      const cCurve = this.estimatedCCurves.get(target);
      const stopLossCurve = this.stopLossCurves.get(target);
      
      if (!pnlCurve) continue;
      
      const lastPnL = pnlCurve[this.lastCandleIndex] ?? 0;
      const lastRiskLine = riskLineCurve?.[this.lastCandleIndex] ?? 0;
      const lastVC = vcCurve?.[this.lastCandleIndex] ?? 0;
      const lastPosition = positionCurve?.[this.lastCandleIndex] ?? 0;
      const lastC = cCurve?.[this.lastCandleIndex] ?? 0;
      const lastStopLoss = stopLossCurve?.[this.lastCandleIndex] ?? 0;
      
      for (let i = this.lastCandleIndex + 1; i < pnlCurve.length; i++) {
        pnlCurve[i] = lastPnL;
        if (riskLineCurve) riskLineCurve[i] = lastRiskLine - lastC * (i - this.lastCandleIndex);
        if (vcCurve) vcCurve[i] = pnlCurve[i] - (riskLineCurve?.[i] ?? 0);
        if (positionCurve) positionCurve[i] = lastPosition;
        if (cCurve) cCurve[i] = lastC;
        if (stopLossCurve) stopLossCurve[i] = lastStopLoss;
      }
    }
  }

  getPnLCurves(): Map<number, number[]> {
    this.finalizeCurves();
    return this.pnlCurves;
  }

  getRiskLineCurves(): Map<number, number[]> {
    this.finalizeCurves();
    return this.riskLineCurves;
  }

  getVCCurves(): Map<number, number[]> {
    this.finalizeCurves();
    return this.vcCurves;
  }

  getPositionCurves(): Map<number, number[]> {
    this.finalizeCurves();
    return this.positionCurves;
  }

  getEstimatedCCurves(): Map<number, number[]> {
    this.finalizeCurves();
    return this.estimatedCCurves;
  }

  getStopLossCurves(): Map<number, number[]> {
    this.finalizeCurves();
    return this.stopLossCurves;
  }

  /**
   * 获取止盈标记
   */
  getTakeProfitMarkers(): Map<number, number[]> {
    const markers = new Map<number, number[]>();
    for (const [target, account] of this.accounts) {
      const events = account.getTakeProfitEvents();
      markers.set(target, events.map(e => e.endCandleIndex));
    }
    return markers;
  }

  /**
   * 获取止损标记
   */
  getStopLossMarkers(): Map<number, number[]> {
    const markers = new Map<number, number[]>();
    for (const [target, account] of this.accounts) {
      const events = account.getStopLossEvents();
      markers.set(target, events.map(e => e.endCandleIndex));
    }
    return markers;
  }

  /**
   * 获取观察期结束索引
   */
  getObservationEndIndices(): Map<number, number> {
    const indices = new Map<number, number>();
    for (const [target, account] of this.accounts) {
      const stats = account.getRiskControlStats();
      indices.set(target, stats.observationEndIndex);
    }
    return indices;
  }

  /**
   * 获取所有账户的快照序列
   */
  getAccountSnapshots(): Map<number, AccountSnapshot[]> {
    const result = new Map<number, AccountSnapshot[]>();
    for (const [target, account] of this.accounts) {
      result.set(target, account.getAccountSnapshots());
    }
    return result;
  }

  /**
   * 获取所有止盈线
   */
  getTargets(): number[] {
    return Array.from(this.accounts.keys());
  }

  /**
   * 重置所有账户
   */
  reset(): void {
    this.totalCandles = 0;
    this.lastCandleIndex = -1;
    this.pnlCurves.clear();
    this.riskLineCurves.clear();
    this.vcCurves.clear();
    this.positionCurves.clear();
    this.estimatedCCurves.clear();
    this.stopLossCurves.clear();
    for (const account of this.accounts.values()) {
      account.reset();
    }
  }
}
