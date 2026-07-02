# Policy Indistinguishability 实验：三层攻击模型详解

## 📋 执行摘要

Policy Indistinguishability（策略不可区分性）实验旨在验证：**当访问控制策略内容被零知识证明隐藏后，语义相似的策略在链上观察者眼中是否真正不可区分。**

本实验设计了三个攻击层级，从简单的机器学习分类到高级统计检验，覆盖不同强度的攻击者。**但需要明确：当前代码中只有 Level I 的结果参与 PASS/FAIL 判决**（见下文"权威判决"一节）；Level II、Level III 提供互补的诊断信息，帮助定位泄露来源，但不直接决定整体判决。

---

## 🎯 实验核心目标

### 研究问题

在医疗数据访问控制场景中，即使策略内容被加密隐藏，链上执行痕迹（如 gas 消耗、calldata 大小、日志信息等）是否会泄露足够信息，使攻击者能够区分不同策略？

### 威胁模型

**攻击者能力**：
- 可以观察所有链上公开信息
- 可以记录多次策略执行的痕迹
- 拥有机器学习和统计分析能力
- **但无法**：破解零知识证明，访问链下数据

**攻击目标**：
- 识别特定策略的身份
- 判断两个观察到的执行是否来自同一策略
- 检测策略间的微小差异

---

## 📊 可观察特征

实验只使用**链上可观察**的 9 个特征：

| 特征类别 | 具体特征 | 含义 |
|---------|---------|------|
| **Gas 消耗** | `commitGasUsed` | commit 交易消耗的 gas |
|  | `accessGasUsed` | access 交易消耗的 gas |
| **数据大小** | `commitCalldataLength` | commit 交易的 calldata 长度 |
|  | `accessCalldataLength` | access 交易的 calldata 长度 |
|  | `proofSize` | 零知识证明的大小 |
| **事件日志** | `commitLogsCount` | commit 交易的日志数量 |
|  | `commitLogsSize` | commit 交易的日志总大小 |
|  | `accessLogsCount` | access 交易的日志数量 |
|  | `accessLogsSize` | access 交易的日志总大小 |

**关键决策**：排除了客户端侧信息（如证明生成时间：`proofGenerationTime`/`proofWitnessTime`/`proofProveTime`/`proofVerifyTime`），因为这些是性能侧指标，不是策略内容channel；同时排除 `blockDifference`，因为它是执行顺序×网络抖动混淆出来的harness artifact，不代表策略本身的可观察特征。当前特征列表是一份显式白名单（见 `feature_keys.js`），新字段不会静默混入攻击特征。

---

## 🔬 策略对分类

实验构造四种类型的策略对来测试不同场景：

### 1. Semantic Equivalent（语义等价）
- **定义**：语义完全相同但实现方式不同
- **例子**：同一条规则用不同的电路结构实现
- **预期**：应该完全不可区分

### 2. Structural Variant（结构变体）
- **定义**：相同语义，但执行参数配置不同
- **例子**：相同策略在不同的 gas limit 或优化级别下执行
- **预期**：应该不可区分

### 3. Weak Equivalent（弱等价）
- **定义**：语义高度相似但非完全等价
- **例子**：允许"心脏病研究者"vs"心血管疾病研究者"
- **预期**：应该难以区分

### 4. Controlled Difference（对照差异）
- **定义**：其余所有语义相似度未达到前三类阈值的策略对（兜底分类，`similarity` 是实际计算值，并非人为强制为 0）
- **例子**：允许"研究用途"vs"商业用途"
- **预期**：可以被区分——这是符合预期的，不代表隐私泄露

**重要**：`controlled_difference` 不参与最终 PASS/FAIL 判决（在 `evaluateMultiseed` 的 `nonGatingKeys` 中被显式排除）。原因不是它是"合成阳性对照"，而是 PI 的隐私主张本身就限定在**语义相近的策略对**范围内——两个本来语义就相差很大的策略被区分开，不构成隐私问题。它仍然作为诊断信息保留在报告中。

---

## 🏗️ 三层攻击模型架构

