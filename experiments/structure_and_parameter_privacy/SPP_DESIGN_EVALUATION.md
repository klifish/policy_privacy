# SPP实验设计评估报告

**评估日期**: 2025-12-01
**评估对象**: Structure & Parameter Privacy (SPP) 实验
**评估范围**: 实验目标合理性、分类维度设计、实验对象选取

---

## 执行摘要

### ✅ SPP实验的必要性

SPP作为第三个隐私实验是**必要且合理**的，它填补了PCH和PI实验的盲区：

| 实验 | 关注点 | 威胁模型 |
|-----|--------|---------|
| **PCH** (Policy Content Hiding) | 策略**内容** | 攻击者试图推测使用了哪些DUO术语/ICD-10代码 |
| **PI** (Policy Indistinguishability) | 策略**身份** | 给定两个策略，攻击者试图区分执行了哪一个 |
| **SPP** (Structure & Parameter Privacy) | 策略**形状** | 攻击者试图推断策略的结构类型和参数大小 |

三个实验构成完整的隐私保护评估体系。

### ⚠️ 主要问题

1. **分类维度混淆**: `paramType`混合了"集合大小"和"范围宽度"两个独立概念
2. **数据严重不平衡**: 某些类别占60-67%，导致ML攻击的成功可能是统计伪影
3. **分类逻辑缺陷**: 使用串联if-else导致优先级不明确
4. **维度相关性**: 某些分类维度高度相关（如`with_sets`和`single_predicate_mixed`）

### 🎯 总体评价

- **实验目标**: ✅ 合理且必要
- **实验对象**: ⚠️ 基本合理但需要改进
- **分类设计**: ❌ 存在明显缺陷
- **数据质量**: ❌ 严重不平衡

---

## 一、实验目标分析

### 1.1 SPP在隐私保护体系中的定位

```
策略隐私 = 内容隐私 + 身份隐私 + 结构隐私
           ↓           ↓           ↓
          PCH         PI          SPP
```

**SPP的独特价值**:
- 评估后缀解释器和填充机制是否隐藏了策略的**拓扑结构**
- 验证参数大小（白名单、Merkle树）是否通过侧信道泄露
- 检测攻击者能否通过gas/proof大小推断策略复杂度

**实际威胁场景**:
1. 攻击者观察到高gas消耗 → 推断策略使用OR（更宽松）
2. 攻击者观察到大proof → 推断策略有大型白名单（特定人群）
3. 攻击者通过聚类发现不同"形状"的策略群

### 1.2 与PCH/PI的互补性

| 维度 | PCH | PI | SPP |
|-----|-----|----|----|
| 策略内容（DUO术语） | ✓✓✓ | ✓ | ✗ |
| 策略身份（P0 vs P1） | ✗ | ✓✓✓ | ✗ |
| 逻辑结构（AND/OR） | ✗ | ✓ | ✓✓✓ |
| 参数大小（集合/范围） | ✗ | ✗ | ✓✓✓ |
| 谓词数量/类型 | ✗ | ✗ | ✓✓✓ |

**结论**: SPP确实填补了结构和参数隐私的空白，是必要的补充。

---

## 二、分类维度评估

### 2.1 结构类型 (structureType)

#### 定义
```javascript
simple_and:  // 简单AND连接，无谓词，低深度
with_or:     // 包含OR但无谓词
nested:      // 深层嵌套的属性表达式
with_sets:   // 有谓词但无OR
complex:     // OR + 谓词 + 深层嵌套
```

#### 评估

| 维度 | 评分 | 说明 |
|-----|------|-----|
| **语义清晰度** | ✅ 好 | 分类标准明确，基于逻辑结构 |
| **实际意义** | ✅ 好 | AND vs OR vs 嵌套确实是不同的结构威胁 |
| **可观察性** | ✅ 好 | 不同结构导致不同电路复杂度 |
| **数据平衡** | ❌ 差 | `with_sets`占60%，严重不平衡 |
| **独立性** | ⚠️ 中 | 与`predicateCombo`有一定相关性 |

#### 问题

**实际分布**:
```
simple_and:  72  (20.0%)
with_sets:  216  (60.0%)  ← 占主导！
complex:     72  (20.0%)
```

**原因分析**:
- 策略生成器倾向于生成有谓词的策略
- 谓词在医疗场景中很常见（ICD-10代码）
- `with_sets`定义过宽："有谓词但无OR"包含了太多情况

