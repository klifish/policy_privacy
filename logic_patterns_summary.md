# Logic Normalized 表达式模式分析

基于 `experiments/unified/artifacts_data/executed_dataset.json` 中 430 个策略的分析

---

## 📝 按 Logic Structure 分类

### 1. `and_only` (201策略, 46.7%)
**特征**: 只使用 AND 连接符，无 OR，NOT 少于2个

**典型样例**:
```
最简单:
GR

单谓词:
(DS & P[ICD10])
(RS & P[OBI])
(POA & P[HANCESTRO])

双谓词:
((RS & P[OBI]) & (GS & P[ISO3166]))
((DS & P[ICD10]) & (POA & P[HANCESTRO]))
```

**说明**: 
- 最多的类别，包含所有 `flat_singleton` 层的基线策略
- 逻辑最简单，适合测试基础功能

---

### 2. `and_or_mixed` (147策略, 34.2%)
**特征**: 同时包含 AND 和 OR 连接符，NOT < 2

**典型样例**:
```
双谓词 OR:
((DS & P[ICD10]) | (RS & P[OBI]))
((POA & P[HANCESTRO]) | (DS & P[ICD10]))

双谓词 AND + OR:
((RS & P[OBI]) & (GS & P[ISO3166]))

包含单个 NOT:
((POA & P[HANCESTRO]) | !(GS & P[ISO3166]))
((GR | !(GS & P[ISO3166])) & (RS & P[OBI]))

4谓词复杂组合:
((((RS & P[OBI]) | (CC & P[SNOMED])) & !(POA & P[HANCESTRO])) & (DS & P[ICD10]))
```

**说明**: 
- 第二大类别，代表现实中常见的混合逻辑
- 可以有1个 NOT，但不超过2个（否则归为 negation_heavy）

---

### 3. `negation_heavy` (82策略, 19.1%)
**特征**: 包含 ≥2 个 NOT 操作符

**典型样例**:
```
双重否定 (常见模式):
!(!GR | (DS & P[ICD10]))        // 德摩根定律: GR & !(DS & P[ICD10])
!(!GR & (RS & P[OBI]))          // 德摩根定律: GR | !(RS & P[OBI])

嵌套否定:
!((CC & P[SNOMED]) | !(DS & P[ICD10]))

三重否定 (medium depth):
!(!(!GR | !(RS & P[OBI])) | !(DS & P[ICD10]))

复杂否定 (deep nesting, 4 predicates):
!((((RS & P[OBI]) & !(DS & P[ICD10])) | (POA & P[HANCESTRO])) & (GS & P[ISO3166]))
((!((CC & P[SNOMED]) | (GS & P[ISO3166])) & !(DS & P[ICD10])) & !(RS & P[OBI]))
```

**说明**: 
- 最少的类别，但对隐私保护很重要
- 否定结构增加电路复杂度和 gas 消耗
- 双重否定可能由配置中的 `groupNotProbability` 参数生成

---

### 4. `or_only` (0策略, 0%)
**观察**: ⚠️ 当前数据集中**没有纯 OR 策略**

**原因分析**:
查看配置文件 `unified_dataset_config_optimized.json`:
- `or_only` 层 (行208-255) 定义了纯OR逻辑
- 但可能在验证时被过滤掉或生成失败
- OR 谓词需要与属性配对: `(DS & P[ICD10]) | (RS & P[OBI])`

---

## 🏗️ 按 Nesting Depth 分类

### 1. `flat` (130策略, 30.2%)
**特征**: maxDepth ≤ 1，无嵌套或单层括号

**典型样例**:
```
无括号:
GR

单层括号:
(DS & P[ICD10])
(RS & P[OBI])
```

**说明**: 所有基线策略都是 flat

---

### 2. `shallow` (190策略, 44.2%)
**特征**: maxDepth = 2，两层嵌套

**典型样例**:
```
标准双层:
!(!GR | (DS & P[ICD10]))
((DS & P[ICD10]) | (RS & P[OBI]))
((POA & P[HANCESTRO]) | !(GS & P[ISO3166]))
```

**说明**: **最常见的深度**，代表大多数实际策略

---

### 3. `medium` (50策略, 11.6%)
**特征**: maxDepth = 3，三层嵌套

**典型样例**:
```
三层嵌套:
!(!(!GR | !(RS & P[OBI])) | !(DS & P[ICD10]))
(((POA & P[HANCESTRO]) | !(DS & P[ICD10])) & !GR)
((GR | !(GS & P[ISO3166])) & (RS & P[OBI]))
```

**说明**: 
- 最少的类别（仅50个）
- 配置中 `medium_nesting_focused` 层专门针对这个深度

---

