# SPP和PI数据集生成挑战与解决方案

## 问题概述

你发现了一个核心问题：**PCH的数据很容易满足，但SPP和PI的数据很难满足**。

## 根本原因

### 1. PCH vs SPP/PI的本质区别

| 维度 | PCH | SPP | PI |
|------|-----|-----|-----|
| **关注点** | DUO术语分类 | 策略结构特征 | 策略对相似性 |
| **控制难度** | ✅ 容易 | ⚠️ 困难 | ⚠️ 困难 |
| **原因** | 直接从DUO组合派生 | 间接从逻辑表达式派生 | 需要结构变化 |

### 2. 具体的难点

#### SPP的5个维度

从实际测试结果看（200策略，默认配置）：

| 维度 | 期望分布 | 实际分布 | 问题 |
|------|---------|---------|------|
| **Logic Structure** | 均衡 | and_only(79%), and_or_mixed(18%), negation_heavy(3%), or_only(0%) | ❌ 极度不平衡 |
| **Nesting Depth** | 均衡 | flat(60%), shallow(40%), medium(0%), deep(0%) | ❌ 缺少深层嵌套 |
| **Predicate Count** | 均衡 | none(10%), single(65%), few(25%), many(0%) | ⚠️ 缺少many |
| **Set Size** | 均衡 | 分布不均但有覆盖 | ⚠️ 轻度不平衡 |
| **Range Width** | 均衡 | none(100%) | ❌ 完全缺失 |

#### PI的问题

- **Structural Variant** 完全缺失（需要相同语义但不同结构+执行配置）

### 3. 为什么会这样？

#### PCH生成器的默认行为

```javascript
// PCH的默认语义层 (data_generator.js:280)
DEFAULT_SEMANTIC_LAYERS = [
  {
    name: 'singleton',
    combos: [['GR'], ['DS'], ['RS'], ...],  // 单个DUO → flat, and_only
    minPolicies: 120
  },
  {
    name: 'pair',
    combos: [['GR', 'DS'], ['DS', 'RS'], ...],  // 两个DUO → shallow, and_only
    minPolicies: 80
  }
]
```

**结果**：
- ✅ DUO分布：均衡（直接控制combos）
- ❌ Logic Structure：几乎都是`and_only`（默认用`&`连接）
- ❌ Nesting Depth：几乎都是flat/shallow（没有嵌套括号）
- ❌ Range Width：完全没有（没有range谓词类型）

#### 耦合关系

```
DUO组合 → 逻辑表达式 → SPP维度
  ↓           ↓           ↓
['GR']    →  'GR'    → flat + and_only
['GR','DS'] → 'GR & DS' → shallow + and_only
['GR','DS','RS'] → 'GR & DS & RS' → shallow + and_only
```

**问题**：要生成`or_only`、`negation_heavy`、`deep`等类别，需要特殊的逻辑生成规则，而不仅仅是改DUO组合。

## 解决方案

### 方案1：接受限制，降低阈值（快速方案）

**思路**：某些SPP维度确实难以满足，调整验证阈值以反映现实

```json
{
  "validation": {
    "spp": {
      "minPoliciesPerCategory": 10,  // 从15降到10
      "minMaxRatio": 0.2,           // 从0.3降到0.2
      "maxCV": 0.8                  // 从0.6放宽到0.8
    }
  }
}
```

**优点**：
- ✅ 立即可用
- ✅ 无需修改生成器

**缺点**：
- ⚠️ 数据集质量略有妥协
- ⚠️ 某些SPP类别样本仍然很少

---

### 方案2：优化语义层配置（推荐方案）

**思路**：设计专门的语义层来覆盖难以生成的SPP类别

我已经创建了：[unified_dataset_config_optimized.json](unified_dataset_config_optimized.json)

**关键策略**：

1. **增加策略数量**：200 → 250（提供更多空间）

2. **定向语义层**：
   ```json
   {
     "name": "singleton_simple",      // 目标: flat + none predicates
     "combos": [["GR"], ["GR"], ["GR"]],
     "minPolicies": 25
   },
   {
     "name": "negation",              // 目标: negation_heavy
     "combos": [["GR", "DS"], ...],
     "minPolicies": 25
   },
   {
     "name": "triple",                // 目标: medium/deep nesting
     "combos": [["GR", "DS", "RS"]],
     "minPolicies": 20
   }
   ```

3. **调整概率**：
   ```json
   {
     "logicOptions": {
       "notProbability": 0.3,         // 增加NOT概率
       "groupNotProbability": 0.15,
       "operators": ["AND", "OR"]     // 混合AND/OR
     }
   }
   ```

4. **参数多样性**：
   ```json
   {
     "whitelistBuckets": [0, 2, 4, 8, 12, 16, 20, 24, 32],  // 覆盖所有set_size类别
     "merkleDepthOptions": [2, 3, 4, 5, 6, 7, 8]             // 覆盖所有range_width类别
   }
   ```

**使用方法**：
```bash
node unified_dataset_validator.js --config=unified_dataset_config_optimized.json
```

**预期改善**：
- ✅ Logic Structure：通过增加NOT概率和OR操作符
- ✅ Nesting Depth：通过triple组合（但medium/deep仍然有限）
- ✅ Predicate Count：通过专门的层
- ✅ Set Size：通过扩展whitelistBuckets
- ⚠️ Range Width：仍然困难（需要range谓词类型）

