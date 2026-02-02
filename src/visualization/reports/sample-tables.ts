/**
 * Sample Tables - 样本报告表格生成
 */

import type { TradeRecord, BaselineSnapshot, AccountSnapshot, Candle } from '../../types.js';

/**
 * 生成交易记录表格
 */
export function generateTradesTable(trades: TradeRecord[]): string {
  if (trades.length === 0) {
    return '<p style="color: #999; text-align: center;">无交易记录</p>';
  }

  const rows = trades
    .map((t) => {
      const rowClass = t.isWin ? 'trade-win' : 'trade-loss';
      const directionText =
        t.direction === 1
          ? '<span class="signal-long">多</span>'
          : '<span class="signal-short">空</span>';
      const pnlText =
        t.pnlPercent >= 0
          ? `<span style="color: #27ae60;">+${(t.pnlPercent * 100).toFixed(3)}%</span>`
          : `<span style="color: #e74c3c;">${(t.pnlPercent * 100).toFixed(3)}%</span>`;

      return `<tr class="${rowClass}">
      <td>${t.tradeIndex}</td>
      <td>${directionText}</td>
      <td>${t.signalIndex}</td>
      <td>${t.entryIndex}</td>
      <td>${t.entryPrice.toFixed(4)}</td>
      <td>${t.exitSignalIndex}</td>
      <td>${t.exitIndex}</td>
      <td>${t.exitPrice.toFixed(4)}</td>
      <td>${t.holdingPeriod}</td>
      <td>${pnlText}</td>
      <td>${(t.maxDrawdown * 100).toFixed(3)}%</td>
    </tr>`;
    })
    .join('');

  return `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>方向</th>
        <th>信号索引</th>
        <th>开仓索引</th>
        <th>开仓价</th>
        <th>平仓信号</th>
        <th>平仓索引</th>
        <th>平仓价</th>
        <th>持仓周期</th>
        <th>PnL</th>
        <th>最大浮亏</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 生成基准账户快照表格
 */
export function generateBaselineTable(snapshots: BaselineSnapshot[]): string {
  if (snapshots.length === 0) {
    return '<p style="color: #999; text-align: center;">无基准账户快照</p>';
  }

  const rows = snapshots
    .map((s) => {
      const pnlText =
        s.pnlPercent >= 0
          ? `<span style="color: #27ae60;">+${(s.pnlPercent * 100).toFixed(3)}%</span>`
          : `<span style="color: #e74c3c;">${(s.pnlPercent * 100).toFixed(3)}%</span>`;
      const equityText =
        s.cumulativeEquity >= 0
          ? `<span style="color: #27ae60;">${(s.cumulativeEquity * 100).toFixed(3)}%</span>`
          : `<span style="color: #e74c3c;">${(s.cumulativeEquity * 100).toFixed(3)}%</span>`;

      return `<tr>
      <td>${s.tradeIndex}</td>
      <td>${s.candleIndex}</td>
      <td>${pnlText}</td>
      <td>${equityText}</td>
      <td>${(s.estimatedC * 100).toFixed(4)}%</td>
      <td>${(s.maxDrawdown * 100).toFixed(3)}%</td>
      <td>${(s.stopLoss * 100).toFixed(3)}%</td>
    </tr>`;
    })
    .join('');

  return `<table>
    <thead>
      <tr>
        <th>交易#</th>
        <th>K线索引</th>
        <th>PnL</th>
        <th>累计净值</th>
        <th>C 值</th>
        <th>浮亏</th>
        <th>StopLoss</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 生成账户状态快照表格
 */
export function generateAccountSnapshotsTable(
  snapshots: AccountSnapshot[],
  _targetMultiplier: number
): string {
  if (snapshots.length === 0) {
    return '<p style="color: #999; text-align: center;">无账户快照</p>';
  }

  const formatPnl = (value: number, isObserving = false): string => {
    if (value === 0 && isObserving) {
      return '<span style="color: #888;">0</span>';
    }
    const color = value >= 0 ? '#27ae60' : '#e74c3c';
    const sign = value >= 0 ? '+' : '';
    return `<span style="color: ${color};">${sign}${(value * 100).toFixed(3)}%</span>`;
  };

  const rows = snapshots
    .map((s) => {
      let rowClass = '';
      let eventText = '';

      switch (s.eventType) {
        case 'observing':
          rowClass = 'observing';
          eventText = '<span class="event-obs">观察期</span>';
          break;
        case 'take_profit':
          eventText = '<span class="event-tp">止盈</span>';
          break;
        case 'stop_loss':
          eventText = '<span class="event-sl">止损</span>';
          break;
        default:
          eventText = '交易';
      }

      const vcText =
        s.ventureCapital >= 0
          ? `<span style="color: #27ae60;">${s.ventureCapital.toFixed(4)}</span>`
          : `<span style="color: #e74c3c;">${s.ventureCapital.toFixed(4)}</span>`;

      return `<tr class="${rowClass}">
      <td>${s.tradeIndex}</td>
      <td>${s.candleIndex}</td>
      <td>${eventText}</td>
      <td>${formatPnl(s.pnlPercent, s.isObserving)}</td>
      <td>${s.positionSize}</td>
      <td>${formatPnl(s.actualPnl, s.isObserving)}</td>
      <td>${formatPnl(s.unrealizedPnL)}</td>
      <td>${formatPnl(s.realizedPnL)}</td>
      <td>${formatPnl(s.pnl)}</td>
      <td>${s.riskLine.toFixed(4)}</td>
      <td>${vcText}</td>
      <td>${s.estimatedC.toFixed(6)}</td>
      <td>${s.stopLoss.toFixed(4)}</td>
    </tr>`;
    })
    .join('');

  return `<table>
    <thead>
      <tr>
        <th>交易#</th>
        <th>K线</th>
        <th>事件</th>
        <th>单笔PnL</th>
        <th>仓位</th>
        <th>本笔盈亏</th>
        <th>未实现盈亏</th>
        <th>已实现盈亏</th>
        <th>总盈亏</th>
        <th>风控线</th>
        <th>VC</th>
        <th>C值</th>
        <th>StopLoss</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * 生成K线数据表格（前100条）
 */
export function generateCandleDataTable(
  candles: Candle[],
  signals: number[],
  trades: TradeRecord[]
): string {
  if (candles.length === 0) {
    return '<p style="color: #999; text-align: center;">无K线数据</p>';
  }

  const tradeEntryMap = new Map<number, TradeRecord>();
  const tradeExitMap = new Map<number, TradeRecord>();
  for (const t of trades) {
    tradeEntryMap.set(t.entryIndex, t);
    tradeExitMap.set(t.exitIndex, t);
  }

  const displayCandles = candles.slice(0, 100);

  const rows = displayCandles
    .map((c, i) => {
      const signal = signals[i] ?? 0;
      let signalText = '<span class="signal-flat">-</span>';
      if (signal === 1) signalText = '<span class="signal-long">多</span>';
      else if (signal === -1) signalText = '<span class="signal-short">空</span>';

      let action = '-';
      const entryTrade = tradeEntryMap.get(i);
      const exitTrade = tradeExitMap.get(i);
      if (entryTrade) {
        action = entryTrade.direction === 1 ? '开多' : '开空';
      }
      if (exitTrade) {
        action += `${action !== '-' ? ' / ' : ''}平仓`;
      }

      return `<tr>
      <td>${i}</td>
      <td>${c.open.toFixed(4)}</td>
      <td>${c.high.toFixed(4)}</td>
      <td>${c.low.toFixed(4)}</td>
      <td>${c.close.toFixed(4)}</td>
      <td>${signalText}</td>
      <td>${action}</td>
    </tr>`;
    })
    .join('');

  return `<table>
    <thead>
      <tr>
        <th>索引</th>
        <th>开盘</th>
        <th>最高</th>
        <th>最低</th>
        <th>收盘</th>
        <th>信号</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="color: #888; font-size: 12px; margin-top: 10px;">
    显示前 ${displayCandles.length} / ${candles.length} 条数据
  </p>`;
}