```
┌─────────────────────────────────────────────────┐
│              攻击强度递增                         │
├─────────────────────────────────────────────────┤
│                                                 │
│  Level I: Single-Sample Attacks                 │
│  威胁: 弱攻击者 - 观察单个策略多次执行            │
│  目标: 识别策略身份（指纹识别）                   │
│  方法: 机器学习分类器                            │
│  ★ 唯一参与 PASS/FAIL 判决的层级                 │
│    （30-seed 多次重跑 + 双重判据，见下文）        │
│                                                 │
│  Level II: Pairwise Attacks                     │
│  威胁: 中等攻击者 - 比较两个策略的执行            │
│  目标: 判断是否同一策略（不可区分性）             │
│  方法: Siamese 风格的差分分类                    │
│  （诊断性，单次切分，不参与最终判决）              │
│                                                 │
│  Level III: Statistical Tests                   │
│  威胁: 强攻击者 - 使用高级统计工具               │
│  目标: 检测微小的分布差异                        │
│  方法: 非参数统计检验                            │
│  （诊断性，不参与最终判决）                       │
│                                                 │
└─────────────────────────────────────────────────┘
```

**重要说明**：三层攻击并非"依次通过关卡"的递进关系。当前代码的权威判决（`evaluateMultiseed`）只运行 Level I 的 30-seed 结果；Level II 和 Level III 各自产出独立的诊断报告，写入 `privacySummary`，用于定位泄露来源、验证 Level I 判决的合理性，但不会让整体 PASS/FAIL 依赖它们。这是历史设计演进的结果（早期三层各自独立判定 PASS/FAIL，因单次切分噪声大而产生大量伪 FAIL，后统一为 Level I 的多 seed 判决，详见下文）。

---

## 📍 Level I: Single-Sample Attacks

### 攻击场景

**威胁模型**：攻击者观察到某个策略的多次执行痕迹。

**攻击任务**：从执行特征中识别"这是哪个策略"。

**类比**：就像通过一个人的多次行为模式识别其身份。

### 方法设计

#### 数据准备与 label 的精确定义

label 的构造非常直接，来自数据生成阶段就确定好的 pair 结构，不依赖任何模型推断：

```js
// feature_extractor.js: buildSingleSampleDataset
pair.policies.forEach((policy, policyIdx) => {
  policy.features.forEach((executionRecord) => {
    samples.push({ ..., label: policyIdx, features: {...} });
  });
});
```

**一条样本 = 一次链上执行**；label 就是 `policyIdx`（0 或 1）——这次执行来自 pair 中的第一个策略还是第二个。如果每个策略跑了 N 次执行，一个 pair 就贡献 `2N` 条样本，label 严格 0/1 各占一半。

#### pair → scope 的层级关系

`semantic_equivalent` / `structural_variant` / `weak_equivalent` / `controlled_difference` 每一个都是一个**类别桶**，桶里包含几十对（数十到上百对，取决于配置的 `targetPairsPerType`）独立生成的策略对，不是单独一对：

1. 生成一大批策略（如 200 个），两两组合算相似度，归入四个桶。
2. 每个桶内做分层抽样，抽出目标数量的 pair。
3. Level I 攻击按 `pairType` 分组（外加一个 `overall` = 全体 pair 合并）独立训练/评估：每个 scope 各出一个 LR + 一个 RF 分类器。

因此 `semantic_equivalent` scope 下的分类器训练/测试数据，是**这几十对 pair 的所有策略、所有执行记录混在一起**。这里 label 的含义也随之变得更抽象：不是"pair #3 里的策略 A 长什么样"，而是"给定链上特征，判断这次执行是它所在 pair 里的第一个策略还是第二个"。因为哪个策略是 pair 里的"第一个"完全是生成时的任意顺序、不代表任何语义类别，所以一个隐私保护良好的系统应该让这个判别问题在跨几十对 pair 的统计意义上都学不出规律——AUC 趋近 0.5。

#### 为什么按策略（policy）切分 train/test，而不是按样本随机切分

这是 Level I 实现中最容易被忽略但最关键的设计。

同一个策略的多次执行记录**不是相互独立的噪声**——它们共享该策略特有的、稳定的链上痕迹（比如某策略的代码路径导致 `accessGasUsed` 总落在某个窄区间）。如果按样本随机切分，同一个策略的记录可能同时出现在训练集和测试集里：分类器在训练时"记住"了这个具体策略实例的数值范围，测试时认出同一个策略的另一次执行，AUC 会被人为拉高——但这只是**记忆效应**（标准机器学习意义上的 data leakage），不是真正的隐私泄露。

PI 要回答的问题从来不是"这两个具体的策略实例能不能被区分开"（只要样本记得多，任何两个不同的东西总能被记住），而是：

> 攻击者拿到一批**从未见过的**策略执行记录，能否仅凭链上可观测特征，泛化地推断出它属于哪一类语义等价组？