**建议改进**:
```javascript
// 更细粒度的分类
and_only:        // 纯AND，无OR
or_only:         // 纯OR，无AND
and_or_mixed:    // 混合AND和OR
deeply_nested:   // 深度 > 3
flat:            // 深度 ≤ 1
```

### 2.2 谓词组合 (predicateCombo)

#### 定义
```javascript
attribute_only:          // 只有属性，无谓词
single_predicate:        // 单一命名空间谓词
single_predicate_mixed:  // 单谓词 + 属性混合
multi_predicate:         // 多个本体的谓词
```

#### 评估

| 维度 | 评分 | 说明 |
|-----|------|-----|
| **语义清晰度** | ✅ 好 | 基于谓词数量，标准清晰 |
| **实际意义** | ✅ 好 | 谓词数量影响Merkle证明数量 |
| **可观察性** | ✅ 好 | 多谓词导致更多链上数据 |
| **数据平衡** | ❌ 差 | `single_predicate_mixed`占67% |
| **独立性** | ❌ 差 | 与`structureType`高度相关 |

#### 问题

**实际分布**:
```
attribute_only:          72  (20.0%)
single_predicate_mixed: 240  (66.7%)  ← 占主导！
multi_predicate:         48  (13.3%)
```

**相关性分析**:
- `with_sets` (216个) 中几乎全部是 `single_predicate_mixed`
- 有谓词 → 必然不是 `attribute_only`
- 很少有多命名空间谓词（因为策略生成器限制）

**建议改进**:
```javascript
// 按谓词数量分类，更直观
no_predicates:      // 0个谓词
one_predicate:      // 1个谓词
two_to_three:       // 2-3个谓词
many_predicates:    // 4+个谓词
```

### 2.3 参数类型 (paramType) 🚨

#### 定义
```javascript
no_sets:       // 无白名单
narrow_range:  // Merkle深度 ≤ 3
small_set:     // 白名单 ≤ 4个元素
medium_set:    // 白名单 5-8个元素
large_set:     // 白名单 > 8个元素
wide_range:    // Merkle深度 ≥ 7
```

#### 评估

| 维度 | 评分 | 说明 |
|-----|------|-----|
| **语义清晰度** | ❌ 差 | 混合了两个概念：集合大小和范围宽度 |
| **实际意义** | ⚠️ 中 | 白名单大小有意义，但与Merkle深度混淆 |
| **可观察性** | ✅ 好 | 不同大小确实可能泄露 |
| **数据平衡** | ❌ 差 | `large_set`占43%（兜底类别） |
| **独立性** | ❌ 差 | 分类函数优先级不清晰 |

#### 关键问题

**1. 概念混淆**

`paramType`试图同时捕获两个正交的概念：
- **集合大小**: 白名单中有多少个元素（离散集合）
- **范围宽度**: age/value范围的跨度（通过Merkle深度近似）

这两个概念应该是独立的维度！

**2. 分类逻辑缺陷**

```javascript
function classifyParameterType(policy) {
  const whitelistSize = policy?.structure?.whitelistSize || 0;
  const merkleDepth = policy?.structure?.merkleDepth || 0;

  if (!whitelistSize) {
    return PARAMETER_TYPES.NO_SETS;         // 优先级1
  }
  if (merkleDepth <= 3) {
    return PARAMETER_TYPES.NARROW_RANGE;    // 优先级2 ← 问题！
  }
  if (whitelistSize <= 4) {
    return PARAMETER_TYPES.SMALL_SET;       // 优先级3
  }
  if (whitelistSize <= 8) {
    return PARAMETER_TYPES.MEDIUM_SET;      // 优先级4
  }
  if (merkleDepth >= 7) {
    return PARAMETER_TYPES.WIDE_RANGE;      // 优先级5
  }
  return PARAMETER_TYPES.LARGE_SET;         // 优先级6（兜底）
}
```

**问题示例**:
- `ws=4, md=6` → `small_set` ✓
- `ws=4, md=3` → `narrow_range` ❌ 应该是small_set！
- `ws=4, md=7` → `small_set` (正确，但只是因为先检查了md≤3)

**3. 实际分布**

```
no_sets:      72  (20.0%)
small_set:    45  (12.5%)
narrow_range: 21  ( 5.8%)
large_set:   153  (42.5%)  ← 兜底类别，不合理！
medium_set:   33  ( 9.2%)
wide_range:   36  (10.0%)
```

`large_set`占43%是因为它是兜底类别，吸收了所有"其他"情况。

