#!/usr/bin/env python3
"""
解析资本持久战实验结果并生成详细报告
"""

import json
import os
import glob
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from datetime import datetime

@dataclass
class SignalResult:
    """单策略结果"""
    signal_type: str
    avg_win_rate: float
    avg_trade_count: float
    take_profit_stats: Dict[str, Any]
    indicators: List[str]
    params: Dict[str, Any]

@dataclass  
class ExperimentResult:
    """实验结果"""
    config: Dict[str, Any]
    signal_results: List[SignalResult]

def parse_signal_result(data: Dict[str, Any]) -> SignalResult:
    """解析单个信号策略结果"""
    signal_type = data['signalType']
    indicators = extract_indicators(signal_type)
    
    return SignalResult(
        signal_type=signal_type,
        avg_win_rate=data.get('avgWinRate', 0),
        avg_trade_count=data.get('avgTradeCount', 0),
        take_profit_stats=data.get('takeProfitStats', {}),
        indicators=indicators,
        params={}
    )

def extract_indicators(signal_type: str) -> List[str]:
    """从策略类型中提取指标列表"""
    # regression_trend_rsi_atr_macd_adx_cci_kdj_obv_roc_williamsr
    # -> ['regression_trend', 'rsi', 'atr', 'macd', 'adx', 'cci', 'kdj', 'obv', 'roc', 'williamsr']
    
    base_strategies = ['random', 'trend_following', 'mean_reversion', 'breakout', 'regression_trend']
    indicators = []
    
    remaining = signal_type
    for base in base_strategies:
        if remaining.startswith(base):
            indicators.append(base)
            remaining = remaining[len(base):]
            break
    
    # 剩余部分按驼峰拆分
    indicator_parts = []
    current = ''
    for i, c in enumerate(remaining):
        if c.isupper():
            if current:
                indicator_parts.append(current.lower())
            current = c.lower()
        else:
            current += c
    if current:
        indicator_parts.append(current.lower())
    
    indicators.extend(indicator_parts)
    return indicators

def load_experiment_data(json_path: str) -> Optional[ExperimentResult]:
    """加载实验数据"""
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        signal_results = [parse_signal_result(s) for s in data.get('signalResults', [])]
        return ExperimentResult(config=data.get('config', {}), signal_results=signal_results)
    except Exception as e:
        print(f"加载失败 {json_path}: {e}")
        return None

def calculate_p2x_probability(result: SignalResult) -> float:
    """计算P(2x)概率"""
    tp_stats = result.take_profit_stats
    if '2' in tp_stats:
        return tp_stats['2'].get('avgFrequency', 0)
    return 0.0

def calculate_baseline_final_pnl(result: SignalResult) -> float:
    """估算baselineFinalPnL（基于止盈统计）"""
    # 使用达到最高止盈目标的频率作为代理
    tp_stats = result.take_profit_stats
    if not tp_stats:
        return 0.0
    
    # 计算加权平均的"最终PnL"
    # 假设更高止盈线代表更高收益
    total_weighted = 0
    total_weight = 0
    
    for target, stats in tp_stats.items():
        freq = stats.get('avgFrequency', 0)
        if freq > 0:
            # 使用目标倍数作为权重
            target_val = float(target)
            total_weighted += freq * target_val
            total_weight += freq
    
    if total_weight > 0:
        return total_weighted / total_weight
    return 0.0

def get_drift_risk(result: SignalResult, drift: float = 0) -> Dict[str, Any]:
    """评估漂移风险"""
    # 在drift=0（无趋势市场）下表现最好的策略是均值回归类
    # 如果策略在无趋势市场表现差，说明对趋势敏感（高漂移风险）
    
    is_mean_reversion = any(ind in result.indicators for ind in ['regression_trend', 'mean_reversion'])
    
    return {
        'is_mean_reversion': is_mean_reversion,
        'drift_sensitivity': 'high' if is_mean_reversion else 'low',
        'warning': '策略在强趋势市场可能失效' if is_mean_reversion else ''
    }

