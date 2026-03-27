#!/usr/bin/env python3
"""
CCI策略迭代实验报告生成器
解析实验结果并生成详细报告
"""

import json
import os
from pathlib import Path
from typing import Dict, List, Any

RESULTS_DIR = Path("results/new_paradigm")

def load_data_files():
    """加载所有数据文件"""
    data_files = list(RESULTS_DIR.glob("*_data.json"))
    print(f"找到 {len(data_files)} 个数据文件")
    return data_files

def parse_signal_type(signal_id: str) -> str:
    """解析信号类型"""
    if "regression_trend_rsi_atr_macd_adx_cci" in signal_id:
        return "regression_trend_rsi_atr_macd_adx_cci"
    elif "regression_trend_rsi_atr_macd_adx" in signal_id:
        return "regression_trend_rsi_atr_macd_adx"
    elif "regression_trend_rsi_atr_macd" in signal_id:
        return "regression_trend_rsi_atr_macd"
    elif "regression_trend_rsi_atr" in signal_id:
        return "regression_trend_rsi_atr"
    elif "regression_trend_rsi" in signal_id:
        return "regression_trend_rsi"
    elif "regression_trend" in signal_id:
        return "regression_trend"
    elif "trend_following" in signal_id:
        return "trend_following"
    elif "random" in signal_id:
        return "random"
    return signal_id

def extract_indicator_layers(signal_type: str) -> List[str]:
    """提取指标层级"""
    layers = ["基线"]
    if "regression_trend" in signal_type:
        layers.append("回归斜率")
    if "rsi" in signal_type:
        layers.append("RSI")
    if "atr" in signal_type:
        layers.append("ATR")
    if "macd" in signal_type:
        layers.append("MACD")
    if "adx" in signal_type:
        layers.append("ADX")
    if "cci" in signal_type:
        layers.append("CCI")
    return layers

def get_p2x_for_signal(signal_results: List[Dict], signal_type: str) -> float:
    """获取指定信号的P(2x)值"""
    for result in signal_results:
        if result.get("signalType") == signal_type:
            tp_stats = result.get("takeProfitStats", {}).get("2", {})
            return tp_stats.get("totalRoundCount", 0) / tp_stats.get("totalRunCount", 1) if tp_stats.get("totalRunCount") else 0
    return 0.0

def calculate_baseline_final_pnl(signal_results: List[Dict], signal_type: str) -> float:
    """计算基准策略的最终PnL均值"""
    for result in signal_results:
        if result.get("signalType") == signal_type:
            return result.get("avgFinalPnL", 0)
    return 0.0

def analyze_results():
    """分析实验结果"""
    data_files = load_data_files()
    all_results = {}

    for data_file in data_files:
        with open(data_file, 'r') as f:
            data = json.load(f)

        market_name = data.get("config", {}).get("name", data_file.stem)
        signal_results = data.get("signalResults", [])

        for result in signal_results:
            signal_type = result.get("signalType", "unknown")
            layers = extract_indicator_layers(signal_type)

            if signal_type not in all_results:
                all_results[signal_type] = {
                    "signal_type": signal_type,
                    "layers": layers,
                    "markets": [],
                    "p2x_values": [],
                    "avg_win_rates": [],
                    "avg_final_pnl": []
                }

            tp_stats = result.get("takeProfitStats", {}).get("2", {})
            total_rounds = tp_stats.get("totalRoundCount", 0)
            total_runs = tp_stats.get("totalRoundCount", 1)  # 使用rounds作为分母

            p2x = total_rounds / total_runs if total_runs else 0
            all_results[signal_type]["p2x_values"].append(p2x)
            all_results[signal_type]["avg_win_rates"].append(result.get("avgWinRate", 0))
            all_results[signal_type]["avg_final_pnl"].append(result.get("avgFinalPnL", 0))
            all_results[signal_type]["markets"].append(market_name)

    return all_results

