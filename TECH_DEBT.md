# 技术债务清单

> 最后更新: 2026-02-03

本文档记录 Sand Table 项目的技术债务和重构计划。

## 已完成

### P0: 删除废弃的 PositionManager 体系 ✅

- 删除 `src/position/index.ts` (307 行)
- 删除 `types.ts` 中的 `PositionState` 和 `PositionManager` 接口
- 移除 `AntiMartingalePositionManager` 和 `FixedPositionManager` 类

### P1: 转换 BacktestEngine/ExperimentRunner 为函数 ✅

- `NewParadigmBacktestEngine.evaluateSignalStrategy()` → `evaluateSignalStrategy()`
- `NewParadigmExperimentRunner.run()` → `runExperiment()`
- 净减少 ~50 行代码

### P2: 移除 VirtualAccountInternalState 冗余 ✅

- 删除 `VirtualAccountInternalState` 接口
- 删除 `getInternalState()` / `syncFromState()` 方法
- 删除 `virtual-account-trade.ts` (225 行)
- 新增 `virtual-account-helpers.ts` (140 行) 提取纯函数
- 净减少 ~90 行代码

### P3: 合并 TrackerCurves 为泛型结构 ✅

- 8 个独立 Map 合并为 `Map<CurveType, Map<number, number[]>>`
- 删除重复的 getter 方法
- 净减少 ~150 行代码

### 移除 deprecated 代码 ✅

- `saveReportSuite` 重命名为 `saveFullResults`

---

## 待完成

### P4: 策略类改为函数式 (高优先级)

**现状问题**:
- `BaseStrategy` 抽象类只提供 `currentPosition` 状态管理
- 7 个策略子类都继承它，但核心只是一个 `generate` 函数
- 装饰器 + 注册表模式对于 7 个策略来说过度设计

**涉及文件**:
| 文件 | 行数 | 说明 |
|------|------|------|
| `src/signal/base.ts` | 263 | BaseStrategy 抽象类 + 注册表 |
| `src/signal/strategies/trend-following.ts` | 73 | 趋势跟踪策略 |
| `src/signal/strategies/mean-reversion.ts` | 80 | 均值回归策略 |
| `src/signal/strategies/breakout.ts` | 105 | 突破策略 |
| `src/signal/strategies/breakout-4.ts` | 74 | 4K线突破策略 |
| `src/signal/strategies/boll-reversion.ts` | 83 | 布林带回归策略 |
| `src/signal/strategies/adaptive-volatility.ts` | 433 | 自适应波动率策略 |
| `src/signal/strategies/random.ts` | 88 | 随机策略 |

**重构方案**:
```typescript
// Before: 类继承
@Strategy({ type: 'trend_following', ... })
export class TrendFollowingStrategy extends BaseStrategy<TrendFollowingParams> {
  generate(candles: Candle[], currentIndex: number): Signal { ... }
}

// After: 工厂函数
export function createTrendFollowingStrategy(params: TrendFollowingParams) {
  let position = 0;
  return {
    type: 'trend_following' as const,
    generate(candles: Candle[], index: number): Signal {
      // 实现...
      return position;
    },
    reset() { position = 0; },
  };
}

// 简单注册表
export const strategyFactories = {
  trend_following: createTrendFollowingStrategy,
  mean_reversion: createMeanReversionStrategy,
  // ...
} as const;
```

**预计收益**: 删除 ~400 行代码

**风险**: 中等 - 需要更新所有策略文件和调用点

---

### P5: Random 类改为闭包 (低优先级)

**现状问题**:
- `Random` 类只有 1 个 `state` 字段
- 完全可以用闭包替代

**涉及文件**:
- `src/utils/random.ts` (63 行)

**重构方案**:
```typescript
// Before
export class Random {
  private state: number;
  constructor(seed?: number) { this.state = seed ?? Date.now(); }
  next(): number { ... }
}

// After
export function createRandom(seed?: number) {
  let state = seed ?? Date.now();
  return {
    next(): number {
      let t = (state += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    nextGaussian(): number { ... },
    nextInt(min: number, max: number): number { ... },
    nextFloat(min: number, max: number): number { ... },
    getSeed: () => state,
    setSeed: (s: number) => { state = s; },
  };
}

export type Random = ReturnType<typeof createRandom>;
```

**预计收益**: 删除 ~10 行代码

**风险**: 低

---

### P6: BaselineTracker 改为函数式 (中优先级)

**现状问题**:
- `BaselineTracker` 类有 9 个状态字段
- 可以改为状态对象 + 纯函数

**涉及文件**:
- `src/betting/baseline-tracker.ts` (229 行)

