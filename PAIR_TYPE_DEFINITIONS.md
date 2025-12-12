# Policy Indistinguishability Pair Types - 定义与区分标准

## 官方定义（来自 experiments/docs/pi/README.md）

### 1. **semantic_equivalent** (语义等价)
> "identical normalized logic, different policy artefacts"

- **语义**：完全相同（normalized logic相同）
- **结构**：不同（policy artefacts不同）
- **执行配置**：**相同** ✓
- **目标**：测试系统能否隐藏结构差异

### 2. **structural_variant** (结构变体)
> "identical semantics but diverging execution protections (gas / event / proof padding etc.)"

- **语义**：完全相同
- **结构**：不同
- **执行配置**：**不同**（diverging execution protections）
- **目标**：测试不同隐私保护策略的效果

### 3. **weak_equivalent** (弱等价)
> "high semantic overlap (≥ 0.95 similarity score) with minor scope differences"

- **语义**：高度相似（≥95%）
- **结构**：可以相同或不同
- **执行配置**：可以相同或不同

### 4. **controlled_difference** (受控差异)
> "small, targeted structural deltas used as regression controls"

- **语义**：不同
- **作用**：作为对照组，验证模型确实能学到真正的差异

## 当前代码实现

### data_generator.js 中的分类逻辑（第224-241行）

```javascript
function determinePairType(policyA, policyB) {
  const similarity = computeSemanticSimilarity(policyA.semantics, policyB.semantics);
  const executionDiffs = countExecutionDifferences(policyA.executionProfile, policyB.executionProfile);
  const structureHashEqual = structuralFingerprint(policyA.structure, {}) === structuralFingerprint(policyB.structure, {});

  // 高语义相似度 + 结构不同
  if (similarity >= 0.999 && !structureHashEqual) {
    if (executionDiffs > 0) {
      return { type: 'structural_variant', similarity };  // 有执行差异
    }
    return { type: 'semantic_equivalent', similarity };   // 无执行差异
  }

  // 中等语义相似度
  if (similarity >= 0.95) {
    return { type: 'weak_equivalent', similarity };
  }

  // 低语义相似度
  return { type: 'controlled_difference', similarity };
}
```

**这个实现与官方定义是一致的！** ✓

## 核心区分标准

| 维度 | semantic_equivalent | structural_variant |
|------|---------------------|-------------------|
| **语义相似度** | ≥99.9% | ≥99.9% |
| **结构** | 不同 | 不同 |
| **执行配置** | **相同** | **不同** |
| **隐私目标** | 隐藏结构差异 | 测试不同隐私策略 |

### 关键点：执行配置（Execution Profile）

执行配置包括：
- `path_unify`: 是否统一执行路径
- `gas_pad`: 是否进行gas padding
- `event_pad`: 是否进行event padding
- `proof_pad`: 是否进行proof padding
- `batch_pattern`: 批处理模式（baseline/batched/staggered）

**语义解释**：
- **semantic_equivalent**: 两个policies使用**相同的隐私保护策略**，只是底层结构不同（如merkle深度、whitelist大小）。测试的是：在相同保护策略下，能否隐藏结构差异。

- **structural_variant**: 两个policies使用**不同的隐私保护策略**。测试的是：不同保护策略是否会泄露信息。

## 为什么当前的区分是合理的

### 研究问题的分层

1. **第一层问题（semantic_equivalent回答）**：
   > "如果我们使用相同的隐私保护策略（如都开启gas_pad），能否隐藏不同结构的policies？"

   - **期望答案**：能！（RF AUC < 0.55）
   - **当前结果**：能！（RF AUC = 0.479）✅

2. **第二层问题（structural_variant回答）**：
   > "如果两个policies使用不同的隐私保护策略，是否会泄露信息？"

   - **期望答案**：理想情况下不应该泄露，但现实中可能会
   - **当前结果**：会泄露！（RF AUC = 0.639）
   - **这是一个发现，不是bug**

## 实验解读

### Semantic Equivalent的好结果说明：

✅ **在相同执行策略下，gas padding等机制有效**
- 即使merkle深度不同（2 vs 8）
- 即使proof类型不同（range_proof vs null_proof）
- gas消耗仍然难以区分