这才对应真实威胁模型——攻击者面对的从来不是"再次分析已研究过的同一策略"，而是全新的、未知的一次执行。

`trainTestSplit`（`feature_extractor.js`）的做法：先把该 scope 下**出现过的所有 policy ID** 打乱，整体划分成 train / test 两组 ID（而不是按样本或按 pair 划分），再把每条样本按其所属策略归到对应一侧。因此某个策略若被分到 train，它的全部执行记录都在 train；若分到 test，全部执行记录都在 test——不存在"同一策略的记录横跨 train/test"。测试阶段面对的必然是训练时从未见过的策略实例；此时若 AUC 依然明显高于 0.5，说明分类器学到的是**能泛化到新策略的、类别层面的通用区分规律**，这才是真正的隐私泄露。

需要注意：这个切分是按**单个 policy ID**（Level I 每条样本只挂自己的 `policyId`），不要求同一 pair 的两个策略被分到同一侧——pair #3 的策略 A 进 train、策略 B 进 test 是允许的，因为 Level I 评估的是"跨整个 scope，能否学出通用的 0/1 判别规律"，而非"这一对 pair 能不能被分开"。（Level II 的 pairwise 差分样本则相反：会要求 pair 双方都在同一侧，跨侧样本被丢弃——因为 pairwise 样本的本质就是"这一对的差异"，拆开来没有意义。）

#### 分类器选择

**1. 逻辑回归（Logistic Regression）**
- 学习特征的线性组合来预测策略
- 输出预测概率：P(策略 = A | 特征)
- 优势：可解释性强，能看到每个特征的权重

**2. 随机森林（Random Forest）**
- 捕捉非线性关系和特征交互
- 多棵决策树的集成
- 优势：能发现复杂模式

### 单次切分诊断指标

以下指标由单次 train/test 切分算出，写入报告作为**诊断信息**（entropy、accuracy、raw advantage 均不参与判决，仅 AUC + permutation p-value 的多 seed 版本用于判决，见下文"权威判决"一节）：

| 指标 | 含义 | 隐私保护的期望方向 |
|------|------|-----------------|
| **AUC** | 分类器区分能力 | 接近 0.5（随机） |
| **Accuracy** | 分类准确率 | 接近 50% |
| **Advantage** | 超过随机猜测的优势（`|accuracy - 0.5|`） | 接近 0；不稳定，仅作 legacy 诊断字段，不参与判决 |
| **Entropy** | 预测概率的二元熵 | 接近 1（完全不确定） |
| **Permutation p-value** | 单次切分下 AUC 是否显著 | ≥ 0.05（不显著）；判决用的是 30-seed 版本，见下文 |

### 特征重要性分析

Level I 的特征在训练前先做过 min-max 归一化（所有 9 维特征缩放到 `[0, 1]`，见 `normalizeSamples`），因此逻辑回归的权重大小之间是可比的，权重向量可以揭示哪些特征最能区分策略：

```
高权重特征 → 该特征能有效区分策略 → 隐私泄露！
低权重特征 → 该特征无法区分策略 → 隐私保护良好 ✅
```

**示例解读**：
- 如果 `commitGasUsed` 权重 = 0.82 → gas 消耗是强判别信号 ❌
- 如果所有权重都接近 0 → 无特征能有效区分 ✅

### 置换检验（Permutation Test）

**目的**：验证分类器的 AUC 是否真正显著，还是只是随机波动。

**方法**：
1. 记录实际 AUC 值
2. 随机打乱标签 500 次，每次计算 AUC
3. 统计有多少次随机 AUC ≥ 实际 AUC
4. p-value = 超过实际 AUC 的比例

**解读**：
- p ≥ 0.05 → 实际 AUC 不显著，可能只是运气 ✅
- p < 0.05 → 实际 AUC 显著，分类器真的有效 ❌

### Level I 的意义

1. **基线测试**：最简单的攻击方式，是隐私保护的第一道防线
2. **指纹检测**：测试单个策略是否有独特的可识别特征
3. **泄露定位**：通过特征权重识别哪些特征导致泄露
4. **系统诊断**：指导优化方向（如需要对哪些特征添加混淆）

### 权威判决：30-seed 双重判据（唯一决定 PASS/FAIL 的机制）