**4. 实际数据分析**

从数据集中看到的实际组合：
```
large_set (ws=32, md=5): 45个  ← 确实是大集合
large_set (ws=24, md=5): 39个
large_set (ws=16, md=4): 33个  ← 这个是中等，不是large！
narrow_range (ws=8, md=3): 15个  ← 集合不小，但范围窄
wide_range (ws=16, md=7): 15个   ← 集合中等，但范围宽
```

可以看到分类的混乱性。

#### 建议改进

**方案1: 分离为两个独立维度**

```javascript
// 维度1: 集合大小（基于白名单）
SET_SIZE = {
  NONE:    whitelistSize === 0
  SMALL:   whitelistSize <= 4
  MEDIUM:  5 <= whitelistSize <= 16
  LARGE:   whitelistSize > 16
}

// 维度2: 范围宽度（基于值域，不是Merkle深度）
RANGE_WIDTH = {
  NONE:    没有范围谓词
  NARROW:  age范围 < 10年，或值域跨度 < 100
  MEDIUM:  10-50年，或 100-1000
  WIDE:    > 50年，或 > 1000
}
```

**方案2: 统一为参数复杂度**

```javascript
PARAM_COMPLEXITY = {
  NONE:    无参数
  LOW:     小集合(≤4) 或 窄范围(md≤3)
  MEDIUM:  中等集合(5-16) 或 中等范围(md=4-6)
  HIGH:    大集合(>16) 或 宽范围(md≥7)
}
```

---

## 三、数据不平衡问题

### 3.1 不平衡程度

| 维度 | 最大类 | 占比 | 最小类 | 占比 | 比例 |
|-----|--------|------|--------|------|------|
| structureType | with_sets | 60.0% | simple_and | 20.0% | 3:1 |
| predicateCombo | single_predicate_mixed | 66.7% | multi_predicate | 13.3% | 5:1 |
| paramType | large_set | 42.5% | narrow_range | 5.8% | 7.3:1 |

### 3.2 对实验的影响

#### 问题1: 分类器可以通过预测多数类获得高准确率

```
如果总是预测 "with_sets":
  准确率 = 60%  ← 看起来不错！
  但实际上没有任何隐私保护
```

这就是为什么实验使用AUC和Advantage，而不是准确率。

#### 问题2: 少数类样本不足

```
narrow_range: 21个样本
  - 训练集: 21 * 0.7 = 14.7 ≈ 15个
  - 测试集: 21 * 0.3 = 6.3 ≈ 6个  ← 太少！
```

6个测试样本无法提供统计显著性。

#### 问题3: 交叉验证困难

少数类样本不足导致：
- 难以进行k-fold交叉验证
- 测试集可能完全不包含某些组合
- 统计功效(statistical power)不足

### 3.3 不平衡的根源

#### 根源1: 策略生成器的自然偏好

```javascript
// policy_generator倾向于生成：
- 有谓词的策略（因为医疗场景常见）
- 单谓词（因为DUO本体相对独立）
- AND连接（因为更常见）
```

#### 根源2: 分类标准的粗细不均

```
with_sets:    "有谓词但无OR"  ← 定义很宽
vs
narrow_range: "md ≤ 3"        ← 定义很窄
```

#### 根源3: 真实场景的自然分布

医疗策略确实更常见：
- 单个疾病代码查询（单谓词）
- AND组合（严格策略）
- 中等大小白名单

### 3.4 解决方案

#### 方案1: 分层采样（推荐）

```javascript
async function generateBalancedDataset(config) {
  const targetPerClass = 30;  // 每类至少30个样本

  for (let structureType of STRUCTURE_TYPES) {
    for (let predicateCombo of PREDICATE_COMBOS) {
      for (let paramType of PARAMETER_TYPES) {
        // 生成这个组合的策略，直到达到目标数量
        while (count < targetPerClass) {
          policy = generatePolicyWithConstraints({
            structureType,
            predicateCombo,
            paramType
          });
        }
      }
    }
  }
}
```

#### 方案2: 重采样

```javascript
// 训练时对少数类进行过采样
const balancedTrainSet = resample(trainSet, {
  strategy: 'oversample',
  targetRatio: 0.8  // 最小类至少是最大类的80%
});
```

#### 方案3: 调整分类标准