### Structural Variant的差结果说明：

⚠️ **不同的执行策略会产生可区分的模式**
- 不同的batch_pattern → 不同的gas时序
- 不同的path_unify → 不同的执行路径
- 不同的event_pad → 不同的event数量

**这是一个重要的发现，而不是失败！**

## 如何改进Structural Variant的结果？

### 问题重新定义

当前结果告诉我们：**"不同的隐私保护策略是可区分的"**

有两种理解方式：

#### 理解A：这是个问题，需要解决
如果你认为即使使用不同的隐私保护策略也应该不可区分，那么需要：

1. **标准化执行策略**
   - 在生产环境中，所有policies都使用相同的执行策略
   - 只允许一种"标准"配置

2. **修改实验定义**
   - 让structural_variant也使用相同的执行配置
   - 用其他维度区分（比如proof类型、merkle深度的具体值）

#### 理解B：这是个发现，需要记录（我推荐）
Structural variant的结果揭示了：
- **执行策略的选择会影响可区分性**
- **这是设计者需要注意的权衡**

**论文贡献**：
1. Semantic equivalent证明：在统一执行策略下，系统提供了有效的隐私保护
2. Structural variant发现：执行策略本身是一个可观察的信号，需要标准化

## 实际建议

### 对于你的研究

我建议**保持当前的定义和结果**，但在论文中清楚地解释：

```
我们定义了两种indistinguishability测试：

1. **Semantic Equivalent**: 测试在相同执行策略下的结构隐藏能力
   - 结果：RF AUC = 0.479（✓ 有效隐藏）

2. **Structural Variant**: 测试不同执行策略的可区分性
   - 结果：RF AUC = 0.639（可区分）
   - 启示：执行策略需要标准化

这表明我们的系统在统一执行策略下提供了有效的隐私保护，但在生产环境中需要
标准化执行配置以防止策略选择泄露信息。
```

### 对于代码

**不需要修改分类逻辑**！当前的实现是正确的：

```javascript
if (similarity >= 0.999 && !structureHashEqual) {
  if (executionDiffs > 0) {
    return { type: 'structural_variant', similarity };  // ✓ 正确
  }
  return { type: 'semantic_equivalent', similarity };   // ✓ 正确
}
```

### 如果确实想改进structural_variant的结果

有三个选项：

#### 选项1：重新定义structural_variant（不推荐）
```javascript
// 不再基于executionDiffs区分
if (similarity >= 0.999 && !structureHashEqual) {
  // 用其他标准，比如随机分配
  const randomSplit = Math.random() < 0.5;
  return {
    type: randomSplit ? 'structural_variant' : 'semantic_equivalent',
    similarity
  };
}
```

#### 选项2：增加一个新类型（推荐）
```javascript
if (similarity >= 0.999 && !structureHashEqual) {
  if (executionDiffs > 0) {
    return { type: 'structural_variant', similarity };
  }
  if (executionDiffs === 0 && hasStructuralDifference(policyA, policyB)) {
    return { type: 'semantic_equivalent', similarity };
  }
  return { type: 'structure_only_variant', similarity };  // 新类型
}
```

#### 选项3：标准化执行配置（最实用）
在policy生成阶段，只使用少数几种预定义的执行配置：

```javascript
const STANDARD_PROFILES = [
  { path_unify: true, gas_pad: true, event_pad: true, batch_pattern: 'baseline' },
  { path_unify: false, gas_pad: true, event_pad: false, batch_pattern: 'batched' }
];

// 在生成policy时，从STANDARD_PROFILES中选择
```

然后在配对时，确保structural_variant的两个policies使用**不同但都来自标准集**的配置。

## 总结

**核心问题的答案**：

> "应该如何区分structural_variant和semantic_equivalent？"

**答案**：通过执行配置（execution profile）是否相同：
- **相同** → semantic_equivalent
- **不同** → structural_variant

**当前的代码实现是正确的**，它反映了官方文档中的定义。

**当前的实验结果也是有价值的**：
- ✅ Semantic equivalent好 → 证明了系统有效性
- ⚠️ Structural variant差 → 揭示了执行策略的重要性

这不是一个需要"修复"的bug，而是一个需要**理解和记录**的研究发现。