`run_experiment.js` 中真正决定 PASS/FAIL 的是 `evaluateMultiseed`（`core/multiseed_criterion.js`），它调用 `seed_records.js` 的 `buildPiRecordsForSeed`，而后者内部**只调用 `runSingleSampleAttacks`**——Level II（pairwise）和 Level III（统计检验）的结果只进入 `privacySummary` 这个诊断性报告，不参与判决。

**为什么不是单次切分算 PASS/FAIL**：早期三个实验（PCH/PI/SPP）各自用单次 policy-disjoint 切分判定，但每个策略只有约 3～5 次执行时，单次切分的 AUC 标准差高达 0.05～0.09，产生了大量并非真实泄露、只是抽样噪声导致的伪 FAIL。现在改为：同一套攻击**重复 30 个 seed**（每个 seed 重新做一次 policy-disjoint 的 train/test 划分），取 AUC 均值和显著 seed 的比例，用双重判据判定：

```
FAIL  iff  AUC_mean > 0.55  且  显著 seed 比例 ≥ 0.5
PASS  otherwise
```

其中一个 seed 记为"显著"，当且仅当该 seed 的置换检验 p-value < 0.05。两个条件缺一不可：
- 只看 AUC 会被非线性攻击者（RF）在纯噪声特征上过拟合出的虚高 AUC 误导（此时置换检验并不显著）；
- 只看显著性会把"真实但微弱、无实际攻击价值"的微小 AUC 也判为泄露。

`Advantage`（accuracy 相对随机基线的优势）在这套判决里**只是 legacy 诊断字段**，不参与 PASS/FAIL——它在类别不平衡的小测试集上不稳定（退化的多数类预测器可以拿到很大的 advantage，但 F1=0、置换检验也不显著）。

另外还有一条不直接体现在判据公式里、但会影响哪些 scope 参与判决的规则：某 scope 的测试集样本数中位数若低于 `minTestSamples`（默认 20），该 scope 仍会被计算和报告，但**不参与整体 gating**——避免小样本子类的抽样噪声左右总体判决。`overall`（全体 pair 合并）以及样本量足够的子类仍然 gate。

多 seed 评估的是**同一套 label 定义**（pair 结构、`policyIdx` 在数据生成阶段就已固定，不随 seed 变化）在不同的 train/test 策略切分抽样下是否稳健，而不是评估不同的 label 定义。每个 scope 的每个分类器（LR、RF）独立产出一条 record，按上述双重判据判定该 scope+classifier 是否 FAIL；任一 scope+classifier FAIL 则整体判决为 FAIL。

---

## 🎯 Level II: Pairwise Attacks

### 攻击场景

**威胁模型**：攻击者观察到两个策略（A 和 B）的多次执行痕迹。

**攻击任务**：判断这两组执行是来自"同一策略"还是"不同策略"。

**类比**：通过对比两个人的行为模式，判断是否同一人。

### 核心创新：差分特征

**关键思想**：不直接使用原始特征，而是使用特征的**绝对差值**。

#### 为什么使用差分？

```
场景 1: 策略 A vs 策略 B（不同策略）
A: commitGas = 50000, proofSize = 1024
B: commitGas = 52000, proofSize = 1280
差值: |50000 - 52000| = 2000, |1024 - 1280| = 256

场景 2: 策略 A 的两次执行（同一策略）
A₁: commitGas = 50000, proofSize = 1024
A₂: commitGas = 50100, proofSize = 1024
差值: |50000 - 50100| = 100, |1024 - 1024| = 0
```

**分类目标**：学习区分"策略间差异"和"执行间随机噪声"。

如果无法区分 → 策略间差异 ≈ 执行噪声 → **不可区分** ✅

### 正负样本构造

#### 正样本（label = 1，不同策略）
- 策略 A 的执行 vs 策略 B 的执行
- 差分特征应该较大（如果策略不同）

#### 负样本（label = 0，同一策略）
- 策略 A 的执行 1 vs 策略 A 的执行 2
- 策略 B 的执行 1 vs 策略 B 的执行 2
- 差分特征应该较小（执行间随机波动）

**关键设计**：负样本提供了"同一策略应有的差异基线"，使分类器能学习"多大差异算不同策略"。

### 方法特点

这是典型的 **Siamese Network** 思想：

```
传统分类：学习 A 的特征 → 识别 A
Pairwise：学习 |A - B| → 判断是否同一策略
```

**优势**：
- **平移不变性**：对整体偏移不敏感
- **对称性**：A vs B = B vs A
- **直接建模相似性**：更符合不可区分性定义

### Level II 的核心意义

