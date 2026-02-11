/**
 * Signal Report Samples - 样本链接生成
 */

import type { ExperimentResult } from '../../types.js';
import { sanitizeFilename } from '../utils.js';

/**
 * 生成样本详情链接 HTML
 */
export function generateSampleLinksHTML(
  result: ExperimentResult,
  signalType: string,
  marketName: string
): string {
  if (!result.sampleRuns || result.sampleRuns.length === 0) {
    return '';
  }

  // 筛选出有该信号策略样本数据的运行
  const runsWithData = result.sampleRuns.filter((run) => {
    const sampleData = run.sampleData?.get(signalType);
    return sampleData && sampleData.trades && sampleData.trades.length > 0;
  });

  if (runsWithData.length === 0) {
    return '';
  }

  const takeProfitTargets = result.config.betting.takeProfitTargets;
  const totalRuns = result.monteCarloRuns;

  // 按样本类型排序：best -> median -> worst, only 排在最前
  const typeOrder: Record<string, number> = { only: 0, best: 0, median: 1, worst: 2 };
  const sortedRuns = [...runsWithData].sort((a, b) => {
    const typeA = a.sampleMetadata?.get(signalType)?.sampleType ?? 'median';
    const typeB = b.sampleMetadata?.get(signalType)?.sampleType ?? 'median';
    return typeOrder[typeA] - typeOrder[typeB];
  });

  // 检测是否为单次运行（非蒙特卡洛）
  const isSingleRun =
    sortedRuns.length === 1 && sortedRuns[0].sampleMetadata?.get(signalType)?.sampleType === 'only';

  // 为每个样本运行生成一个卡片
  const runCards = sortedRuns
    .map((run) => {
      const meta = run.sampleMetadata?.get(signalType);
      const originalRunIndex = meta?.runIndex ?? run.runIndex;
      const sampleType = meta?.sampleType ?? 'median';
      const baselinePnL = meta?.baselinePnL ?? 0;

      const typeLabel =
        sampleType === 'only'
          ? '唯一样本'
          : sampleType === 'best'
            ? '最佳'
            : sampleType === 'worst'
              ? '最差'
              : '中位';
      const typeColor =
        sampleType === 'only'
          ? '#8e44ad'
          : sampleType === 'best'
            ? '#27ae60'
            : sampleType === 'worst'
              ? '#e74c3c'
              : '#3498db';
      const pnlStr = (baselinePnL * 100).toFixed(2);
      const pnlColor = baselinePnL >= 0 ? '#27ae60' : '#e74c3c';

      const mtLinks = takeProfitTargets
        .map((mt) => {
          const sampleFilename = `sample_${sanitizeFilename(marketName)}_${sanitizeFilename(signalType)}_run${originalRunIndex + 1}_mt${mt}.html`;
          return `<a href="${sampleFilename}" class="mt-link">M_T=${mt}</a>`;
        })
        .join('');

      return `
      <div class="sample-run-card" style="border-left: 4px solid ${typeColor};">
        <h4>
          <span class="sample-type-badge" style="background: ${typeColor};">${typeLabel}</span>
          ${sampleType === 'only' ? '' : `Run #${originalRunIndex + 1} | `}基准PnL: <span style="color: ${pnlColor};">${pnlStr}%</span>
        </h4>
        <div class="mt-links-grid">
          ${mtLinks}
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div class="card">
      <h2>样本详情报告</h2>
      <p style="color: #666; margin-bottom: 15px;">
        ${
          isSingleRun
            ? '单次运行的样本数据。每个 M_T 值有独立的报告文件。'
            : `从 <strong>${totalRuns}</strong> 次蒙特卡洛运行中选择 <strong>3</strong> 个代表性样本（基于基准账户 PnL 排序）。
        每个 M_T 值有独立的报告文件。`
        }
      </p>
      <style>
        .sample-run-card {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          padding: 15px;
          margin-bottom: 15px;
          color: white;
        }
        .sample-run-card h4 {
          margin: 0 0 10px 0;
          font-size: 16px;
        }
        .sample-type-badge {
          display: inline-block;
          padding: 2px 10px;
          border-radius: 4px;
          margin-right: 10px;
          font-size: 13px;
        }
        .mt-links-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .mt-link {
          display: inline-block;
          padding: 6px 12px;
          background: rgba(255,255,255,0.2);
          border-radius: 6px;
          color: white;
          text-decoration: none;
          font-size: 13px;
          transition: background 0.2s;
        }
        .mt-link:hover {
          background: rgba(255,255,255,0.4);
        }
      </style>
      ${runCards}
    </div>
  `;
}
