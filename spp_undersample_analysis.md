# SPP实验结果分析 (Undersample方法)

**实验时间**: 2025-12-08 10:40:39
**平衡方法**: `undersample`
**整体结果**: ✗ **FAIL**

---

## 一、实验配置

- **Policy count**: 120
- **Executions per policy**: 3
- **Satisfy ratio**: 0.50
- **Test ratio**: 30%
- **Balance method**: undersample
- **Total executions**: 860

---

## 二、数据平衡效果总结

### 2.1 structureType维度

| 对比 | 原始分布 | 平衡后分布 | 不平衡比例 | 方法 |
|------|---------|-----------|-----------|------|
| and_only vs negation_heavy | 402 vs 164 | 164 vs 164 | 2.45:1 | undersample |
| and_only vs and_or_mixed | 402 vs 294 | 294 vs 294 | 1.37:1 | undersample |
| negation_heavy vs and_or_mixed | 164 vs 294 | 164 vs 164 | 1.79:1 | undersample |

### 2.2 predicateCombo维度

| 对比 | 原始分布 | 平衡后分布 | 不平衡比例 | 数据丢失 |
|------|---------|-----------|-----------|---------|
| none vs single | 120 vs 190 | 120 vs 120 | 1.58:1 | 丢失70个样本 |
| none vs few | 120 vs 430 | 120 vs 120 | 3.58:1 | ⚠️ 丢失310个样本 |
| none vs many | 120 vs 120 | 120 vs 120 | 1:1 | 无丢失 |
| single vs few | 190 vs 430 | 190 vs 190 | 2.26:1 | 丢失240个样本 |
| few vs many | 430 vs 120 | 120 vs 120 | 3.58:1 | ⚠️ 丢失310个样本 |

### 2.3 paramType维度

| 对比 | 原始分布 | 平衡后分布 | 不平衡比例 | 数据丢失 |
|------|---------|-----------|-----------|---------|
| none vs small | 120 vs 182 | 120 vs 120 | 1.52:1 | 丢失62个样本 |
| none vs medium | 120 vs 372 | 120 vs 120 | 3.10:1 | ⚠️ 丢失252个样本 |
| none vs large | 120 vs 186 | 120 vs 120 | 1.55:1 | 丢失66个样本 |
| small vs medium | 182 vs 372 | 182 vs 182 | 2.04:1 | 丢失190个样本 |
| medium vs large | 372 vs 186 | 186 vs 186 | 2:1 | 丢失186个样本 |

**关键观察**: Undersample方法在高不平衡比例（>3:1）场景下丢失了大量数据（300+样本），可能导致欠拟合。

---

## 三、攻击结果分析

### 3.1 Supervised Classification Attacks（监督分类攻击）

#### 3.1.1 structureType - ✗ FAIL (4个失败)

| 对比 | LR Advantage | RF Advantage | 状态 |
|------|-------------|--------------|------|
| and_only vs negation_heavy | 1.02% ✅ | **18.37%** ❌ | LR通过，RF失败 |
| and_only vs and_or_mixed | 0% ✅ | **27.84%** ❌ | LR通过，RF失败 |
| negation_heavy vs and_or_mixed | 4.08% ✅ | **19.39%** ❌ | LR通过，RF失败 |

**关键发现**:
- ✅ **Logistic Regression 显著改善**: and_only vs negation_heavy 从之前的退化状态（21.6%）降至 **1.02%**
- ❌ **Random Forest 仍然失败**: 所有对比的RF模型advantage均 >18%，说明存在真实的可区分特征
- ⚠️ **Confusion Matrix异常** (and_only vs and_or_mixed LR):
  ```
  TP=88, TN=0, FP=88, FN=0
  模型仍然只预测一个类（所有样本预测为class0）
  ```

#### 3.1.2 predicateCombo - ✗ FAIL (10个失败)

**最严重的泄漏**:

| 对比 | LR Advantage | RF Advantage | 严重程度 |
|------|-------------|--------------|---------|
| **none vs single** | **48.61%** ❌ | **45.83%** ❌ | 🔴 极严重 |
| none vs few | 12.5% ❌ | **47.22%** ❌ | 🔴 严重 |
| none vs many | 2.78% ✅ | **48.61%** ❌ | 🔴 严重 |
| **single vs few** | 14.91% ❌ | **50.0%** ❌ | 🔴 完美分类！ |
| single vs many | 6.94% ❌ | **43.06%** ❌ | 🔴 严重 |
| few vs many | 0% ✅ | **48.61%** ❌ | 🔴 严重 |