**概念上最贴近"不可区分性"的形式化定义，但当前实现中是诊断性的，不参与 PASS/FAIL 判决**（判决只看 Level I 的 30-seed 结果，见上文）。

1. **直接测试不可区分性定义**
   - 密码学定义：攻击者无法判断两个密文是否加密了相同消息
   - Level II 类比：攻击者无法判断两组执行是否来自相同策略

2. **更强的威胁模型**
   - Level I：只观察单个策略
   - Level II：可以比较多个策略
   - 更接近实际攻击场景

3. **实用性验证**
   - 真实场景中的隐私问题往往涉及比较
   - 例如："Alice 和 Bob 的访问策略是否相同？"

**报告解读**：单次切分下 AUC 应接近 0.5。由于是单次切分（无多 seed 平均），标准差较大，仅作为 Level I 判决的交叉验证参考，不单独构成 PASS/FAIL 依据。

---

## 🔍 Level III: Two-Sample Statistical Tests

### 攻击场景

**威胁模型**：攻击者是统计学专家，使用非参数统计方法检测分布差异。

**攻击任务**：判断两个策略的特征分布是否在统计上显著不同。

**类比**：医学研究中比较两组病人的指标分布是否有差异。

### 为什么需要 Level III？

#### Level I & II 的局限性

```
机器学习分类器的限制：
- 需要训练数据（可能不足）
- 依赖模型选择和超参数
- 可能欠拟合，没学到真实差异
- 只能捕捉已学到的模式
```

#### Level III 的优势

```
统计检验 = 无需训练的"分类器"
- 直接比较分布，无需训练
- 有严格的数学和统计理论基础
- 能检测机器学习模型遗漏的微小差异
- p-value 有清晰的概率解释
```

### 方法 1: MMD（Maximum Mean Discrepancy）

#### 核心思想

测量两个分布在**高维特征空间**中的距离。

**直观理解**：
1. 将所有数据点映射到高维空间（通过核函数）
2. 计算策略 A 的样本的"平均位置"
3. 计算策略 B 的样本的"平均位置"
4. MMD = 两个"平均位置"的距离

#### 数学直觉

```
MMD²(A, B) = E[相似度(A内部样本)]
           + E[相似度(B内部样本)]
           - 2×E[相似度(A与B之间)]
```

**几何图景**：

```
情况 1: 分布相同
    ● ○ ● ○ ● ○    (A 和 B 混在一起)
    ○ ● ○ ● ○ ●

    A 内部相似 ≈ B 内部相似 ≈ A-B 之间相似
    MMD ≈ 0 ✅

情况 2: 分布不同
    ● ● ● ● ●      (A 在左边)
            ○ ○ ○ ○ ○  (B 在右边)

    A 内部相似很高，B 内部相似很高
    A-B 之间相似很低
    MMD 很大 ❌
```

#### RBF 核函数

使用高斯核（RBF kernel）测量相似度：

```
K(x, y) = exp(-||x - y||² / 2σ²)
```

- 距离近 → K ≈ 1（非常相似）
- 距离远 → K ≈ 0（不相似）
- σ（带宽）自动选择（中位数启发式）

#### 评估标准

- **MMD ≤ 0.05**：分布距离很小，不可区分 ✅
- **MMD > 0.05**：分布显著不同，可区分 ❌

### 方法 2: KS Test（Kolmogorov-Smirnov Test）

#### 核心思想

比较两个**一维分布**的累积分布函数（CDF）。

**逐特征检验**：对每个特征（如 commitGasUsed, proofSize 等）单独进行 KS 测试。

#### 统计量定义

```
D = max |CDF_A(x) - CDF_B(x)|
    x∈ℝ
```

D = 两个 CDF 之间的最大垂直距离

#### 可视化理解

```
策略 A 的 CDF (commitGasUsed):

1.0 |                    ┌─────
    |                ┌───┘
0.5 |          ┌─────┘         ← 50% 的执行 gas < 50k
    |     ┌────┘
0.0 |─────┘
    └─────────────────────────► gas
    0   20k  40k  60k  80k

策略 B 的 CDF:

1.0 |                    ┌─────
    |               ┌────┘      ← 稍有偏移
0.5 |        ┌──────┘
    |   ┌────┘
0.0 |───┘
    └─────────────────────────► gas

D = max |CDF_A - CDF_B| = 0.15
```

#### 假设检验框架

**零假设 H₀**：两个分布相同
**备择假设 H₁**：两个分布不同

