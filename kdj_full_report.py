#!/usr/bin/env python3
"""
完整实验结果分析脚本 - KDJ 迭代专项报告
"""

import json
import glob
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
import statistics

class ExperimentAnalyzer:
    def __init__(self, data_dir: str = "./results/new_paradigm"):
        self.data_dir = data_dir
        self.results = {}
    
    def load_results(self) -> bool:
        """加载所有实验结果"""
        pattern = os.path.join(self.data_dir, "*_data.json")
        
        for file_path in glob.glob(pattern):
            if "samples" in file_path:
                continue
            
            file_name = os.path.basename(file_path)
            market_name = file_name.replace("_data.json", "")
            
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.results[market_name] = data
                    print(f"Loaded: {market_name}")
            except Exception as e:
                print(f"Error loading {file_path}: {e}")
        
        return len(self.results) > 0
    
    def get_signal_names(self, market_name: str) -> List[str]:
        """获取信号策略列表"""
        if market_name not in self.results:
            return []
        
        config = self.results[market_name].get('config', {})
        signals = config.get('signals', [])
        return [s.get('type', 'unknown') for s in signals]
    
    def analyze_market(self, market_name: str) -> Dict[str, Any]:
        """分析单个市场的结果"""
        if market_name not in self.results:
            return {}
        
        market_data = self.results[market_name]
        signal_results = market_data.get('signalResults', [])
        
        analysis = {}
        
        for signal in signal_results:
            signal_type = signal.get('signalType', 'unknown')
            avg_win_rate = signal.get('avgWinRate', 0)
            avg_trade_count = signal.get('avgTradeCount', 0)
            
            take_profit_stats = signal.get('takeProfitStats', {})
            
            # 提取关键指标
            metrics = {}
            for mt in [2, 4, 8, 16, 32]:
                if str(mt) in take_profit_stats:
                    tp = take_profit_stats[str(mt)]
                    stats = tp.get('intervalStats', {})
                    metrics[f'p{mt}_median'] = stats.get('median')
                    metrics[f'p{mt}_mean'] = stats.get('mean')
                    metrics[f'p{mt}_p50'] = stats.get('p50')
            
            analysis[signal_type] = {
                'avgWinRate': avg_win_rate,
                'avgTradeCount': avg_trade_count,
                'metrics': metrics
            }
        
        return analysis
    
    def calculate_improvement(self, current: float, baseline: float) -> float:
        """计算相对提升"""
        if baseline == 0:
            return 0 if current == 0 else float('inf')
        return ((baseline - current) / baseline) * 100  # 越小越好，所以取反
    
    def rank_strategies(self, market_name: str) -> List[Dict]:
        """排名策略"""
        analysis = self.analyze_market(market_name)
        
        if 'random' not in analysis:
            return []
        
        baseline_p2 = analysis['random'].get('metrics', {}).get('p2_median', 0)
        
        ranked = []
        for signal_type, data in analysis.items():
            p2 = data.get('metrics', {}).get('p2_median', 0)
            improvement = self.calculate_improvement(p2, baseline_p2)
            
            ranked.append({
                'signal': signal_type,
                'p2_median': p2,
                'win_rate': data.get('avgWinRate', 0),
                'trade_count': data.get('avgTradeCount', 0),
                'improvement': improvement,
                'is_baseline': signal_type == 'random'
            })
        
        # 按 P(2x) 排序
        ranked.sort(key=lambda x: x['p2_median'] if x['p2_median'] else float('inf'))
        
        return ranked
    
    def generate_report(self) -> str:
        """生成 Markdown 报告"""
        if not self.results:
            return "No results loaded!"
        
        lines = []
        lines.append("# 资本持久战实验报告 - KDJ 策略迭代\n")
        lines.append(f"**生成时间**: 2026-02-08\n")
        lines.append(f"**分析市场数**: {len(self.results)}\n")
        lines.append(f"**策略数**: {len(self.get_signal_names(list(self.results.keys())[0]))}\n")
        
        # 遍历各市场
        for market_name in sorted(self.results.keys()):
            lines.append(f"\n## 📊 {market_name}\n")
            
            ranked = self.rank_strategies(market_name)
            if not ranked:
                continue
            
            baseline = next((r for r in ranked if r['is_baseline']), None)
            
            lines.append(f"**基线 (random) P(2x)**: {baseline['p2_median'] if baseline else 'N/A'}\n")
            lines.append(f"**基线胜率**: {baseline['win_rate']:.2%}\n")
            lines.append("")
            
            lines.append("| 排名 | 策略 | P(2x) 中位数 | 胜率 | 交易次数 | 相对提升 |")
            lines.append("|------|------|-------------|------|---------|---------|")
            
            for i, r in enumerate(ranked, 1):
                improvement = f"{r['improvement']:+.1f}%" if not r['is_baseline'] else "基线"
                p2 = r['p2_median'] if r['p2_median'] else "N/A"
                
                lines.append(f"| {i} | {r['signal']} | {p2} | {r['win_rate']:.2%} | {r['trade_count']:.0f} | {improvement} |")
            
            lines.append("")
            
            # drift0 风险评估
            if 'drift0' in market_name.lower():
                lines.append("⚠️ **风险提示**: drift0 场景下部分策略 P(2x) 高于基线，表明存在漂移敏感性\n")
        
        # 指标解释
        lines.append("\n## 📖 策略指标解释\n")
        lines.append("| 策略 | 新增指标 | 说明 |")
        lines.append("|------|---------|------|")
        lines.append("| random | 无 | 随机对照基准 |")
        lines.append("| trend_following | MA(5/20) | 经典均线趋势策略 |")
        lines.append("| regression_trend | 线性回归斜率 | 价格趋势计算 |")
        lines.append("| regression_trend_rsi | +RSI | 相对强弱指数 |")
        lines.append("| regression_trend_rsi_atr | +ATR | 真实波幅门控 |")
        lines.append("| regression_trend_rsi_atr_macd | +MACD | 移动平均收敛发散 |")
        lines.append("| regression_trend_rsi_atr_macd_adx | +ADX | 平均方向指数 |")
        lines.append("| regression_trend_rsi_atr_macd_adx_cci | +CCI | 商品通道指数 |")
        lines.append("| regression_trend_rsi_atr_macd_adx_cci_kdj | +KDJ | 随机指标 |")
        
        # KDJ 详细说明
        lines.append("\n## 🎯 KDJ 指标说明\n")
        lines.append("**KDJ** 是随机指标 (Stochastic) 的改进版：\n")
        lines.append("- **K 值**: 快速随机线，RSV 的 EMA 平滑\n")
        lines.append("- **D 值**: 慢速随机线，K 值的 EMA 平滑\n")
        lines.append("- **J 值**: 3K - 2D，放大波动\n")
        lines.append("- **超买区域**: K/D > 80\n")
        lines.append("- **超卖区域**: K/D < 20\n")
        lines.append("")
        lines.append("**策略门控**:")
        lines.append("- 做多: 回归斜率>0 + RSI>56 + MACD柱>0 + CCI>100 + D值从超卖回升\n")
        lines.append("- 做空: 回归斜率<0 + RSI<44 + MACD柱<0 + CCI<-100 + D值从超买回落\n")
        
        # 下一步
        lines.append("\n## 🚀 下一步假设\n")
        lines.append("1. 观察 KDJ 在各场景的 P(2x) 表现\n")
        lines.append("2. 如 KDJ 有效，可作为主策略\n")
        lines.append("3. 建议下一步: 尝试添加 OBV (能量潮) 指标\n")
        
        return "\n".join(lines)
    
    def save_report(self, output_path: str = None):
        """保存报告"""
        report = self.generate_report()
        if output_path is None:
            output_path = os.path.join(self.data_dir, "kdj_iteration_report.md")
        
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(report)
        
        print(f"Report saved to: {output_path}")
        return report


def main():
    analyzer = ExperimentAnalyzer()
    
    if not analyzer.load_results():
        print("No results found!")
        return
    
    print(f"\nLoaded {len(analyzer.results)} market scenarios\n")
    
    # 生成并保存报告
    report = analyzer.save_report()
    
    # 打印摘要
    print("\n" + "=" * 60)
    print(report)


if __name__ == "__main__":
    main()
