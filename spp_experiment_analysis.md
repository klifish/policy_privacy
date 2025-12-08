# SPP (Structure & Parameter Privacy) 实验结果深度分析

**实验日期**: 2025年12月8日 09:48  
**数据源**: `experiments/structure_and_parameter_privacy/results/report.json`

---

## 📋 实验配置

| 参数 | 值 |
|------|-----|
| 策略数量 | 120 |
| 每策略执行次数 | 3 |
| 满足比例 | 50% |
| 测试集比例 | 30% |
| 随机种子 | "spp-experiment" |

**攻击阈值**:
- 最大优势 (Max Advantage): **0.05** (5%)
- 最大 AUC: **0.55**
- 最大 MMD: **0.05**
- 最小轮廓系数 (Min Silhouette): **0.3**

---

## ❌ 总体结果: **失败 (FAIL)**

**结论**: 检测到潜在的结构和参数泄露，建议进一步加固。

---

## 🎯 详细攻击结果分析

### 1. 监督分类攻击 (Supervised Classification)

#### 1.1 Logic Structure (structureType) 攻击

**目标类别**: `and_only`, `negation_heavy`, `and_or_mixed` (3类)

**失败案例** (5个):

| 类别对 | 模型 | 准确率 | Advantage | 状态 |
|--------|------|--------|-----------|------|
| and_only vs negation_heavy | Random Forest | 77.51% | **27.51%** | ❌ |
| and_only vs and_or_mixed | Random Forest | 74.52% | **24.52%** | ❌ |
| and_only vs negation_heavy | Logistic Regression | 71.60% | **21.60%** | ❌ |
| and_only vs and_or_mixed | Logistic Regression | 64.90% | 14.90% | ❌ |
| negation_heavy vs and_or_mixed | Random Forest | 59.85% | 9.85% | ❌ |

**关键发现**:
- `and_only` 与其他类别高度可区分 (27% advantage)
- Random Forest 比 Logistic Regression 更有效
- Permutation Test 对 and_only vs negation_heavy 显著 (p=0.016)

---

#### 1.2 Predicate Count (predicateCombo) 攻击 ⚠️ **最严重**

**目标类别**: `none`, `single`, `few`, `many` (4类)

**失败案例** (11个 - 全部失败):

| 类别对 | 模型 | 准确率 | Advantage | 状态 |
|--------|------|--------|-----------|------|
| none vs single | Random Forest | **97.85%** | **47.85%** | ❌ |
| none vs few | Random Forest | **97.58%** | **47.58%** | ❌ |
| few vs many | Random Forest | **96.97%** | **46.97%** | ❌ |
| none vs many | Random Forest | **95.83%** | 45.83% | ❌ |
| single vs few | Random Forest | **96.24%** | 46.24% | ❌ |
| single vs many | Random Forest | **90.32%** | 40.32% | ❌ |

**关键发现**:
- 🚨 **极度严重泄露**: Random Forest 可以接近完美地区分所有类别对
- `none` 类别最容易识别 (准确率>97%)
- 所有测试都未通过，包括 Logistic Regression

---

#### 1.3 Set Size (paramType) 攻击 ⚠️ **严重**

**目标类别**: `none`, `small`, `medium`, `large` (4类)

**失败案例** (10个 - 全部失败):

| 类别对 | 模型 | 准确率 | Advantage | 状态 |
|--------|------|--------|-----------|------|
| none vs large | Random Forest | **98.90%** | **48.90%** | ❌ |
| none vs small | Random Forest | **98.89%** | **48.89%** | ❌ |
| none vs medium | Random Forest | **94.56%** | 44.56% | ❌ |
| medium vs large | Random Forest | **86.83%** | 36.83% | ❌ |
| small vs large | Random Forest | **83.64%** | 33.64% | ❌ |

**关键发现**:
- 🚨 **极度严重泄露**: Random Forest 准确率高达 98.9%
- `none` (无白名单) 与其他类别完全可区分
- 即使 medium vs large 也有 36% advantage

---

### 2. 统计假设检验 (Statistical Hypothesis Tests)

#### 2.1 MMD (Maximum Mean Discrepancy) 测试

| 目标 | 状态 | 失败数 |
|------|------|--------|
| structureType | ✅ PASS | 0/3 |
| predicateCombo | ❌ FAIL | 6/6 |
| paramType | ❌ FAIL | 5/6 |

**Predicate Count 的 MMD 失败**:
- none vs single: MMD=**0.1997** (阈值: 0.05)
- single vs few: MMD=**0.1578**
- none vs few: MMD=**0.1137**
- few vs many: MMD=**0.1104**

**Set Size 的 MMD 失败**:
- none vs small: MMD=**0.1714**
- none vs large: MMD=**0.1271**
- none vs medium: MMD=**0.1005**
- small vs medium: MMD=**0.0814**

**结论**: 特征分布在统计上显著不同

---

### 3. 无监督聚类攻击 (Unsupervised Clustering)

#### 3.1 K-Means + Silhouette Score

**所有三个目标都失败**:

**Logic Structure**:
- k=3: Silhouette=**0.4496** (阈值: 0.3) ❌
- k=4: Silhouette=**0.5953** ❌
- k=5: Silhouette=**0.6251** ❌

**Predicate Count** ⚠️ **极度严重**:
- k=2: Silhouette=**0.9976** 🚨 (接近完美聚类!)
- k=3: Silhouette=**0.5363** ❌
- k=4: Silhouette=**0.5711** ❌
- k=5: Silhouette=**0.6030** ❌