**p-value 解读**：
- p ≥ 0.05 → 不拒绝 H₀，分布可能相同 ✅
- p < 0.05 → 拒绝 H₀，分布显著不同 ❌

#### 诊断能力

KS 测试对每个特征单独检验，可以精确定位问题：

```
结果示例:
- commitGasUsed:  D=0.14, p=0.52 ✅
- proofSize:      D=0.92, p=0.003 ❌ (问题特征！)
- commitLogsSize: D=0.10, p=0.64 ✅
```

**结论**：`proofSize` 的分布显著不同，需要标准化处理。

### Level III 的评估指标

以下阈值是 `run_experiment.js` 中 `DEFAULT_THRESHOLDS` 的默认值，用于单次统计检验报告的诊断性 PASS/FAIL 标注（不影响整体 PASS/FAIL，见上文"权威判决"）：

| 检验方法 | 指标 | 报告标注阈值 |
|---------|------|-----------------|
| **MMD** | 分布距离 | ≤ 0.05（`mmdMax`） |
| **KS Test** | p-value（每个特征） | ≥ 0.05（`ksPValueMin`） |

执行次数少于 2 次的策略会被 `runTwoSampleTests` 自动跳过（否则 MMD 分母 `len*(len-1)` 会除零产生 NaN），跳过数量会打印警告。

### Level III 的独特价值

1. **敏感度高的补充视角**
   - 能检测机器学习分类器可能遗漏的微小分布差异
   - 结果写入诊断报告，供人工判断是否需要关注（**不会自动改变整体 PASS/FAIL**，因为它不参与 `evaluateMultiseed`）

2. **理论基础扎实**
   - 基于假设检验的数学框架
   - p-value 有清晰的概率解释
   - 不依赖模型选择和训练

3. **精确的诊断能力**
   - MMD：整体分布是否不同
   - KS：哪个特征导致差异
   - 可以精确指导系统优化

4. **与密码学不可区分性对应**
   - 密码学定义：任意 PPT 算法无法区分
   - Level III：最敏感的统计方法无法区分
   - 为理论声明提供额外的实证参考

**报告解读**：MMD 小且所有特征的 KS p-value 都不显著，视为该 scope 在分布层面未见明显差异；若与 Level I 的判决不一致，应作为需要人工复核的信号，而非自动覆盖判决。

---

## 🔗 三层攻击的互补性

### 实际的判决与诊断关系

三层不是"依次闯关"的递进关系——当前唯一决定 PASS/FAIL 的是 Level I 的 30-seed 双重判据。Level II、Level III 的价值在于**交叉验证和定位泄露来源**，而不是各自独立的关卡：

```
┌────────────────────────────────────────┐
│ Level I: 权威判决                       │
│ 30-seed 双重判据 → 唯一的 PASS/FAIL 来源 │
├────────────────────────────────────────┤
│ Level II: 诊断（单次切分）               │
│ 若与 Level I 结论不一致 → 提示需要复核    │
├────────────────────────────────────────┤
│ Level III: 诊断（统计检验，无需训练）     │
│ 能发现分类器欠拟合遗漏的微小分布差异      │
└────────────────────────────────────────┘
```

### 互补场景（诊断性解读，均不改变最终判决）

#### 场景 1: Level II 诊断显示正常但 Level III 诊断发现差异

```
Level II: AUC = 0.52 (分类器单次切分下接近随机)
Level III: MMD = 0.068 (分布距离超过 0.05 阈值)
```

**解释**：
- 分类器表达能力有限，或单次切分样本不足，没学到真实差异
- 但统计检验捕捉到了微小的分布偏移
- 这是一个需要人工关注的信号：即使 Level I 判 PASS，也建议检查 Level III 是否有类似情况，作为后续优化方向的线索

#### 场景 2: Level II 诊断显示可分但 Level III 诊断正常

```
Level II: Accuracy = 0.68 (单次切分下分类器有效)
Level III: MMD = 0.018 (分布无明显差异)
```

**解释**：
- 单次切分样本量小，分类器可能过拟合出偶然的可分性
- 或存在特征组合模式，但单个特征的边际分布正常（MMD/KS 主要捕捉边际分布差异，对高维组合模式不如分类器敏感）
- 应参考 Level I 的 30-seed 结果作为更可靠的判断依据，而非仅凭单次 Level II 切分下结论

### 多角度验证

