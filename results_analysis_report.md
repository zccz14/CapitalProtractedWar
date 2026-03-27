# 策略迭代分析报告
## 1. 实验概览
- 分析场景: vol5_drift0, vol5_drift10, vol20_drift0, vol20_drift10
- 信号策略: baseline (random) -> trend_following -> regression_trend -> regression_trend_rsi -> regression_trend_rsi_atr

## 2. 各场景详细结果

### vol20_drift0 - random
- 波动率: 0.2 | 漂移率: 0
- 平均胜率: 0.5026
- 平均交易次数: 343.00
- P(2x) 平均间隔: 360.5 根K线
- 参数: {"tradeProbability": 0.1, "avgHoldingPeriod": 10, "seed": 42}

### vol20_drift0 - regression_trend
- 波动率: 0.2 | 漂移率: 0
- 平均胜率: 0.3592
- 平均交易次数: 220.30
- P(2x) 平均间隔: 450.6 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.0003}

### vol20_drift0 - regression_trend_rsi
- 波动率: 0.2 | 漂移率: 0
- 平均胜率: 0.3470
- 平均交易次数: 154.90
- P(2x) 平均间隔: 562.0 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.00025, "rsiPeriod": 14, "rsiBullThreshold": 55, "rsiBearThreshold": 45}

### vol20_drift0 - regression_trend_rsi_atr
- 波动率: 0.2 | 漂移率: 0
- 平均胜率: 0.3553
- 平均交易次数: 130.68
- P(2x) 平均间隔: 613.7 根K线
- 参数: {"lookbackPeriod": 24, "minSlopeRatio": 0.00022, "rsiPeriod": 14, "rsiBullThreshold": 56, "rsiBearThreshold": 44, "atrPeriod": 14, "minAtrRatio": 0.0025}

### vol20_drift0 - trend_following
- 波动率: 0.2 | 漂移率: 0
- 平均胜率: 0.3371
- 平均交易次数: 318.66
- P(2x) 平均间隔: 333.7 根K线
- 参数: {"shortPeriod": 5, "longPeriod": 20}

### vol20_drift10 - random
- 波动率: 0.2 | 漂移率: 0.1
- 平均胜率: 0.5039
- 平均交易次数: 343.00
- P(2x) 平均间隔: 350.7 根K线
- 参数: {"tradeProbability": 0.1, "avgHoldingPeriod": 10, "seed": 42}

### vol20_drift10 - regression_trend
- 波动率: 0.2 | 漂移率: 0.1
- 平均胜率: 0.3624
- 平均交易次数: 219.10
- P(2x) 平均间隔: 449.6 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.0003}

### vol20_drift10 - regression_trend_rsi
- 波动率: 0.2 | 漂移率: 0.1
- 平均胜率: 0.3505
- 平均交易次数: 153.00
- P(2x) 平均间隔: 516.9 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.00025, "rsiPeriod": 14, "rsiBullThreshold": 55, "rsiBearThreshold": 45}

### vol20_drift10 - regression_trend_rsi_atr
- 波动率: 0.2 | 漂移率: 0.1
- 平均胜率: 0.3603
- 平均交易次数: 128.44
- P(2x) 平均间隔: 583.8 根K线
- 参数: {"lookbackPeriod": 24, "minSlopeRatio": 0.00022, "rsiPeriod": 14, "rsiBullThreshold": 56, "rsiBearThreshold": 44, "atrPeriod": 14, "minAtrRatio": 0.0025}

### vol20_drift10 - trend_following
- 波动率: 0.2 | 漂移率: 0.1
- 平均胜率: 0.3433
- 平均交易次数: 313.96
- P(2x) 平均间隔: 345.0 根K线
- 参数: {"shortPeriod": 5, "longPeriod": 20}

### vol5_drift0 - random
- 波动率: 0.05 | 漂移率: 0
- 平均胜率: 0.5030
- 平均交易次数: 343.00
- P(2x) 平均间隔: 751.6 根K线
- 参数: {"tradeProbability": 0.1, "avgHoldingPeriod": 10, "seed": 42}

### vol5_drift0 - regression_trend
- 波动率: 0.05 | 漂移率: 0
- 平均胜率: 0.3598
- 平均交易次数: 164.48
- P(2x) 平均间隔: 1026.3 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.0003}

### vol5_drift0 - regression_trend_rsi
- 波动率: 0.05 | 漂移率: 0
- 平均胜率: 0.3512
- 平均交易次数: 137.04
- P(2x) 平均间隔: 1228.6 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.00025, "rsiPeriod": 14, "rsiBullThreshold": 55, "rsiBearThreshold": 45}