def generate_report(results: List[ExperimentResult], output_path: str):
    """生成详细报告"""
    
    report_lines = []
    report_lines.append("=" * 80)
    report_lines.append("资本持久战 - 新范式实验详细报告")
    report_lines.append(f"生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    report_lines.append("=" * 80)
    
    for exp in results:
        if not exp:
            continue
            
        config = exp.config
        report_lines.append(f"\n## 实验配置")
        report_lines.append(f"- 市场类型: {config.get('market', {}).get('type', 'N/A')}")
        report_lines.append(f"- 波动率: {config.get('market', {}).get('volatility', 0)*100}%")
        report_lines.append(f"- 漂移率: {config.get('market', {}).get('drift', 0)*100}%")
        report_lines.append(f"- K线数量: {config.get('market', {}).get('candleCount', 'N/A')}")
        report_lines.append(f"- 蒙特卡洛运行次数: {config.get('monteCarloRuns', 'N/A')}")
        
        report_lines.append(f"\n## 策略对比总览")
        report_lines.append("-" * 80)
        
        # 按P(2x)排序
        sorted_results = sorted(
            exp.signal_results,
            key=lambda x: calculate_p2x_probability(x),
            reverse=True
        )
        
        for i, sr in enumerate(sorted_results, 1):
            p2x = calculate_p2x_probability(sr)
            baseline_pnl = calculate_baseline_final_pnl(sr)
            drift_risk = get_drift_risk(sr)
            
            report_lines.append(f"\n### {i}. {sr.signal_type}")
            report_lines.append(f"**指标**: {', '.join(sr.indicators)}")
            report_lines.append(f"- 平均胜率: {sr.avg_win_rate*100:.2f}%")
            report_lines.append(f"- 平均交易次数: {sr.avg_trade_count:.1f}")
            report_lines.append(f"- **P(2x) 排名**: #{i}")
            report_lines.append(f"- **P(2x)**: {p2x*100:.2f}%")
            report_lines.append(f"- **baselineFinalPnL 均值 (估算)**: {baseline_pnl:.2f}x")
            report_lines.append(f"- 漂移风险: {drift_risk['drift_sensitivity']}")
            if drift_risk['warning']:
                report_lines.append(f"  ⚠️ {drift_risk['warning']}")
            
            # 止盈统计
            if sr.take_profit_stats:
                report_lines.append(f"\n**止盈达成统计**:")
                for target, stats in sr.take_profit_stats.items():
                    freq = stats.get('avgFrequency', 0)
                    rounds = stats.get('totalRoundCount', 0)
                    if freq > 0:
                        report_lines.append(f"  - {target}x: 频率={freq*100:.2f}%, 总达成={rounds}次")
        
        # 相对提升分析
        report_lines.append(f"\n## 相对提升分析")
        report_lines.append("-" * 80)
        
        if sorted_results:
            baseline = sorted_results[-1]  # 最差的作为基线
            best = sorted_results[0]  # 最好的作为目标
            
            baseline_p2x = calculate_p2x_probability(baseline)
            best_p2x = calculate_p2x_probability(best)
            
            if baseline_p2x > 0:
                improvement = (best_p2x - baseline_p2x) / baseline_p2x * 100
                report_lines.append(f"最佳策略 vs 最差策略 P(2x) 提升: {improvement:.1f}%")
            else:
                report_lines.append(f"最佳策略 P(2x): {best_p2x*100:.2f}% (基线策略P(2x)=0)")
            
            # 对比random基线
            random_result = next((r for r in sorted_results if 'random' in r.signal_type.lower()), None)
            if random_result:
                random_p2x = calculate_p2x_probability(random_result)
                if random_p2x > 0:
                    for sr in sorted_results:
                        if sr != random_result:
                            sr_p2x = calculate_p2x_probability(sr)
                            if sr_p2x > 0:
                                rel_imp = (sr_p2x - random_p2x) / random_p2x * 100
                                report_lines.append(f"{sr.signal_type} vs Random: +{rel_imp:.1f}%")
                                break
        
        # 指标增量贡献分析
        report_lines.append(f"\n## 指标增量贡献分析")
        report_lines.append("-" * 80)
        
        # 按指标数量排序
        sorted_by_indicators = sorted(
            exp.signal_results,
            key=lambda x: len(x.indicators)
        )
        
        prev_p2x = 0
        for sr in sorted_by_indicators:
            p2x = calculate_p2x_probability(sr)
            if len(sr.indicators) > 1:  # 非基线策略
                delta = p2x - prev_p2x
                new_indicator = sr.indicators[-1] if len(sr.indicators) > len(sorted_by_indicators[0].indicators) else 'baseline'
                report_lines.append(f"+ {new_indicator}: P(2x) {prev_p2x*100:.2f}% → {p2x*100:.2f}% (Δ{delta*100:.2f}%)")
            prev_p2x = p2x
        
        # 下一步假设
        report_lines.append(f"\n## 下一步假设")
        report_lines.append("-" * 80)
        
        # 找出表现最好的策略类型
        best_strategies = [sr.signal_type for sr in sorted_results[:3]]
        report_lines.append(f"1. **表现最佳策略**: {', '.join(best_strategies)}")
        
        # 建议下一步
        report_lines.append(f"\n2. **假设验证方向**:")
        
        # 如果有策略P(2x)为0
        zero_p2x = [sr.signal_type for sr in sorted_results if calculate_p2x_probability(sr) == 0]
        if zero_p2x:
            report_lines.append(f"   - 以下策略信号过于严格，需要放宽参数: {zero_p2x[:3]}")
        
        # 找出交易次数最少的
        sorted_by_trades = sorted(exp.signal_results, key=lambda x: x.avg_trade_count)
        if sorted_by_trades:
            least_trades = sorted_by_trades[0]
            report_lines.append(f"   - {least_trades.signal_type} 交易次数最少({least_trades.avg_trade_count:.1f})，可能需要降低信号阈值")
        
        # 找出胜率最高的
        sorted_by_winrate = sorted(exp.signal_results, key=lambda x: x.avg_win_rate, reverse=True)
        if sorted_by_winrate:
            best_winrate = sorted_by_winrate[0]
            report_lines.append(f"   - {best_winrate.signal_type} 胜率最高({best_winrate.avg_win_rate*100:.2f}%)")
        
        report_lines.append(f"\n3. **下一步实验建议**:")
        report_lines.append(f"   - 尝试调整表现最好策略的参数组合")
        report_lines.append(f"   - 在高波动率场景下验证策略鲁棒性")
        report_lines.append(f"   - 引入更多趋势市场(drift>0)测试")
        
        report_lines.append(f"\n" + "=" * 80)
        report_lines.append("报告结束")
        report_lines.append("=" * 80)
    
    # 写入文件
    report_content = '\n'.join(report_lines)
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(report_content)
    
    return report_content

def main():
    """主函数"""
    base_path = '/Users/c1/.openclaw/workspace/CapitalProtractedWar/results/new_paradigm'
    output_path = os.path.join(base_path, 'detailed_report.txt')
    
    # 查找所有_data.json文件
    json_files = glob.glob(os.path.join(base_path, '*_data.json'))
    
    print(f"找到 {len(json_files)} 个实验数据文件")
    
    results = []
    for json_file in json_files:
        print(f"加载: {json_file}")
        result = load_experiment_data(json_file)
        if result:
            results.append(result)
    
    if results:
        print(f"\n生成报告...")
        report = generate_report(results, output_path)
        print(f"报告已保存到: {output_path}")
        print(f"\n报告预览:")
        print(report[:2000])
    else:
        print("没有找到有效的实验数据")

if __name__ == '__main__':
    main()
