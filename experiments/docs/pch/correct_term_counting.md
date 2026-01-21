# 正确的 Term 计数方式

## 🎯 问题

当前的评估方法存在一个**根本性错误**：

对于包含多个 terms 的策略（如 [DS+RS]），当前只在一个 term 中计数，但实际上**应该在两个 term 中都计数**！

---

## 📊 当前的错误做法

### 当前逻辑（错误）

```
策略: [DS+RS]
当前处理: 选择 DS 作为"主 term"
结果:
  - DS 计数: +1 ✓
  - RS 计数: +0 ✗ (被忽略了！)
```

### 导致的问题

```
实际策略分布:
  [DS+RS] 组合策略: 30 个

当前计数结果:
  DS: +30
  RS: +0  ← 错误！这 30 个策略明明也包含 RS！
```

---

## ✅ 正确的做法

### 应该如何计数

对于评估"攻击者能否推断策略是否包含某个 term"，正确的问题框架是：

**二分类任务**（对每个 term 单独评估）：

```
Term 0 (GR) 的二分类:
  问题: "策略是否包含 GR？"

  标签应该是:
    [GR] 策略 → 包含 GR (正例)
    [DS] 策略 → 不包含 GR (负例)
    [RS] 策略 → 不包含 GR (负例)
    [GR+DS] 策略 → 包含 GR (正例) ✓
    [GR+RS] 策略 → 包含 GR (正例) ✓
    [DS+RS] 策略 → 不包含 GR (负例)
```

### 正确的统计

```
Term 0 (GR) 的出现次数:
  [GR] 单独: 37 个
  [GR+DS]: 30 个  ✓ 包含 GR
  [GR+RS]: 30 个  ✓ 包含 GR
  总计: 97 个

Term 1 (DS) 的出现次数:
  [DS] 单独: 37 个
  [GR+DS]: 30 个  ✓ 包含 DS
  [DS+RS]: 30 个  ✓ 包含 DS
  总计: 97 个

Term 2 (RS) 的出现次数:
  [RS] 单独: 36 个
  [GR+RS]: 30 个  ✓ 包含 RS
  [DS+RS]: 30 个  ✓ 包含 RS
  总计: 96 个

样本总数: 200
Term 总计: 97 + 97 + 96 = 290 个 ✓
```

---

## 🔍 当前 vs 正确 对比

### 当前（错误）的分布

```
Term 0: 97 个样本包含 (48.5%)
Term 1: 67 个样本包含 (33.5%)
Term 2: 36 个样本包含 (18.0%)

问题:
  - Term 2 被严重低估（应该是 96，实际只计了 36）
  - 60 个包含 RS 的样本被忽略了
```

### 正确的分布（应该是）

```
Term 0: 97 个样本包含 (48.5%)
Term 1: 97 个样本包含 (48.5%)
Term 2: 96 个样本包含 (48.0%)

结果:
  - 三个 term 的分布几乎完全均衡！
  - 这才是数据生成器的真实意图
```

---

## 💡 为什么当前的实现是错误的？

### 混淆了两个不同的问题

**问题 A: 多类分类**（当前的错误实现）
```
问题: "策略的主要类型是什么？"
标签: Term 0, Term 1, 或 Term 2 (互斥)

这个问题不适合有多个 terms 的策略！
[DS+RS] 策略既是 DS 类型，也是 RS 类型
```

**问题 B: 二分类（每个 term 独立）**（正确的方法）
```
问题: "策略是否包含 Term X？"
标签: 是 or 否 (对每个 term 单独评估)

这才是正确的隐私评估问题：
  - 攻击者能否推断策略包含 DS？
  - 攻击者能否推断策略包含 RS？
```

---

## 🛠️ 如何修复

### 方案 1: 每个 Term 独立的二分类（推荐）

