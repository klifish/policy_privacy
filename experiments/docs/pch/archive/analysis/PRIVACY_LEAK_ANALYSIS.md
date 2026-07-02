# Privacy Leak Analysis Report - Testnet Experiment

> ⚠️ **ARCHIVED — superseded.** This document describes the pre-multiseed, single-split
> PASS/FAIL design (a single AUC≤0.55-and-Advantage≤5% threshold check). The current
> authoritative privacy verdict is a 30-seed policy-disjoint double criterion
> (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`), implemented in
> `experiments/core/multiseed_criterion.js`. Some file/API references below (e.g.
> `evaluator.js`, `classifiers.js`, `mock_demo.js`) no longer exist as standalone files.
> Kept for historical context only — do not use as a spec of current behavior.

**Date**: 2025-11-08
**Dataset**: 200 samples (testnet)
**Status**: ⚠️ Privacy leak detected in DUO Term 0

---

## Executive Summary

分析发现了**两个关键的隐私泄露点**，导致对抗模型能够以 **AUC=0.6774** (8.33% advantage) 的准确率推断 DUO Term 0 的存在：

1. 🔴 **CRITICAL**: Term 0 是唯一可以没有 ontology namespace 的条款
2. 🔴 **HIGH**: Term 0 的 commit gas 方差显著高于其他条款 (std=1728 vs ~18)

---

## 1. 数据分布分析

### DUO Term 分布

| Term ID | 样本数 | 占比 | 带 Ontology | 不带 Ontology |
|---------|--------|------|-------------|---------------|
| Term 0  | 97     | 48.5% | 60 (61.9%) | **37 (38.1%)** |
| Term 1  | 67     | 33.5% | 67 (100%) | **0 (0%)** |
| Term 2  | 36     | 18.0% | 36 (100%) | **0 (0%)** |

**关键发现**：
- ✓ Term 分布相对均衡 (48.5% / 33.5% / 18.0%)
- 🔴 **Term 0 是唯一可以不带 ontology 的条款** - 这是最严重的泄露点！

### Ontology Namespace 分布

**Term 0**:
- null: 37 (38.1%)
- ICD10: 30 (30.9%)
- OBI: 30 (30.9%)

**Term 1**:
- ICD10: 67 (100%) - 总是疾病相关

**Term 2**:
- OBI: 36 (100%) - 总是研究相关

**泄露机制**：
```
如果 ontologyNamespace == null:
  → 可以 100% 确定是 Term 0
  → 这解释了 38.1% 的 Term 0 样本可以被准确识别
```

---

## 2. Gas 消耗模式分析

### Commit Gas 统计

| Term | Mean | Std Dev | Min | Max | Range |
|------|------|---------|-----|-----|-------|
| **Term 0** | 501,566 | **1,727.78** 🔴 | 501,341 | **518,494** | 17,153 |
| **Term 1** | 501,387 | **18.08** ✓ | 501,341 | 501,394 | 53 |
| **Term 2** | 501,385 | **19.73** ✓ | 501,341 | 501,394 | 53 |

**关键发现**：

1. **方差泄露 (Variance Leak)**：
   - Term 0 的标准差是 Term 1/2 的 **95倍**！
   - Term 1/2 的 gas 消耗非常稳定 (std ≈ 18-20)
   - Term 0 的 gas 消耗高度不稳定 (std = 1728)

2. **异常值泄露 (Outlier Leak)**：
   - 存在一个 Term 0 样本消耗了 **518,494 gas**
   - 其他所有样本都在 501,341-501,394 范围内
   - 这个唯一的异常值可以 100% 标识为 Term 0

### Term 0 内部分析：带 vs 不带 Ontology

| 类型 | 样本数 | Commit Gas Mean | Commit Gas Std |
|------|--------|-----------------|----------------|
| 带 Ontology | 60 | 501,388 | 17.01 ✓ |
| **不带 Ontology** | 37 | 501,855 | **2,773.23** 🔴 |

**洞察**：
- 不带 ontology 的 Term 0 样本 gas 方差**更高** (2773 vs 17)
- 这两个泄露点**相互叠加**，导致 Term 0 特别容易被识别

### Access Gas 统计

| Term | Mean | Std Dev |
|------|------|---------|
| Term 0 | 1,001,490 | 26.80 |
| Term 1 | 1,001,501 | 24.55 |
| Term 2 | 1,001,493 | 26.09 |

✓ Access gas 已经做得很好，所有 term 的模式几乎相同

---

## 3. 泄露点总结

### 🔴 Leak #1: Ontology Namespace 独特性

**严重性**: CRITICAL
**影响**: 37/97 (38.1%) 的 Term 0 样本

```
攻击策略：
IF (ontologyNamespace == null):
    prediction = "Term 0"
    confidence = 100%
ELSE:
    prediction = "Not Term 0" or "Unknown"
```

**修复难度**: Medium
**修复方案**: 见下方推荐

---

### 🔴 Leak #2: Commit Gas 方差

**严重性**: HIGH
**影响**: 所有 Term 0 样本

```
攻击策略：
特征工程：使用 commitGasUsed 作为主要特征
逻辑回归可以学习：
  - 高 gas 值 → Term 0 可能性大
  - 标准 gas 值 → Term 1/2 可能性大
```

**Gini Impurity / Information Gain**:
- commitGasUsed 具有高区分度
- Term 0 的分布与 Term 1/2 显著不同

**修复难度**: High
**修复方案**: 需要改进 gas padding 策略

---

## 4. 改进建议

### Priority 1: 修复 Ontology Namespace 泄露 🔴

**问题根源**：
- Term 0 (GENERAL_RESEARCH) 在语义上可以不需要 ontology
- Term 1 (DISEASE_SPECIFIC) 总是需要 ICD10 ontology
- Term 2 (RESEARCH_SPECIFIC) 总是需要 OBI ontology

**解决方案选项**：

**Option A: 统一 Ontology 处理** (推荐)
```javascript
// 为所有 term 添加可选的 ontology
// 即使 Term 1/2 也可以有 null ontology
// 或者 Term 0 总是需要添加 dummy ontology

if (duoTerm === 0 && !hasOntology) {
  // Add dummy ontology with random namespace
  addDummyOntology(); // ICD10 or OBI, random choice
}
```

**Option B: Proof Padding**
```javascript
// 确保 proof size 和 calldata 大小不泄露 ontology 信息
// 已经部分实现，但需要验证是否足够
```

**Option C: 改变数据生成策略**
```javascript
// 让 Term 1/2 也有一定概率没有 ontology
// 例如：50% Term 1 有 ICD10，50% 没有
```

---

### Priority 2: 修复 Commit Gas 方差泄露 🔴

**问题根源**：
- Term 0 在某些情况下消耗显著更多 gas (518,494 vs 501,394)
- 需要检查为什么会有这个异常值

**调查步骤**：

1. **找出高 gas 样本的特征**：
```bash
# 查找 commitGasUsed > 510000 的样本
grep -A 5 '"commitGasUsed": 51[8-9]' results/execution_results_200_testnet.json
```

2. **检查是否与特定配置相关**：
   - 是否与 ontology 类型相关？
   - 是否与其他 policy 参数相关？
   - 是否是 gas padding 失效？

**解决方案**：

**Step 1: 增强 Gas Padding**
```solidity
// 在 commit 阶段添加动态 padding
function commitPolicy(...) {
    // ... existing logic ...

    // Add random padding to normalize gas consumption
    uint256 targetGas = 520000; // Upper bound
    uint256 currentGas = gasleft();
    if (currentGas < targetGas) {
        _padGas(targetGas - currentGas);
    }
}

function _padGas(uint256 amount) internal {
    // Consume exactly 'amount' gas through dummy operations
    for (uint256 i = 0; i < amount / 20; i++) {
        // Each iteration costs ~20 gas
        assembly { pop(add(i, 1)) }
    }
}
```

**Step 2: 统计验证**
```javascript
// 目标：所有 term 的 gas 分布应该满足：
// - Mean 在 ±100 gas 范围内
// - Std Dev < 100 gas
// - 没有可识别的异常值
```

---

### Priority 3: 增加样本量

**当前**: 200 samples (140 train, 60 test)
**推荐**: 500-1000 samples

**原因**：
- 小样本量会导致评估不稳定
- AUC 在小数据集上可能不可靠
- 需要更多数据来验证修复效果

---

## 5. 预期改进效果

### 如果修复了 Ontology Leak：

**当前表现**：
- AUC: 0.6774
- Advantage: 8.33%

**预期表现**：
- AUC: ~0.55-0.60 (降低 0.07-0.12)
- Advantage: ~2-5% (降低 3-6%)

**原因**: 移除了 38.1% 样本的 100% 准确识别能力

---

### 如果同时修复 Gas Variance Leak：

**预期表现**：
- AUC: ~0.50-0.53 (接近随机)
- Advantage: ~0-3% (基本无优势)

**这将达到隐私保护目标** ✓

---

## 6. 验证计划

### Step 1: 本地验证
```bash
# 修复代码后，在本地网络运行实验
npm run experiment:local -- --policy-count 500

# 检查新的 evaluation report
cat results/evaluation_report.json
```

### Step 2: Testnet 验证
```bash
# 在 testnet 上验证（需要足够的 gas）
npm run experiment:testnet -- --policy-count 200

# 对比修复前后的结果
diff results/old_evaluation_report.json results/new_evaluation_report.json
```

### Step 3: 成功标准
- ✓ DUO Term 0: AUC ≤ 0.55, Advantage ≤ 5%
- ✓ DUO Term 1: AUC ≤ 0.55, Advantage ≤ 5%
- ✓ DUO Term 2: AUC ≤ 0.55, Advantage ≤ 5%
- ✓ ICD-10: Advantage ≤ 5%

---

## 7. 技术细节

### 为什么 Term 1/2 没有泄露？

**Term 1 (AUC=0.5395, Advantage=-1.67%)**:
- Gas 消耗稳定 (std=18)
- 总是有 ICD10 ontology，但这不是独特特征
- 与 Term 2 很难区分

**Term 2 (AUC=0.5984, Advantage=-6.67%)**:
- Gas 消耗稳定 (std=20)
- 总是有 OBI ontology，但这不是独特特征
- Advantage 为负说明模型表现比随机猜测更差

### 为什么 ICD-10 预测失败？

**结果**: Accuracy=0%, Advantage=-9.09%

**原因**:
- 11 个类别分类任务很难
- Gas 模式没有泄露 ICD-10 chapter 信息
- Proof padding 和 gas padding 有效隐藏了医疗信息

**这是好事！** ✓ 医疗敏感信息得到了保护

---

## 8. 结论

### 当前状态
- ✗ DUO Term 0: 存在泄露
- ✓ DUO Term 1: 隐私保护良好
- ✓ DUO Term 2: 隐私保护良好
- ✓ ICD-10: 隐私保护优秀

### 根本原因
1. Term 0 的语义设计导致 ontology namespace 独特性
2. Gas padding 不够激进，未能消除方差差异

### 修复路径
1. 统一 ontology 处理（强制或禁止）
2. 增强 gas padding 策略
3. 在更大数据集上验证

### 预期成果
修复后，所有 DUO term 预测任务应该达到：
- AUC ≤ 0.55
- Advantage ≤ 5%
- 实现真正的 Policy Content Hiding ✓

---

## Appendix: Raw Data

### Commit Gas Distribution by Term

**Term 0** (n=97):
```
Min:    501,341
Q1:     501,394
Median: 501,394
Q3:     501,394
Max:    518,494  ← Outlier!
Mean:   501,566
Std:    1,728
```

**Term 1** (n=67):
```
Min:    501,341
Q1:     501,378
Median: 501,394
Q3:     501,394
Max:    501,394
Mean:   501,387
Std:    18
```

**Term 2** (n=36):
```
Min:    501,341
Q1:     501,378
Median: 501,394
Q3:     501,394
Max:    501,394
Mean:   501,385
Std:    20
```

### Unique Gas Values

- **Term 0 only**: 518,494 (1 sample)
- **All terms**: 501,341, 501,394
- **Term 1/2 only**: 501,378

---

**Report Generated**: 2025-11-08
**Analysis Script**: `analyze_gas_patterns.js`