### 4. `deep` (60策略, 14.0%)
**特征**: maxDepth ≥ 4，四层或更深

**典型样例**:
```
4层嵌套 + 4谓词:
!((((RS & P[OBI]) & !(DS & P[ICD10])) | (POA & P[HANCESTRO])) & (GS & P[ISO3166]))

((((RS & P[OBI]) | (CC & P[SNOMED])) & !(POA & P[HANCESTRO])) & (DS & P[ICD10]))

((!((CC & P[SNOMED]) | (GS & P[ISO3166])) & !(DS & P[ICD10])) & !(RS & P[OBI]))
```

**说明**: 
- 所有 deep 策略都来自 `deep_nested_large` 层
- 与 `many` 谓词强相关（60个 deep 策略全是 many 谓词）

---

## 🔢 按 Predicate Count 分类

### 1. `none` (60策略, 14.0%)
**特征**: 无谓词，只有属性

**唯一样例**:
```
GR
```

**说明**: 所有 `none` 策略都来自 `flat_singleton` 层

---

### 2. `single` (95策略, 22.1%)
**特征**: 恰好1个谓词

**典型样例**:
```
标准单谓词:
(DS & P[ICD10])
(RS & P[OBI])
(POA & P[HANCESTRO])
(GS & P[ISO3166])
(CC & P[SNOMED])

带否定:
!(!GR | (DS & P[ICD10]))
```

**说明**: 来自 `single_predicate_small` 层

---

### 3. `few` (215策略, 50.0%)
**特征**: 2-3个谓词

**典型样例**:
```
2谓词:
((DS & P[ICD10]) | (RS & P[OBI]))
((RS & P[OBI]) & (GS & P[ISO3166]))

3谓词:
!(!(!GR | !(RS & P[OBI])) | !(DS & P[ICD10]))
(((POA & P[HANCESTRO]) | !(DS & P[ICD10])) & !GR)
```

**说明**: **占据一半**，主要来自 `dual_mixed_medium` 和 `medium_nesting_focused` 层

---

### 4. `many` (60策略, 14.0%)
**特征**: 4+个谓词

**典型样例**:
```
4谓词 (所有样例都是4个):
!((((RS & P[OBI]) & !(DS & P[ICD10])) | (POA & P[HANCESTRO])) & (GS & P[ISO3166]))

DUO组合示例:
- DS, RS, POA, GS (4种ontology)
- DS, RS, POA, CC
- DS, RS, GS, CC
```

**说明**: 
- 全部来自 `deep_nested_large` 层
- **100% 与 deep nesting 相关**
- 配置中提到支持5谓词，但实际数据集最多4个

---

## 📏 表达式长度分布

| 长度范围 | 数量 | 占比 | 说明 |
|----------|------|------|------|
| **<20字符** | 118 | 27.4% | 简单策略 (GR, 单谓词) |
| **20-50字符** | 227 | 52.8% | 标准策略 (双谓词, shallow) |
| **50-100字符** | 75 | 17.4% | 复杂策略 (三谓词, medium/deep) |
| **100-200字符** | 10 | 2.3% | 极复杂策略 (4谓词, deep) |

---

## 🔍 特殊模式观察

### 德摩根定律应用
```
原始: !(!GR | (DS & P[ICD10]))
等价: GR & !(DS & P[ICD10])

原始: !(!GR & (RS & P[OBI]))
等价: GR | !(RS & P[OBI])
```

**说明**: 配置中的 `groupNotProbability` 参数可能生成这类模式

### 谓词命名空间 (Ontology)
所有谓词都遵循格式: `P[NAMESPACE]`
- `P[ICD10]` - Disease Specific (DS)
- `P[OBI]` - Research Specific (RS)
- `P[HANCESTRO]` - Population Ancestry (POA)
- `P[ISO3166]` - Geographical Restriction (GS)
- `P[SNOMED]` - Clinical Care (CC)

### 属性-谓词配对规则
**始终成对出现**:
- `DS & P[ICD10]` ✅
- `RS & P[OBI]` ✅
- `POA & P[HANCESTRO]` ✅

**从未单独出现**:
- `P[ICD10]` 单独 ❌
- `DS` 不带谓词 (除了在 NOT 内) ✅

---

## 💡 结论

1. **最常见的模式**: `and_or_mixed + shallow + few` (双谓词, 2层嵌套)
2. **最简单的模式**: `and_only + flat + none` (仅GR)
3. **最复杂的模式**: `negation_heavy + deep + many` (4谓词, 4层嵌套, 多重否定)
4. **缺失的模式**: `or_only` 类别完全缺失
5. **强相关性**: `deep nesting` ⇔ `many predicates` (100%相关)

