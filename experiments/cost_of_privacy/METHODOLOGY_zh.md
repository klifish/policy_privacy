# 隐私成本方法论

## 1. 问题陈述

本实验套件研究 ZK 策略隐私协议中 DUO 策略执行的隐私-效用权衡。

- **效用指标**：访问成功率 (Access Success Rate, ASR)，记为 `ASR(P, D)`
- **隐私成本指标**：复合隐私成本 (Cost of Privacy, CoP)，记为 `CoP(P)`

给定策略 `P` 和请求者群体分布 `D`，我们评估：

- 诚实请求者能够满足策略约束的频率
- 隐私在 Gas、证明延迟和泄露方面的成本

实现锚点：

- `policy_model.py` (ASR 和策略评估)
- `privacy_cost.py` (CoP 模型)
- `pareto_analysis.py` (前沿 + 受限优化)

## 2. 策略表示与满足

策略表示为最大深度为 20 的 RPN (后缀) 令牌序列。

- 属性令牌：`0..5` (GR, DS, RS, POA, GS, CC)
- 谓词令牌：`6..10`
- 操作符：`AND=11`, `OR=12`, `NOT=13`

设 `phi_P(s)` 为策略 `P` 在请求者满足向量 `s` 上的布尔评估值。
评估器在 `policy_model.py` 中的 `evaluate_policy_tokens(...)` 中实现。

## 3. 访问成功率 (ASR)

### 3.1 先验 ASR (Prior ASR)

群体级 ASR 为：

`ASR(P, D) = sum_r D(r) * 1[phi_P(r) = 1]`

用于快速路径的特例：

- AND 策略：`ASR = prod_{i in T} p_i(W_i)`
- OR 策略：`ASR = 1 - prod_{i in T}(1 - p_i(W_i))`

其中：

- `T` 是活跃属性集
- `W_i` 是谓词属性 `i` 的白名单
- `p_i(W_i)` 是分布 `D` 下的属性满足概率

通用混合逻辑回退到枚举所有 `2^|T|` 种满足组合。

### 3.2 后验 ASR (Posterior ASR)

后验 ASR 通过提高声称概率来模拟受激发的请求者（在看到策略要求后）：

- 先验：`p_i = p_claim_i * p_match_i`
- 后验：`p_i' = min(boost * p_claim_i, 1) * p_match_i`

这通过 `ConditionalRequesterModel` 和 `compute_asr_posterior(...)` 实现。

## 4. 隐私成本 (CoP)

CoP 结合了 Gas、证明延迟和泄露：

`CoP(P) = alpha * G_norm(P) + beta * T_norm(P) + (1 - alpha - beta) * L_norm(P)`

默认权重：

- `alpha = 0.5` (Gas)
- `beta = 0.3` (证明时间)
- `1 - alpha - beta = 0.2` (泄露)

当前实现中的归一化：

- `G_norm = total_with_padding / GAS_HIGH_STORAGE_TARGET` (4,000,000)
- `T_norm = min(proof_time / 30, 1)`
- `L_norm = leakage` 在 `[0,1]` 范围内

Gas 和计时使用与当前后端和 AA 设置对齐的常数进行参数化（例如，`GAS_PADDING_TARGET = 800000`）。

## 5. 优化目标

受限策略设计公式化为：

- `min_P CoP(P)`
- subject to `ASR(P, D) >= tau`
- and `L(P) <= epsilon`

在 `find_optimal_policy(...)` 中使用随机候选搜索加结构化策略种子实现。

## 6. 群体场景

使用五个场景预设：

1. `uniform` (均匀)
2. `real_world` (现实世界)
3. `us_centric` (以美国为中心)
4. `cancer_focused` (癌症关注)
5. `european_ancestry` (欧洲血统)

每个场景定义：

- `p_gr`
- 每个本体命名空间的属性声称概率 `p_claim`
- 本体代码分布

场景定义在 `population_model.py` 中。

## 7. 实验协议 (A-F)

`simulation_runner.py` 提供六个主要实验和一个验证轮次：

1. **A: ASR 扫描**
   扫描属性、白名单比例、逻辑类型和目标群体。
2. **B: 成本分解**
   报告代表性策略的 Gas/时间/泄露和开销。
3. **C: 帕累托前沿**
   评估约 1 万个随机策略并提取非支配前沿。
4. **D: 群体敏感性**
   在所有群体场景中比较固定策略集。
5. **E: 最优策略推荐**
   在 `(tau, epsilon)` 网格上求解受限优化。
6. **F: 先验 vs 后验 + AND vs OR**
   量化激励效应和更丰富逻辑的潜在收益。
7. **Validation (验证)**
   根据蒙特卡洛估计确证分析性 ASR。

## 8. 可复现性

仅运行验证：

```bash
python3 submodules/policy_privacy/experiments/cost_of_privacy/simulation_runner.py --experiment validate
```

运行所有实验：

```bash
python3 submodules/policy_privacy/experiments/cost_of_privacy/simulation_runner.py --experiment all
```

生成图表：

```bash
python3 submodules/policy_privacy/experiments/cost_of_privacy/visualization.py
```

结果写入：

- `submodules/policy_privacy/experiments/cost_of_privacy/results/`

## 9. 有效性威胁

1. 分析性 ASR 分解假设属性独立。
2. 泄露模型是启发式的 (`max(gas, metadata, timing)`)，而非信息论的。
3. 固定的 Gas 填充目标可能会压缩策略间的 Gas 差异。
4. 优化是随机随机搜索，因此接近最优性取决于样本覆盖范围。
5. 当前 UI 主要暴露 AND 策略，而协议/电路可以支持更丰富的逻辑。
