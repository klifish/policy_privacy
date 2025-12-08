# 🔬 and_only vs negation_heavy / Logistic Regression 深度分析

**攻击目标**: 区分 `and_only` 和 `negation_heavy` 两种逻辑结构  
**攻击模型**: Logistic Regression (线性分类器)  
**攻击结果**: ❌ 失败 (Advantage = 21.60% > 5%)

---

## 📊 数据集概况

| 指标 | 值 |
|------|-----|
| 总样本数 | 566 |
| 训练集 (70%) | 397 |
| 测试集 (30%) | 169 |
| and_only 样本 | ~121 (71.6%) |
| negation_heavy 样本 | ~48 (28.4%) |
| **类别不平衡比例** | **2.5:1** |

⚠️ **严重问题**: 数据集高度不平衡，多数类占比 > 70%

---

## 🎯 Logistic Regression 性能

### 整体指标

| 指标 | 值 | 状态 |
|------|-----|------|
| **准确率** | **71.60%** | ⚠️ 等于基准 |
| **Advantage** | **21.60%** | ❌ > 5% 阈值 |
| Precision | 0.0000 | ❌ 无法计算 |
| Recall | 0.0000 | ❌ 无法计算 |
| F1 Score | 0.0000 | ❌ 无法计算 |

**基准准确率** (全预测多数类): 71.6%  
**LR 实际准确率**: 71.6%  
**结论**: LR 完全退化为 "全预测多数类" 策略！

---

### 混淆矩阵

```
                  预测: and_only    预测: negation_heavy
实际: and_only           121                   0
实际: negation_heavy      48                   0
```

**详细解读**:
- **TN = 121**: 正确识别为 and_only
- **FP = 0**: and_only 误判为 negation_heavy (无)
- **FN = 48**: negation_heavy 误判为 and_only (全部!)
- **TP = 0**: 正确识别为 negation_heavy (无)

🚨 **关键发现**: 模型**从未预测任何样本为 negation_heavy**！

---

## 🔍 特征权重分析

Logistic Regression 学到的特征重要性 (所有权重都是负值):

| 排名 | 特征 | 权重 | 方向 |
|------|------|------|------|
| 1 | **accessGasUsed** | -3078.21 | → and_only |
| 2 | **commitGasUsed** | -1545.35 | → and_only |
| 3 | proofSize | -8.86 | → and_only |
| 4 | accessCalldataLength | -8.52 | → and_only |
| 5 | commitCalldataLength | -1.22 | → and_only |
| 6 | accessLogsSize | -0.91 | → and_only |
| 7 | commitLogsSize | -0.56 | → and_only |
| 8 | accessLogsCount | -0.006 | → and_only |
| 9 | commitLogsCount | -0.003 | → and_only |
| 10 | blockDifference | -0.003 | → and_only |

### 权重解读

**所有权重都是负值**，这意味着:
- 特征值越大 → 越倾向于预测 and_only (实际应该相反!)
- 模型错误地学习到了反向关系

**理论上应该**:
- `negation_heavy` 策略有更多 NOT 操作
- 应该消耗更多 Gas (accessGasUsed/commitGasUsed 更高)
- 权重应该是**正值**

**实际情况**:
- 权重全为负 → 模型完全倒置
- 结果: 所有样本都被预测为 and_only

---

## 📈 Permutation Test (统计显著性检验)

| 指标 | 值 |
|------|-----|
| 实际准确率 | 78.70% |
| P-value | **0.016** |
| 迭代次数 | 500 |
| 阈值 | 0.05 |
| **结果** | **❌ 显著** |

**解读**:
- P-value = 0.016 < 0.05 → 拒绝零假设
- 模型性能**显著优于随机猜测**
- 即使 LR 退化，仅靠"猜多数类"策略就能获得统计显著的优势

⚠️ **这非常严重**:
- 说明数据集的类别分布本身就泄露了结构信息
- 攻击者无需复杂模型，简单策略即可成功

---

## 🆚 Random Forest 对比

| 指标 | LR | RF | RF 优势 |
|------|----|----|---------|
| 准确率 | 71.60% | **77.51%** | +5.92% |
| Advantage | 21.60% | **27.51%** | +5.92% |
| Precision | 0.0000 | **0.7083** | +70.83% |
| Recall | 0.0000 | **0.3542** | +35.42% |
| F1 Score | 0.0000 | **0.4722** | +47.22% |

### Random Forest 混淆矩阵

```
                  预测: and_only    预测: negation_heavy
实际: and_only           114                   7
实际: negation_heavy      31                  17
```

- **TP = 17**: RF 成功预测了 17 个 negation_heavy 样本 (vs LR 的 0)
- **TN = 114**: 正确识别 and_only
- **FP = 7**: 7 个误报
- **FN = 31**: 31 个漏报

✅ **RF 的优势**:
1. 非线性决策边界
2. 集成学习减少过拟合
3. 自动处理特征交互
4. 对类别不平衡更鲁棒

---

## 🔬 根本原因分析

### 为什么 LR 完全退化？

#### 1. **类别严重不平衡** ⚠️

```
and_only:        71.6% (多数类)
negation_heavy:  28.4% (少数类)
比例:            2.5:1
```

- LR 倾向于优化整体准确率
- 全预测多数类 → 准确率 71.6%
- 尝试平衡预测 → 可能更低 (因为少数类更难)
- 模型选择了 "懒惰" 策略

#### 2. **线性不可分**

```
Logistic Regression 假设:
  P(negation_heavy) = sigmoid(w·x + b)
  
如果特征空间中两类线性不可分:
  → 无法找到好的线性决策边界
  → 退化为全预测多数类
```