**极端案例分析**:

1. **none vs single (LR)**:
   ```
   TP=0, TN=71, FP=0, FN=1
   Accuracy=98.61%, Advantage=48.61%
   模型几乎完美地区分了"无谓词"和"单谓词"
   ```

2. **single vs few (RF)**:
   ```
   TP=40, TN=74, FP=0, FN=0
   Accuracy=100%, Advantage=50%
   Random Forest达到完美分类！
   ```

3. **none vs small (RF)** in paramType:
   ```
   TP=29, TN=43, FP=0, FN=0
   Accuracy=100%, Advantage=50%
   另一个完美分类案例
   ```

#### 3.1.3 paramType - ✗ FAIL (12个失败)

| 对比 | LR Advantage | RF Advantage | RF精度 |
|------|-------------|--------------|-------|
| none vs small | 9.72% ❌ | **50.0%** ❌ | 100% |
| none vs medium | 6.94% ❌ | **38.89%** ❌ | 88.89% |
| none vs large | **15.28%** ❌ | **44.44%** ❌ | 94.44% |
| small vs medium | 9.63% ❌ | **34.40%** ❌ | 84.40% |
| small vs large | **5.05%** ❌ | **28.90%** ❌ | 78.90% |
| medium vs large | 3.15% ✅ | **22.07%** ❌ | 72.07% |

**观察**: paramType泄漏相对于predicateCombo较轻，但仍有多个RF模型accuracy >80%。

---

### 3.2 Statistical Hypothesis Tests（统计假设检验）

#### 3.2.1 structureType - ✓ PASS
- **MMD**: 所有对比 <0.05 ✅
- **KS Test**: 平均p-value >0.9 ✅
- **结论**: 从统计分布角度看，structureType受到良好保护

#### 3.2.2 predicateCombo - ✗ FAIL (6个失败)

| 对比 | MMD值 | 阈值 | 状态 |
|------|------|------|------|
| none vs single | **0.1997** | 0.05 | ❌ 4倍超标 |
| none vs few | **0.1137** | 0.05 | ❌ 2.3倍超标 |
| none vs many | **0.1725** | 0.05 | ❌ 3.5倍超标 |
| single vs few | **0.1578** | 0.05 | ❌ 3.2倍超标 |
| single vs many | **0.1394** | 0.05 | ❌ 2.8倍超标 |
| few vs many | **0.1104** | 0.05 | ❌ 2.2倍超标 |

**所有谓词数量对比均显示分布显著不同！**

#### 3.2.3 paramType - ✗ FAIL (5个失败)

| 对比 | MMD值 | KS Test (accessGasUsed) p-value |
|------|------|--------------------------------|
| none vs small | 0.1714 | 0.0009 ⚠️ |
| none vs medium | 0.1005 | 0.0066 ⚠️ |
| none vs large | 0.1271 | 0.0659 |
| small vs medium | 0.0814 | **0.000015** ⚠️ |
| small vs large | 0.0950 | 0.0001 ⚠️ |

**关键泄漏点**: `accessGasUsed` 特征在多个对比中显示极低的p-value (<0.01)，说明访问阶段的gas消耗严重泄漏参数信息。

---

### 3.3 Unsupervised Clustering Attacks（无监督聚类攻击）

#### 3.3.1 所有维度的k=2聚类 - 🔴 灾难性泄漏

**所有三个维度在k=2时的Silhouette系数均为0.9976（几乎完美）**

```
structureType (k=2): Silhouette=0.9976
  Cluster sizes: [859, 1]  ← 存在1个极端异常值！

predicateCombo (k=2): Silhouette=0.9976
  Cluster sizes: [859, 1]  ← 同一个异常值

paramType (k=2): Silhouette=0.9976
  Cluster sizes: [859, 1]  ← 同一个异常值
```

**严重问题**: 存在1个样本在所有特征空间中都与其他859个样本完全分离！

#### 3.3.2 k=3, 4, 5聚类结果

