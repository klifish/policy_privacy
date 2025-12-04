# Structure and Parameter Privacy - Dataset Generation Workflow

## Overview

The Structure and Parameter Privacy (SPP) experiment evaluates whether an attacker can infer structural and parametric properties of policies from blockchain-observable features. Unlike PCH (policy content) and PI (policy pairs), SPP focuses on **multi-dimensional classification** of policy characteristics.

**Key File**: [data_generator.js](../data_generator.js)

**Core Difference from Other Experiments**:
```
PCH: Policy → Features → Classify(DUO Term)
PI:  Pair → Feature Diff → Classify(Policy0 vs Policy1)
SPP: Policy → Features → Classify(Structure, Depth, Predicates, Parameters)
```

---

## Architecture Overview

### Design Philosophy

SPP treats policies as objects with **5 independent classification dimensions**:

1. **Logic Structure**: Boolean connectives (AND, OR, NOT)
2. **Nesting Depth**: Structural complexity (flat, shallow, medium, deep)
3. **Predicate Count**: Number of external constraints (none, single, few, many)
4. **Set Size**: Whitelist cardinality (none, small, medium, large)
5. **Range Width**: Numeric range span (none, narrow, medium, wide)

**Key Innovation**: **Dimension Decoupling**
- Each dimension is classified independently
- Reduces correlation between classification axes
- Enables granular privacy leakage evaluation

---

## Classification Dimensions

### Dimension 1: Logic Structure

**Focus**: Boolean connectives, independent of predicates

```javascript
const LOGIC_STRUCTURES = {
  AND_ONLY: 'and_only',          // Only AND connectives (e.g., A & B & C)
  OR_ONLY: 'or_only',            // Only OR connectives (e.g., A | B | C)
  AND_OR_MIXED: 'and_or_mixed',  // Both AND and OR (e.g., (A & B) | C)
  NEGATION_HEAVY: 'negation_heavy' // Has NOT operators (≥2) (e.g., !A & !B)
};
```

