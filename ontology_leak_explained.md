# Ontology Namespace 模式泄露详解

## 🎯 问题核心

**Ontology Namespace 模式泄露** 是指：虽然 `ontologyNamespace` 字段本身没有直接暴露给区块链观察者，但不同 DUO Term 使用 ontology 的**模式不同**，这种模式差异可以通过**间接的可观察特征**被推断出来。

---

## 📊 数据分布现状

从你的实验数据（200个样本）来看：

```
Term 0 (GENERAL_RESEARCH): 97 个样本
  ├─ null (没有 ontology):  37 样本 (38.1%)  ← 独特！
  ├─ ICD10:                30 样本 (30.9%)
  └─ OBI:                  30 样本 (30.9%)

Term 1 (DISEASE_SPECIFIC): 67 个样本
  └─ ICD10:                67 样本 (100%)    ← 独特！

Term 2 (RESEARCH_SPECIFIC): 36 个样本
  └─ OBI:                  36 样本 (100%)    ← 独特！
```

### 问题在哪？

**每个 Term 都有独特的 ontology 使用模式**：

1. **Term 0 独特性**：只有 Term 0 可以没有 ontology（null）
2. **Term 1 独特性**：Term 1 总是使用 ICD10（疾病分类）
3. **Term 2 独特性**：Term 2 总是使用 OBI（研究本体）

---

## 🔍 攻击者的视角

### 场景 1：攻击者能直接看到 ontologyNamespace 吗？

**不能！**

在你的系统中，`ontologyNamespace` 是隐私数据的一部分，通过零知识证明进行隐藏。攻击者在区块链上看到的只是：
- 交易哈希
- Gas 消耗
- Proof（密文）
- 事件日志
- Calldata 大小

### 场景 2：那为什么还说有"模式泄露"？

**因为 ontologyNamespace 虽然被隐藏了，但它影响了可观察的行为！**

---

## 🔗 间接泄露的机制

### 类比：穿着泄露职业

想象这个场景：
```
你不告诉别人你的职业（职业 = ontologyNamespace）
但是：
  - 医生穿白大褂（gas 消耗高）
  - 程序员穿 T 恤（gas 消耗中）
  - 律师穿西装（gas 消耗低）

虽然你没说职业，但穿着（可观察特征）泄露了信息！
```

### 在你系统中的具体体现

#### 1️⃣ Gas 消耗差异

不同的 ontology 类型在智能合约中的处理逻辑不同：

```solidity
// 伪代码示意
function commitPolicy(proof, ontology) {
  if (ontology == null) {
    // 处理逻辑 A - 消耗 X gas
    // 没有 ontology 验证，gas 较低
  } else if (ontology == "ICD10") {
    // 处理逻辑 B - 消耗 Y gas
    // 验证 ICD10 格式，查询 Merkle tree
  } else if (ontology == "OBI") {
    // 处理逻辑 C - 消耗 Z gas
    // 验证 OBI 格式，查询 Merkle tree
  }
}
```

**结果**：X ≠ Y ≠ Z → Gas 消耗模式不同！

从你的分析报告看到：
```
Term 0 的 commit gas 标准差: 1,728  ← 非常不稳定！
Term 1 的 commit gas 标准差: 18    ← 很稳定
Term 2 的 commit gas 标准差: 20    ← 很稳定
```

这个巨大的差异来自于：
- Term 0 有时没有 ontology（null）→ gas 低
- Term 0 有时有 ontology（ICD10/OBI）→ gas 高
- **方差大** → 容易被识别！

#### 2️⃣ Proof 结构差异

零知识证明的输入不同，proof 可能有微小差异：

```javascript
// 有 ontology 的情况
proof_input = {
  policyData: ...,
  ontologyValue: 123,        // ← 额外输入
  ontologyMerkleProof: [...] // ← 额外证明
}

// 没有 ontology 的情况
proof_input = {
  policyData: ...,
  ontologyValue: 0,          // ← 默认值
  ontologyMerkleProof: []    // ← 空
}
```

虽然 proof 本身是加密的，但：
- Proof 大小可能不同
- Calldata 长度可能不同
- 这些都是**可观察**的！

#### 3️⃣ 统计模式识别

机器学习模型可以学习这些微小差异：

```
训练数据：
  样本 1: gas=501341, calldata=1024, ... → Term 0 (null ontology)
  样本 2: gas=501394, calldata=1056, ... → Term 0 (ICD10)
  样本 3: gas=501394, calldata=1056, ... → Term 1 (ICD10)
  样本 4: gas=501394, calldata=1088, ... → Term 2 (OBI)
  ...

模型学习到的规则：
  IF gas 波动大 AND 有时 calldata 短 → Term 0 概率高
  IF gas 稳定 AND calldata 中等 → Term 1 概率高
  IF gas 稳定 AND calldata 长 → Term 2 概率高
```

---

## 🎲 具体攻击场景

### 攻击策略 1：利用 null ontology

```python
def predict_term(transaction):
    gas = transaction.gas_used

    # 如果这个策略没有 ontology（如何判断？看 gas 低）
    if gas < 501350:  # 经验阈值
        return "Term 0 (置信度: 100%)"  # ← 只有 Term 0 能没有 ontology
    else:
        return "Unknown"
```

**成功率**：对于 37/97 (38.1%) 的 Term 0 样本，攻击者可以 100% 准确识别！

### 攻击策略 2：统计学习