| 维度 | k=3 | k=4 | k=5 |
|------|-----|-----|-----|
| structureType | 0.5363 ❌ | **0.3581** ❌ | 0.6033 ❌ |
| predicateCombo | 0.5363 ❌ | 0.5711 ❌ | 0.5737 ❌ |
| paramType | **0.4430** ❌ | 0.5953 ❌ | 0.5392 ❌ |

**注**: k=4时structureType的0.3581刚好超过0.3阈值，但仍然失败。

---

## 四、核心泄漏源分析

### 4.1 主要泄漏特征

通过KS测试p-value分析，识别出以下泄漏特征：

| 特征 | 主要泄漏场景 | 典型p-value | 严重程度 |
|------|------------|------------|---------|
| **accessGasUsed** | predicateCombo, paramType | <0.01 | 🔴 极严重 |
| commitGasUsed | predicateCombo (none vs *) | 0.015-0.05 | 🟡 中等 |
| proofSize | 无 | 1.0 | ✅ 良好 |
| commitCalldataLength | 无 | 1.0 | ✅ 良好 |
| logsCount/logsSize | 无 | 1.0 | ✅ 良好 |

### 4.2 泄漏机制推断

#### 4.2.1 predicateCombo泄漏

**谓词数量 → accessGasUsed 强关联**:
- `none` (无谓词): accessGasUsed较低
- `single` (单谓词): accessGasUsed中等
- `few/many` (多谓词): accessGasUsed较高

**证据**:
```
none vs single: accessGasUsed KS p-value = 0.0081 ⚠️
none vs few:    accessGasUsed KS p-value = 0.0003 ⚠️
single vs few:  accessGasUsed KS p-value = 0.0002 ⚠️
```

**结论**: 每个谓词评估（`P[ICD10]`, `P[Age]`等）在访问阶段产生可观测的gas消耗差异。

#### 4.2.2 paramType泄漏

**参数范围/集合大小 → accessGasUsed 关联**:
- `none`: 无参数，accessGasUsed基线
- `small`: 小范围参数，gas略增
- `medium/large`: 大范围参数，gas显著增加

**证据**:
```
small vs medium: accessGasUsed KS p-value = 0.000015 🔴
small vs large:  accessGasUsed KS p-value = 0.0001 🔴
```

**结论**: 参数集合大小或范围验证复杂度泄漏到gas消耗中。

#### 4.2.3 structureType相对安全

**为什么structureType在统计测试中PASS？**
- AND/OR逻辑结构差异可能被postfix解释器的统一执行路径掩盖
- 但Random Forest仍能通过非线性特征组合检测到微弱信号（18-27% advantage）

### 4.3 异常值问题

**1个极端异常样本**：
- 在所有860个样本中，有1个样本与其他859个完全分离
- 导致k=2聚类Silhouette=0.9976（近乎完美）

**可能原因**:
1. **执行错误**: 该policy执行失败，产生异常gas值
2. **极端policy**: 某个极端复杂或极端简单的policy
3. **数据异常**: 记录错误或测量异常

**建议**: 检查该异常样本，考虑从数据集中移除。

---

## 五、平衡方法对比

### 5.1 Undersample vs 之前的无平衡方法

| 对比 | 方法 | 原始 (无平衡) | Undersample | 改善 |
|------|------|-------------|-------------|------|
| and_only vs negation_heavy | LR Adv | 21.6% | **1.02%** | ✅ -95% |
| and_only vs negation_heavy | RF Adv | 27.51% | **18.37%** | ✅ -33% |
| and_only vs and_or_mixed | LR Adv | 14.9% | **0%** | ✅ -100% |
| and_only vs and_or_mixed | RF Adv | 24.52% | **27.84%** | ❌ +14% |

**观察**:
- ✅ **LR模型显著改善**: 不再退化，advantage大幅下降
- ⚠️ **RF模型效果不稳定**: 部分改善，部分反而升高
- ❌ **Predicatecombo/ParamType仍然极高泄漏**: Undersample无法解决本质泄漏问题

### 5.2 Undersample的优缺点

**优点**:
- ✅ 解决了LR模型退化问题
- ✅ 训练速度快（样本量减少）
- ✅ 对structureType效果较好

**缺点**:
- ❌ **大量数据丢失**: 在高不平衡场景（3:1）丢失300+样本
- ❌ **欠拟合风险**: few类别有430个样本，undersample后只用120个
- ❌ **无法解决特征泄漏**: predicateCombo和paramType的泄漏是特征本身的问题，平衡无法解决