**Set Size** ⚠️ **极度严重**:
- k=2: Silhouette=**0.9976** 🚨 (接近完美聚类!)
- k=3: Silhouette=**0.5363** ❌
- k=4: Silhouette=**0.5950** ❌
- k=5: Silhouette=**0.6033** ❌

**关键发现**:
- Silhouette=0.9976 表示策略在特征空间中形成**极度清晰的簇**
- 攻击者无需标签数据即可区分策略类别
- 这是最危险的攻击形式

---

## 🔥 严重性排名

### Top 10 最严重的信息泄露:

1. **[Set Size] none vs large** - Random Forest: **48.90%** advantage
2. **[Set Size] none vs small** - Random Forest: **48.89%** advantage
3. **[Predicate Count] none vs single** - Random Forest: **47.85%** advantage
4. **[Predicate Count] none vs few** - Random Forest: **47.58%** advantage
5. **[Predicate Count] few vs many** - Random Forest: **46.97%** advantage
6. **[Predicate Count] single vs few** - Random Forest: **46.24%** advantage
7. **[Predicate Count] none vs many** - Random Forest: **45.83%** advantage
8. **[Set Size] none vs medium** - Random Forest: **44.56%** advantage
9. **[Predicate Count] single vs many** - Random Forest: **40.32%** advantage
10. **[Set Size] medium vs large** - Random Forest: **36.83%** advantage

---

## 🔍 根本原因分析

### 为什么攻击如此成功？

#### 1. **"none" 类别特征过于独特**

**Predicate Count = none**:
- 策略形式: 仅 `GR` (General Research)
- 无谓词验证 → 无 Merkle 证明
- Gas 消耗极低 → 容易区分

**Set Size = none**:
- whitelistSize = 0
- 无白名单构建开销
- 特征向量明显不同

#### 2. **特征维度信息量过大**

可观测特征包括:
- `commitGasUsed` - Gas 消耗
- `accessGasUsed` - 访问 Gas
- `proofSize` - 证明大小
- `commitLogsCount/Size` - 事件日志
- `blockDifference` - 区块差异

这些特征**直接关联**策略复杂度:
- 谓词越多 → Gas 越高
- 白名单越大 → 证明越大
- 逻辑越复杂 → 计算越多

#### 3. **保护机制不足**

当前实验配置 (120 policies, 3 executions):
- **Gas Padding**: 可能未启用或不足
- **Event Padding**: 未添加虚假事件
- **Path Unification**: 未统一执行路径
- **Batch Pattern**: 可能为 baseline

---

## 💡 改进建议

### 短期措施 (立即可行)

#### 1. **增强 Gas Padding**
```javascript
当前: GAS_PAD_VARIANCE = 0.1  // ±10%
建议: GAS_PAD_VARIANCE = 0.3  // ±30%
```

**理由**: 10% 方差不足以掩盖 none vs many 的巨大差异

#### 2. **启用 Event Padding**
```javascript
executionProtections: {
  event_pad: true,  // 添加虚假事件
  pad_count: 5-10   // 随机数量
}
```

#### 3. **强制 Path Unification**
```javascript
executionProtections: {
  path_unify: true  // 统一所有分支的 Gas 消耗
}
```

---

### 中期措施 (需要重新设计)

#### 4. **分层 Padding 策略**

对不同类别应用不同强度:
```javascript
if (predicateCount === 'none') {
  // 为 none 添加虚拟谓词开销
  gasTarget += PREDICATE_COST * 2;
}
```

#### 5. **固定 Gas Target**

设定固定的 Gas 目标:
```javascript
TARGET_GAS = {
  commit: 500000n,  // 所有策略归一化到此
  access: 1000000n
}
```

#### 6. **Batch Pattern Randomization**
```javascript
batch_pattern: random(['baseline', 'batched', 'staggered'])
```

---

### 长期措施 (架构改进)

#### 7. **Feature Normalization**

在电路层面标准化所有可观测特征:
- Gas 消耗固定
- 证明大小固定
- 事件数量固定

#### 8. **Dummy Operations**

添加无效但消耗 Gas 的操作:
```solidity
for (uint i = 0; i < dummyCount; i++) {
    sha256(abi.encode(i));  // 虚拟计算
}
```

#### 9. **Decoy Policies**

生成"诱饵"策略来混淆分布:
- 为 none 添加假谓词
- 为 small 添加假白名单

---

## 📊 预期效果

### 如果实施所有短期措施:

| 目标 | 当前 Advantage | 预期 Advantage | 改善 |
|------|----------------|----------------|------|
| Predicate Count | 47.85% | < 15% | 69% ↓ |
| Set Size | 48.90% | < 15% | 69% ↓ |
| Logic Structure | 27.51% | < 10% | 64% ↓ |

### 关键指标:

- **Random Forest 准确率**: 从 98% → 60-65%
- **Silhouette Score**: 从 0.99 → < 0.3
- **MMD**: 从 0.20 → < 0.05

---

## ⚠️ 警告

**当前系统不安全**，原因:
1. 攻击者可以**98.9%准确率**识别 Set Size
2. 无监督聚类**几乎完美** (Silhouette=0.9976)
3. **所有目标维度**都存在严重泄露

**不建议在生产环境使用**，除非实施所有建议的改进措施。

---

## 🎓 研究价值

虽然实验失败，但提供了宝贵的洞察:

1. **识别了脆弱点**: none 类别、谓词数量、集合大小
2. **量化了泄露程度**: 准确率、advantage、MMD
3. **验证了攻击模型**: Random Forest、K-Means 都有效
4. **提出了改进方向**: Gas padding、path unification

**下一步**: 实施建议措施后重新评估