**Classification Logic** ([data_generator.js:176](../data_generator.js#L176)):
```javascript
function classifyLogicStructure(stats) {
  const { hasAnd, hasOr, hasNot, notCount } = stats;

  // Priority 1: Negation-heavy (≥2 NOT operators)
  if (notCount >= 2) {
    return LOGIC_STRUCTURES.NEGATION_HEAVY;
  }

  // Priority 2: Pure AND
  if (hasAnd && !hasOr) {
    return LOGIC_STRUCTURES.AND_ONLY;
  }

  // Priority 3: Pure OR
  if (hasOr && !hasAnd) {
    return LOGIC_STRUCTURES.OR_ONLY;
  }

  // Priority 4: Mixed
  if (hasAnd && hasOr) {
    return LOGIC_STRUCTURES.AND_OR_MIXED;
  }

  // Default: Single atom → AND_ONLY
  return LOGIC_STRUCTURES.AND_ONLY;
}
```

**Examples**:
| Logic Expression | AND | OR | NOT | Classification |
|------------------|-----|----|----|----------------|
| `DS` | No | No | No | `and_only` (default) |
| `DS & RS` | Yes | No | No | `and_only` |
| `DS \| RS` | No | Yes | No | `or_only` |
| `(DS & RS) \| GR` | Yes | Yes | No | `and_or_mixed` |
| `!DS & !RS` | Yes | No | Yes (2) | `negation_heavy` |

---

### Dimension 2: Nesting Depth

**Focus**: Structural complexity independent of logic type

```javascript
const NESTING_DEPTHS = {
  FLAT: 'flat',          // maxDepth ≤ 1 (no nesting)
  SHALLOW: 'shallow',    // maxDepth == 2 (one level)
  MEDIUM: 'medium',      // maxDepth == 3 (two levels)
  DEEP: 'deep'           // maxDepth ≥ 4 (three+ levels)
};
```

**Classification Logic** ([data_generator.js:205](../data_generator.js#L205)):
```javascript
function classifyNestingDepth(stats) {
  const { maxDepth } = stats;

  if (maxDepth <= 1) return NESTING_DEPTHS.FLAT;
  if (maxDepth === 2) return NESTING_DEPTHS.SHALLOW;
  if (maxDepth === 3) return NESTING_DEPTHS.MEDIUM;
  return NESTING_DEPTHS.DEEP;
}
```

**Depth Calculation**:
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

**Examples**:
| Logic Expression | Max Depth | Classification |
|------------------|-----------|----------------|
| `DS` | 0 | `flat` |
| `DS & RS` | 0 | `flat` |
| `(DS & RS)` | 1 | `flat` |
| `((DS & RS) \| GR)` | 2 | `shallow` |
| `(((DS & RS) \| GR) & CC)` | 3 | `medium` |
| `((((DS) & RS) \| GR) & CC)` | 4 | `deep` |

---

### Dimension 3: Predicate Count

**Focus**: Number of external predicates (e.g., ICD-10, OBI)

```javascript
const PREDICATE_COUNTS = {
  NONE: 'none',       // 0 predicates (attribute-only policies)
  SINGLE: 'single',   // 1 predicate
  FEW: 'few',         // 2-3 predicates
  MANY: 'many'        // 4+ predicates
};
```

**Classification Logic** ([data_generator.js:222](../data_generator.js#L222)):
```javascript
function classifyPredicateCount(stats) {
  const count = stats.predicateNamespaces.length;

  if (count === 0) return PREDICATE_COUNTS.NONE;
  if (count === 1) return PREDICATE_COUNTS.SINGLE;
  if (count <= 3) return PREDICATE_COUNTS.FEW;
  return PREDICATE_COUNTS.MANY;
}
```

**Predicate Detection**:
```javascript
// Regex to find predicates like P[ICD10:0], P[OBI:1]
const predicateRegex = /P\[([A-Z0-9_:-]+)\]/g;
const predicateNamespaces = new Set();

let match;
while ((match = predicateRegex.exec(logic)) !== null) {
  predicateNamespaces.add(match[1]); // e.g., "ICD10:0"
}
```

**Examples**:
| Logic Expression | Predicates | Count | Classification |
|------------------|------------|-------|----------------|
| `GR` | - | 0 | `none` |
| `DS & P[ICD10:0]` | `ICD10:0` | 1 | `single` |
| `DS & P[ICD10:0] & P[OBI:1]` | `ICD10:0`, `OBI:1` | 2 | `few` |
| `DS & P[ICD10:0] & P[OBI:1] & P[AGE:2] & P[LOC:3]` | 4 predicates | 4 | `many` |

---

### Dimension 4: Set Size

**Focus**: Whitelist cardinality (separated from Merkle depth)

```javascript
const SET_SIZES = {
  NONE: 'none',       // whitelistSize == 0 (no whitelist)
  SMALL: 'small',     // 1-4 elements
  MEDIUM: 'medium',   // 5-16 elements
  LARGE: 'large'      // 17+ elements
};
```

**Classification Logic** ([data_generator.js:239](../data_generator.js#L239)):
```javascript
function classifySetSize(policy) {
  const whitelistSize = policy?.structure?.whitelistSize || 0;

  if (whitelistSize === 0) return SET_SIZES.NONE;
  if (whitelistSize <= 4) return SET_SIZES.SMALL;
  if (whitelistSize <= 16) return SET_SIZES.MEDIUM;
  return SET_SIZES.LARGE;
}
```

**Key Improvement**: **Separated from Merkle Depth**
- Old approach: Used Merkle depth as proxy (conflated set size with tree structure)
- New approach: Uses actual `whitelistSize` from policy structure
- Benefit: Independent dimension, no correlation with range width

**Examples**:
| Whitelist Size | Classification |
|----------------|----------------|
| 0 | `none` (attribute-only policy) |
| 2 | `small` (e.g., ["C00", "C15"]) |
| 8 | `medium` (e.g., 8 ICD-10 codes) |
| 24 | `large` (e.g., 24 disease codes) |

---

### Dimension 5: Range Width

**Focus**: Numeric range predicates (separated from set size)

```javascript
const RANGE_WIDTHS = {
  NONE: 'none',       // No range predicates
  NARROW: 'narrow',   // Range < 10 (approximated by Merkle depth ≤ 3)
  MEDIUM: 'medium',   // 10-50 (depth 4-6)
  WIDE: 'wide'        // 50+ (depth ≥ 7)
};
```

**Classification Logic** ([data_generator.js:258](../data_generator.js#L258)):
```javascript
function classifyRangeWidth(policy) {
  const merkleDepth = policy?.structure?.merkleDepth || 0;
  const logic = policy?.semantics?.logicNormalized || '';

  // Check if policy has range predicates
  const hasRangePredicates = /RANGE|AGE|VALUE/i.test(logic);

  if (!hasRangePredicates) {
    return RANGE_WIDTHS.NONE;
  }

  // Approximate range width by Merkle depth (placeholder)
  // TODO: Replace with actual range parsing from predicates
  if (merkleDepth <= 3) return RANGE_WIDTHS.NARROW;
  if (merkleDepth <= 6) return RANGE_WIDTHS.MEDIUM;
  return RANGE_WIDTHS.WIDE;
}
```

**Note**: Currently approximated by Merkle depth. Future improvement: Parse actual range values from predicate definitions.

**Examples**:
| Logic | Has Range | Merkle Depth | Classification |
|-------|-----------|--------------|----------------|
| `DS` | No | 5 | `none` |
| `AGE[18-25]` | Yes | 3 | `narrow` (range: 7) |
| `AGE[18-50]` | Yes | 5 | `medium` (range: 32) |
| `AGE[0-100]` | Yes | 7 | `wide` (range: 100) |

---

## Dataset Generation Pipeline

### Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase 1: Generate Base Dataset (Reuse PCH)                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ generatePolicyDataset()                                    │ │
│  │ - Generate 120 policies (default)                          │ │
│  │ - 3 executions per policy (default)                        │ │
│  │ - Diverse DUO combinations, structures, parameters        │ │
│  │ Output: 360 execution instances with metadata             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 2: Annotate with SPP Classifications                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ For each policy:                                           │ │
│  │   1. Analyze logic shape (parse structure)                │ │
│  │   2. Classify logic structure (AND/OR/NOT)                │ │
│  │   3. Classify nesting depth (flat/shallow/medium/deep)    │ │
│  │   4. Classify predicate count (none/single/few/many)      │ │
│  │   5. Classify set size (none/small/medium/large)          │ │
│  │   6. Classify range width (none/narrow/medium/wide)       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                             ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase 3: Compute Coverage & Balance Metrics                    │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ For each dimension:                                        │ │
│  │   - Count policies per category                           │ │
│  │   - Calculate min/max ratio                               │ │
│  │   - Calculate coefficient of variation (CV)               │ │
│  │ Output: dataset.__meta.sppSummary, balanceMetrics         │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

### Phase 1: Generate Base Dataset

**Function**: `generateDataset` ([data_generator.js:371](../data_generator.js#L371))

```javascript
async function generateDataset(config = {}) {
  const mergedConfig = {
    policyCount: 120,
    executionsPerPolicy: 3,
    satisfyRatio: 0.5,
    seed: 'spp-dataset',
    ...config
  };

  console.log('Generating SPP dataset...');

  // Reuse PCH dataset generator
  const dataset = await generatePolicyDataset({
    policyCount: mergedConfig.policyCount,
    executionsPerPolicy: mergedConfig.executionsPerPolicy,
    satisfyRatio: mergedConfig.satisfyRatio,
    seed: mergedConfig.seed,
    // ... other PCH config
  });

  // Continue to Phase 2...
}
```

**Key Points**:
- **Reuses PCH infrastructure**: Leverages [policy_content_hiding/data_generator.js](../../policy_content_hiding/data_generator.js)
- **Default configuration**: 120 policies × 3 executions = 360 instances
- **Fewer executions**: 3 vs 20 in PCH (SPP focuses on policy-level structure, not execution variance)

**Output Structure**:
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
    // SPP classifications not yet added
  },
  // ... 359 more instances
]
```

---

### Phase 2: Annotate with Classifications

**Function**: `annotatePolicy` ([data_generator.js:292](../data_generator.js#L292))

```javascript
function annotatePolicy(policy) {
  // 1. Extract and analyze logic
  const logic = policy?.semantics?.logicNormalized ||
                policy?.semantics?.logicOriginal || '';
  const stats = analyzeLogicShape(logic);

  // 2. Apply all 5 classifications
  policy.logicStructure = classifyLogicStructure(stats);
  policy.nestingDepth = classifyNestingDepth(stats);
  policy.predicateCount = classifyPredicateCount(stats);
  policy.setSize = classifySetSize(policy);
  policy.rangeWidth = classifyRangeWidth(policy);

  // 3. Store analysis statistics
  policy.structureStats = stats;

  return policy;
}

// Apply to entire dataset
dataset.forEach(annotatePolicy);
```

**Logic Analysis** ([data_generator.js:104](../data_generator.js#L104)):
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

  // 1. Count operators and track depth
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

  // 2. Extract predicates
  const predicateRegex = /P\[([A-Z0-9_:-]+)\]/g;
  const predicateNamespaces = new Set();
  let match;
  while ((match = predicateRegex.exec(logic)) !== null) {
    predicateNamespaces.add(match[1]);
  }
  stats.predicateNamespaces = Array.from(predicateNamespaces);
  stats.predicateCount = stats.predicateNamespaces.length;

  // 3. Extract attribute tokens
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

**Example Annotation**:
```javascript
// Input policy
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

// After annotatePolicy()
{
  policyId: "pair-5",
  // ... original fields

  // SPP classifications
  logicStructure: "and_or_mixed",  // Has both & and |
  nestingDepth: "shallow",          // maxDepth = 2
  predicateCount: "none",           // No P[...] found
  setSize: "medium",                // whitelistSize = 8
  rangeWidth: "none",               // No range predicates

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

### Phase 3: Compute Coverage & Balance

**Function**: `summarizeDataset` ([data_generator.js:316](../data_generator.js#L316))

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

**Balance Metrics** ([data_generator.js:349](../data_generator.js#L349)):
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
    minMaxRatio: (min / max).toFixed(3),  // Ideal: close to 1.0
    coefficientOfVariation: (stdDev / mean).toFixed(3)  // Ideal: close to 0.0
  };
}
```

**Metrics Interpretation**:
- **Min/Max Ratio**: Measures balance (1.0 = perfect, 0.0 = highly imbalanced)
- **Coefficient of Variation (CV)**: Measures consistency (0.0 = perfect, >0.5 = poor)

**Example Output**:
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
      minMaxRatio: '0.222',  // Poor balance
      coefficientOfVariation: '0.458'
    },
    nestingDepth: {
      min: 5,
      max: 60,
      mean: '30.0',
      minMaxRatio: '0.083',  // Very poor balance
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
      minMaxRatio: '0.400',  // Moderate balance
      coefficientOfVariation: '0.408'
    },
    rangeWidth: {
      min: 5,
      max: 80,
      mean: '30.0',
      minMaxRatio: '0.063',  // Very poor balance
      coefficientOfVariation: '1.069'
    }
  }
}
```

**Console Output**:
```
=== Balance Metrics ===
  logicStructure: min/max=0.222, CV=0.458
  nestingDepth: min/max=0.083, CV=0.729
  predicateCount: min/max=0.100, CV=0.596
  setSize: min/max=0.400, CV=0.408
  rangeWidth: min/max=0.063, CV=1.069
```

---

## Complete Workflow

### Main Entry Point

```javascript
const { generateDataset } = require('./data_generator');

async function main() {
  // Generate annotated dataset
  const dataset = await generateDataset({
    policyCount: 120,
    executionsPerPolicy: 3,
    satisfyRatio: 0.5,
    seed: 'spp-exp-001'
  });

  console.log(`Generated ${dataset.length} annotated policies`);
  console.log('Summary:', dataset.__meta.sppSummary);
  console.log('Balance:', dataset.__meta.balanceMetrics);

  // Access classifications
  dataset.forEach((policy) => {
    console.log(`Policy ${policy.policyId}:`);
    console.log(`  Logic: ${policy.logicStructure}`);
    console.log(`  Depth: ${policy.nestingDepth}`);
    console.log(`  Predicates: ${policy.predicateCount}`);
    console.log(`  Set Size: ${policy.setSize}`);
    console.log(`  Range: ${policy.rangeWidth}`);
  });
}

main();
```

### Data Flow Diagram

```
Input Configuration
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: Generate Base Policies (Reuse PCH)                     │
│   generatePolicyDataset()                                       │
│   Output: 360 instances (120 policies × 3 executions)          │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: Annotate Each Policy                                   │
│   For each policy in dataset:                                   │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Step 1: analyzeLogicShape()                            │ │
│     │   - Parse logic string                                 │ │
│     │   - Count operators (&, |, !)                          │ │
│     │   - Track nesting depth                                │ │
│     │   - Extract predicates                                 │ │
│     │   Output: stats object                                 │ │
│     └─────────────────┬───────────────────────────────────────┘ │
│                       ↓                                         │
│     ┌─────────────────────────────────────────────────────────┐ │
│     │ Step 2: Apply Classifications                           │ │
│     │   logicStructure ← classifyLogicStructure(stats)       │ │
│     │   nestingDepth ← classifyNestingDepth(stats)           │ │
│     │   predicateCount ← classifyPredicateCount(stats)       │ │
│     │   setSize ← classifySetSize(policy)                    │ │
│     │   rangeWidth ← classifyRangeWidth(policy)              │ │
│     └─────────────────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: Compute Summary & Metrics                              │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ summarizeDataset()                                      │  │
│   │   - Count policies per category in each dimension       │  │
│   │   Output: sppSummary                                    │  │
│   └─────────────────┬───────────────────────────────────────┘  │
│                     ↓                                           │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │ calculateBalanceMetrics()                               │  │
│   │   For each dimension:                                   │  │
│   │     - min, max, mean                                    │  │
│   │     - minMaxRatio = min / max                           │  │
│   │     - CV = stdDev / mean                                │  │
│   │   Output: balanceMetrics                                │  │
│   └─────────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
Final Dataset:
  - 360 annotated instances
  - 5 classification dimensions per policy
  - Coverage summary (counts per category)
  - Balance metrics (min/max ratio, CV)
```

---

## Key Design Improvements

### 1. Dimension Decoupling

**Problem in Original Design**:
```javascript
// Old: Single "paramType" conflated set size and Merkle depth
paramType = merkleDepth < 4 ? 'small' : 'large';
// Issue: Merkle depth affects BOTH set size AND tree structure
```

**Solution in New Design**:
```javascript
// New: Separate dimensions
setSize = classifySetSize(policy);      // Uses whitelistSize
rangeWidth = classifyRangeWidth(policy); // Uses merkleDepth (for ranges)
```

**Benefit**:
- Independent classification axes
- Reduced correlation between dimensions
- More granular privacy leakage evaluation

---

### 2. Fine-Grained Categories

**Old Design** (3 categories total):
```
structureType: simple | nested | complex
```

**New Design** (5 dimensions × 4 categories = 20 total):
```
logicStructure: and_only | or_only | and_or_mixed | negation_heavy
nestingDepth: flat | shallow | medium | deep
predicateCount: none | single | few | many
setSize: none | small | medium | large
rangeWidth: none | narrow | medium | wide
```

**Benefit**:
- More nuanced classification
- Better capture of structural variations
- Enables dimension-specific attack evaluation

---

### 3. Balance Metrics

**Purpose**: Assess dataset quality before expensive execution

```javascript
balanceMetrics = {
  logicStructure: {
    minMaxRatio: 0.400,  // Moderate (ideal: >0.5)
    coefficientOfVariation: 0.408  // Good (ideal: <0.3)
  },
  nestingDepth: {
    minMaxRatio: 0.083,  // Poor (needs more deep policies)
    coefficientOfVariation: 0.729  // Poor
  },
  // ...
};
```

**Action Items**:
- If `minMaxRatio < 0.3`: Adjust policy generation to increase minority categories
- If `CV > 0.5`: Rebalance dataset before on-chain execution

---

## Configuration Parameters

### Default Configuration

```javascript
const DEFAULT_DATASET_CONFIG = {
  policyCount: 120,           // 120 policies (vs 200 in PCH)
  executionsPerPolicy: 3,     // 3 executions (vs 5 in PI, 20 in PCH)
  satisfyRatio: 0.5,          // 50% satisfy, 50% don't
  seed: 'spp-dataset'         // Deterministic RNG seed
};
```

### Tuning Guidelines

**For Quick Prototyping**:
```javascript
{
  policyCount: 30,
  executionsPerPolicy: 1
}
// Result: 30 policies, fast generation
```

**For Balanced Distribution**:
```javascript
{
  policyCount: 200,
  executionsPerPolicy: 3,
  semanticLayers: [
    // Customize to increase specific categories
    { name: 'deep', combos: [...], minPolicies: 40 }
  ]
}
```

**For Statistical Power**:
```javascript
{
  policyCount: 500,
  executionsPerPolicy: 5
}
// Result: 2500 instances, better coverage
```

---

## Usage Examples

### Example 1: Generate Annotated Dataset

```javascript
const { generateDataset } = require('./data_generator');

const dataset = await generateDataset({
  policyCount: 120,
  seed: 'exp-001'
});

console.log(`Total policies: ${dataset.length}`);
console.log('Logic structures:', dataset.__meta.sppSummary.logicStructures);
console.log('Balance metrics:', dataset.__meta.balanceMetrics);
```

### Example 2: Filter by Dimension

```javascript
// Get all AND-only policies
const andOnlyPolicies = dataset.filter(
  p => p.logicStructure === 'and_only'
);

// Get all deep nested policies
const deepPolicies = dataset.filter(
  p => p.nestingDepth === 'deep'
);

// Get policies with many predicates and large sets
const complexPolicies = dataset.filter(
  p => p.predicateCount === 'many' && p.setSize === 'large'
);
```

### Example 3: Analyze Coverage

```javascript
const { summarizeDataset } = require('./data_generator');

const summary = summarizeDataset(dataset);

console.log('Logic Structure Distribution:');
Object.entries(summary.logicStructures).forEach(([type, count]) => {
  const pct = (count / dataset.length * 100).toFixed(1);
  console.log(`  ${type}: ${count} (${pct}%)`);
});
```

### Example 4: Validate Balance Before Execution

```javascript
const dataset = await generateDataset({ policyCount: 120 });
const metrics = dataset.__meta.balanceMetrics;

// Check if all dimensions are balanced
const isBalanced = Object.values(metrics).every(
  m => parseFloat(m.minMaxRatio) > 0.3
);

if (!isBalanced) {
  console.warn('Dataset is imbalanced! Consider regenerating with adjusted config.');
  // Show problematic dimensions
  Object.entries(metrics).forEach(([dim, m]) => {
    if (parseFloat(m.minMaxRatio) < 0.3) {
      console.warn(`  ${dim}: minMaxRatio=${m.minMaxRatio} (< 0.3)`);
    }
  });
} else {
  console.log('Dataset is balanced, proceeding to execution...');
  // Execute on-chain
}
```

---

## Performance Considerations

### Time Complexity

```
Phase 1 (Generate): O(P × E) where P=policies, E=executions
  - Policy compilation: ~1 sec
  - Total: ~2 seconds for 120 policies

Phase 2 (Annotate): O(P × L) where L=logic length
  - Logic parsing: O(L) per policy
  - Total: <1 second for 120 policies

Phase 3 (Summarize): O(P × D) where D=dimensions (5)
  - Count aggregation: O(P)
  - Metrics calculation: O(D)
  - Total: <1 second

Total: ~3 seconds (no blockchain execution)
```

### Memory Usage

```
Base dataset: 120 policies × 5KB = ~600KB
Annotations: 120 × 2KB = ~240KB
Statistics: ~50KB
Total: <1MB
```

---

## Integration with Attack Evaluation

### Attack Workflow

```
SPP Dataset
    ↓
┌─────────────────────────────────────────────────────────────────┐
│ Attack: Multi-Dimensional Classification                         │
│                                                                  │
│ For each dimension D in [logic, depth, predicates, set, range]: │
│   1. Extract feature vectors:                                   │
│      X = [gas, calldata, proof size, ...]                       │
│                                                                  │
│   2. Train classifier:                                           │
│      C_D(X) → class in dimension D                              │
│                                                                  │
│   3. Evaluate per-dimension accuracy                            │
└────────────────────┬────────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ Evaluation Metrics                                               │
│   - Accuracy by dimension                                        │
│   - Confusion matrices                                           │
│   - Feature importance per dimension                             │
│   - Cross-dimension correlation                                  │
└─────────────────────────────────────────────────────────────────┘
```

See [attacks.js](../attacks.js) for implementation details.

---

## Conclusion

The Structure and Parameter Privacy dataset generator provides:

1. **Multi-dimensional classification**: 5 independent axes for granular evaluation
2. **Dimension decoupling**: Reduced correlation between classification dimensions
3. **Balance metrics**: Quality assessment before expensive execution
4. **PCH integration**: Reuses proven policy generation infrastructure
5. **Fine-grained categories**: 4 categories per dimension for nuanced analysis

**Key Advantages**:
- Separates logic structure from predicates
- Separates set size from range width
- Provides balance metrics for data quality
- Enables dimension-specific privacy evaluation

**Recommended Workflow**:
1. Generate dataset: `generateDataset()`
2. Validate balance: Check `dataset.__meta.balanceMetrics`
3. If balanced → Execute on-chain
4. If imbalanced → Adjust config and regenerate
5. Evaluate attacks per dimension
6. Analyze privacy leakage by category

This dataset enables comprehensive evaluation of structural and parametric privacy in policy-based access control systems.