```python
# 收集大量交易数据
training_data = [
    (features=[gas, calldata_len, ...], label=0),  # Term 0
    (features=[gas, calldata_len, ...], label=1),  # Term 1
    ...
]

# 训练分类器
model = LogisticRegression()
model.fit(training_data)

# 对新交易进行预测
new_transaction = extract_features(blockchain_tx)
prediction = model.predict(new_transaction)
# → "这个策略 67.85% 概率是 Term 0"
```

**这就是你的评估实验做的事情！结果：**
- Term 0: AUC = 0.6185（比随机猜测好 12%）
- Term 2: AUC = 0.6274（比随机猜测好 13%）

---

## ❓为什么这是问题？

### 隐私目标

你的系统目标是：**策略内容应该完全隐藏**

即使攻击者观察到所有区块链数据，也不应该能推断出：
- 这是什么类型的 DUO Term？
- 策略是否限制特定疾病？
- 策略是否有研究限制？

### 当前问题

攻击者可以以 **61-63% 的准确率**推断 DUO Term：
- 这泄露了策略的使用场景
- 间接泄露了医疗数据的敏感性
- 可能被用于歧视性决策

**例子**：
```
保险公司观察到某患者的数据访问请求：
  → 推断出是 Term 1 (DISEASE_SPECIFIC)
  → 猜测患者有特定疾病
  → 提高保费或拒绝保险！
```

---

## ✅ 修复方案

### 方案 1：统一 Ontology 分布（推荐）

让每个 Term 都有相似的 ontology 分布：

```javascript
// 当前（有问题）
Term 0: 38% null, 31% ICD10, 31% OBI  ← 独特
Term 1: 100% ICD10                    ← 独特
Term 2: 100% OBI                      ← 独特

// 修复后
Term 0: 33% null, 33% ICD10, 34% OBI
Term 1: 33% null, 33% ICD10, 34% OBI  ← 添加多样性
Term 2: 33% null, 33% ICD10, 34% OBI  ← 添加多样性
```

**实现**：
```javascript
// data_generator.js
function generatePolicy(duoTerm) {
  // 为所有 term 随机选择 ontology
  const ontologies = [null, 'ICD10', 'OBI'];
  const randomOntology = ontologies[Math.floor(Math.random() * 3)];

  return {
    duoTerm,
    ontologyNamespace: randomOntology,
    // ... 如果是 null，添加 dummy ontology data 以保持 proof 大小一致
  };
}
```

### 方案 2：增强 Gas Padding

消除不同 ontology 类型的 gas 差异：

```solidity
function commitPolicy(...) {
  // ... 原有逻辑 ...

  // 根据 ontology 类型补偿性 padding
  if (ontologyNamespace == null) {
    _consumeGas(200);  // 补偿到和 ICD10/OBI 一样的水平
  } else if (ontologyNamespace == "ICD10") {
    _consumeGas(100);
  } else if (ontologyNamespace == "OBI") {
    _consumeGas(150);
  }

  // 最终目标：所有路径消耗相同的 gas
}
```

### 方案 3：Proof 统一化

确保所有 proof 大小相同：

```javascript
// 对于没有 ontology 的情况，添加 dummy data
if (!ontologyNamespace) {
  proof_input.ontologyValue = 0;
  proof_input.ontologyMerkleProof = generateDummyProof();  // ← 假证明，大小与真实证明相同
}
```

---

## 📊 预期改进效果

### 修复前（当前）
```
Term 0: AUC 0.6185, Advantage 6.67%   ⚠️ 泄露
Term 1: AUC 0.3393, Advantage -11.67% ✅ 安全
Term 2: AUC 0.6274, Advantage 20%     🔴 严重泄露
```

### 修复后（预期）
```
Term 0: AUC ~0.52, Advantage ~2-3%    ✅ 安全
Term 1: AUC ~0.50, Advantage ~0%      ✅ 安全
Term 2: AUC ~0.51, Advantage ~1-2%    ✅ 安全
```

**成功标准**：
- AUC ≤ 0.55（接近随机猜测的 0.50）
- Advantage ≤ 5%
- 所有 term 的 gas std < 100

---

## 🎓 关键要点总结

1. **Ontology Namespace 模式泄露** = 虽然 ontologyNamespace 本身被隐藏，但它影响了可观察的链上行为

2. **泄露渠道**：
   - Gas 消耗差异
   - Proof/Calldata 大小差异
   - 统计模式识别

3. **为什么严重**：
   - 可以推断策略类型
   - 间接泄露医疗数据敏感性
   - 违背了隐私保护目标

4. **修复思路**：
   - 统一所有 term 的 ontology 分布
   - 或消除不同 ontology 的可观察差异
   - 目标：让所有策略的链上行为"看起来一样"

5. **类比记忆**：
   ```
   隐藏职业 ≈ 隐藏 ontologyNamespace
   但穿着不同 ≈ gas/proof 差异
   → 虽然没说，但能推断出来！
   ```

---

## 🔗 相关文档

- [PRIVACY_LEAK_ANALYSIS.md](experiments/policy_content_hiding/analysis/PRIVACY_LEAK_ANALYSIS.md) - 详细的泄露分析
- [FINAL_ANALYSIS_REPORT.md](experiments/policy_content_hiding/analysis/FINAL_ANALYSIS_REPORT.md) - 完整的实验结果
- [analyze_term2_leak.js](experiments/policy_content_hiding/analysis/analyze_term2_leak.js) - Term 2 泄露分析脚本