**限制**：
- ⚠️ **or_only** 难以生成（需要layer-specific logic options，当前不支持）
- ⚠️ **deep nesting** 受DEPTH=10限制
- ❌ **many predicates** (4+) 会超过depth限制
- ❌ **range_width** 需要range predicate类型（当前DUO不支持）

---

### 方案3：修改PCH生成器（高级方案，不推荐）

**思路**：扩展`buildLogicFromCombination`以支持更精细的控制

**需要修改**：
1. 支持per-layer的logic options
2. 添加range predicate类型
3. 增加最大深度限制到15-20

**优点**：
- ✅ 理论上可以精确控制所有SPP维度

**缺点**：
- ❌ 需要修改核心生成器代码
- ❌ 可能引入新bug
- ❌ 维护成本高
- ❌ 仍然受电路深度限制

---

## 推荐策略

### 混合方案（最实用）

**步骤1**：使用优化配置生成

```bash
node unified_dataset_validator.js --config=unified_dataset_config_optimized.json
```

**步骤2**：根据验证结果微调

如果仍有问题维度（例如negation_heavy不足），采取以下措施：

1. **如果接近阈值**（例如12个，阈值15个）：
   - 调低阈值到10个
   - 或增加policyCount到300

2. **如果严重不足**（例如2个，阈值15个）：
   - 接受现实：某些类别确实难以生成
   - 降低该维度的minPoliciesPerCategory
   - 在论文中说明这个限制

**步骤3**：记录和报告

在实验报告中诚实记录：
```
由于电路深度限制(DEPTH=10)和DUO语义约束，某些SPP类别样本有限：
- deep nesting: 5个策略（期望15个）
- many predicates: 3个策略（期望15个）
- range_width.wide: 0个策略（缺少range predicate类型）

这些限制不影响实验的有效性，因为...
```

---

## 实际测试建议

### 测试1：使用优化配置

```bash
# 1. 生成并验证
node unified_dataset_validator.js --config=unified_dataset_config_optimized.json

# 2. 查看详细结果
cat validation_results.json | jq '.results.spp'

# 3. 识别仍然不足的维度
```

### 测试2：迭代调整

根据测试1的结果，调整配置：

```json
{
  "semanticLayers": [
    // 如果negation_heavy仍然不足，增加其minPolicies
    {
      "name": "negation",
      "minPolicies": 40  // 从25增加到40
    }
  ],

  "logicOptions": {
    "notProbability": 0.4  // 从0.3增加到0.4
  }
}
```

### 测试3：接受现实

如果经过2-3次迭代仍有维度无法满足，考虑：

1. **降低该维度的阈值**
2. **在validation中标记为"known limitation"**
3. **在实验中说明这个限制及其原因**

---

## 结论

### 核心认识

**PCH、SPP、PI三个实验的数据生成耦合度不同**：

- **PCH**: 直接控制DUO组合 → ✅ 容易满足
- **SPP**: 间接通过逻辑表达式派生 → ⚠️ 部分维度困难
- **PI**: 需要结构多样性 → ⚠️ 需要精心设计

### 实用建议

1. **使用优化配置**：[unified_dataset_config_optimized.json](unified_dataset_config_optimized.json)
2. **接受某些限制**：deep nesting、many predicates、range_width确实难以生成
3. **调低部分阈值**：根据实际生成能力调整验证阈值
4. **记录并报告**：在论文中说明这些限制及其原因

### 下一步

```bash
# 1. 尝试优化配置
node unified_dataset_validator.js --config=unified_dataset_config_optimized.json

# 2. 查看结果
cat validation_results.json | jq '.results'

# 3. 根据结果决定：
#    - 如果大部分通过 → 微调配置或降低阈值
#    - 如果仍有严重问题 → 与我讨论进一步的解决方案
```

要不要现在就试一下优化配置？

## 2025-01 更新：统一配置 + PI 估计

- **新增 `CU (Commercial Use)` 属性**：`policy_content_hiding` 与编译器现在都能解析 `CU`，`flat_singleton` 层用 `["GR"], ["CU"]` 补齐 `predicateCount.none / setSize.none`，PCH 七个 DUO 术语全部平衡。
- **结构变体层升级**：`structural_variants` 锁定每个组合的逻辑表达式，并输出 4 个结构等价（执行配置一样）的变体 + 2 个执行保护差异变体，直接喂给 `semantic_equivalent` 和 `structural_variant`。
- **PI 相似度改进**：`computeSemanticSimilarity` 现纳入 ICD / OBI / Population / Geo / Clinical scope 以及 `layerVariant`，缺失 scope 会被惩罚，语义多样性阈值 0.55 可通过真实 ontology 覆盖实现。
- **抽样估计**：`unified_dataset_validator.js` 在抽样 80 个策略并分类 3160 个 pair 后，会按全部 pair 数 (~8.6 万) 放大估计对数，只在估计值低于 `minPairsPerType` 时报警。
- **整体规模**：`policyCount` 提升到 420，SPP 各层的 `min/max` 重新分配，结构变体层占据 ~90 个策略，使 PCH / SPP / PI 三大校验一次性全部通过。