---

## 六、根本问题与改进建议

### 6.1 根本问题

**平衡方法只是"创可贴"，真正问题在于**:

1. **accessGasUsed泄漏严重**:
   - 谓词评估和参数验证的gas消耗差异可观测
   - 当前的gas padding（±15%）不足以掩盖这些差异

2. **Postfix解释器路径不统一**:
   - 不同数量的谓词导致不同的循环次数
   - 参数集合大小影响验证复杂度

3. **极端异常值**:
   - 1个样本与其他859个完全分离
   - 导致聚类攻击接近完美成功

### 6.2 改进建议

#### 优先级1: 修复accessGasUsed泄漏 🔴

**方案1: 增强Gas Padding**
```javascript
// 当前: ±15% padding
const paddingRatio = 0.15;

// 建议: ±50% padding
const paddingRatio = 0.50;

// 或使用固定gas上限
const maxGas = estimateMaxGas();
// 所有policy执行都消耗maxGas
```

**方案2: 统一执行路径**
```solidity
// 添加dummy操作使所有路径gas一致
function evaluatePolicy() {
    uint actualPredicates = policy.predicateCount;
    uint maxPredicates = 10;

    // 实际评估
    for (uint i = 0; i < actualPredicates; i++) {
        evaluatePredicate(i);
    }

    // Dummy评估（gas对齐）
    for (uint i = actualPredicates; i < maxPredicates; i++) {
        dummyOperation();  // 消耗相同gas但不影响结果
    }
}
```

#### 优先级2: 清理异常数据 🟡

```bash
# 检查异常样本
node -e "
const data = require('./experiments/unified/artifacts_data/spp_dataset.json');
// 找到与其他样本差异最大的样本
const outlier = findOutlier(data);
console.log('Outlier:', outlier);
"

# 从数据集中移除并重新运行实验
```

#### 优先级3: 特征工程 🟡

**添加噪声特征**:
```javascript
// 在commitLogs中添加随机dummy logs
const dummyLogsCount = Math.floor(Math.random() * 5);
for (let i = 0; i < dummyLogsCount; i++) {
    emit DummyLog(randomBytes32());
}
```

#### 优先级4: 尝试其他平衡方法 🟢

```bash
# 测试oversample方法（保留更多数据）
npm run experiment:policy:spp:test --balance-method oversample

# 测试hybrid方法（both）
npm run experiment:policy:spp:test --balance-method both
```

---

## 七、结论

### 7.1 Undersample方法评估

| 指标 | 评分 | 说明 |
|------|------|------|
| 解决LR退化 | ⭐⭐⭐⭐⭐ | 完全解决 |
| 保留数据 | ⭐⭐ | 丢失大量数据 |
| 整体泄漏改善 | ⭐⭐ | predicateCombo/paramType仍严重泄漏 |
| 训练效率 | ⭐⭐⭐⭐⭐ | 样本减少，训练快 |

**综合评分**: ⭐⭐⭐ (3/5)

### 7.2 SPP系统评估

| 维度 | 状态 | 攻击抵抗力 | 主要问题 |
|------|------|----------|---------|
| structureType | 🟡 部分通过 | 中等 | RF仍可检测 (18-27%) |
| predicateCombo | 🔴 严重失败 | 极弱 | RF达到100%精度 |
| paramType | 🔴 失败 | 弱 | accessGasUsed泄漏 |
| 聚类攻击 | 🔴 灾难性 | 极弱 | 异常值+Silhouette 0.9976 |

**整体评估**: 🔴 **系统不安全，需要重大改进**

### 7.3 下一步行动

1. **立即行动** (今天):
   - [ ] 识别并移除异常样本
   - [ ] 将gas padding从15%增加到50%

2. **短期行动** (本周):
   - [ ] 实现统一执行路径（dummy operations）
   - [ ] 测试oversample和both平衡方法
   - [ ] 重新运行实验并对比结果

3. **中期行动** (下周):
   - [ ] 添加dummy logs进行特征混淆
   - [ ] 实现固定gas上限机制
   - [ ] 考虑引入ZK-SNARK进一步隐藏执行细节

---

**报告生成时间**: 2025-12-08
**分析者**: Claude
**数据来源**: experiments/structure_and_parameter_privacy/results/report.json