```python
# 为每个 term 创建独立的二分类任务

# Task 1: 预测策略是否包含 Term 0
y_term0 = [1 if 0 in sample.duoTerms else 0 for sample in data]
# [1, 0, 0, 1, 1, 0, ...]  ← 200 个标签

model_term0 = LogisticRegression()
model_term0.fit(X, y_term0)
# 评估: AUC, Advantage 等

# Task 2: 预测策略是否包含 Term 1
y_term1 = [1 if 1 in sample.duoTerms else 0 for sample in data]
model_term1 = LogisticRegression()
model_term1.fit(X, y_term1)

# Task 3: 预测策略是否包含 Term 2
y_term2 = [1 if 2 in sample.duoTerms else 0 for sample in data]
model_term2 = LogisticRegression()
model_term2.fit(X, y_term2)
```

**优势**：
- ✅ 每个 term 都被正确评估
- ✅ 组合策略不会被忽略
- ✅ 分布自然均衡
- ✅ 符合真实的隐私威胁模型

**统计**：
```
Term 0 二分类:
  正例 (包含 Term 0): 97 个
  负例 (不包含 Term 0): 103 个
  总计: 200 个 ✓

Term 1 二分类:
  正例 (包含 Term 1): 97 个
  负例 (不包含 Term 1): 103 个
  总计: 200 个 ✓

Term 2 二分类:
  正例 (包含 Term 2): 96 个
  负例 (不包含 Term 2): 104 个
  总计: 200 个 ✓
```

### 方案 2: 展开为多个样本（备选）

```python
# 将每个组合策略展开为多个样本
expanded_samples = []

for sample in data:
    for term in sample.duoTerms:
        expanded_samples.append({
            'features': sample.features,
            'duoTerm': term,  # 每个 term 一个样本
            'policyId': sample.policyId
        })

# 结果:
# 110 个单 term 策略 → 110 个样本
# 90 个组合策略 → 180 个样本
# 总计: 290 个样本
```

**注意**：需要在 train/test split 时保持同一策略的样本在同一组。

---

## 📈 修复后的预期结果

### 当前结果（错误的计数）

```
Term 0: AUC 0.6185, Advantage 6.67%
Term 1: AUC 0.3393, Advantage -11.67%
Term 2: AUC 0.6274, Advantage 20%
```

### 修复后可能的结果

使用正确的二分类评估：

```
Term 0 二分类 (是否包含 GR):
  AUC: ~0.60, Advantage: ~5%
  正例: 97, 负例: 103

Term 1 二分类 (是否包含 DS):
  AUC: ~0.55, Advantage: ~3%
  正例: 97, 负例: 103

Term 2 二分类 (是否包含 RS):
  AUC: ~0.58, Advantage: ~4%  ← 不再是 20%！
  正例: 96, 负例: 104
```

**关键变化**：
- Term 2 的样本量从 36 增加到 96（几乎是 3 倍）
- Advantage 可能会从 20% 降低到合理水平
- 三个 term 的评估更加公平和平衡

---

## 🎓 理论依据

### 隐私威胁模型

攻击者的真实目标：

```
"给定一个策略的链上特征（gas, calldata 等），
 我能否推断出这个策略是否包含特定的 DUO term？"
```

这是一个**属性推断攻击**（Attribute Inference Attack），正确的评估方式是：

1. 对每个 term 单独评估
2. 使用二分类模型
3. 标签是"是否包含该 term"，而不是"主要是哪个 term"

### 真实场景

```
场景 1: 保险公司观察到某个策略的交易
  问题: "这个策略是否限制了特定疾病（DS term）？"
  → 需要评估 DS 的二分类 AUC

场景 2: 研究机构想知道数据用途
  问题: "这个策略是否限制了研究类型（RS term）？"
  → 需要评估 RS 的二分类 AUC

对于 [DS+RS] 策略:
  - DS 查询的答案: 是（包含 DS）
  - RS 查询的答案: 是（包含 RS）
  - 两者都应该参与评估！
```