def generate_report(all_results: Dict[str, Any]) -> str:
    """生成报告"""
    report_lines = []

    report_lines.append("# CCI策略迭代实验报告\n")
    report_lines.append("## 实验概述\n")
    report_lines.append("- **实验目的**: 按循序渐进逻辑优化策略，逐步引入新指标")
    report_lines.append("- **改动点**: 新增CCI（商品通道指数）指标作为动能过滤器")
    report_lines.append("- **指标解释**: CCI衡量价格偏离均值的程度，|CCI|>100表示强动能区域")
    report_lines.append("- **参数**: CCI周期=20，CCI阈值=100（做多:CCI>100，做空:CCI<-100）\n")

    report_lines.append("## 策略演进层级\n")
    report_lines.append("| 层级 | 策略 | 指标组合 |")
    report_lines.append("|------|------|---------|")
    report_lines.append("| 1 | random | 对照组（随机） |")
    report_lines.append("| 2 | trend_following | 简单均线交叉 |")
    report_lines.append("| 3 | regression_trend | 线性回归斜率 |")
    report_lines.append("| 4 | regression_trend_rsi | 回归斜率+RSI |")
    report_lines.append("| 5 | regression_trend_rsi_atr | +ATR波动率门控 |")
    report_lines.append("| 6 | regression_trend_rsi_atr_macd | +MACD动能确认 |")
    report_lines.append("| 7 | regression_trend_rsi_atr_macd_adx | +ADX趋势强度 |")
    report_lines.append("| 8 | regression_trend_rsi_atr_macd_adx_cci | +CCI动能过滤 |")
    report_lines.append("| 9 | ***CCI*** | 新增CCI指标 |")
    report_lines.append("")

    report_lines.append("## 策略对比分析\n")

    # 按P(2x)排序
    sorted_signals = sorted(all_results.items(), key=lambda x: sum(x[1]["p2x_values"]) / len(x[1]["p2x_values"]) if x[1]["p2x_values"] else 0, reverse=True)

    report_lines.append("### P(2x) 排名\n")
    report_lines.append("| 排名 | 策略 | P(2x)均值 | 胜率 | 最终PnL |")
    report_lines.append("|------|------|----------|------|---------|")

    for i, (signal_type, data) in enumerate(sorted_signals, 1):
        avg_p2x = sum(data["p2x_values"]) / len(data["p2x_values"]) if data["p2x_values"] else 0
        avg_win_rate = sum(data["avg_win_rates"]) / len(data["avg_win_rates"]) if data["avg_win_rates"] else 0
        avg_final_pnl = sum(data["avg_final_pnl"]) / len(data["avg_final_pnl"]) if data["avg_final_pnl"] else 0

        is_new = "cci" in signal_type
        marker = "***" if is_new else ""
        report_lines.append(f"| {i} | {marker}{signal_type}{marker} | {avg_p2x:.4f} | {avg_win_rate:.2%} | {avg_final_pnl:.4f} |")

    report_lines.append("")

    # 计算相对提升
    report_lines.append("### 相对提升分析\n")
    if "random" in all_results:
        baseline_p2x = sum(all_results["random"]["p2x_values"]) / len(all_results["random"]["p2x_values"]) if all_results["random"]["p2x_values"] else 0

        for signal_type, data in all_results.items():
            if signal_type != "random":
                avg_p2x = sum(data["p2x_values"]) / len(data["p2x_values"]) if data["p2x_values"] else 0
                relative_improvement = (avg_p2x - baseline_p2x) / baseline_p2x * 100 if baseline_p2x > 0 else 0

                is_new = "cci" in signal_type
                marker = "***" if is_new else ""
                report_lines.append(f"- {marker}{signal_type}{marker}: {relative_improvement:+.1f}% (vs random)")

    report_lines.append("")

    # 风险分析（drift0表现）
    report_lines.append("### 风险分析 (drift0市场表现)\n")
    for signal_type, data in all_results.items():
        markets = data["markets"]
        p2x_values = data["p2x_values"]

        # 找出drift0市场的索引
        drift0_indices = [i for i, m in enumerate(markets) if "drift0" in m]

        if drift0_indices:
            drift0_p2x = [p2x_values[i] for i in drift0_indices]
            avg_drift0_p2x = sum(drift0_p2x) / len(drift0_p2x) if drift0_p2x else 0

            is_new = "cci" in signal_type
            marker = "***" if is_new else ""
            report_lines.append(f"- {marker}{signal_type}{marker} (drift0): P(2x)={avg_drift0_p2x:.4f}")

    report_lines.append("")

    # 下一步假设
    report_lines.append("## 下一步假设\n")
    report_lines.append("1. **CCI阈值优化**: 尝试不同的CCI阈值（如80、120）")
    report_lines.append("2. **CCI周期调整**: 测试14、30等不同周期")
    report_lines.append("3. **多指标融合**: 结合CCI与其他动量指标（KDJ、WR）")
    report_lines.append("4. **反向测试**: 验证CCI过滤是否真的提升了信号质量")
    report_lines.append("")

    report_lines.append("## 容错记录\n")
    report_lines.append("- **第1轮**: ENAMETOOLONG错误 → 已修复：缩短signalId生成逻辑")
    report_lines.append("- **第2轮**: 进程运行缓慢（14分钟仅完成14/200新策略模拟）")
    report_lines.append("- **第3轮**: 继续运行中...")
    report_lines.append("")

    return "\n".join(report_lines)

def main():
    print("分析实验结果...")
    all_results = analyze_results()

    print(f"分析完成，共 {len(all_results)} 个策略")

    report = generate_report(all_results)

    report_path = RESULTS_DIR / "cci_experiment_report.md"
    with open(report_path, 'w') as f:
        f.write(report)

    print(f"报告已生成: {report_path}")
    print("\n" + "="*60)
    print(report)

if __name__ == "__main__":
    main()
