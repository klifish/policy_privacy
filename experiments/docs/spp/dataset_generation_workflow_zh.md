# 结构与参数隐私 - 数据集生成工作流程

## 概述

结构与参数隐私（Structure and Parameter Privacy, SPP）实验评估攻击者能否从区块链可观察特征推断策略的结构和参数属性。与 PCH（策略内容）和 PI（策略配对）不同，SPP 聚焦于策略特征的**多维度分类**。

**核心文件**: [data_generator.js](../data_generator.js)

**与其他实验的核心区别**:
```
PCH: 策略 → 特征 → 分类(DUO术语)
PI:  配对 → 特征差异 → 分类(策略0 vs 策略1)
SPP: 策略 → 特征 → 分类(结构、深度、谓词、参数)
```

---

## 架构概览

### 设计理念

SPP 将策略视为具有 **5 个独立分类维度**的对象：

1. **逻辑结构**（Logic Structure）：布尔连接词（AND, OR, NOT）
2. **嵌套深度**（Nesting Depth）：结构复杂度（flat, shallow, medium, deep）
3. **谓词数量**（Predicate Count）：外部约束数量（none, single, few, many）
4. **集合大小**（Set Size）：白名单基数（none, small, medium, large）
5. **范围宽度**（Range Width）：数值范围跨度（none, narrow, medium, wide）

**核心创新**: **维度解耦**（Dimension Decoupling）
- 每个维度独立分类
- 降低分类轴之间的相关性
- 实现细粒度隐私泄露评估

---

## 分类维度详解

### 维度1：逻辑结构

**关注点**：布尔连接词，独立于谓词

```javascript
const LOGIC_STRUCTURES = {
  AND_ONLY: 'and_only',          // 只有AND连接 (例如: A & B & C)
  OR_ONLY: 'or_only',            // 只有OR连接 (例如: A | B | C)
  AND_OR_MIXED: 'and_or_mixed',  // 同时有AND和OR (例如: (A & B) | C)
  NEGATION_HEAVY: 'negation_heavy' // 有NOT操作符(≥2个) (例如: !A & !B)
};
```