**重构方案**:
```typescript
// 状态类型
interface BaselineState {
  cumulativeEquity: number;
  estimatedC: number;
  stopLoss: number;
  snapshots: BaselineSnapshot[];
  equityCurve: number[];
  cCurve: number[];
  stopLossCurve: number[];
  totalCandles: number;
  lastCandleIndex: number;
  recordDetails: boolean;
}

// 纯函数
function createBaselineState(totalCandles: number, recordDetails: boolean): BaselineState { ... }
function processTradeResult(state: BaselineState, ...): BaselineState { ... }
function finalize(state: BaselineState): BaselineState { ... }
```

**预计收益**: 删除 ~30 行代码

**风险**: 中等

---

### P7: VirtualAccount 改为函数式 (中优先级)

**现状问题**:
- `VirtualAccount` 类有 16 个状态字段
- 状态转换逻辑复杂

**涉及文件**:
- `src/betting/virtual-account.ts` (~230 行)
- `src/betting/virtual-account-helpers.ts` (140 行)

**重构方案**:
```typescript
// 状态类型
interface VirtualAccountState {
  targetMultiplier: number;
  enableRiskControl: boolean;
  realizedPnL: number;
  unrealizedPnL: number;
  riskLine: number;
  positionSize: number;
  // ... 其他字段
}

// 纯函数
function createVirtualAccountState(targetMultiplier: number, enableRiskControl: boolean): VirtualAccountState { ... }
function processTradeResult(state: VirtualAccountState, ...): { state: VirtualAccountState; result: TradeResultType } { ... }
```

**预计收益**: 删除 ~50 行代码

**风险**: 高 - 状态转换逻辑复杂

---

### P8: MultiAccountTracker 改为函数式 (中优先级)

**现状问题**:
- `MultiAccountTracker` 类管理多个 `VirtualAccount`
- 依赖 P7 完成

**涉及文件**:
- `src/betting/multi-account-tracker.ts` (~400 行)

**重构方案**: 依赖 P7，将 `Map<number, VirtualAccount>` 改为 `Map<number, VirtualAccountState>`

**预计收益**: 删除 ~50 行代码

**风险**: 高 - 依赖 P7

---

### P9: TrackerCurves 改为函数式 (低优先级)

**现状问题**:
- `TrackerCurves` 类有 4 个状态字段
- 主要是数据容器

**涉及文件**:
- `src/betting/tracker-curves.ts` (~210 行)

**重构方案**:
```typescript
interface TrackerCurvesState {
  curves: Map<CurveType, Map<number, number[]>>;
  totalCandles: number;
  lastCandleIndex: number;
  recordSample: boolean;
}

function createTrackerCurvesState(): TrackerCurvesState { ... }
function updateCurve(state: TrackerCurvesState, ...): TrackerCurvesState { ... }
```

**预计收益**: 删除 ~20 行代码

**风险**: 低

---

### 命令类 - 无法消灭

以下类由 Clipanion CLI 框架强制要求，无法消灭：

| 类 | 文件 |
|---|------|
| `RunCommand` | `src/commands/run.ts` |
| `ExpNewCommand` | `src/commands/exp-new.ts` |
| `ScenariosCommand` | `src/commands/scenarios.ts` |
| `TargetsCommand` | `src/commands/targets.ts` |

**可选方案**: 更换为函数式 CLI 框架（如 `commander.js`）

---

## 优先级总结

| 优先级 | 任务 | 预计删除行数 | 风险 | 状态 |
|--------|------|-------------|------|------|
| P0 | 删除废弃 PositionManager | ~330 | 低 | ✅ 完成 |
| P1 | Engine 类转函数 | ~50 | 低 | ✅ 完成 |
| P2 | 移除 VirtualAccountInternalState | ~90 | 中 | ✅ 完成 |
| P3 | 合并 TrackerCurves | ~150 | 中 | ✅ 完成 |
| P4 | 策略类改为函数式 | ~400 | 中 | 待完成 |
| P5 | Random 类改为闭包 | ~10 | 低 | 待完成 |
| P6 | BaselineTracker 函数式 | ~30 | 中 | 待完成 |
| P7 | VirtualAccount 函数式 | ~50 | 高 | 待完成 |
| P8 | MultiAccountTracker 函数式 | ~50 | 高 | 待完成 |
| P9 | TrackerCurves 函数式 | ~20 | 低 | 待完成 |

---

## 设计原则

1. **函数优于类**: 优先使用纯函数和闭包，避免 OOP 模式
2. **状态显式化**: 状态作为参数传入，作为返回值传出
3. **不可变优先**: 尽量返回新状态对象，而非修改原对象
4. **简单注册**: 使用简单对象映射代替装饰器和复杂注册表
5. **max-lines: 300**: 单文件不超过 300 行（不含空行和注释）
6. **re-export 限制**: 只有 `index.ts` 可以 re-export
