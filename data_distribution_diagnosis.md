# SPP数据集分布诊断报告

**生成时间**: 2025-12-08
**数据源**: experiments/unified/artifacts_data/spp_dataset.json
**总样本数**: 860 (430 policies × 2 executions)

---

## 一、整体评估

### 🎯 数据质量总分: **2.3/5.0** ⚠️

| 维度 | 评分 | 状态 | 说明 |
|------|------|------|------|
| 类别平衡 | 2.3/5.0 | ⚠️ 需改进 | predicateCombo和paramType不平衡严重 |
| 样本规模 | 5.0/5.0 | ✅ 优秀 | 860样本，430个unique policies |
| 特征多样性 | **1.0/5.0** | 🔴 **极差** | 大部分特征几乎恒定 |
| 数据分离度 | 3.0/5.0 | ⚠️ 中等 | 类别之间有微弱差异 |

**综合诊断**: 🟡 **数据可用，但存在严重的特征单调性问题**

---

## 二、类别分布分析

### 2.1 structureType (逻辑结构) - ⚠️ 中等不平衡

```
and_only          402 (46.7%) ████████████████████    ← 最多类
and_or_mixed      294 (34.2%) ███████████████
negation_heavy    164 (19.1%) ████████                ← 最少类

不平衡比例: 2.45:1 ⚠️
```

**评估**:
- ✅ **可接受**: 2.45:1的不平衡比例在机器学习中属于中等水平
- ⚠️ **建议**: 使用`both`或`oversample`方法可以改善
- 📊 **最小类样本数**: 164 (足够训练)

**交叉分布**: structureType × predicateCombo
```
                   none  single  few   many
and_only            120    152   126      4    ← none只出现在and_only
and_or_mixed          0     18   212     64    ← 偏向few/many
negation_heavy        0     20    92     52    ← 偏向few/many
```

**⚠️ 关键问题**:
- `none` (无谓词) **只存在于** `and_only` 结构
- 这导致 `none vs (single/few/many)` 的攻击实际上是在区分 `and_only` vs 其他结构
- **这是predicateCombo完美分类的根本原因！**

---

### 2.2 predicateCombo (谓词数量) - 🔴 高度不平衡

```
few               430 (50.0%) ██████████████████████  ← 最多类 (占一半)
single            190 (22.1%) ██████████
none              120 (14.0%) ██████                  ← 最少类
many              120 (14.0%) ██████                  ← 最少类

不平衡比例: 3.58:1 ❌
```

**评估**:
- ❌ **严重不平衡**: 3.58:1已经接近"需要重新采样"的阈值
- 🔴 **最大问题**: `few`类占50%，其他类被严重稀释
- 📊 **最小类样本数**: 120 (勉强够用，但平衡后会更少)

**分布偏斜原因**:
```python
# 数据生成配置偏向"few"
semantic_layers = {
    'and_only': mostly generates 'few' predicates
    'and_or_mixed': heavily biased to 'few' (212/294 = 72%)
    'negation_heavy': biased to 'few' (92/164 = 56%)
}
```

---

### 2.3 paramType (参数类型) - 🔴 高度不平衡

```
medium            372 (43.3%) ███████████████████     ← 最多类
large             186 (21.6%) █████████
small             182 (21.2%) █████████
none              120 (14.0%) ██████                  ← 最少类

不平衡比例: 3.10:1 ❌
```

**评估**:
- ❌ **严重不平衡**: 与predicateCombo类似
- 🔴 **问题**: `medium`类占43%，`none`只有14%
- 📊 **最小类样本数**: 120

**交叉分布**: structureType × paramType
```
                   none  small  medium  large
and_only            120    156      84     42    ← none只出现在and_only
and_or_mixed          0     22     180     92    ← 偏向medium
negation_heavy        0      4     108     52    ← 偏向medium
```

**⚠️ 与predicateCombo相同的问题**:
- `none` (无参数) **只存在于** `and_only` 结构
- 这导致 `none vs (small/medium/large)` 变成 `and_only` vs 其他
- **这是paramType高泄漏的结构性原因！**

