#!/usr/bin/env python3
"""
结果分析脚本 - 解析 experiment results 并生成详细报告
"""

import json
import glob
import os
from pathlib import Path
from typing import Dict, List, Any
import statistics

def parse_results_data(data_dir: str) -> Dict[str, Any]:
    """解析所有 *_data.json 文件"""
    results = {}
    pattern = os.path.join(data_dir, "*_data.json")
    
    for file_path in glob.glob(pattern):
        if "samples" in file_path:
            continue  # 跳过 samples 目录
        
        file_name = os.path.basename(file_path)
        market_name = file_name.replace("_data.json", "")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                results[market_name] = data
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
    
    return results

def analyze_signal_performance(signal_results: List[Dict]) -> Dict[str, Any]:
    """分析单个信号策略的性能"""
    analysis = {}
    
    for signal in signal_results:
        signal_type = signal.get('signalType', 'unknown')
        avg_win_rate = signal.get('avgWinRate', 0)
        avg_trade_count = signal.get('avgTradeCount', 0)
        
        take_profit_stats = signal.get('takeProfitStats', {})
        
        # 提取 P(2x) 排名数据 - 使用 M_T=2 的止盈间隔中位数
        p2_median = None
        p2_mean = None
        if '2' in take_profit_stats:
            tp_data = take_profit_stats['2']
            interval_stats = tp_data.get('intervalStats', {})
            p2_median = interval_stats.get('median')
            p2_mean = interval_stats.get('mean')
        
        analysis[signal_type] = {
            'avgWinRate': avg_win_rate,
            'avgTradeCount': avg_trade_count,
            'p2_median': p2_median,
            'p2_mean': p2_mean,
            'takeProfitStats': take_profit_stats
        }
    
    return analysis

def calculate_relative_improvement(current: float, baseline: float) -> float:
    """计算相对提升百分比"""
    if baseline == 0:
        return 0 if current == 0 else float('inf')
    return ((current - baseline) / abs(baseline)) * 100

def rank_signals_by_p2_median(signal_analysis: Dict) -> List[tuple]:
    """按 P(2x) 排名信号"""
    ranked = []
    for signal_type, data in signal_analysis.items():
        if data['p2_median'] is not None:
            ranked.append((signal_type, data['p2_median'], data))
    
    # 按 p2_median 排序（越小越好）
    ranked.sort(key=lambda x: x[1] if x[1] else float('inf'))
    return ranked

def generate_report(results: Dict[str, Any]) -> str:
    """生成详细报告"""
    report_lines = []
    report_lines.append("=" * 80)
    report_lines.append("资本持久战实验报告 - 策略性能分析")
    report_lines.append("=" * 80)
    report_lines.append("")
    
    for market_name, market_data in results.items():
        report_lines.append(f"\n## 市场场景: {market_name}")
        report_lines.append("-" * 60)
        
        config = market_data.get('config', {})
        signals = config.get('signals', [])
        signal_results = market_data.get('signalResults', [])
        
        # 分析各信号
        signal_analysis = analyze_signal_performance(signal_results)
        
        # 基线（随机策略）
        baseline = signal_analysis.get('random', {})
        baseline_p2 = baseline.get('p2_median', 0) if baseline else 0
        
        report_lines.append(f"\n基线 (random) P(2x) 中位数: {baseline_p2}")
        report_lines.append("")
        
        # 排名
        ranked = rank_signals_by_p2_median(signal_analysis)
        
        report_lines.append("P(2x) 排名（间隔越小越好）:")
        for rank, (signal_type, p2_median, data) in enumerate(ranked, 1):
            win_rate = data.get('avgWinRate', 0)
            trade_count = data.get('avgTradeCount', 0)
            
            if signal_type == 'random':
                relative_improvement = "基线"
                drift_risk = "N/A (对照)"
            else:
                rel_imp = calculate_relative_improvement(p2_median, baseline_p2)
                relative_improvement = f"{rel_imp:+.1f}%"
                
                # 风险评估：如果策略在 drift0 表现差，说明有 drift
                if 'drift0' in market_name.lower():
                    drift_risk = "⚠️ 高漂移敏感性" if p2_median > baseline_p2 else "✅ 稳定"
                else:
                    drift_risk = "✅"
            
            report_lines.append(f"  {rank}. {signal_type}")
            report_lines.append(f"     P(2x) 中位数: {p2_median}")
            report_lines.append(f"     胜率: {win_rate:.2%}")
            report_lines.append(f"     平均交易次数: {trade_count:.1f}")
            report_lines.append(f"     相对提升: {relative_improvement}")
            report_lines.append(f"     漂移风险: {drift_risk}")
            report_lines.append("")
    
    # 添加策略解释
    report_lines.append("\n" + "=" * 80)
    report_lines.append("策略指标解释")
    report_lines.append("=" * 80)
    report_lines.append("")
    report_lines.append("| 策略 | 新增指标 | 说明 |")
    report_lines.append("|------|---------|------|")
    report_lines.append("| random | 无 | 随机对照基准 |")
    report_lines.append("| trend_following | 无 | 经典均线趋势策略 (5/20 日均线) |")
    report_lines.append("| regression_trend | 线性回归斜率 | 通过线性回归计算价格趋势斜率 |")
    report_lines.append("| regression_trend_rsi | +RSI | 相对强弱指数，动量确认 |")
    report_lines.append("| regression_trend_rsi_atr | +ATR | 真实波幅，波动率门控 |")
    report_lines.append("| regression_trend_rsi_atr_macd | +MACD | 移动平均收敛发散，动能确认 |")
    report_lines.append("| regression_trend_rsi_atr_macd_adx | +ADX | 平均方向指数，趋势强度过滤 |")
    report_lines.append("| regression_trend_rsi_atr_macd_adx_cci | +CCI | 商品通道指数，动能门控 |")
    report_lines.append("| regression_trend_rsi_atr_macd_adx_cci_kdj | +KDJ | 随机指标，超买超卖过滤 |")
    report_lines.append("")
    
    # 下一步假设
    report_lines.append("\n" + "=" * 80)
    report_lines.append("下一步假设")
    report_lines.append("=" * 80)
    report_lines.append("")
    report_lines.append("1. KDJ 进一步过滤了超买超卖区域的虚假信号")
    report_lines.append("2. 如果 KDJ 策略在所有场景都表现最好，考虑作为主策略")
    report_lines.append("3. 如果 KDJ 在高波动率场景表现下降，可能需要调整参数")
    report_lines.append("4. 建议下一步：尝试在 KDJ 基础上增加 OBV (能量潮) 指标")
    report_lines.append("")
    
    return "\n".join(report_lines)

def main():
    data_dir = "./results/new_paradigm"
    
    print("Parsing results...")
    results = parse_results_data(data_dir)
    
    if not results:
        print("No results found!")
        return
    
    print(f"Found {len(results)} market scenarios")
    
    # 生成报告
    report = generate_report(results)
    print("\n" + report)
    
    # 保存报告
    report_path = os.path.join(data_dir, "experiment_report.txt")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    print(f"\nReport saved to: {report_path}")
    
    # 返回报告内容供发送
    return report

if __name__ == "__main__":
    main()