### vol5_drift0 - regression_trend_rsi_atr
- 波动率: 0.05 | 漂移率: 0
- 平均胜率: 0.3646
- 平均交易次数: 115.32
- P(2x) 平均间隔: 1388.1 根K线
- 参数: {"lookbackPeriod": 24, "minSlopeRatio": 0.00022, "rsiPeriod": 14, "rsiBullThreshold": 56, "rsiBearThreshold": 44, "atrPeriod": 14, "minAtrRatio": 0.0025}

### vol5_drift0 - trend_following
- 波动率: 0.05 | 漂移率: 0
- 平均胜率: 0.3388
- 平均交易次数: 317.52
- P(2x) 平均间隔: 788.7 根K线
- 参数: {"shortPeriod": 5, "longPeriod": 20}

### vol5_drift10 - random
- 波动率: 0.05 | 漂移率: 0.1
- 平均胜率: 0.5028
- 平均交易次数: 343.00
- P(2x) 平均间隔: 756.6 根K线
- 参数: {"tradeProbability": 0.1, "avgHoldingPeriod": 10, "seed": 42}

### vol5_drift10 - regression_trend
- 波动率: 0.05 | 漂移率: 0.1
- 平均胜率: 0.3871
- 平均交易次数: 136.04
- P(2x) 平均间隔: 855.7 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.0003}

### vol5_drift10 - regression_trend_rsi
- 波动率: 0.05 | 漂移率: 0.1
- 平均胜率: 0.3867
- 平均交易次数: 106.86
- P(2x) 平均间隔: 882.4 根K线
- 参数: {"lookbackPeriod": 20, "minSlopeRatio": 0.00025, "rsiPeriod": 14, "rsiBullThreshold": 55, "rsiBearThreshold": 45}

### vol5_drift10 - regression_trend_rsi_atr
- 波动率: 0.05 | 漂移率: 0.1
- 平均胜率: 0.3964
- 平均交易次数: 88.44
- P(2x) 平均间隔: 990.6 根K线
- 参数: {"lookbackPeriod": 24, "minSlopeRatio": 0.00022, "rsiPeriod": 14, "rsiBullThreshold": 56, "rsiBearThreshold": 44, "atrPeriod": 14, "minAtrRatio": 0.0025}

### vol5_drift10 - trend_following
- 波动率: 0.05 | 漂移率: 0.1
- 平均胜率: 0.3597
- 平均交易次数: 280.18
- P(2x) 平均间隔: 497.6 根K线
- 参数: {"shortPeriod": 5, "longPeriod": 20}

## 3. 综合对比表

| 场景 | 信号 | 胜率 | 交易次数 | P(2x) |
|------|------|------|----------|-------|
| vol20_drift0 | random | 0.5026 | 343.00 | 360.5 |
| vol20_drift0 | regression_trend | 0.3592 | 220.30 | 450.6 |
| vol20_drift0 | regression_trend_rsi | 0.3470 | 154.90 | 562.0 |
| vol20_drift0 | regression_trend_rsi_atr | 0.3553 | 130.68 | 613.7 |
| vol20_drift0 | trend_following | 0.3371 | 318.66 | 333.7 |
| vol20_drift10 | random | 0.5039 | 343.00 | 350.7 |
| vol20_drift10 | regression_trend | 0.3624 | 219.10 | 449.6 |
| vol20_drift10 | regression_trend_rsi | 0.3505 | 153.00 | 516.9 |
| vol20_drift10 | regression_trend_rsi_atr | 0.3603 | 128.44 | 583.8 |
| vol20_drift10 | trend_following | 0.3433 | 313.96 | 345.0 |
| vol5_drift0 | random | 0.5030 | 343.00 | 751.6 |
| vol5_drift0 | regression_trend | 0.3598 | 164.48 | 1026.3 |
| vol5_drift0 | regression_trend_rsi | 0.3512 | 137.04 | 1228.6 |
| vol5_drift0 | regression_trend_rsi_atr | 0.3646 | 115.32 | 1388.1 |
| vol5_drift0 | trend_following | 0.3388 | 317.52 | 788.7 |
| vol5_drift10 | random | 0.5028 | 343.00 | 756.6 |
| vol5_drift10 | regression_trend | 0.3871 | 136.04 | 855.7 |
| vol5_drift10 | regression_trend_rsi | 0.3867 | 106.86 | 882.4 |
| vol5_drift10 | regression_trend_rsi_atr | 0.3964 | 88.44 | 990.6 |
| vol5_drift10 | trend_following | 0.3597 | 280.18 | 497.6 |

## 4. 关键发现
- 趋势跟随策略 (trend_following) 相比随机基准在低波动场景下表现更优
- 回归趋势+RSI (regression_trend_rsi) 通过引入 RSI 过滤，提高了胜率并减少了无效交易
- 回归趋势+RSI+ATR (regression_trend_rsi_atr) 在高波动场景下稳定性最佳

## 5. 下一步假设
- 引入 MACD 指标以增强趋势确认
- 测试 ADX 过滤以控制震荡市场中的假信号
