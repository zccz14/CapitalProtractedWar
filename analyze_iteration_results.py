#!/usr/bin/env python3
"""
实验结果分析脚本
解析 results/new_paradigm/*_data.json 并生成详细报告
"""

import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
import statistics

DATA_DIR = Path("/Users/c1/.openclaw/workspace/CapitalProtractedWar/results/new_paradigm")

def load_data_files() -> Dict[str, Any]:
    """加载所有数据文件"""
    data_files = list(DATA_DIR.glob("*_data.json"))
    data = {}
    for f in data_files:
        market_name = f.stem.replace("_data", "")
        with open(f, 'r') as file:
            data[market_name] = json.load(file)
    return data

def get_signal_label(signal_type: str) -> str:
    """获取策略的中文标签"""
    labels = {
        'random': '随机对照',
        'trend_following': '均线趋势',
        'regression_trend': '回归斜率(基线)',
        'regression_trend_rsi': '回归+RSI',
        'regression_trend_rsi_atr': '回归+RSI+ATR',
        'regression_trend_rsi_atr_macd': '回归+RSI+ATR+MACD',
        'regression_trend_rsi_atr_macd_adx': '回归+RSI+ATR+MACD+ADX',
        'regression_trend_rsi_atr_macd_adx_cci': '回归+RSI+ATR+MACD+ADX+CCI',
        'regression_trend_rsi_atr_macd_adx_cci_kdj': '回归+RSI+ATR+MACD+ADX+CCI+KDJ',
        'regression_trend_rsi_atr_macd_adx_cci_kdj_obv': '回归+RSI+ATR+MACD+ADX+CCI+KDJ+OBV',
    }
    return labels.get(signal_type, signal_type)

def get_indicator_explanation(signal_type: str) -> str:
    """获取指标解释"""
    explanations = {
        'random': '基准对照：完全随机交易，用于衡量市场随机性',
        'trend_following': 'MA(5,20)：短期均线高于长期均线时做多',
        'regression_trend': '线性回归斜率：价格序列的线性拟合斜率',
        'regression_trend_rsi': 'RSI(14)：相对强弱指数，动量确认，RSI>55做多，RSI<45做空',
        'regression_trend_rsi_atr': 'ATR(14)：真实波幅均值，用于波动率门控，避免低波动区间',
        'regression_trend_rsi_atr_macd': 'MACD(12,26,9)：指数移动平均差值，确认动能方向',
        'regression_trend_rsi_atr_macd_adx': 'ADX(14)：平均趋向指数，衡量趋势强度，ADX>20表示趋势明显',
        'regression_trend_rsi_atr_macd_adx_cci': 'CCI(20)：商品通道指数，识别超买超卖',
        'regression_trend_rsi_atr_macd_adx_cci_kdj': 'KDJ(9,3,3)：随机指标，进一步过滤超买超卖区域',
        'regression_trend_rsi_atr_macd_adx_cci_kdj_obv': 'OBV(20)：能量潮，成交量趋势确认',
    }
    return explanations.get(signal_type, '')

def calculate_p2_rankings(data: Dict[str, Any]) -> Dict[str, float]:
    """计算P(2x)排名 - 止盈2倍的概率"""
    rankings = {}
    for market_name, market_data in data.items():
        for signal_result in market_data['signalResults']:
            signal_type = signal_result['signalType']
            key = f"{market_name}_{signal_type}"
            p2_stats = signal_result['takeProfitStats'].get('2', {})
            total_rounds = p2_stats.get('totalRoundCount', 0)
            avg_rounds_per_run = p2_stats.get('avgRoundsPerRun', 0)
            # P(2x) = 止盈2倍的概率 = 平均每次运行完成的轮数
            rankings[key] = avg_rounds_per_run
    return rankings

def calculate_baseline_final_pnl(data: Dict[str, Any]) -> Dict[str, float]:
    """计算各策略的最终PnL均值"""
    # 基于止盈间隔反推：间隔越短，交易越频繁，收益累积越快
    final_pnls = {}
    for market_name, market_data in data.items():
        for signal_result in market_data['signalResults']:
            signal_type = signal_result['signalType']
            key = f"{market_name}_{signal_type}"
            # 使用M=1024作为长期收益指标
            p1024_stats = signal_result['takeProfitStats'].get('1024', {})
            total_rounds = p1024_stats.get('totalRoundCount', 0)
            avg_rounds_per_run = p1024_stats.get('avgRoundsPerRun', 0)
            final_pnls[key] = avg_rounds_per_run * 1024  # 简化估算
    return final_pnls

def calculate_relative_improvement(current: float, baseline: float) -> float:
    """计算相对提升"""
    if baseline == 0:
        return 0
    return (current - baseline) / baseline * 100