---

## 三、特征分布分析 🔴 **严重问题**

### 3.1 特征唯一性 - **极差**

| 特征 | 唯一值数量 | 占比 | 评估 |
|------|-----------|------|------|
| commitGasUsed | **5** | 0.6% | 🔴 几乎恒定 |
| accessGasUsed | **56** | 6.5% | 🔴 变化极小 |
| proofSize | **1** | 0.1% | 🔴 完全恒定 |
| commitLogsCount | **1** | 0.1% | 🔴 完全恒定 |
| accessLogsCount | **1** | 0.1% | 🔴 完全恒定 |

**诊断结果**:
- 860个样本中，`commitGasUsed`只有5个不同的值
- `proofSize`, `commitLogsCount`, `accessLogsCount` **完全恒定**
- 只有`accessGasUsed`有56个值（但仍然只占6.5%）

### 3.2 特征变化范围

#### commitGasUsed (Commit阶段Gas消耗)
```
全局范围: [501,325 → 518,494]  (变化3.4%)

按predicateCombo:
  none      : [501,341 → 518,494]
  single    : [501,325 → 501,394]  ← 范围极窄
  few       : [501,325 → 501,394]  ← 范围极窄
  many      : [501,341 → 501,394]  ← 范围极窄
```

**问题**:
- ⚠️ `none`的最大值(518,494)远高于其他类别，这可能是异常
- ⚠️ `single/few/many`的范围只有69 gas，几乎无差异
- 🔴 **根本问题**: Commit阶段的gas消耗被过度padding，几乎抹平了差异

#### accessGasUsed (Access阶段Gas消耗)
```
全局范围: [1,001,451 → 1,001,540]  (变化0.009%)

按predicateCombo:
  none      : [1,001,456 → 1,001,530]  (变化74 gas)
  single    : [1,001,453 → 1,001,532]  (变化79 gas)
  few       : [1,001,451 → 1,001,539]  (变化88 gas)
  many      : [1,001,453 → 1,001,540]  (变化87 gas)
```

**关键发现**:
- ✅ **这是唯一有轻微差异的特征** (56个unique值)
- ⚠️ 但变化范围极小：只有89 gas的差异 (0.009%)
- 🔴 **这就是为什么机器学习模型仍能检测到泄漏**：
  - 虽然差异很小，但它是**系统性的**
  - `none` vs `many` 平均差异约 ~10 gas
  - Random Forest能捕捉到这种微弱但稳定的信号

#### 其他特征 (完全恒定)
```
proofSize        : 2,870 (100%恒定)
commitLogsCount  : 1     (100%恒定)
accessLogsCount  : 2     (100%恒定)
```

**评估**:
- 🔴 这些特征**对分类没有任何贡献**
- 🔴 实际上只有2个特征有用: `commitGasUsed` (5值) 和 `accessGasUsed` (56值)

---

## 四、数据泄漏的根本原因

### 4.1 结构性泄漏 🔴 **最严重**

**问题**: `none` (无谓词/无参数) 只存在于 `and_only` 结构

```
structureType × predicateCombo:
  and_only:        none=120, single=152, few=126, many=4
  and_or_mixed:    none=0,   single=18,  few=212, many=64
  negation_heavy:  none=0,   single=20,  few=92,  many=52
```

**后果**:
1. **攻击者不需要看gas值**，只需要知道"是否有谓词"就能部分推断出结构类型
2. 当攻击者看到 `none`，可以100%确定是 `and_only`
3. 这导致 `none vs (single/few/many)` 的分类实际上是在做 `and_only vs 其他`

**这就是为什么**:
- `none vs single` 的RF达到 **45.83%** advantage
- `none vs few` 的RF达到 **47.22%** advantage
- `none vs many` 的RF达到 **48.61%** advantage

**解决方案**:
```
1. 修改数据生成逻辑，让所有structureType都能生成none
2. 或者：从数据集中移除所有none样本，只测试有谓词的场景
```