#### 3. **特征尺度差异巨大**

观察权重:
- `accessGasUsed`: -3078.21 (巨大)
- `blockDifference`: -0.003 (极小)

差异达到 **10^6 倍**！

没有特征标准化 → LR 性能退化

#### 4. **权重学习错误**

理论上:
- `negation_heavy` 应该有更高的 Gas (更多 NOT 操作)
- 权重应该是**正值**

实际:
- 所有权重都是**负值**
- 模型学反了！

---

## 💡 为什么攻击仍然成功？

虽然 LR 退化，但**攻击仍然成功** (Advantage = 21.6%):

### 攻击成功的逻辑

```
基准准确率 (随机猜测):     50%
全预测多数类准确率:        71.6%
Advantage:                 71.6% - 50% = 21.6%
```

**这意味着**:
- 仅通过**猜测最常见的类别**，攻击者就能获得 21.6% 优势
- 数据集的**类别分布本身**就暴露了策略结构信息
- 不需要机器学习，简单统计即可攻击

### 攻击者策略

```python
def trivial_attack(sample):
    return "and_only"  # 永远猜多数类
    
# 准确率: 71.6%
# Advantage: 21.6%
# 复杂度: O(1)
```

---

## 🛠️ 改进建议

### 短期修复 (数据层面)

#### 1. **平衡数据集**

**当前**:
- and_only: 121 (71.6%)
- negation_heavy: 48 (28.4%)

**目标**:
- and_only: 85 (50%)
- negation_heavy: 85 (50%)

**方法**:
- **过采样** negation_heavy (SMOTE)
- **欠采样** and_only
- 或生成更多 negation_heavy 策略

#### 2. **特征标准化**

```python
from sklearn.preprocessing import StandardScaler

scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)

# 效果: 所有特征均值=0，方差=1
```

#### 3. **类别权重调整**

```python
from sklearn.linear_model import LogisticRegression

lr = LogisticRegression(class_weight='balanced')
# 自动调整权重: w_i = n_samples / (n_classes * n_samples_i)
```

---

### 中期改进 (算法层面)

#### 4. **使用 Random Forest** ✅

已验证有效:
- 准确率从 71.6% → 77.5%
- Recall 从 0% → 35.4%
- 成功预测了 17 个 negation_heavy

#### 5. **集成方法**

```python
from sklearn.ensemble import VotingClassifier

ensemble = VotingClassifier([
    ('lr', LogisticRegression()),
    ('rf', RandomForestClassifier()),
    ('svm', SVC())
])
```

---

### 长期方案 (系统层面)

#### 6. **增加 negation_heavy 策略生成**

修改配置文件:
```json
{
  "name": "negation_heavy",
  "minPolicies": 45,  // 当前
  "maxPolicies": 90   // 建议翻倍
}
```

#### 7. **强化隐私保护**

- **Gas Padding**: ±30% (当前可能只有 ±10%)
- **Event Padding**: 添加虚假事件
- **Path Unification**: 统一 NOT 操作的 Gas 消耗

---

## 📊 预期改进效果

### 如果实施所有短期措施:

| 指标 | 当前 | 预期 | 改善 |
|------|------|------|------|
| LR 准确率 | 71.6% | ~60-65% | 接近随机 |
| LR Advantage | 21.6% | <5% | ✅ 通过 |
| LR Recall | 0% | 30-40% | 大幅提升 |
| 类别比例 | 2.5:1 | 1:1 | 完全平衡 |

---

## ⚠️ 安全警告

### 当前状态

**极度不安全** - 即使最简单的攻击策略也能成功:

```python
# 攻击者代码 (5行)
def attack(observations):
    # 不需要训练模型
    # 不需要特征工程
    # 只需要知道数据集的类别分布
    return "and_only"  # 永远猜多数类

# 成功率: 71.6%
# Advantage: 21.6%
```

### 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| 信息泄露 | 🔴 高 | 策略结构可被识别 |
| 攻击复杂度 | 🟢 低 | 无需机器学习 |
| 检测难度 | 🔴 高 | 被动观察即可 |
| 影响范围 | 🟠 中 | 71.6% 策略受影响 |

---

## 🎓 研究洞察

### 这个案例揭示的问题

1. **类别不平衡是隐私的敌人**
   - 分布本身就泄露信息
   - 不需要复杂攻击即可成功

2. **线性模型的局限性**
   - LR 退化为全预测多数类
   - RF 显著优于 LR (5.92% 提升)

3. **Permutation Test 的重要性**
   - 即使模型退化，P-value 仍显著
   - 说明数据集本身有问题

4. **防御必须多层**
   - 仅靠加密不够
   - 需要平衡数据分布
   - 需要标准化特征

---

## 📝 总结

### 关键要点

1. ❌ **LR 完全退化**: 从未预测任何 negation_heavy
2. ❌ **但攻击仍成功**: 21.6% advantage (仅靠猜多数类)
3. ⚠️ **根本原因**: 类别不平衡 (2.5:1)
4. ✅ **RF 更有效**: 77.5% 准确率，35.4% recall
5. 🔴 **安全风险**: 即使简单攻击也能成功

### 行动建议

**立即执行**:
1. 平衡数据集 (生成更多 negation_heavy)
2. 特征标准化
3. 使用 Random Forest

**优先级**: 🔴 高 - 当前系统不安全

---

## 📚 参考

- 实验报告: `experiments/structure_and_parameter_privacy/results/report.json`
- 配置文件: `experiments/unified/configs/unified_dataset_config_optimized.json`
- 相关代码: `experiments/structure_and_parameter_privacy/attacks.js`

