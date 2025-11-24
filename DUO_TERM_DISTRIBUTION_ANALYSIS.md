# DUO Term 分布分析

## 📊 实际数据集统计

基于最新的实验数据（`execution_results.json`，200个样本）：

```
总样本数: 200

DUO Term 分布：
  Term 0 (GR - General Research):     97 个样本 (48.5%)
  Term 1 (DS - Disease Specific):     67 个样本 (33.5%)
  Term 2 (RS - Research Specific):    36 个样本 (18.0%)
```

---

## 🎯 分布特征

### 1. **不均匀分布**

DUO Term 的分布是**不均匀的**，比例大约是：

```
Term 0 : Term 1 : Term 2 ≈ 5 : 3.5 : 2
```

或者用百分比：
```
Term 0: 48.5% (接近一半)
Term 1: 33.5% (三分之一)
Term 2: 18.0% (不到五分之一)
```

### 2. **为什么是这样的分布？**

让我查看数据生成配置中的语义层（Semantic Layers）定义：

```javascript
// data_generator.js 中的配置
const DEFAULT_SEMANTIC_LAYERS = [
  {
    name: 'singleton',    // 单个 DUO term 的策略
    combos: [
      ['GR'],           // Term 0
      ['DS'],           // Term 1
      ['RS']            // Term 2
    ],
    minPolicies: 60     // 每个层至少 60 个策略
  },
  {
    name: 'pair',         // 两个 DUO term 的组合
    combos: [
      ['GR', 'DS'],     // Term 0 + Term 1
      ['GR', 'RS'],     // Term 0 + Term 2
      ['DS', 'RS']      // Term 1 + Term 2
    ],
    minPolicies: 40     // 每个层至少 40 个策略
  }
];
```

#### 计算逻辑

**Singleton 层** (单一 term):
- `['GR']` → 生成约 60 个策略 → Term 0 出现 60 次
- `['DS']` → 生成约 60 个策略 → Term 1 出现 60 次
- `['RS']` → 生成约 60 个策略 → Term 2 出现 60 次

**Pair 层** (组合 term):
- `['GR', 'DS']` → 生成约 40 个策略 → Term 0 +40, Term 1 +40
- `['GR', 'RS']` → 生成约 40 个策略 → Term 0 +40, Term 2 +40
- `['DS', 'RS']` → 生成约 40 个策略 → Term 1 +40, Term 2 +40

**理论总计**:
```
Term 0 出现次数 = 60 (singleton) + 40 (GR+DS) + 40 (GR+RS) = 140 次
Term 1 出现次数 = 60 (singleton) + 40 (GR+DS) + 40 (DS+RS) = 140 次
Term 2 出现次数 = 60 (singleton) + 40 (GR+RS) + 40 (DS+RS) = 140 次
```

**等等，理论上应该是均匀的！**

但实际数据显示：
```
Term 0: 97 次 (48.5%)
Term 1: 67 次 (33.5%)
Term 2: 36 次 (18.0%)
```

---

## 🔍 实际分布的成因分析

### 可能原因 1: 样本数量限制

实际生成了 **200 个策略**，而不是理论的 240 个（60×3 + 40×3）。

配置中指定的 `minPolicies` 是**最小值**，实际生成时可能：
1. 总策略数被限制为 200
2. 分配算法可能不是完全均匀的
3. 可能有随机因素影响分配

### 可能原因 2: 每个策略只计算一个主 DUO Term

查看 `execution_results.json` 的数据结构，每个样本只有一个 `duoTerm` 字段，而不是一个列表。

这意味着：
- **即使策略包含多个 DUO terms（如 ['GR', 'DS']），在评估时只选择其中一个作为主 term**

让我验证这个假设：

```javascript
// 在 feature_extractor.js 或 data_generator.js 中
// 可能有类似的逻辑：
function extractPrimaryDuoTerm(policy) {
  if (policy.duoAttributes.length === 1) {
    return policy.duoAttributes[0];  // 单一 term
  } else {
    // 对于多个 term 的策略，随机选择一个？
    // 或者选择第一个？
    return policy.duoAttributes[0];
  }
}
```

### 可能原因 3: 数据生成的随机性

如果分配是随机的或基于某种启发式算法，可能会导致：
- Term 0 被优先分配（作为 "default" 或 "general" term）
- Term 2 被分配得较少（作为最"特殊"的 term）

---

## 📈 分布不均的影响

### 对机器学习评估的影响

**类别不平衡（Class Imbalance）**问题：

