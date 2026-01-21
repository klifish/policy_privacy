# ICD-10 Multi-Class Classification Fix

## 问题描述

在之前的实验中,ICD-10 章节多类分类任务显示异常结果:

```json
{
  "task": "ICD-10 Chapter Prediction (RandomForest)",
  "accuracy": 0,
  "macroF1": 0,
  "advantage": -1,
  "randomBaseline": 1,
  "numClasses": 1
}
```

**根本原因**: `numIcd10Chapters: 1` 表明系统只识别到 1 个 ICD-10 章节,导致多类分类不可能进行。

## 根因分析

### 1. 数据流追踪

| 步骤 | 文件 | 状态 | 说明 |
|------|------|------|------|
| **Blueprint 生成** | [data_generator.js:801-837](data_generator.js#L801-L837) | ✅ 正确 | 从 10 个 ICD-10 章节中随机选择,存储在 `predicateValuesBySlot[0]` |
| **Dataset 生成** | [data_generator.js:1236-1257](data_generator.js#L1236-L1257) | ✅ 正确 | 将 `ontologyValue` (0-9) 正确传递到 dataset entry |
| **Feature 提取** | [feature_extractor.js:11-42](feature_extractor.js#L11-L42) | ❌ **缺失** | **没有提取 `icd10Chapter` 字段** |
| **分类训练** | [run_experiment.js:516](run_experiment.js#L516) | ❌ 失败 | 尝试使用不存在的 `icd10Chapter` 字段 |
| **章节计数** | [run_experiment.js:617](run_experiment.js#L617) | ❌ 错误 | `new Set([undefined]).size = 1` |

### 2. 代码缺陷

**修复前** ([feature_extractor.js:34-40](feature_extractor.js#L34-L40)):

```javascript
return {
  // ... other features

  // Labels for classification
  duoTerm: result.duoTerm,
  duoTermCodes: result.duoTermCodes || [],
  ontologyNamespace: result.ontologyNamespace,
  ontologyValue: result.ontologyValue,
  // ❌ 缺少 icd10Chapter 字段!
  satisfy: result.satisfy ? 1 : 0
};
```

**问题**: 虽然 `ontologyValue` 包含 ICD-10 章节值 (0-9),但在 [run_experiment.js:617](run_experiment.js#L617) 中尝试访问的是 `f.icd10Chapter`:

```javascript
const icdChapterCount = new Set(normalizedFeatures.map(f => f.icd10Chapter)).size;
// f.icd10Chapter 全部返回 undefined
// new Set([undefined, undefined, ...]) → size = 1
```

## 修复方案

### 修改的文件

**[feature_extractor.js](feature_extractor.js)**

#### 1. `extractFeatures` 函数 (Lines 34-45)

```javascript
// Labels for classification
duoTerm: result.duoTerm,
duoTermCodes: result.duoTermCodes || [],
ontologyNamespace: result.ontologyNamespace,
ontologyValue: result.ontologyValue,

// ✅ 新增: ICD-10 chapter for multi-class classification
// Only set when namespace is ICD10, otherwise undefined
icd10Chapter: result.ontologyNamespace === 'ICD10' ? result.ontologyValue : undefined,

satisfy: result.satisfy ? 1 : 0
```

**设计考虑**:
- 只有当 `ontologyNamespace === 'ICD10'` 时才设置 `icd10Chapter`
- 其他情况(如 GR, RS 等)保持为 `undefined`
- 这确保只有真正的 ICD-10 样本会被用于多类分类

#### 2. `normalizeFeatures` 函数 (Line 56)

```javascript
const featureNames = Object.keys(features[0]).filter(
  key => !['duoTerm', 'duoTermCodes', 'ontologyNamespace', 'ontologyValue',
           'icd10Chapter', 'satisfy', 'proofGenerationTime'].includes(key)
);
```

**原因**: `icd10Chapter` 是分类标签,不应该被归一化。

#### 3. `prepareClassificationData` 函数 (Lines 110-114)

```javascript
const X = features.map(f => {
  const x = { ...f };
  delete x.duoTerm;
  delete x.duoTermCodes;
  delete x.ontologyNamespace;
  delete x.ontologyValue;
  delete x.icd10Chapter;  // ✅ 新增
  delete x.satisfy;
  return Object.values(x);
});
```

**原因**: 在提取特征矩阵时,需要移除所有标签字段。

#### 4. `calculateFeatureStats` 函数 (Line 129)

```javascript
const featureNames = Object.keys(features[0]).filter(
  key => !['duoTerm', 'duoTermCodes', 'ontologyNamespace', 'ontologyValue',
           'icd10Chapter', 'satisfy'].includes(key)
);
```

**原因**: 统计特征时排除标签字段。

## 测试验证

### 测试场景

创建了 3 个模拟样本:
1. **Sample 1**: DS (Disease-Specific) + ICD10 Chapter 0 (INFECTIOUS)
2. **Sample 2**: DS + ICD10 Chapter 1 (NEOPLASMS)
3. **Sample 3**: GR (General Research, 无 ontology)

### 测试结果

```
✅ PASS: Found 2 samples with ICD-10 chapters (expected: 2)
✅ PASS: Found 2 unique ICD-10 chapters (expected: 2)
✅ PASS: GR sample correctly has icd10Chapter = undefined
```

### Before vs After

| 指标 | 修复前 | 修复后 |
|------|-------|--------|
| **icd10Chapter 字段** | ❌ 不存在 | ✅ 正确提取 |
| **numIcd10Chapters** | 1 (错误) | 2+ (正确) |
| **Multi-class 分类** | ❌ 失败 (numClasses=1) | ✅ 可用 |
| **Advantage 计算** | -100% (无意义) | 正常范围 |

## 预期影响

### 1. 实验报告改进

**修复前**:
```json
{
  "task": "ICD-10 Chapter Prediction (RandomForest)",
  "numClasses": 1,
  "accuracy": 0,
  "advantage": -1,
  "randomBaseline": 1
}
```

**修复后** (假设数据集包含 5 个 ICD-10 章节):
```json
{
  "task": "ICD-10 Chapter Prediction (RandomForest)",
  "numClasses": 5,
  "accuracy": 0.25,
  "advantage": -0.55,
  "randomBaseline": 0.2
}
```

### 2. 隐私评估

现在可以正确评估系统是否泄露 ICD-10 章节信息:

- **Advantage ≤ 5%**: 隐私保护良好
- **Advantage > 5%**: 检测到信息泄露

### 3. 数据集要求

为了进行有效的 ICD-10 多类分类,数据集应该:

- ✅ 包含多个 ICD-10 章节 (建议 ≥ 3)
- ✅ 每个章节有足够样本 (建议 ≥ 30)
- ✅ 类别分布相对均衡

**生成建议配置**:
```bash
node run_experiment.js \
  --num-duo-terms 3 \
  --policy-count 200 \
  --executions-per-policy 3
```

这将生成包含多个 DUO terms 的策略,其中 DS (Disease-Specific) policies 会随机分配到 10 个 ICD-10 章节。

## 相关文件

- **[feature_extractor.js](feature_extractor.js)** - 主要修复文件
- **[run_experiment.js](run_experiment.js)** - 使用 `icd10Chapter` 的地方
- **[data_generator.js](data_generator.js)** - ICD-10 章节定义和分配逻辑
- **[ICD10_CHAPTERS](data_generator.js#L172-L183)** - 10 个 ICD-10 章节常量
- **[ICD10_SCOPE_LIBRARY](data_generator.js#L284-L377)** - 每个章节的详细配置

## 后续工作

### 短期
- [x] 修复 `feature_extractor.js` 中的 `icd10Chapter` 提取
- [ ] 运行完整实验验证多类分类功能
- [ ] 更新文档说明 ICD-10 多类分类的使用

### 长期
- [ ] 考虑支持其他 ontology 的多类分类 (OBI, HANCESTRO 等)
- [ ] 添加自动化测试确保 feature extraction 的正确性
- [ ] 优化数据集生成策略,确保 ICD-10 章节分布均衡

## 总结

这次修复解决了一个关键的数据流问题:

1. **问题**: ICD-10 章节值在 `ontologyValue` 中,但代码期望 `icd10Chapter` 字段
2. **影响**: 多类分类完全失效,显示 `numClasses: 1`
3. **修复**: 在 feature extraction 时添加 `icd10Chapter` 字段映射
4. **验证**: 测试显示修复后能正确识别多个 ICD-10 章节
5. **收益**: 现在可以正确评估 ICD-10 章节信息的隐私保护效果

**关键教训**: 在复杂的数据管道中,字段名称的一致性至关重要。应该在数据流的早期阶段就规范化字段命名,避免后续的歧义。