---

## 🔧 代码修改建议

### 修改 `feature_extractor.js`

**当前（错误）**：
```javascript
function prepareClassificationData(features, labelKey) {
  // 只使用单一的 duoTerm 作为标签
  return features.map(f => ({
    x: extractFeatures(f),
    y: f.duoTerm  // ✗ 只使用主 term
  }));
}
```

**修复后（正确）**：
```javascript
function prepareClassificationDataBinary(features, termId) {
  // 为每个 term 创建二分类数据
  return features.map(f => ({
    x: extractFeatures(f),
    y: f.duoTerms.includes(termId) ? 1 : 0  // ✓ 检查是否包含该 term
  }));
}

// 使用示例
const term0_data = prepareClassificationDataBinary(features, 0);
const term1_data = prepareClassificationDataBinary(features, 1);
const term2_data = prepareClassificationDataBinary(features, 2);
```

### 修改 `evaluator.js`

```javascript
function evaluateClassificationTasks(features, config) {
  const results = {};

  // 对每个 term 单独评估
  for (let termId = 0; termId < 3; termId++) {
    const data = prepareClassificationDataBinary(features, termId);
    const [trainData, testData] = splitTrainTest(data, 0.3);

    // 统计正负例
    const positiveCount = testData.filter(d => d.y === 1).length;
    const negativeCount = testData.filter(d => d.y === 0).length;

    // 训练二分类模型
    const model = new LogisticRegression();
    model.fit(trainData.map(d => d.x), trainData.map(d => d.y));

    // 评估
    const predictions = testData.map(d => model.predict(d.x));
    const auc = calculateAUC(testData.map(d => d.y), predictions);
    const advantage = calculateAdvantage(testData.map(d => d.y), predictions);

    results[`term${termId}_binary`] = {
      taskName: `DUO Term ${termId} Presence (Binary)`,
      positiveCount,
      negativeCount,
      totalSamples: testData.length,
      auc,
      advantage,
      passed: auc <= 0.55 && advantage <= 0.05
    };
  }

  return results;
}
```

---

## 📋 行动计划

### 立即修复（推荐）

1. **修改评估代码**
   - 改为每个 term 的二分类评估
   - 使用 `duoTerms` 数组而不是单一的 `duoTerm`

2. **重新运行评估**
   ```bash
   node run_experiment.js --phase 3 --features results/features.json
   ```

3. **对比结果**
   - 旧方法: Term 2 只有 36 个正例
   - 新方法: Term 2 有 96 个正例

4. **验证改进**
   - 检查 Term 2 的 Advantage 是否降低
   - 验证三个 term 的样本分布是否均衡

### 长期改进（可选）

1. **增加样本量**
   - 生成 600 个策略（当前 200 → 600）
   - 每个 term 的正例约 300 个

2. **添加多标签分类评估**
   - 使用 `MultiLabelBinarizer`
   - 同时评估单个和组合 terms

---

## ✅ 总结

### 你的观察是完全正确的！

```
问题: DS+RS 策略应该怎么统计？

正确答案:
  - 在 DS 的计数中: +1 ✓
  - 在 RS 的计数中: +1 ✓
  - 不是只选择一个！

当前的错误:
  - 只在 DS 中计数: +1
  - RS 被忽略: +0 ✗
```

### 核心问题

当前的实现**混淆了多类分类和二分类**：
- 使用了多类分类的框架（每个样本一个标签）
- 但隐私评估需要的是二分类（每个 term 独立评估）

### 解决方案

修改为**每个 term 的独立二分类**：
- Term 0: "策略是否包含 GR？"（200 个样本，97 正 / 103 负）
- Term 1: "策略是否包含 DS？"（200 个样本，97 正 / 103 负）
- Term 2: "策略是否包含 RS？"（200 个样本，96 正 / 104 负）

这样才是正确的隐私评估方法！