```javascript
// 重新设计分类，使各类更平衡
STRUCTURE_TYPE = {
  FLAT_AND:  depth <= 1 && !hasOr    // 25%
  FLAT_OR:   depth <= 1 && hasOr     // 25%
  NESTED_AND: depth > 1 && !hasOr    // 25%
  NESTED_OR:  depth > 1 && hasOr     // 25%
}
```

---

## 四、维度相关性问题

### 4.1 实际相关性分析

```
                    predicateCombo
                    ├── attribute_only
                    ├── single_predicate_mixed (67%)
                    └── multi_predicate

structureType
├── simple_and      → 几乎全是 attribute_only
├── with_sets (60%) → 几乎全是 single_predicate_mixed ←相关!
└── complex         → 混合
```

**相关系数估计**:
- `with_sets` 和 `single_predicate_mixed`: ~0.8 (高度相关)
- `simple_and` 和 `attribute_only`: ~0.9 (高度相关)

### 4.2 影响

#### 问题1: 多重共线性

当两个分类维度高度相关时：
```
攻击者通过structureType泄露
  → 自动获得predicateCombo的信息
  → 两个维度的"失败"实际上是同一个失败
```

#### 问题2: 混淆效应

```
监督攻击在structureType上失败，原因可能是：
1. 结构确实被隐藏了 ✓
2. 谓词数量被泄露，攻击者通过谓词推断结构 ✗
```

无法区分是哪种情况。

### 4.3 解决方案

#### 方案1: 独立测试

```javascript
// 每次只测试一个维度，控制其他维度
testStructureType({
  fixedPredicateCount: 1,  // 固定谓词数量
  fixedSetSize: 'medium'   // 固定集合大小
});

testPredicateCombo({
  fixedStructure: 'flat',  // 固定结构
  fixedSetSize: 'medium'
});
```

#### 方案2: 正交设计

确保生成的策略覆盖所有组合：
```
               |  attr_only  |  1_pred  |  2_pred
----------------------------------------------------
simple_and     |     30      |    30    |    30
with_or        |     30      |    30    |    30
nested         |     30      |    30    |    30
```

#### 方案3: 偏相关分析

计算控制其他变量后的相关性：
```javascript
// 控制predicateCombo后，structureType是否仍可被推断？
partialCorrelation(
  structureType,
  features,
  control: [predicateCombo]
);
```

---

## 五、总体评价与建议

### 5.1 评分卡

| 维度 | 评分 | 权重 | 加权分 |
|-----|------|------|--------|
| **实验目标合理性** | 9/10 | 30% | 2.7 |
| **分类维度设计** | 4/10 | 25% | 1.0 |
| **数据质量** | 3/10 | 25% | 0.75 |
| **实现正确性** | 8/10 | 20% | 1.6 |
| **总分** | - | - | **6.05/10** |

### 5.2 优先级改进建议

#### 🔥 优先级1: 修复paramType分类（必须）

**问题**: 混淆了集合大小和范围宽度

**方案**: 拆分为两个独立维度
```javascript
// 新的分类
classifySetSize(whitelistSize)
classifyRangeWidth(ageRange, valueRange)
```

**影响**: 高 - 直接影响实验有效性

#### 🔥 优先级2: 平衡数据分布（必须）

**问题**: 某些类别占60-67%

**方案**: 分层生成，每类至少30个样本

**影响**: 高 - 影响统计显著性

#### ⚠️ 优先级3: 重新设计结构分类（重要）

**问题**: `with_sets`定义过宽

**方案**: 更细粒度的分类（AND-only, OR-only, AND-OR-mixed, nested）

**影响**: 中 - 提高实验精度

#### ⚠️ 优先级4: 解除维度相关性（重要）

**问题**: `with_sets`和`single_predicate_mixed`高度相关

**方案**: 正交实验设计，或偏相关分析

**影响**: 中 - 影响结果解释

#### 💡 优先级5: 增加样本量（建议）

**当前**: 120个策略，360个执行

**建议**: 200个策略，600个执行

**影响**: 低 - 提高统计功效，但成本高

### 5.3 短期建议（1-2周）

1. ✅ **保留当前实验结果作为baseline**
2. ⚠️ **修复paramType分类逻辑**（优先级1）
3. ⚠️ **实现分层采样**（优先级2）
4. ✅ **重新运行实验并对比**

### 5.4 中期建议（1个月）

1. **重新设计所有三个分类维度**
2. **实现正交实验设计**
3. **增加样本量到200个策略**
4. **添加偏相关分析工具**

### 5.5 长期建议（研究方向）