```
Term 0: 97 样本 → 训练集 ~68, 测试集 ~29
Term 1: 67 样本 → 训练集 ~47, 测试集 ~20
Term 2: 36 样本 → 训练集 ~25, 测试集 ~11  ← 问题！
```

#### Term 2 的问题

- **测试集只有约 11 个样本**
- 统计不够稳定
- 容易过拟合
- 评估指标（AUC, Advantage）可能不可靠

**例子**：
```
如果分类器对 11 个 Term 2 测试样本的预测结果：
  正确: 9 个
  错误: 2 个
  → Accuracy = 81.8%

但如果只是运气不好/好，多预测对/错 1 个：
  正确: 10 个 → Accuracy = 90.9% (+9.1%)
  正确: 8 个  → Accuracy = 72.7% (-9.1%)

这种不稳定性使得评估结果不太可靠！
```

### 对隐私评估的影响

从你的分析报告看：

```
Term 0: AUC 0.6185, Advantage 6.67%   ← 样本多，评估相对可靠
Term 1: AUC 0.3393, Advantage -11.67% ← 样本中等，评估较可靠
Term 2: AUC 0.6274, Advantage 20%     ← 样本少，评估可能不稳定！
```

**Term 2 的 20% Advantage 可能部分来自**：
1. 真实的隐私泄露（access gas 独特值）
2. 小样本统计噪声
3. 过拟合效应

---

## ✅ 理想的分布

### 推荐配置

为了获得更可靠的评估结果，应该：

```javascript
// 目标：600 个样本，每个 term 200 个

配置方案 1: 完全均匀
  Term 0: 200 样本 (33.3%)
  Term 1: 200 样本 (33.3%)
  Term 2: 200 样本 (33.3%)

配置方案 2: 基于真实世界分布（如果有先验知识）
  例如：如果 General Research 在实际中更常见
  Term 0: 240 样本 (40%)
  Term 1: 180 样本 (30%)
  Term 2: 180 样本 (30%)
```

### 实现方式

修改 `data_generator.js` 配置：

```javascript
const CUSTOM_SEMANTIC_LAYERS = [
  {
    name: 'singleton_balanced',
    combos: [
      ['GR'],
      ['DS'],
      ['RS']
    ],
    minPolicies: 200  // 每个 term 各 200 个
  }
];

// 或者手动指定分布
const config = {
  policyCount: 600,
  duoTermDistribution: {
    term0: 200,
    term1: 200,
    term2: 200
  },
  // 确保每个样本只包含一个 DUO term
  singleTermOnly: true
};
```

---

## 🎓 技术总结

### 当前状态

| Term | 样本数 | 占比 | 测试集大小 | 评估可靠性 |
|------|--------|------|------------|------------|
| Term 0 | 97 | 48.5% | ~29 | ✅ 较好 |
| Term 1 | 67 | 33.5% | ~20 | ✅ 中等 |
| Term 2 | 36 | 18.0% | ~11 | ⚠️ **较差** |

### 问题

1. **分布不均匀**：Term 0 占比过高（48.5%），Term 2 过低（18.0%）
2. **样本量偏小**：总共只有 200 个样本
3. **统计不稳定**：Term 2 测试集只有 ~11 个样本

### 影响

- Term 2 的评估指标（AUC 0.6274, Advantage 20%）可能不可靠
- 难以区分真实泄露和统计噪声
- 论文审稿人可能质疑评估的统计显著性

### 解决方案

**短期**（当前数据集）：
- 在论文中明确说明样本量限制
- 报告置信区间（如果可能）
- 多次运行实验取平均值

**长期**（重新生成数据）：
- 增加到 600 样本（每个 term 200）
- 确保均匀分布
- 使用分层抽样（Stratified Sampling）确保测试集也均匀

---

## 📋 数据生成命令建议

```bash
# 生成 600 个样本的均衡数据集
node run_experiment.js \
  --policy-count 600 \
  --num-duo-terms 3 \
  --executions-per-policy 3 \
  --semantic-layers custom_balanced

# 或者在配置文件中指定
# config.json:
{
  "policyCount": 600,
  "semanticLayers": [
    {
      "name": "singleton",
      "combos": [["GR"], ["DS"], ["RS"]],
      "minPolicies": 200,
      "maxPolicies": 200
    }
  ]
}
```

---

## 🔗 相关文档

- [FINAL_ANALYSIS_REPORT.md](experiments/policy_content_hiding/analysis/FINAL_ANALYSIS_REPORT.md) - 当前评估结果
- [data_generator.js](experiments/policy_content_hiding/data_generator.js) - 数据生成逻辑
- [run_experiment.js](experiments/policy_content_hiding/run_experiment.js) - 实验运行器