| 维度 | Level I | Level II | Level III |
|------|---------|----------|-----------|
| **方法** | 监督学习 | Siamese 学习 | 统计检验 |
| **输入** | 原始特征 | 差分特征 | 特征分布 |
| **威胁** | 弱攻击者 | 中等攻击者 | 强攻击者 |
| **捕捉** | 身份特征 | 相对差异 | 分布差异 |
| **优势** | 可解释性 | 不可区分性 | 最严格 |

---

## 📈 实验阈值设计

### 权威判决：Level I 的双重判据（唯一决定 PASS/FAIL）

| 判据 | 阈值 | 含义 |
|------|------|------|
| `aucMax` | 0.55 | AUC 均值（30 seed）超过此值才算"优势足够大" |
| `sigFractionMax` | 0.5 | 30 个 seed 中，置换检验显著（p < `permAlpha`）的比例达到此值才算"统计上真实" |
| `permAlpha` | 0.05 | 单个 seed 的置换检验显著性水平 |
| `minTestSamples` | 20 | 测试集样本数中位数低于此值的 scope 不参与 gating（仍报告） |

判据：`FAIL iff AUC_mean > aucMax AND sigFraction >= sigFractionMax`，两者缺一不可（见上文"权威判决"一节的详细解释）。

### Level II / Level III 的诊断性阈值（不参与整体判决）

| 层级 | 指标 | 报告标注阈值 | 含义 |
|------|------|------|------|
| **Level II**（单次切分） | AUC | ≤ 0.55 | 接近随机 |
|  | Permutation p | ≥ 0.05 | AUC 不显著 |
| **Level III** | MMD | ≤ 0.05（`mmdMax`） | 分布距离很小 |
|  | KS p-value | ≥ 0.05（`ksPValueMin`） | 所有特征不显著 |

### 阈值的合理性

#### AUC = 0.55 的选择

```
AUC = 0.5  → 完全随机
AUC = 0.55 → 允许轻微偏差（容忍抽样波动）
AUC = 0.6  → 开始有轻微泄露
AUC = 0.7+ → 显著泄露
```

#### sigFractionMax = 0.5 的选择

要求 30 个 seed 里至少一半的置换检验显著，才能认定"AUC 偏高不是偶然"。这是为了避免仅凭个别 seed 的偶然显著性就判定泄露——单个 seed 的显著性受该次 policy-disjoint 切分的具体样本影响，需要多数 seed 一致才算稳健信号。

#### MMD & p-value = 0.05 的选择

```
α = 0.05 是统计学标准显著性水平
含义: 5% 的假阳性率（错误拒绝零假设的概率）
```

---

## 🎓 实验的科学意义

### 1. 量化隐私保证

**不仅声称"策略被加密了"，而是给出可复现、多次重跑下稳健的量化判据**

```
传统安全声明: "我们使用了 AES-256 加密"
本实验声明: "在 30 次独立的 policy-disjoint 切分重跑中，
             攻击者的平均 AUC 未超过 0.55，
             且未能在半数以上的重跑中给出统计显著的区分"
```

注意这里量化的是 AUC（分类器区分能力的排序指标），不是"准确率"或"成功率"——AUC=0.55 不等价于"55% 的样本被猜对"。

### 2. 对抗性评估

**模拟多种攻击方法，测试最坏情况下的隐私性**

- 机器学习攻击（Level I & II）
- 统计分析攻击（Level III）
- 覆盖从简单到复杂的攻击谱

### 3. 侧信道分析

**验证即使内容被隐藏，执行痕迹是否泄露信息**

```
问题: 零知识证明隐藏了策略内容，是否足够？
答案: 还需验证 gas、日志等侧信道不泄露信息
```

### 4. 系统优化指导

**精确定位泄露源，指导系统改进**

```
发现: proofSize 权重 0.71 (Level I)
      proofSize KS p=0.003 (Level III)

优化: 标准化所有 proof 为固定大小
验证: 重新运行实验，检查是否修复
```

### 5. 理论与实践的桥梁

**为理论不可区分性声明提供实证支持**

```
理论: ∀ PPT A, |Pr[A(P₀)=1] - Pr[A(P₁)=1]| ≤ ε
实证: 三层攻击都无法有效区分 → 支持理论声明
```

---

## 📊 实验报告示例

**以下示例为示意格式，用于说明报告大致包含哪些信息，并非某次真实实验的输出截图；实际字段名和数值请以 `run_experiment.js` 生成的报告文件为准。**

### 理想结果（完美的不可区分性）