def generate_report(data: Dict[str, Any]) -> str:
    """生成详细报告"""
    report_lines = []
    
    report_lines.append("=" * 80)
    report_lines.append("资本持久战实验报告 - 策略迭代优化分析")
    report_lines.append("=" * 80)
    report_lines.append("")
    
    # P2排名分析
    report_lines.append("【1. P(2x) 排名分析】")
    report_lines.append("-" * 40)
    rankings = calculate_p2_rankings(data)
    
    # 按市场分组显示
    for market_name in sorted(data.keys()):
        report_lines.append(f"\n📊 市场场景: {market_name}")
        market_rankings = {k.replace(f"{market_name}_", ""): v for k, v in rankings.items() if k.startswith(market_name)}
        sorted_signals = sorted(market_rankings.items(), key=lambda x: x[1], reverse=True)
        for rank, (signal, p2_value) in enumerate(sorted_signals, 1):
            label = get_signal_label(signal)
            report_lines.append(f"   {rank:2d}. {label:25s} P(2x)={p2_value:.2f}")
    
    report_lines.append("")
    
    # Baseline Final PnL 均值
    report_lines.append("【2. baselineFinalPnL 均值估算】")
    report_lines.append("-" * 40)
    final_pnls = calculate_baseline_final_pnl(data)
    
    for market_name in sorted(data.keys()):
        report_lines.append(f"\n📊 市场场景: {market_name}")
        market_pnls = {k.replace(f"{market_name}_", ""): v for k, v in final_pnls.items() if k.startswith(market_name)}
        sorted_pnls = sorted(market_pnls.items(), key=lambda x: x[1], reverse=True)
        baseline_val = None
        for signal, pnl in sorted_pnls:
            if 'regression_trend_rsi_atr_macd_adx_cci_kdj_obv' in signal:
                baseline_val = pnl
                break
        
        for signal, pnl in sorted_pnls:
            label = get_signal_label(signal)
            improvement = calculate_relative_improvement(pnl, baseline_val) if baseline_val else 0
            sign = "+" if improvement > 0 else ""
            report_lines.append(f"   {label:25s} PnL≈{pnl:8.2f} {sign}{improvement:.1f}%")
    
    report_lines.append("")
    
    # 改动点汇总
    report_lines.append("【3. 改动点与指标解释】")
    report_lines.append("-" * 40)
    
    signal_types = ['random', 'trend_following', 'regression_trend', 'regression_trend_rsi', 
                   'regression_trend_rsi_atr', 'regression_trend_rsi_atr_macd',
                   'regression_trend_rsi_atr_macd_adx', 'regression_trend_rsi_atr_macd_adx_cci',
                   'regression_trend_rsi_atr_macd_adx_cci_kdj', 'regression_trend_rsi_atr_macd_adx_cci_kdj_obv']
    
    for signal in signal_types:
        label = get_signal_label(signal)
        explanation = get_indicator_explanation(signal)
        report_lines.append(f"\n🔧 {label}")
        report_lines.append(f"   类型: {signal}")
        report_lines.append(f"   解释: {explanation}")
    
    report_lines.append("")
    
    # 参数配置
    report_lines.append("【4. 关键参数配置】")
    report_lines.append("-" * 40)
    
    for market_name, market_data in data.items():
        config = market_data['config']
        report_lines.append(f"\n📊 市场配置 ({market_name}):")
        report_lines.append(f"   波动率: {config['market']['volatility']*100}%")
        report_lines.append(f"   漂移率: {config['market']['drift']*100}%")
        report_lines.append(f"   K线数: {config['market']['candleCount']}")
        report_lines.append(f"   MC运行次数: {config['monteCarloRuns']}")
        
        report_lines.append(f"\n📊 止盈目标: {config['betting']['takeProfitTargets']}")
        report_lines.append(f"   交易成本: {config['betting']['tradingCostRate']*100}%")
    
    report_lines.append("")
    
    # 风险分析 - drift0表现
    report_lines.append("【5. 风险分析 (drift0中性市场表现)】")
    report_lines.append("-" * 40)
    
    drift0_data = {k: v for k, v in data.items() if 'drift0' in k}
    
    for market_name in sorted(drift0_data.keys()):
        report_lines.append(f"\n⚠️ 中性市场: {market_name}")
        market = drift0_data[market_name]
        
        for signal_result in market['signalResults']:
            signal_type = signal_result['signalType']
            label = get_signal_label(signal_type)
            avg_win_rate = signal_result.get('avgWinRate', 0)
            avg_trade_count = signal_result.get('avgTradeCount', 0)
            
            # 计算在高止盈线下的表现稳定性
            high_target_stats = signal_result['takeProfitStats'].get('1024', {})
            total_rounds = high_target_stats.get('totalRoundCount', 0)
            
            report_lines.append(f"   {label:20s} 胜率:{avg_win_rate:.1%} 交易数:{avg_trade_count:.1f} 高止盈达成:{total_rounds}")
    
    report_lines.append("")
    
    # 下一步假设
    report_lines.append("【6. 下一步优化假设】")
    report_lines.append("-" * 40)
    
    report_lines.append("""
🎯 基于当前实验结果，建议以下优化方向：

1. 【KDJ参数微调】
   - 当前KDJ超买80/超卖20可能过于宽松
   - 假设：收紧至70/30可减少假信号

2. 【CCI门控优化】
   - 当前CCI阈值100可能遗漏部分趋势
   - 假设：降低至80可捕获更多早期趋势

3. 【ATR动态仓位】
   - 当前ATR仅用于过滤，建议结合仓位调整
   - 假设：高ATR时减少仓位，低ATR时增加

4. 【OBV斜率优化】
   - 当前OBV斜率阈值0.02可能过高
   - 假设：降低至0.01观察成交量确认效果

5. 【多时间框架确认】
   - 引入更高周期(1h/4h)的趋势确认
   - 假设：大周期趋势向上时才允许做多

6. 【机器学习辅助】
   - 使用轻量级ML模型综合多指标信号
   - 假设：LR/ RF模型可提升信号质量
""")
    
    report_lines.append("")
    report_lines.append("=" * 80)
    report_lines.append("报告生成完毕")
    report_lines.append("=" * 80)
    
    return "\n".join(report_lines)

def main():
    print("正在加载实验数据...")
    data = load_data_files()
    print(f"已加载 {len(data)} 个市场场景的数据")
    
    print("正在生成报告...")
    report = generate_report(data)
    
    report_path = DATA_DIR / "detailed_experiment_report.txt"
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    print(f"报告已保存至: {report_path}")
    print("\n" + "=" * 60)
    print(report)

if __name__ == "__main__":
    main()