### 4.2 特征泄漏 🔴 **严重但可修复**

**问题**: `accessGasUsed` 仍然保留了微弱的系统性差异

虽然padding已经将差异压缩到89 gas (0.009%)，但因为这个差异是**确定性的**（谓词越多，gas越高），机器学习模型（尤其是Random Forest）仍然能检测到。

**证据**:
```
none平均   : 1,001,493 gas
single平均 : 1,001,493 gas
few平均    : 1,001,495 gas    ← 略高
many平均   : 1,001,497 gas    ← 最高

差异: 4 gas (0.0004%)
但这个4 gas是稳定的、可重复的！
```

**Random Forest为什么能检测到**:
```javascript
if (accessGasUsed < 1,001,494) {
    // 大概率是 none 或 single
} else if (accessGasUsed < 1,001,496) {
    // 大概率是 few
} else {
    // 大概率是 many
}
```

**解决方案**:
```solidity
// 当前padding: 固定增加某个值
paddedGas = actualGas + somePadding;

// 建议: 随机化到固定上限
uint256 maxGas = 1,002,000;  // 比最大实际gas高一些
uint256 randomPadding = pseudoRandom(0, maxGas - actualGas);
paddedGas = actualGas + randomPadding;
// 这样所有policy的gas会均匀分布在 [actualGas, maxGas] 范围内
```

### 4.3 特征单调性 🟡 **中等问题**

**问题**: 大部分特征完全恒定，没有提供任何信息

| 特征 | 作用 | 现状 |
|------|------|------|
| commitGasUsed | 可能泄漏结构信息 | ⚠️ 只有5个值 |
| accessGasUsed | 可能泄漏谓词/参数信息 | ⚠️ 只有56个值 |
| proofSize | 应该对所有policy相同 | ✅ 恒定(正确) |
| commitLogsCount | 可能泄漏policy复杂度 | 🔴 恒定(未利用) |
| accessLogsCount | 可能泄漏访问次数 | 🔴 恒定(未利用) |

**建议**:
- commitLogsCount 和 accessLogsCount **应该**随policy复杂度变化
- 如果它们恒定，要么是padding策略太强，要么是没有正确实现日志记录

---

## 五、对攻击结果的解释

### 5.1 为什么predicateCombo泄漏最严重？

**原因1: 结构性泄漏 (主要)**
```
none只存在于and_only → 攻击者可以100%识别none
→ none vs (single/few/many) 变成 and_only vs 其他
→ RF达到45-50% advantage
```

**原因2: accessGasUsed微弱但稳定的差异**
```
谓词数量 → 访问次数 → accessGasUsed稳定增加 4 gas
→ RF能学习到这个模式
→ single vs few也达到50% advantage (完美分类)
```

### 5.2 为什么paramType也泄漏？

**同样的两个原因**:
1. `none` (无参数) 只存在于 `and_only`
2. 参数集合大小/范围影响验证复杂度 → accessGasUsed差异

### 5.3 为什么structureType相对好一些？

**因为**:
- structureType没有"只存在于某一类"的问题
- AND/OR逻辑差异被postfix解释器较好地隐藏了
- 但RF仍能检测到18-27%的advantage，说明仍有微弱泄漏

### 5.4 为什么k=2聚类Silhouette=0.9976？

**可能原因**:
1. **1个极端异常样本**: 某个policy的gas值与其他859个完全不同
2. **二分特征**: 可能是 "has predicates" vs "no predicates" 这种二元特征导致完美分离

**证据**: Cluster sizes = [859, 1] - 确实有1个异常值

---

## 六、数据分布问题总结

### 🔴 严重问题

1. **结构性泄漏** (优先级1):
   - `none` 类只存在于 `and_only` 结构
   - 这是predicateCombo和paramType泄漏的根本原因
   - **影响**: 导致~50%的advantage

2. **特征单调性** (优先级2):
   - commitGasUsed只有5个值 (0.6%)
   - proofSize/logsCount完全恒定
   - **影响**: 模型只能依赖accessGasUsed的微弱信号