**分类逻辑** ([data_generator.js:176](../data_generator.js#L176))：
```javascript
function classifyLogicStructure(stats) {
  const { hasAnd, hasOr, hasNot, notCount } = stats;

  // 优先级1: 否定重（≥2个NOT操作符）
  if (notCount >= 2) {
    return LOGIC_STRUCTURES.NEGATION_HEAVY;
  }

  // 优先级2: 纯AND
  if (hasAnd && !hasOr) {
    return LOGIC_STRUCTURES.AND_ONLY;
  }

  // 优先级3: 纯OR
  if (hasOr && !hasAnd) {
    return LOGIC_STRUCTURES.OR_ONLY;
  }

  // 优先级4: 混合
  if (hasAnd && hasOr) {
    return LOGIC_STRUCTURES.AND_OR_MIXED;
  }

  // 默认: 单原子 → AND_ONLY
  return LOGIC_STRUCTURES.AND_ONLY;
}
```

**示例**：
| 逻辑表达式 | AND | OR | NOT | 分类结果 |
|-----------|-----|----|----|---------|
| `DS` | 否 | 否 | 否 | `and_only`（默认） |
| `DS & RS` | 是 | 否 | 否 | `and_only` |
| `DS \| RS` | 否 | 是 | 否 | `or_only` |
| `(DS & RS) \| GR` | 是 | 是 | 否 | `and_or_mixed` |
| `!DS & !RS` | 是 | 否 | 是(2) | `negation_heavy` |

---

### 维度2：嵌套深度

**关注点**：结构复杂度，独立于逻辑类型

```javascript
const NESTING_DEPTHS = {
  FLAT: 'flat',          // 最大深度 ≤ 1（无嵌套）
  SHALLOW: 'shallow',    // 最大深度 == 2（一层嵌套）
  MEDIUM: 'medium',      // 最大深度 == 3（两层嵌套）
  DEEP: 'deep'           // 最大深度 ≥ 4（三层及以上嵌套）
};
```

**分类逻辑** ([data_generator.js:205](../data_generator.js#L205))：
```javascript
function classifyNestingDepth(stats) {
  const { maxDepth } = stats;

  if (maxDepth <= 1) return NESTING_DEPTHS.FLAT;
  if (maxDepth === 2) return NESTING_DEPTHS.SHALLOW;
  if (maxDepth === 3) return NESTING_DEPTHS.MEDIUM;
  return NESTING_DEPTHS.DEEP;
}
```

**深度计算**：
```javascript
function analyzeLogicShape(logic) {
  let depth = 0;
  let maxDepth = 0;

  for (const ch of logic) {
    if (ch === '(') {
      depth++;
      maxDepth = Math.max(maxDepth, depth);
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    }
  }

  return { maxDepth, ... };
}
```

**示例**：
| 逻辑表达式 | 最大深度 | 分类结果 |
|-----------|---------|---------|
| `DS` | 0 | `flat` |
| `DS & RS` | 0 | `flat` |
| `(DS & RS)` | 1 | `flat` |
| `((DS & RS) \| GR)` | 2 | `shallow` |
| `(((DS & RS) \| GR) & CC)` | 3 | `medium` |
| `((((DS) & RS) \| GR) & CC)` | 4 | `deep` |

---

### 维度3：谓词数量

**关注点**：外部谓词的数量（例如 ICD-10, OBI）

```javascript
const PREDICATE_COUNTS = {
  NONE: 'none',       // 0个谓词（仅属性策略）
  SINGLE: 'single',   // 1个谓词
  FEW: 'few',         // 2-3个谓词
  MANY: 'many'        // 4个及以上谓词
};
```

**分类逻辑** ([data_generator.js:222](../data_generator.js#L222))：
```javascript
function classifyPredicateCount(stats) {
  const count = stats.predicateNamespaces.length;

  if (count === 0) return PREDICATE_COUNTS.NONE;
  if (count === 1) return PREDICATE_COUNTS.SINGLE;
  if (count <= 3) return PREDICATE_COUNTS.FEW;
  return PREDICATE_COUNTS.MANY;
}
```

**谓词检测**：
```javascript
// 正则表达式查找类似 P[ICD10:0], P[OBI:1] 的谓词
const predicateRegex = /P\[([A-Z0-9_:-]+)\]/g;
const predicateNamespaces = new Set();

let match;
while ((match = predicateRegex.exec(logic)) !== null) {
  predicateNamespaces.add(match[1]); // 例如: "ICD10:0"
}
```

**示例**：
| 逻辑表达式 | 谓词 | 数量 | 分类结果 |
|-----------|------|------|---------|
| `GR` | - | 0 | `none` |
| `DS & P[ICD10:0]` | `ICD10:0` | 1 | `single` |
| `DS & P[ICD10:0] & P[OBI:1]` | `ICD10:0`, `OBI:1` | 2 | `few` |
| `DS & P[ICD10:0] & P[OBI:1] & P[AGE:2] & P[LOC:3]` | 4个谓词 | 4 | `many` |

---

### 维度4：集合大小

**关注点**：白名单基数（与Merkle深度分离）

```javascript
const SET_SIZES = {
  NONE: 'none',       // whitelistSize == 0（无白名单）
  SMALL: 'small',     // 1-4个元素
  MEDIUM: 'medium',   // 5-16个元素
  LARGE: 'large'      // 17个及以上元素
};
```

**分类逻辑** ([data_generator.js:239](../data_generator.js#L239))：
```javascript
function classifySetSize(policy) {
  const whitelistSize = policy?.structure?.whitelistSize || 0;

  if (whitelistSize === 0) return SET_SIZES.NONE;
  if (whitelistSize <= 4) return SET_SIZES.SMALL;
  if (whitelistSize <= 16) return SET_SIZES.MEDIUM;
  return SET_SIZES.LARGE;
}
```

**关键改进**：**与Merkle深度分离**
- 旧方法：使用Merkle深度作为代理（混淆了集合大小和树结构）
- 新方法：使用策略结构中的实际 `whitelistSize`
- 优势：独立维度，与范围宽度无相关性

**示例**：
| 白名单大小 | 分类结果 |
|-----------|---------|
| 0 | `none`（仅属性策略） |
| 2 | `small`（例如: ["C00", "C15"]） |
| 8 | `medium`（例如: 8个ICD-10代码） |
| 24 | `large`（例如: 24个疾病代码） |

---

### 维度5：范围宽度

**关注点**：数值范围谓词（与集合大小分离）

```javascript
const RANGE_WIDTHS = {
  NONE: 'none',       // 无范围谓词
  NARROW: 'narrow',   // 范围 < 10（通过Merkle深度≤3近似）
  MEDIUM: 'medium',   // 10-50（深度4-6）
  WIDE: 'wide'        // 50+（深度≥7）
};
```

**分类逻辑** ([data_generator.js:258](../data_generator.js#L258))：
```javascript
function classifyRangeWidth(policy) {
  const merkleDepth = policy?.structure?.merkleDepth || 0;
  const logic = policy?.semantics?.logicNormalized || '';

  // 检查策略是否有范围谓词
  const hasRangePredicates = /RANGE|AGE|VALUE/i.test(logic);

  if (!hasRangePredicates) {
    return RANGE_WIDTHS.NONE;
  }

  // 通过Merkle深度近似范围宽度（占位符）
  // TODO: 替换为从谓词定义解析实际范围值
  if (merkleDepth <= 3) return RANGE_WIDTHS.NARROW;
  if (merkleDepth <= 6) return RANGE_WIDTHS.MEDIUM;
  return RANGE_WIDTHS.WIDE;
}
```

**注意**：当前通过Merkle深度近似。未来改进：从谓词定义解析实际范围值。

**示例**：
| 逻辑 | 有范围 | Merkle深度 | 分类结果 |
|------|-------|-----------|---------|
| `DS` | 否 | 5 | `none` |
| `AGE[18-25]` | 是 | 3 | `narrow`（范围: 7） |
| `AGE[18-50]` | 是 | 5 | `medium`（范围: 32） |
| `AGE[0-100]` | 是 | 7 | `wide`（范围: 100） |

---

## 数据集生成流程

### 概览

```
┌─────────────────────────────────────────────────────────────────┐
│  阶段1: 生成基础数据集（复用PCH）                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ generatePolicyDataset()                                    │ │
│  │ - 生成120个策略（默认）                                      │ │
│  │ - 每个策略3次执行（默认）                                    │ │
│  │ - 多样化的DUO组合、结构、参数                                │ │
│  │ 输出: 360个执行实例（包含元数据）                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段2: SPP分类注释                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 对每个策略:                                                 │ │
│  │   1. 分析逻辑形状（解析结构）                                │ │
│  │   2. 分类逻辑结构（AND/OR/NOT）                             │ │
│  │   3. 分类嵌套深度（flat/shallow/medium/deep）               │ │
│  │   4. 分类谓词数量（none/single/few/many）                   │ │
│  │   5. 分类集合大小（none/small/medium/large）                │ │
│  │   6. 分类范围宽度（none/narrow/medium/wide）                │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  阶段3: 计算覆盖率与平衡度指标                                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 对每个维度:                                                 │ │
│  │   - 统计每个类别的策略数量                                  │ │
│  │   - 计算最小/最大比率                                       │ │
│  │   - 计算变异系数（CV）                                      │ │
│  │ 输出: dataset.__meta.sppSummary, balanceMetrics            │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### 阶段1：生成基础数据集

**函数**: `generateDataset` ([data_generator.js:371](../data_generator.js#L371))

```javascript
async function generateDataset(config = {}) {
  const mergedConfig = {
    policyCount: 120,
    executionsPerPolicy: 3,
    satisfyRatio: 0.5,
    seed: 'spp-dataset',
    ...config
  };

  console.log('生成SPP数据集...');

  // 复用PCH数据集生成器
  const dataset = await generatePolicyDataset({
    policyCount: mergedConfig.policyCount,
    executionsPerPolicy: mergedConfig.executionsPerPolicy,
    satisfyRatio: mergedConfig.satisfyRatio,
    seed: mergedConfig.seed,
    // ... 其他PCH配置
  });

  // 继续阶段2...
}
```

**关键点**：
- **复用PCH基础设施**：利用 [policy_content_hiding/data_generator.js](../../policy_content_hiding/data_generator.js)
- **默认配置**：120策略 × 3执行 = 360实例
- **更少执行次数**：3次 vs PCH的20次（SPP关注策略级结构，而非执行变异）

**输出结构**：
```javascript
dataset = [
  {
    policyIndex: 0,
    policyId: "singleton-0",
    executionId: 0,
    semantics: {
      logicOriginal: "DS",
      logicNormalized: "DS",
      duoTerms: [1],
      icd10Scope: { id: "NEOPLASMS", ... }
    },
    structure: {
      whitelistSize: 16,
      merkleDepth: 5,
      proofType: "merkle_proof",
      policyDepth: 10
    },
    execution: {
      gas_pad: true,
      event_pad: false
    },
    // SPP分类尚未添加
  },
  // ... 359个更多实例
]
```

---

### 阶段2：分类注释

**函数**: `annotatePolicy` ([data_generator.js:292](../data_generator.js#L292))

```javascript
function annotatePolicy(policy) {
  // 1. 提取并分析逻辑
  const logic = policy?.semantics?.logicNormalized ||
                policy?.semantics?.logicOriginal || '';
  const stats = analyzeLogicShape(logic);

  // 2. 应用所有5个分类
  policy.logicStructure = classifyLogicStructure(stats);
  policy.nestingDepth = classifyNestingDepth(stats);
  policy.predicateCount = classifyPredicateCount(stats);
  policy.setSize = classifySetSize(policy);
  policy.rangeWidth = classifyRangeWidth(policy);

  // 3. 存储分析统计
  policy.structureStats = stats;

  return policy;
}

// 应用到整个数据集
dataset.forEach(annotatePolicy);
```

**逻辑分析** ([data_generator.js:104](../data_generator.js#L104))：
```javascript
function analyzeLogicShape(logic = '') {
  const stats = {
    source: logic,
    hasOr: false,
    hasAnd: false,
    hasNot: false,
    andCount: 0,
    orCount: 0,
    notCount: 0,
    maxDepth: 0,
    predicateCount: 0,
    predicateNamespaces: [],
    attributeTokens: []
  };

  // 1. 统计操作符并追踪深度
  let depth = 0;
  for (const ch of logic) {
    if (ch === '(') {
      depth++;
      stats.maxDepth = Math.max(stats.maxDepth, depth);
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === '|') {
      stats.hasOr = true;
      stats.orCount++;
    } else if (ch === '&') {
      stats.hasAnd = true;
      stats.andCount++;
    } else if (ch === '!') {
      stats.hasNot = true;
      stats.notCount++;
    }
  }

  // 2. 提取谓词
  const predicateRegex = /P\[([A-Z0-9_:-]+)\]/g;
  const predicateNamespaces = new Set();
  let match;
  while ((match = predicateRegex.exec(logic)) !== null) {
    predicateNamespaces.add(match[1]);
  }
  stats.predicateNamespaces = Array.from(predicateNamespaces);
  stats.predicateCount = stats.predicateNamespaces.length;

  // 3. 提取属性标记
  const logicWithoutPredicates = logic.replace(/P\[[^\]]+\]/g, ' ');
  const attributeRegex = /\b([A-Z]{2,})\b/g;
  const attributeTokens = new Set();
  while ((match = attributeRegex.exec(logicWithoutPredicates)) !== null) {
    attributeTokens.add(match[1]);
  }
  stats.attributeTokens = Array.from(attributeTokens);

  return stats;
}
```

**注释示例**：
```javascript
// 输入策略
{
  policyId: "pair-5",
  semantics: {
    logicNormalized: "((DS & RS) | GR)",
    duoTerms: [1, 2, 0]
  },
  structure: {
    whitelistSize: 8,
    merkleDepth: 4
  }
}

// annotatePolicy()之后
{
  policyId: "pair-5",
  // ... 原始字段

  // SPP分类
  logicStructure: "and_or_mixed",  // 同时有&和|
  nestingDepth: "shallow",          // maxDepth = 2
  predicateCount: "none",           // 未找到P[...]
  setSize: "medium",                // whitelistSize = 8
  rangeWidth: "none",               // 无范围谓词

  structureStats: {
    source: "((DS & RS) | GR)",
    hasAnd: true,
    hasOr: true,
    hasNot: false,
    andCount: 1,
    orCount: 1,
    notCount: 0,
    maxDepth: 2,
    predicateCount: 0,
    predicateNamespaces: [],
    attributeTokens: ["DS", "RS", "GR"]
  }
}
```

---

### 阶段3：计算覆盖率与平衡度

**函数**: `summarizeDataset` ([data_generator.js:316](../data_generator.js#L316))

```javascript
function summarizeDataset(dataset) {
  const summary = {
    logicStructures: {},
    nestingDepths: {},
    predicateCounts: {},
    setSizes: {},
    rangeWidths: {}
  };

  dataset.forEach((policy) => {
    increment(summary.logicStructures, policy.logicStructure);
    increment(summary.nestingDepths, policy.nestingDepth);
    increment(summary.predicateCounts, policy.predicateCount);
    increment(summary.setSizes, policy.setSize);
    increment(summary.rangeWidths, policy.rangeWidth);
  });

  return summary;
}
```

**平衡度指标** ([data_generator.js:349](../data_generator.js#L349))：
```javascript
function calculateBalanceMetrics(distribution) {
  const counts = Object.values(distribution);

  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  return {
    min,
    max,
    mean: mean.toFixed(1),
    minMaxRatio: (min / max).toFixed(3),  // 理想: 接近1.0
    coefficientOfVariation: (stdDev / mean).toFixed(3)  // 理想: 接近0.0
  };
}
```

**指标解释**：
- **最小/最大比率**：衡量平衡度（1.0 = 完美，0.0 = 高度不平衡）
- **变异系数（CV）**：衡量一致性（0.0 = 完美，>0.5 = 较差）

**示例输出**：
```javascript
dataset.__meta = {
  sppSummary: {
    logicStructures: {
      and_only: 45,
      or_only: 30,
      and_or_mixed: 35,
      negation_heavy: 10
    },
    nestingDepths: {
      flat: 60,
      shallow: 40,
      medium: 15,
      deep: 5
    },
    predicateCounts: {
      none: 40,
      single: 50,
      few: 25,
      many: 5
    },
    setSizes: {
      none: 20,
      small: 30,
      medium: 50,
      large: 20
    },
    rangeWidths: {
      none: 80,
      narrow: 20,
      medium: 15,
      wide: 5
    }
  },

  balanceMetrics: {
    logicStructure: {
      min: 10,
      max: 45,
      mean: '30.0',
      minMaxRatio: '0.222',  // 平衡度较差
      coefficientOfVariation: '0.458'
    },
    nestingDepth: {
      min: 5,
      max: 60,
      mean: '30.0',
      minMaxRatio: '0.083',  // 平衡度很差
      coefficientOfVariation: '0.729'
    },
    predicateCount: {
      min: 5,
      max: 50,
      mean: '30.0',
      minMaxRatio: '0.100',
      coefficientOfVariation: '0.596'
    },
    setSize: {
      min: 20,
      max: 50,
      mean: '30.0',
      minMaxRatio: '0.400',  // 平衡度中等
      coefficientOfVariation: '0.408'
    },
    rangeWidth: {
      min: 5,
      max: 80,
      mean: '30.0',
      minMaxRatio: '0.063',  // 平衡度很差
      coefficientOfVariation: '1.069'
    }
  }
}
```

**控制台输出**：
```
=== 平衡度指标 ===
  logicStructure: min/max=0.222, CV=0.458
  nestingDepth: min/max=0.083, CV=0.729
  predicateCount: min/max=0.100, CV=0.596
  setSize: min/max=0.400, CV=0.408
  rangeWidth: min/max=0.063, CV=1.069
```

---

## 完整工作流程

### 主入口点

```javascript
const { generateDataset } = require('./data_generator');

async function main() {
  // 生成注释后的数据集
  const dataset = await generateDataset({
    policyCount: 120,
    executionsPerPolicy: 3,
    satisfyRatio: 0.5,
    seed: 'spp-exp-001'
  });

  console.log(`生成了 ${dataset.length} 个注释后的策略`);
  console.log('摘要:', dataset.__meta.sppSummary);
  console.log('平衡度:', dataset.__meta.balanceMetrics);

  // 访问分类
  dataset.forEach((policy) => {
    console.log(`策略 ${policy.policyId}:`);
    console.log(`  逻辑: ${policy.logicStructure}`);
    console.log(`  深度: ${policy.nestingDepth}`);
    console.log(`  谓词: ${policy.predicateCount}`);
    console.log(`  集合大小: ${policy.setSize}`);
    console.log(`  范围: ${policy.rangeWidth}`);
  });
}

main();
```

### 数据流图

```
输入配置
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 阶段1: 生成基础策略（复用PCH）                                    │
│   generatePolicyDataset()                                       │
│   输出: 360个实例（120个策略 × 3次执行）                         │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 阶段2: 注释每个策略                                              │
│   对数据集中的每个策略:                                          │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ 步骤1: analyzeLogicShape()                             │ │
│     │   - 解析逻辑字符串                                      │ │
│     │   - 统计操作符(&, |, !)                                │ │
│     │   - 追踪嵌套深度                                        │ │
│     │   - 提取谓词                                            │ │
│     │   输出: stats对象                                       │ │
│     └─────────────────┬───────────────────────────────────────┘ │
│                       ↓                                         │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ 步骤2: 应用分类                                         │ │
│     │   logicStructure ← classifyLogicStructure(stats)       │ │
│     │   nestingDepth ← classifyNestingDepth(stats)           │ │
│     │   predicateCount ← classifyPredicateCount(stats)       │ │
│     │   setSize ← classifySetSize(policy)                    │ │
│     │   rangeWidth ← classifyRangeWidth(policy)              │ │
│     └─────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 阶段3: 计算摘要与指标                                            │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ summarizeDataset()                                      │  │
│   │   - 统计每个维度中每个类别的策略数量                      │  │
│   │   输出: sppSummary                                       │  │
│   └─────────────────┬───────────────────────────────────────┘  │
│                     ↓                                           │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ calculateBalanceMetrics()                               │  │
│   │   对每个维度:                                            │  │
│   │     - min, max, mean                                    │  │
│   │     - minMaxRatio = min / max                           │  │
│   │     - CV = stdDev / mean                                │  │
│   │   输出: balanceMetrics                                   │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
最终数据集:
  - 360个注释后的实例
  - 每个策略有5个分类维度
  - 覆盖率摘要（每个类别的计数）
  - 平衡度指标（最小/最大比率，CV）
```

---

## 关键设计改进

### 1. 维度解耦

**原始设计的问题**：
```javascript
// 旧方法: 单个"paramType"混淆了集合大小和Merkle深度
paramType = merkleDepth < 4 ? 'small' : 'large';
// 问题: Merkle深度同时影响集合大小和树结构
```

**新设计的解决方案**：
```javascript
// 新方法: 独立维度
setSize = classifySetSize(policy);      // 使用whitelistSize
rangeWidth = classifyRangeWidth(policy); // 使用merkleDepth（用于范围）
```

**优势**：
- 独立的分类轴
- 降低维度间的相关性
- 更细粒度的隐私泄露评估

---

### 2. 细粒度类别

**旧设计**（总共3个类别）：
```
structureType: simple | nested | complex
```

**新设计**（5个维度 × 4个类别 = 总共20个）：
```
logicStructure: and_only | or_only | and_or_mixed | negation_heavy
nestingDepth: flat | shallow | medium | deep
predicateCount: none | single | few | many
setSize: none | small | medium | large
rangeWidth: none | narrow | medium | wide
```

**优势**：
- 更细致的分类
- 更好地捕获结构变化
- 支持维度特定的攻击评估

---

### 3. 平衡度指标

**目的**：在昂贵的执行前评估数据集质量

```javascript
balanceMetrics = {
  logicStructure: {
    minMaxRatio: 0.400,  // 中等（理想: >0.5）
    coefficientOfVariation: 0.408  // 良好（理想: <0.3）
  },
  nestingDepth: {
    minMaxRatio: 0.083,  // 较差（需要更多深层策略）
    coefficientOfVariation: 0.729  // 较差
  },
  // ...
};
```

**行动项**：
- 如果 `minMaxRatio < 0.3`：调整策略生成以增加少数类别
- 如果 `CV > 0.5`：在链上执行前重新平衡数据集

---

## 配置参数

### 默认配置

```javascript
const DEFAULT_DATASET_CONFIG = {
  policyCount: 120,           // 120个策略（vs PCH的200个）
  executionsPerPolicy: 3,     // 3次执行（vs PI的5次，PCH的20次）
  satisfyRatio: 0.5,          // 50%满足，50%不满足
  seed: 'spp-dataset'         // 确定性RNG种子
};
```

### 调优指南

**快速原型**：
```javascript
{
  policyCount: 30,
  executionsPerPolicy: 1
}
// 结果: 30个策略，快速生成
```

**平衡分布**：
```javascript
{
  policyCount: 200,
  executionsPerPolicy: 3,
  semanticLayers: [
    // 自定义以增加特定类别
    { name: 'deep', combos: [...], minPolicies: 40 }
  ]
}
```

**统计功效**：
```javascript
{
  policyCount: 500,
  executionsPerPolicy: 5
}
// 结果: 2500个实例，更好的覆盖率
```

---

## 使用示例

### 示例1：生成注释后的数据集

```javascript
const { generateDataset } = require('./data_generator');

const dataset = await generateDataset({
  policyCount: 120,
  seed: 'exp-001'
});

console.log(`总策略数: ${dataset.length}`);
console.log('逻辑结构:', dataset.__meta.sppSummary.logicStructures);
console.log('平衡度指标:', dataset.__meta.balanceMetrics);
```

### 示例2：按维度过滤

```javascript
// 获取所有仅AND的策略
const andOnlyPolicies = dataset.filter(
  p => p.logicStructure === 'and_only'
);

// 获取所有深层嵌套的策略
const deepPolicies = dataset.filter(
  p => p.nestingDepth === 'deep'
);

// 获取具有多个谓词和大型集合的策略
const complexPolicies = dataset.filter(
  p => p.predicateCount === 'many' && p.setSize === 'large'
);
```

### 示例3：分析覆盖率

```javascript
const { summarizeDataset } = require('./data_generator');

const summary = summarizeDataset(dataset);

console.log('逻辑结构分布:');
Object.entries(summary.logicStructures).forEach(([type, count]) => {
  const pct = (count / dataset.length * 100).toFixed(1);
  console.log(`  ${type}: ${count} (${pct}%)`);
});
```

### 示例4：执行前验证平衡度

```javascript
const dataset = await generateDataset({ policyCount: 120 });
const metrics = dataset.__meta.balanceMetrics;

// 检查所有维度是否平衡
const isBalanced = Object.values(metrics).every(
  m => parseFloat(m.minMaxRatio) > 0.3
);

if (!isBalanced) {
  console.warn('数据集不平衡！考虑使用调整后的配置重新生成。');
  // 显示有问题的维度
  Object.entries(metrics).forEach(([dim, m]) => {
    if (parseFloat(m.minMaxRatio) < 0.3) {
      console.warn(`  ${dim}: minMaxRatio=${m.minMaxRatio} (< 0.3)`);
    }
  });
} else {
  console.log('数据集平衡，继续执行...');
  // 链上执行
}
```

---

## 性能考虑

### 时间复杂度

```
阶段1（生成）: O(P × E) 其中P=策略数，E=执行数
  - 策略编译: ~1秒
  - 总计: 120个策略约2秒

阶段2（注释）: O(P × L) 其中L=逻辑长度
  - 逻辑解析: 每个策略O(L)
  - 总计: 120个策略<1秒

阶段3（总结）: O(P × D) 其中D=维度数（5）
  - 计数聚合: O(P)
  - 指标计算: O(D)
  - 总计: <1秒

总计: ~3秒（无区块链执行）
```

### 内存使用

```
基础数据集: 120个策略 × 5KB = ~600KB
注释: 120 × 2KB = ~240KB
统计: ~50KB
总计: <1MB
```

---

## 与攻击评估的集成

### 攻击工作流程

```
SPP数据集
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ 攻击: 多维度分类                                                 │
│                                                                  │
│ 对于每个维度D in [structureType, predicateCombo, paramType]:    │
│   1. 提取特征向量:                                               │
│      X = [gas, calldata, proof size, ...]                       │
│                                                                  │
│   2. 训练分类器:                                                 │
│      C_D(X) → 维度D中的类别                                      │
│                                                                  │
│   3. 在30个policy-disjoint seed上评估AUC                        │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 评估指标                                                         │
│   - 按维度的AUC(mean±std)与置换检验显著性                       │
│   - 混淆矩阵                                                     │
│   - 跨维度相关性(诊断性)                                        │
└─────────────────────────────────────────────────────────────────┘
```

**注意**：生成阶段的5个维度里，目前只有3个被实际喂给攻击套件——`structureType`(对应Logic
Structure)、`predicateCombo`(对应Predicate Count)、`paramType`(对应Set Size)。
`nestingDepth`和`rangeWidth`只在生成阶段计算并用于数据平衡诊断（见
`dataset.__meta.sppSummary`/`balanceMetrics`），并未传入`runSupervisedAttacks`/统计/聚类攻击
（见`run_experiment.js`里的`targetAttributes`）。这3个被攻击维度的权威PASS/FAIL判决是
`experiments/core/multiseed_criterion.js`里的30-seed policy-disjoint双重判据，不是单次切分的
准确率阈值判断。

详见 [attacks.js](../attacks.js) 实现细节。

---

## 结论

结构与参数隐私数据集生成器提供：

1. **生成阶段的多维度分类**：生成时标注5个独立轴，其中3个（`structureType`、
   `predicateCombo`、`paramType`）目前被实际攻击；`nestingDepth`和`rangeWidth`仍只是
   生成阶段的诊断量
2. **维度解耦**：降低分类维度间的相关性
3. **平衡度指标**：在昂贵执行前进行质量评估
4. **PCH集成**：复用已验证的策略生成基础设施
5. **细粒度类别**：每个维度4个类别用于细致分析

**关键优势**：
- 将逻辑结构与谓词分离
- 将集合大小与范围宽度分离
- 提供数据质量的平衡度指标
- 支持维度特定的隐私评估

**推荐工作流程**：
1. 生成数据集: `generateDataset()`
2. 验证平衡度: 检查 `dataset.__meta.balanceMetrics`
3. 如果平衡 → 链上执行
4. 如果不平衡 → 调整配置并重新生成
5. 按维度评估攻击
6. 按类别分析隐私泄露

此数据集支持对基于策略的访问控制系统中的结构和参数隐私进行全面评估。