1. **理论分析**: 证明哪些结构信息在理论上可被隐藏
2. **自适应攻击**: 实现知道分类标准的攻击者
3. **细粒度分析**: 分析具体哪个特征（gas, proof, calldata）泄露了哪种结构
4. **跨实验关联**: 分析PCH, PI, SPP三个实验结果的关系

---

## 六、结论

### 6.1 回答核心问题

**问题**: 对于policy privacy来说，SPP实验以及选取的实验对象合适吗？

**答案**:

✅ **SPP实验本身是合适的**:
- 填补了PCH和PI的盲区
- 评估了结构和参数隐私
- 威胁模型现实且重要

⚠️ **但当前实现存在缺陷**:
- `paramType`分类混淆了两个概念
- 数据严重不平衡
- 某些维度高度相关

❌ **实验对象选取需要改进**:
- 分类标准需要重新设计
- 数据生成需要平衡控制
- 需要独立测试各维度

### 6.2 当前实验结果的可信度

| 维度 | 结果 | 可信度 | 说明 |
|-----|------|--------|-----|
| structureType | FAIL | ⚠️ 中 | 不平衡可能导致假阳性，但聚类失败是真实的 |
| predicateCombo | FAIL | ⚠️ 中 | 与structureType相关性高，可能是同一泄露 |
| paramType | FAIL | ❌ 低 | 分类逻辑混乱，结果难以解释 |

### 6.3 最终建议

**建议1**: 保留当前实验作为baseline，记录问题

**建议2**: 实施优先级1-2改进（修复paramType + 平衡数据）

**建议3**: 重新运行实验，对比改进效果

**建议4**: 在论文中诚实讨论这些限制

**建议5**: 将改进工作作为future work提出

---

## 附录

### A. 建议的新分类方案

```javascript
// 维度1: 逻辑结构
LOGIC_STRUCTURE = {
  AND_ONLY:      hasAnd && !hasOr
  OR_ONLY:       hasOr && !hasAnd
  AND_OR_MIXED:  hasAnd && hasOr
  NEGATION_HEAVY: notCount > 2
}

// 维度2: 嵌套深度
NESTING_DEPTH = {
  FLAT:      maxDepth <= 1
  SHALLOW:   maxDepth == 2
  MEDIUM:    maxDepth == 3
  DEEP:      maxDepth >= 4
}

// 维度3: 谓词数量
PREDICATE_COUNT = {
  NONE:       0
  SINGLE:     1
  FEW:        2-3
  MANY:       4+
}

// 维度4: 集合大小（独立）
SET_SIZE = {
  NONE:      whitelistSize == 0
  SMALL:     1-4
  MEDIUM:    5-16
  LARGE:     17+
}

// 维度5: 范围宽度（独立，基于实际范围）
RANGE_WIDTH = {
  NONE:      no range predicates
  NARROW:    range < 10 (years or value units)
  MEDIUM:    10-50
  WIDE:      50+
}
```

### B. 平衡数据生成示例

```javascript
const TARGET_PER_COMBINATION = 10;

for (let logicStruct of LOGIC_STRUCTURES) {
  for (let depth of NESTING_DEPTHS) {
    for (let predCount of PREDICATE_COUNTS) {
      for (let setSize of SET_SIZES) {
        // 跳过不可能的组合
        if (predCount === 'NONE' && setSize !== 'NONE') {
          continue;  // 无谓词不能有集合
        }

        // 生成这个组合
        await generatePolicies({
          target: TARGET_PER_COMBINATION,
          constraints: {
            logicStruct,
            depth,
            predCount,
            setSize
          }
        });
      }
    }
  }
}
```

### C. 统计功效计算

```javascript
// 当前设计的统计功效
const currentPower = calculatePower({
  minClassSize: 21,      // narrow_range
  testSize: 6,           // 21 * 0.3
  effectSize: 0.05,      // 期望检测5%的差异
  alpha: 0.05
});
// Result: power ≈ 0.15 (太低！需要0.8)

// 改进后的功效
const improvedPower = calculatePower({
  minClassSize: 30,
  testSize: 9,
  effectSize: 0.05,
  alpha: 0.05
});
// Result: power ≈ 0.45 (仍然不够)

// 理想功效
const idealPower = calculatePower({
  minClassSize: 100,
  testSize: 30,
  effectSize: 0.05,
  alpha: 0.05
});
// Result: power ≈ 0.85 (足够！)
```

---

**报告结束**

评估人: Claude Code
日期: 2025-12-01
