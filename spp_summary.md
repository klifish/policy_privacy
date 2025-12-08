# SPP (Structure & Parameter Privacy) 数据集统计报告

**数据集**: `experiments/unified/artifacts_data/executed_dataset.json`  
**生成时间**: 2025年  
**总策略数**: 430  
**总执行记录数**: 860 (每个策略执行2次)

---

## 📊 五维度分布统计

### 1. Logic Structure (逻辑结构)
| 类别 | 数量 | 占比 | 平衡指标 |
|------|------|------|----------|
| **and_only** | 201 | 46.7% | 最多 |
| **and_or_mixed** | 147 | 34.2% | 中等 |
| **negation_heavy** | 82 | 19.1% | 最少 |

**平衡度**: min/max=0.408 ✅, CV=0.339 ✅

### 2. Nesting Depth (嵌套深度)
| 类别 | 数量 | 占比 | 说明 |
|------|------|------|------|
| **shallow** (depth=2) | 190 | 44.2% | 最多 |
| **flat** (depth≤1) | 130 | 30.2% | 中等 |
| **deep** (depth≥4) | 60 | 14.0% | 较少 |
| **medium** (depth=3) | 50 | 11.6% | 最少 |

**平衡度**: min/max=0.263 ✅, CV=0.528 ⚠️ (接近阈值0.65)

### 3. Predicate Count (谓词数量)
| 类别 | 数量 | 占比 | 说明 |
|------|------|------|------|
| **few** (2-3个) | 215 | 50.0% | 最多 |
| **single** (1个) | 95 | 22.1% | 中等 |
| **none** (0个) | 60 | 14.0% | 较少 |
| **many** (4+个) | 60 | 14.0% | 较少 |

**平衡度**: min/max=0.279 ✅, CV=0.592 ⚠️ (接近阈值)

### 4. Set Size (集合大小)
| 类别 | 数量 | 占比 | 白名单大小 |
|------|------|------|------------|
| **medium** | 186 | 43.3% | 5-16元素 |
| **large** | 93 | 21.6% | 17+元素 |
| **small** | 91 | 21.2% | 1-4元素 |
| **none** | 60 | 14.0% | 0元素 |

**平衡度**: min/max=0.323 ✅, CV=0.439 ✅

### 5. Range Width (范围宽度)
| 类别 | 数量 | 占比 | 说明 |
|------|------|------|------|
| **none** | 430 | 100% | 所有策略无范围谓词 |

**平衡度**: min/max=1.000 ✅, CV=0.000 ✅

⚠️ **注意**: 当前数据集未包含范围谓词（RANGE/AGE/VALUE），此维度退化。

---

## 🔗 交叉维度分析

### Logic Structure × Predicate Count (Top 10)
```
and_or_mixed × few        106策略  (混合逻辑 + 2-3谓词)
and_only × single          76策略  (纯AND + 1谓词)
and_only × few             63策略  (纯AND + 2-3谓词)
and_only × none            60策略  (纯AND + 0谓词)
negation_heavy × few       46策略  (高否定 + 2-3谓词)
and_or_mixed × many        32策略  (混合逻辑 + 4+谓词)
negation_heavy × many      26策略  (高否定 + 4+谓词)
```

### Nesting Depth × Predicate Count
```
shallow × few             165策略  (深度2 + 2-3谓词) - 最常见组合
flat × single              70策略  (深度≤1 + 1谓词)
flat × none                60策略  (深度≤1 + 0谓词) - 基线策略
deep × many                60策略  (深度≥4 + 4+谓词) - 最复杂
```

### Set Size × Predicate Count
```
medium × few              162策略  (中等集合 + 2-3谓词)
small × single             72策略  (小集合 + 1谓词)
none × none                60策略  (无集合 + 0谓词) - GR基线
large × many               59策略  (大集合 + 4+谓词)
```

---

## 📌 DUO术语分布

| DUO编号 | 名称 | 策略数 | 占比 |
|---------|------|--------|------|
| 1 | Disease Specific (DS) | 176 | 40.9% |
| 2 | Research Specific (RS) | 171 | 39.8% |
| 5 | Clinical Care (CC) | 164 | 38.1% |
| 3 | Population Ancestry (POA) | 144 | 33.5% |
| 4 | Geographical Restriction (GS) | 142 | 33.0% |
| 0 | General Research (GR) | 113 | 26.3% |

**说明**: 
- 策略总数 > DUO总数是因为多数策略包含多个DUO术语组合
- DS、RS、CC是最常用的谓词类型（ontology-linked）
- GR常作为基础属性与其他术语组合

---

## 🔍 典型策略样例

### 1. and_only + flat + none
```
策略ID: flat_singleton-0
DUO术语: GR (General Research)
逻辑表达式: GR
维度: depth=flat, pred=none, set=none, range=none
```
**说明**: 最简单的策略，仅包含GR属性，无谓词，无嵌套。

### 2. negation_heavy + shallow + single
```
策略ID: dual_mixed_medium-130
DUO术语: GR, DS
逻辑表达式: !(!GR | (DS & P[ICD10]))
维度: depth=shallow, pred=single, set=medium, range=none
```
**说明**: 双重否定结构，包含1个ICD10谓词。

### 3. and_or_mixed + shallow + few
```
策略ID: dual_mixed_medium-132
DUO术语: DS, RS
逻辑表达式: ((DS & P[ICD10]) | (RS & P[OBI]))
维度: depth=shallow, pred=few, set=medium, range=none
```
**说明**: 混合AND/OR逻辑，包含2个ontology谓词。

---

## ✅ 验证结果

### SPP要求 (experiments/unified/configs/unified_dataset_config_optimized.json)
- ✅ minPoliciesPerCategory: 15 → 最小50 > 15
- ✅ minMaxRatio: 0.25 → 最低0.263 > 0.25
- ⚠️ maxCV: 0.65 → 最高0.592 < 0.65 (接近阈值)

### 潜在改进建议
1. **Range Width维度**: 当前100%为none，建议添加包含RANGE/AGE谓词的策略层
2. **Nesting Depth平衡**: medium类别(50)较少，可增加depth=3的策略生成
3. **Predicate Count平衡**: many类别(60)与few(215)差距大，可增加4-5谓词组合

---

## 📈 结论

当前数据集在**5个维度中的4个**达到良好平衡：
- ✅ Logic Structure (CV=0.339)
- ✅ Set Size (CV=0.439)
- ⚠️ Nesting Depth (CV=0.528, 接近阈值)
- ⚠️ Predicate Count (CV=0.592, 接近阈值)
- ❌ Range Width (未激活)

**总体质量**: 符合SPP实验要求，但Range Width维度需要补充数据。