```markdown
## Policy Indistinguishability Evaluation Report

### Level I: Single-Sample Attacks

| Pair Type | Classifier | AUC | Advantage | p-value | Status |
|-----------|-----------|-----|-----------|---------|--------|
| overall | Logistic | 0.51 | 0.01 | 0.45 | ✓ PASS |
| overall | RandomForest | - | 0.03 | - | ✓ PASS |
| semantic_equivalent | Logistic | 0.52 | 0.02 | 0.38 | ✓ PASS |

**Feature Importance**: All weights < 0.05 (no dominant feature)

---

### Level II: Pairwise Attacks

| Classifier | AUC | Advantage | p-value | Status |
|-----------|-----|-----------|---------|--------|
| Logistic | 0.52 | 0.02 | 0.34 | ✓ PASS |
| RandomForest | - | 0.03 | - | ✓ PASS |

**Conclusion**: Cannot distinguish intra-policy vs inter-policy differences.

---

### Level III: Two-Sample Statistical Tests

**MMD Results**:
- semantic_equivalent: 0.012 (< 0.05 ✓)
- structural_variant: 0.018 (< 0.05 ✓)
- weak_equivalent: 0.023 (< 0.05 ✓)

**KS Test Results** (all features p > 0.05 ✓):
- commitGasUsed: p=0.52
- proofSize: p=0.55
- commitLogsSize: p=0.64
- ... (all pass)

---

## Overall Status: ✓ PASS

Policies appear **indistinguishable** across all three attack levels.
```

### 问题结果（存在泄露）

```markdown
### Level II: Pairwise Attacks

| Classifier | AUC | Advantage | p-value | Status |
|-----------|-----|-----------|---------|--------|
| Logistic | 0.64 | 0.14 | 0.02 | ✗ FAIL |

**Feature Importance**:
- commitGasUsed: 0.68 (HIGH WEIGHT ⚠️)
- proofSize: 0.52 (HIGH WEIGHT ⚠️)

---

### Level III: Two-Sample Statistical Tests

**KS Test - Problematic Features**:
- proofSize: D=0.92, p=0.003 ✗ FAIL

---

## Overall Status: ✗ FAIL

**Leakage detected**:
1. Gas consumption varies systematically between policies
2. Proof size distributions are significantly different

**Recommendations**:
1. Add random gas padding/consumption
2. Standardize proof sizes to a fixed value
3. Re-run experiments after mitigation
```

---

## 🎯 总结

### 核心贡献

本实验设计了一个**三层递进**的攻击框架来验证策略不可区分性：

1. **Level I (Single-Sample)**：测试策略是否有独特指纹
2. **Level II (Pairwise)**：直接测试不可区分性定义
3. **Level III (Statistical)**：最严格的分布差异检验

### 独特优势

- ✅ **全面性**：覆盖从弱到强的攻击者
- ✅ **互补性**：机器学习（Level I/II） + 统计检验（Level III）从不同角度交叉验证
- ✅ **可操作性**：Level I 有明确的多 seed 双重判据作为权威判决
- ✅ **诊断性**：Level II/III 精确定位泄露源，指导系统优化
- ✅ **稳健性**：权威判决基于 30-seed 重跑，避免单次切分的抽样噪声导致伪判决

### 理论意义

- 为密码学不可区分性提供实证支持
- 验证侧信道信息不泄露策略内容
- 量化隐私保证的程度

### 实践价值

- 指导系统优化（如 gas padding, proof 标准化）
- 为安全声明提供可信证据
- 可用于持续监控和回归测试

**最终目标**：证明在医疗数据访问控制场景中，即使所有链上信息都被观察，语义相似的策略仍然**计算上不可区分**，从而保护策略制定者的隐私意图。

---

## 📚 参考文献建议

本实验方法借鉴了以下领域的研究：

1. **差分隐私与不可区分性**
   - Dwork, C., & Roth, A. (2014). The algorithmic foundations of differential privacy.

2. **侧信道攻击**
   - Kocher, P. C. (1996). Timing attacks on implementations of Diffie-Hellman, RSA, DSS, and other systems.

3. **MMD 统计检验**
   - Gretton, A., et al. (2012). A kernel two-sample test. Journal of Machine Learning Research.

4. **零知识证明的隐私分析**
   - Goldreich, O., Micali, S., & Wigderson, A. (1991). Proofs that yield nothing but their validity.

5. **区块链隐私分析**
   - Meiklejohn, S., et al. (2013). A fistful of bitcoins: characterizing payments among men with no names.