3. **accessGasUsed仍有微弱泄漏** (优先级3):
   - 虽然变化只有89 gas (0.009%)
   - 但这是系统性、确定性的差异
   - **影响**: RF能检测到这个稳定模式

### ⚠️ 中等问题

4. **类别不平衡** (优先级4):
   - predicateCombo: 3.58:1
   - paramType: 3.10:1
   - **影响**: 导致LR模型退化

5. **异常值** (优先级5):
   - 存在1个极端异常样本
   - **影响**: k=2聚类完美分离 (Silhouette 0.9976)

---

## 七、改进建议优先级

### 🚨 紧急修复 (必须做)

#### 1. 修复结构性泄漏
```javascript
// 方案A: 让所有结构都能生成none
generateDataset({
    structureTypes: {
        'and_only': { allowNone: true },
        'and_or_mixed': { allowNone: true },  // ← 新增
        'negation_heavy': { allowNone: true }  // ← 新增
    }
});

// 方案B: 移除所有none类别
const filtered = dataset.filter(d =>
    d.predicateCombo !== 'none' && d.paramType !== 'none'
);
// 这样只测试"有谓词/参数"的情况
```

#### 2. 增强accessGasUsed随机化
```solidity
// 当前
paddedGas = actualGas + fixedPadding;

// 改进: 随机化到上限
uint256 maxGas = estimateMaxPossibleGas();
uint256 randomPadding = randomInRange(0, maxGas - actualGas);
paddedGas = actualGas + randomPadding;
```

### 🔧 高优先级修复

#### 3. 移除异常样本
```bash
node -e "
const data = require('./experiments/unified/artifacts_data/spp_dataset.json');
// 找到并移除cluster analysis中的异常值
const filtered = removeOutliers(data);
fs.writeFileSync('spp_dataset_cleaned.json', JSON.stringify(filtered));
"
```

#### 4. 重新平衡数据集
```javascript
// 使用oversample或both方法
// 避免undersample丢失大量数据
npm run experiment:policy:spp:test --balance-method both
```

### 🎯 中优先级改进

#### 5. 增强特征多样性
```solidity
// 添加随机dummy logs
uint dummyLogsCount = random(0, 3);
for (uint i = 0; i < dummyLogsCount; i++) {
    emit DummyLog(randomBytes32());
}
```

#### 6. 重新设计数据生成配置
```json
{
    "predicateCombo": {
        "none": 0.25,    // 从14% → 25%
        "single": 0.25,  // 从22% → 25%
        "few": 0.25,     // 从50% → 25%
        "many": 0.25     // 从14% → 25%
    }
}
```

---

## 八、预期改进效果

### 修复前 (当前)
```
predicateCombo:
  - none vs single: RF 45.83% advantage
  - single vs few:  RF 50.0% advantage (完美)

原因: 结构性泄漏 + accessGasUsed微弱差异
```

### 修复后 (预期)
```
修复1: 结构性泄漏 → advantage降至 10-15%
修复2: accessGasUsed随机化 → advantage降至 5-10%
修复3+4: 移除异常+重平衡 → LR正常工作，整体降至 <5%

最终目标: 所有advantage < 5% ✅
```

---

## 九、行动计划

### 今天 (2-3小时)
- [ ] 修复结构性泄漏（修改数据生成配置）
- [ ] 重新生成860个样本
- [ ] 用`both`方法重新测试

### 本周 (1-2天)
- [ ] 实现accessGasUsed随机化padding
- [ ] 添加dummy logs
- [ ] 移除异常样本
- [ ] 完整实验对比

### 预期结果
```
修复前: 整体FAIL (26个失败，advantage最高50%)
修复后: 整体PASS (失败<5个，advantage < 5%)
```

---

**报告结论**: 你的数据分布存在**严重的结构性泄漏**和**特征单调性问题**。好消息是这些问题都是**可修复的**，且修复后预期能大幅改善攻击抵抗力。建议优先修复结构性泄漏（让all structures都能生成none），这将解决约60-70%的问题。
