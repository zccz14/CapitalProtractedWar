/**
 * Sample Report Overview - 样本报告概览部分生成
 */

import type { SampleRunData, AccountSnapshot } from '../../types.js';

export interface SampleOverviewData {
  totalTrades: number;
  winRate: string;
  avgHoldingPeriod: string;
  totalPnl: number;
  finalBaselineEquity: number;
  finalLearnedC: number;
  finalStopLoss: number;
  finalAntiMartingalePnL: number;
  finalRealizedPnL: number;
  takeProfitCount: number;
  stopLossCount: number;
  maxPosition: number;
  avgPosition: number;
  obsEndIdx: number;
}

/**
 * 从样本数据中提取概览信息
 */
export function extractOverviewData(
  sampleData: SampleRunData,
  targetMT: number
): SampleOverviewData {
  const { trades, baselineSnapshots, baselineEquityCurve, accountSnapshots, observationEndIndices } =
    sampleData;

  const totalTrades = trades?.length ?? 0;
  const winTrades = trades?.filter((t) => t.isWin).length ?? 0;
  const winRate = totalTrades > 0 ? ((winTrades / totalTrades) * 100).toFixed(1) : 'N/A';
  const avgHoldingPeriod =
    totalTrades > 0
      ? (trades!.reduce((sum, t) => sum + t.holdingPeriod, 0) / totalTrades).toFixed(1)
      : 'N/A';
  const totalPnl = trades?.reduce((sum, t) => sum + t.pnlPercent, 0) ?? 0;
  const finalBaselineEquity = baselineEquityCurve?.[baselineEquityCurve.length - 1] ?? 0;
  const finalLearnedC = baselineSnapshots?.[baselineSnapshots.length - 1]?.estimatedC ?? 0;

  const accountSnapshotsForTarget = accountSnapshots?.get(targetMT) ?? [];
  const finalSnapshot = accountSnapshotsForTarget[accountSnapshotsForTarget.length - 1];
  const finalAntiMartingalePnL = finalSnapshot?.pnl ?? 0;
  const finalRealizedPnL = finalSnapshot?.realizedPnL ?? 0;
  const takeProfitCount = accountSnapshotsForTarget.filter(
    (s) => s.eventType === 'take_profit'
  ).length;
  const stopLossCount = accountSnapshotsForTarget.filter((s) => s.eventType === 'stop_loss').length;
  const nonObservingSnapshots = accountSnapshotsForTarget.filter((s) => !s.isObserving);
  const maxPosition =
    nonObservingSnapshots.length > 0
      ? Math.max(...nonObservingSnapshots.map((s) => s.positionSize))
      : 0;
  const avgPosition =
    nonObservingSnapshots.length > 0
      ? nonObservingSnapshots.reduce((sum, s) => sum + s.positionSize, 0) /
        nonObservingSnapshots.length
      : 0;
  const finalStopLoss = finalSnapshot?.stopLoss ?? 0;
  const obsEndIdx = observationEndIndices?.get(targetMT) ?? 0;

  return {
    totalTrades,
    winRate,
    avgHoldingPeriod,
    totalPnl,
    finalBaselineEquity,
    finalLearnedC,
    finalStopLoss,
    finalAntiMartingalePnL,
    finalRealizedPnL,
    takeProfitCount,
    stopLossCount,
    maxPosition,
    avgPosition,
    obsEndIdx,
  };
}

/**
 * 生成概览卡片 HTML
 */
export function generateOverviewHTML(
  data: SampleOverviewData,
  config: { candleCount: number },
  targetMT: number
): string {
  return `
    <div class="card">
      <h2>运行概览</h2>
      <p style="color: #666; margin-bottom: 15px;">基础交易统计</p>
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="value">${config.candleCount}</div>
          <div class="label">K线数量</div>
        </div>
        <div class="metric-card">
          <div class="value">${data.totalTrades}</div>
          <div class="label">总交易数</div>
        </div>
        <div class="metric-card">
          <div class="value">${data.winRate}%</div>
          <div class="label">胜率</div>
        </div>
        <div class="metric-card">
          <div class="value">${data.avgHoldingPeriod}</div>
          <div class="label">平均持仓周期</div>
        </div>
      </div>
      
      <p style="color: #666; margin: 20px 0 15px 0;">基准账户 (仓位=1)</p>
      <div class="grid grid-4">
        <div class="metric-card">
          <div class="value">${(data.totalPnl * 100).toFixed(2)}%</div>
          <div class="label">累计PnL</div>
        </div>
        <div class="metric-card">
          <div class="value">${(data.finalBaselineEquity * 100).toFixed(2)}%</div>
          <div class="label">最终净值</div>
        </div>
        <div class="metric-card">
          <div class="value">${(data.finalLearnedC * 100).toFixed(4)}%</div>
          <div class="label">学习到的 C 值</div>
        </div>
        <div class="metric-card">
          <div class="value">${(data.finalStopLoss * 100).toFixed(4)}%</div>
          <div class="label">学习到的 StopLoss</div>
        </div>
      </div>
      
      <p style="color: #667eea; margin: 20px 0 15px 0; font-weight: bold;">反马丁账户 (M_T=${targetMT})</p>
      <div class="grid grid-4">
        <div class="metric-card" style="border-left: 4px solid #27ae60;">
          <div class="value" style="color: ${data.finalAntiMartingalePnL >= 0 ? '#27ae60' : '#e74c3c'};">${(data.finalAntiMartingalePnL * 100).toFixed(2)}%</div>
          <div class="label">最终总 PnL</div>
        </div>
        <div class="metric-card" style="border-left: 4px solid #3498db;">
          <div class="value">${(data.finalRealizedPnL * 100).toFixed(2)}%</div>
          <div class="label">已实现 PnL</div>
        </div>
        <div class="metric-card" style="border-left: 4px solid #27ae60;">
          <div class="value" style="color: #27ae60;">${data.takeProfitCount}</div>
          <div class="label">止盈次数</div>
        </div>
        <div class="metric-card" style="border-left: 4px solid #e74c3c;">
          <div class="value" style="color: #e74c3c;">${data.stopLossCount}</div>
          <div class="label">止损次数</div>
        </div>
      </div>
      <div class="grid grid-4" style="margin-top: 15px;">
        <div class="metric-card">
          <div class="value">${data.maxPosition}</div>
          <div class="label">最大仓位</div>
        </div>
        <div class="metric-card">
          <div class="value">${data.avgPosition.toFixed(2)}</div>
          <div class="label">平均仓位</div>
        </div>
        <div class="metric-card">
          <div class="value">${data.obsEndIdx}</div>
          <div class="label">观察期结束索引</div>
        </div>
        <div class="metric-card">
          <div class="value">${data.takeProfitCount + data.stopLossCount}</div>
          <div class="label">总轮数</div>
        </div>
      </div>
    </div>
  `;
}
