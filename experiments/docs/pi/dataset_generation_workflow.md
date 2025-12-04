# Policy Indistinguishability - Dataset Generation Workflow

## Overview

The Policy Indistinguishability (PI) experiment evaluates whether an attacker can distinguish between two policies based on observable blockchain features. Unlike Policy Content Hiding (PCH) which focuses on individual policy privacy, PI treats **policy pairs** as the primary evaluation unit.

**Key Files**:
- [pi_data_generator.js](../pi_data_generator.js) - Optimized generator with stratified sampling (recommended)
- [data_generator.js](../data_generator.js) - Original generator with greedy pair construction

**Core Difference from PCH**:
```
PCH: Policy → Executions → Features → Classify(Policy Type)
PI:  Policy → Executions → Pairs → Features → Classify(Policy0 vs Policy1)
```

---

## Architecture Overview

### Two-Phase Pipeline

```
┌──────────────────────────────────────────────────────────────────┐
│  Phase 1: Policy Generation & Execution                          │
│  ┌────────────────┐    ┌──────────────────┐    ┌──────────────┐ │
│  │ Generate       │ -> │ Execute on-chain │ -> │ Aggregate    │ │
│  │ Policies       │    │ (ZK proofs, txs) │    │ by Policy ID │ │
│  └────────────────┘    └──────────────────┘    └──────────────┘ │
│   200 policies          1000 executions         200 policies     │
│   × 5 executions                                with features    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  Phase 2: Pair Construction & Stratified Sampling                │
│  ┌────────────────┐    ┌──────────────────┐    ┌──────────────┐ │
│  │ Generate All   │ -> │ Classify Pair    │ -> │ Stratified   │ │
│  │ Possible Pairs │    │ Types            │    │ Sampling     │ │
│  └────────────────┘    └──────────────────┘    └──────────────┘ │
│   19,900 pairs          4 categories            ~200 pairs       │
│   (200 choose 2)                                (balanced)       │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Policy Generation & Execution

### Step 1: Generate Policies

**Function**: `generatePIDataset` ([pi_data_generator.js:306](../pi_data_generator.js#L306))

```javascript
async function generatePIDataset(config = {}) {
  const fullConfig = {
    policyCount: 200,
    executionsPerPolicy: 5,
    satisfyRatio: 0.5,
    minPairsPerType: 30,
    targetPairsPerType: 50,
    maxPairsPerType: 100,
    randomSeed: null,
    ...config
  };

  // Reuse PCH dataset generator
  const dataset = await generateDataset({
    policyCount: fullConfig.policyCount,
    executionsPerPolicy: fullConfig.executionsPerPolicy,
    satisfyRatio: fullConfig.satisfyRatio,
    seed: fullConfig.randomSeed
  });

  return { dataset, datasetMeta: dataset.__meta, config: fullConfig };
}
```

**Key Points**:
- **Reuses PCH generator**: Leverages the mature [policy_content_hiding/data_generator.js](../../policy_content_hiding/data_generator.js) pipeline
- **Fewer executions per policy**: 5 vs 20 in PCH (PI focuses on policy-level features, not execution-level variance)
- **Same policy diversity**: Semantic layers, DUO combinations, ontology scopes

**Output**:
```javascript
{
  dataset: [
    // 1000 execution instances (200 policies × 5 executions)
    {
      policyIndex: 0,
      policyId: "singleton-0",
      executionId: 0,
      layer: "singleton",
      duoTermCodes: ["DS"],
      semantics: { icd10Scope: {...}, ... },
      structure: { whitelistSize: 16, merkleDepth: 5, ... },
      execution: { gas_pad: true, event_pad: false, ... },
      requesterAttrs: [0, 1, 0, 0, 0, 0],
      satisfy: true,
      features: null  // Not yet executed
    },
    // ...
  ],
  datasetMeta: {
    policyCount: 200,
    executionsPerPolicy: 5,
    coverage: { layers: {...}, duoTerms: {...}, ... }
  },
  config: { policyCount: 200, minPairsPerType: 30, ... }
}
```

---

### Step 2: Execute Policies On-Chain

**Function**: `executePIDataset` ([pi_data_generator.js:345](../pi_data_generator.js#L345))

```javascript
async function executePIDataset(dataset, contract, config = {}) {
  const executionResults = [];

  for (let i = 0; i < dataset.length; i++) {
    const policyData = dataset[i];
    try {
      // Execute using PCH's executePolicy function
      const result = await executePolicy(policyData, contract);
      executionResults.push(result);
    } catch (error) {
      console.error(`Error executing policy ${i}:`, error.message);
    }
  }

  return executionResults;  // Will be used in Phase 2
}
```

**What Happens During Execution**:

1. **Generate ZK Proof**
   ```javascript
   const circuitInput = createCircuitInput(policyCommitment, {
     policy, requesterAttrs, randomizer,
     predicateTypes, merkleRoots, ontologyCodes, ...
   });
   const proof = await generateGroth16Proof(circuitInput);
   ```

2. **Submit Commit Transaction**
   ```javascript
   const commitTx = await contract.commitPolicyWithGasPad(
     policyCommitment, paramsCommitment,
     'ipfs://metadata', gasTarget
   );
   const commitReceipt = await commitTx.wait();
   ```

3. **Submit Access Request Transaction**
   ```javascript
   const accessTx = await contract.requestAccessWithGasPad(
     policyId, proof.pA, proof.pB, proof.pC, proof.pubSignals, gasTarget
   );
   const accessReceipt = await accessTx.wait();
   ```

4. **Extract Observable Features**
   ```javascript
   const features = {
     commitGasUsed: commitReceipt.gasUsed.toString(),
     commitCalldataLength: commitTx.data.length,
     accessGasUsed: accessReceipt.gasUsed.toString(),
     accessCalldataLength: accessTx.data.length,
     proofSize: JSON.stringify(proof).length,
     commitLogsCount: commitEventLogs.length,
     commitLogsSize: computeLogPayloadSizeBytes(commitEventLogs),
     accessLogsCount: accessEventLogs.length,
     accessLogsSize: computeLogPayloadSizeBytes(accessEventLogs),
     blockDifference: accessReceipt.blockNumber - commitReceipt.blockNumber
   };
   ```

**Output**:
```javascript
executionResults = [
  {
    policyIndex: 0,
    policyId: "singleton-0",
    executionId: 0,
    // ... all input fields
    features: {
      commitGasUsed: "485234",
      commitCalldataLength: 324,
      accessGasUsed: "1032456",
      accessCalldataLength: 1856,
      proofSize: 1200,
      commitLogsCount: 1,
      commitLogsSize: 96,
      accessLogsCount: 1,
      accessLogsSize: 96,
      blockDifference: 1
    },
    policyCommitment: "12345...",
    paramsCommitment: "54321...",
    blockchainPolicyId: "1"
  },
  // ... 999 more executions
]
```

---

### Step 3: Aggregate by Policy

**Function**: `aggregatePolicies` ([data_generator.js:64](../data_generator.js#L64))

Groups multiple executions of the same policy into a single policy record:

```javascript
function aggregatePolicies(executionResults) {
  const policies = new Map();

  for (const result of executionResults) {
    const id = result.policyId;

    if (!policies.has(id)) {
      policies.set(id, {
        policyId: id,
        policyIndex: result.policyIndex,
        layer: result.layer,
        duoTerms: result.duoTerms,
        semantics: { ...result.semantics },
        structure: { ...result.structure },
        executionProfile: { ...result.execution },
        features: [],           // Will collect all execution features
        rawExecutions: []       // Keep raw data
      });
    }

    const policy = policies.get(id);
    policy.features.push(mapFeaturesToRecord(result));
    policy.rawExecutions.push(result);
  }

  return Array.from(policies.values());
}
```

**Feature Mapping**:
```javascript
function mapFeaturesToRecord(result) {
  const numeric = {};
  FEATURE_KEYS.forEach((key) => {
    const value = result.features[key];
    numeric[key] = typeof value === 'string' ? parseFloat(value) : value;
  });

  return {
    policyId: result.policyId,
    executionId: result.executionId,
    features: numeric,
    satisfy: result.satisfy ? 1 : 0,
    duoTerm: result.duoTerm,
    ontologyNamespace: result.ontologyNamespace,
    ontologyValue: result.ontologyValue
  };
}
```

**Output**:
```javascript
policies = [
  {
    policyId: "singleton-0",
    policyIndex: 0,
    layer: "singleton",
    duoTerms: [1],
    semantics: {
      primaryDuoTerm: "DS",
      icd10Scope: { id: "NEOPLASMS", ... },
      logicNormalized: "DS",
      ...
    },
    structure: {
      whitelistSize: 16,
      merkleDepth: 5,
      proofType: "merkle_proof",
      policyHash: "0xabc...",
      ...
    },
    executionProfile: {
      gas_pad: true,
      event_pad: false,
      path_unify: true,
      batch_pattern: "baseline"
    },
    features: [
      // Execution 0
      {
        policyId: "singleton-0",
        executionId: 0,
        features: { commitGasUsed: 485234, accessGasUsed: 1032456, ... },
        satisfy: 1,
        duoTerm: 1
      },
      // Execution 1
      { executionId: 1, features: {...}, satisfy: 0, ... },
      // Execution 2
      { executionId: 2, features: {...}, satisfy: 1, ... },
      // Execution 3
      { executionId: 3, features: {...}, satisfy: 0, ... },
      // Execution 4
      { executionId: 4, features: {...}, satisfy: 1, ... }
    ],
    rawExecutions: [/* full execution data */]
  },
  // ... 199 more policies
]
```

---

## Phase 2: Pair Construction & Stratified Sampling

This is the **core innovation** of the PI dataset generator.

### ⚠️ Critical Clarification: Execution Independence

**Question**: Does pair construction depend on execution results?

**Answer**: **NO for pair type classification, YES for attack evaluation**

The pair construction process has two distinct aspects:

1. **Pair Type Classification** (execution-independent):
   - Uses only **policy metadata** from `generateDataset()`:
     - `semantics` (DUO terms, ICD-10 scope, logic)
     - `structure` (whitelist size, Merkle depth, proof type)
     - `execution` (gas_pad, event_pad, path_unify config)
   - **Does NOT use** on-chain execution results
   - Can be done immediately after `generateDataset()` without blockchain deployment

2. **Attack Evaluation** (execution-dependent):
   - Requires actual **on-chain features** from `executePolicy()`:
     - `commitGasUsed`, `accessGasUsed`
     - `commitCalldataLength`, `accessCalldataLength`
     - `proofSize`, `blockDifference`
   - These features are stored in `policy.features[]` after execution
   - Used by classifiers to distinguish pairs

**Data Flow**:

```
generateDataset()
    ↓
dataset[1000] with:
  - semantics ✅ (for pair classification)
  - structure ✅ (for pair classification)
  - execution ✅ (for pair classification)
  - features ❌ (not yet available)
    ↓
    ├─→ buildPairsOptimal(policies)  ← Can run immediately!
    │     Uses: semantics, structure, execution
    │     Output: Pairs classified by type
    │
    └─→ executeDataset(dataset, contract)
          ↓
        executionResults[1000] with:
          - features ✅ (commitGasUsed, accessGasUsed, ...)
            ↓
          aggregatePolicies(executionResults)
            ↓
          policies[200] with features[]
            ↓
          evaluateAttacks(pairs, policies)
            Uses: policies[].features
```

**Example**:

```javascript
// Step 1: Generate policies (no blockchain needed)
const { dataset } = await generatePIDataset({ policyCount: 200 });

// Step 2: Build pairs immediately (uses only metadata)
const policies = dataset.map(entry => ({
  policyId: entry.policyId,
  semantics: entry.semantics,
  structure: entry.structure,
  executionProfile: entry.execution
}));

const { pairs } = buildPairsOptimal(policies, config);
// ✅ Pairs are classified!
// pairs[0].pairType = 'semantic_equivalent'

// Step 3: Later, execute on-chain for attack evaluation
const contract = await deployContract();
const executionResults = await executePIDataset(dataset, contract);
const policiesWithFeatures = aggregatePolicies(executionResults);

// Step 4: Evaluate attacks (needs features)
const attackResults = evaluateDistinguishability(pairs, policiesWithFeatures);
// Uses policiesWithFeatures[].features for classification
```

**Why this matters**:
- ✅ Can **validate pair distribution** before expensive on-chain execution
- ✅ Can **adjust policy generation** to ensure sufficient pairs of each type
- ✅ Separates **pair semantics** (cheap) from **attack evaluation** (expensive)
- ✅ Enables **dry-run analysis** of pair types without blockchain

**Visual Comparison**:

```
┌────────────────────────────────────────────────────────────────┐
│ What generateDataset() Returns (WITHOUT execution)            │
├────────────────────────────────────────────────────────────────┤
│ {                                                              │
│   policyId: "singleton-0",                                     │
│   semantics: { duoTerms: [1], icd10Scope: {...} },    ← ✅    │
│   structure: { whitelistSize: 16, merkleDepth: 5 },   ← ✅    │
│   execution: { gas_pad: true, event_pad: false },     ← ✅    │
│   features: undefined  ← ❌ Not yet available                  │
│ }                                                              │
└────────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ buildPairsOptimal() - Uses metadata only                       │
├────────────────────────────────────────────────────────────────┤
│ Input:  semantics ✅, structure ✅, execution ✅               │
│ Output: Pair types (semantic_equivalent, structural_variant)  │
│ Cost:   ~5 seconds (no blockchain)                            │
└────────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ executeDataset() - Adds on-chain features                      │
├────────────────────────────────────────────────────────────────┤
│ {                                                              │
│   policyId: "singleton-0",                                     │
│   semantics: {...},                                    ← ✅    │
│   structure: {...},                                    ← ✅    │
│   execution: {...},                                    ← ✅    │
│   features: {                                          ← ✅ NEW│
│     commitGasUsed: 485234,                                     │
│     accessGasUsed: 1032456,                                    │
│     proofSize: 1200, ...                                       │
│   }                                                            │
│ }                                                              │
└────────────────────────────────────────────────────────────────┘
                           ↓
┌────────────────────────────────────────────────────────────────┐
│ evaluateAttacks() - Uses features for classification           │
├────────────────────────────────────────────────────────────────┤
│ Input:  pairs (from buildPairsOptimal) + features ✅           │
│ Output: Attack accuracy, distinguishability metrics           │
│ Cost:   ~30 seconds (blockchain execution)                    │
└────────────────────────────────────────────────────────────────┘
```

**Key Insight**:
The pair construction algorithm classifies pairs based on **what policies are designed to do** (semantics, structure), not **what they actually do on-chain** (gas usage, calldata size). This design enables:
- Fast iteration on pair distribution (no blockchain needed)
- Separation of concerns (pair semantics vs. observable features)
- Efficient experimentation (validate pairs before expensive execution)

---

### Pair Types

PI defines 4 types of policy pairs based on semantic similarity and structural differences:

| Pair Type | Semantic Similarity | Structure Differs | Execution Differs | Use Case |
|-----------|---------------------|-------------------|-------------------|----------|
| **Semantic Equivalent** | ≥ 0.999 | Yes | No | Test if structural changes leak information |
| **Structural Variant** | ≥ 0.999 | Yes | Yes | Test if execution protections hide policies |
| **Weak Equivalent** | ≥ 0.95 | Any | Any | Test if similar policies are distinguishable |
| **Controlled Difference** | < 0.95 | Any | Any | Test if different policies are correctly distinguishable |

**Configuration** ([pi_data_generator.js:36](../pi_data_generator.js#L36)):
```javascript
const PAIR_TYPE_THRESHOLDS = {
  semantic_equivalent: {
    similarity: 0.999,
    structureMustDiffer: true,
    executionMustDiffer: false
  },
  structural_variant: {
    similarity: 0.999,
    structureMustDiffer: true,
    executionMustDiffer: true
  },
  weak_equivalent: {
    similarity: 0.95,
    structureMustDiffer: false,
    executionMustDiffer: false
  },
  controlled_difference: {
    similarity: 0.0,
    structureMustDiffer: false,
    executionMustDiffer: false
  }
};
```

---

### Semantic Similarity Computation

**Function**: `computeSemanticSimilarity` ([data_generator.js:130](../data_generator.js#L130))

Computes similarity score between two policies in [0, 1]:

```javascript
function computeSemanticSimilarity(a, b) {
  // 1. Exact logic match (highest priority)
  if (a.logicNormalized && b.logicNormalized &&
      a.logicNormalized === b.logicNormalized) {
    return 1;
  }

  // 2. DUO term overlap (Jaccard similarity)
  const duoA = new Set(a.duoTerms || []);
  const duoB = new Set(b.duoTerms || []);
  const intersection = new Set([...duoA].filter(v => duoB.has(v)));
  const union = new Set([...duoA, ...duoB]);
  const duoScore = union.size === 0 ? 1 : intersection.size / union.size;

  // 3. ICD-10 scope similarity
  const icdScore = a.icd10Scope && b.icd10Scope
    ? (a.icd10Scope.id === b.icd10Scope.id ? 1 : 0.75)
    : 1;

  // 4. OBI scope similarity
  const obiScore = a.obiScope && b.obiScope
    ? (a.obiScope.id === b.obiScope.id ? 1 : 0.75)
    : 1;

  // 5. Predicate count similarity
  const predicateScore = a.predicateCount === b.predicateCount ? 1 : 0.8;

  // 6. Weighted combination (biased towards DUO terms)
  const weightedScore = (
    0.55 * duoScore +
    0.15 * icdScore +
    0.15 * obiScore +
    0.15 * predicateScore
  );

  return Math.max(0, Math.min(1, weightedScore));
}
```

**Examples**:

| Policy A | Policy B | DUO Score | ICD Score | Similarity |
|----------|----------|-----------|-----------|------------|
| DS (NEOPLASMS) | DS (NEOPLASMS) | 1.0 | 1.0 | **1.0** (identical) |
| DS (NEOPLASMS) | DS (INFECTIOUS) | 1.0 | 0.75 | **0.9625** (weak equiv) |
| DS + RS | DS | 0.67 | 1.0 | **0.7185** (controlled diff) |
| DS | GR | 0.0 | 1.0 | **0.45** (controlled diff) |

---

### Structural Fingerprinting

**Function**: `structuralFingerprint` ([data_generator.js:114](../data_generator.js#L114))

Creates a hash of structural parameters to detect differences:

```javascript
function structuralFingerprint(structure, executionProfile) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      policyHash: structure.policyHash,
      proofType: structure.proofType,
      policyDepth: structure.policyDepth,
      whitelistSize: structure.whitelistSize,
      executionProfile  // Includes gas_pad, event_pad, etc.
    }))
    .digest('hex');
}
```

**Example**:
```javascript
// Policy A
structuralFingerprint({
  policyHash: "0xabc...",
  proofType: "merkle_proof",
  policyDepth: 10,
  whitelistSize: 16
}, {
  gas_pad: true,
  event_pad: false
});
// → "a1b2c3d4..."

// Policy B (different whitelist size)
structuralFingerprint({
  policyHash: "0xdef...",
  proofType: "merkle_proof",
  policyDepth: 10,
  whitelistSize: 24  // Different
}, {
  gas_pad: true,
  event_pad: false
});
// → "e5f6g7h8..." (different hash)
```

---

### Execution Profile Differences

**Function**: `countExecutionDifferences` ([data_generator.js:169](../data_generator.js#L169))

Counts how many execution protection parameters differ:

```javascript
function countExecutionDifferences(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let diffs = 0;

  keys.forEach((key) => {
    if (a[key] !== b[key]) {
      diffs += 1;
    }
  });

  return diffs;
}
```

**Example**:
```javascript
profileA = { gas_pad: true, event_pad: false, path_unify: true, batch_pattern: "baseline" };
profileB = { gas_pad: true, event_pad: true,  path_unify: true, batch_pattern: "batched" };

countExecutionDifferences(profileA, profileB);
// → 2 (event_pad and batch_pattern differ)
```

---

### Pair Type Determination

**Function**: `determinePairType` ([data_generator.js:213](../data_generator.js#L213))

Classifies a pair based on similarity and differences:

```javascript
function determinePairType(policyA, policyB) {
  const similarity = computeSemanticSimilarity(
    policyA.semantics, policyB.semantics
  );
  const executionDiffs = countExecutionDifferences(
    policyA.executionProfile, policyB.executionProfile
  );
  const structureHashEqual = structuralFingerprint(policyA.structure, {}) ===
                             structuralFingerprint(policyB.structure, {});

  // Semantic equivalent: ≥99.9% similar, different structure
  if (similarity >= 0.999 && !structureHashEqual) {
    // Structural variant: also has execution differences
    if (executionDiffs > 0) {
      return { type: 'structural_variant', similarity };
    }
    return { type: 'semantic_equivalent', similarity };
  }

  // Weak equivalent: ≥95% similar
  if (similarity >= 0.95) {
    return { type: 'weak_equivalent', similarity };
  }

  // Everything else is controlled difference
  return { type: 'controlled_difference', similarity };
}
```

**Classification Examples**:

| Scenario | Similarity | Structure Equal | Exec Diffs | Result |
|----------|------------|-----------------|------------|--------|
| Same logic, different whitelist size | 1.0 | No | 0 | **semantic_equivalent** |
| Same logic, different protections | 1.0 | No | 2 | **structural_variant** |
| Similar DUO terms (DS vs DS+RS) | 0.97 | No | 1 | **weak_equivalent** |
| Different DUO terms (DS vs GR) | 0.45 | No | 0 | **controlled_difference** |

---

### Optimal Pair Construction

**Function**: `buildPairsOptimal` ([pi_data_generator.js:168](../pi_data_generator.js#L168))

This is the **core innovation** - stratified random sampling for balanced pairs:

```javascript
function buildPairsOptimal(policies, config) {
  const random = new SeededRandom(config.randomSeed);

  // Step 1: Generate ALL possible pairs and classify them
  const allPairs = [];
  const pairsByType = {
    semantic_equivalent: [],
    structural_variant: [],
    weak_equivalent: [],
    controlled_difference: []
  };

  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const policyA = policies[i];
      const policyB = policies[j];

      const metadata = determinePairType(policyA, policyB);
      const pair = createPairRecord(policyA, policyB, metadata.type, metadata);

      allPairs.push(pair);
      pairsByType[metadata.type].push(pair);
    }
  }

  console.log('Pair type distribution (all possible):');
  for (const [type, pairs] of Object.entries(pairsByType)) {
    console.log(`  - ${type}: ${pairs.length} pairs`);
  }

  // Step 2: Stratified sampling for balanced dataset
  const selectedPairs = [];
  const targetCounts = {};

  for (const [type, candidates] of Object.entries(pairsByType)) {
    const available = candidates.length;

    // Determine sample size
    let target;
    if (available === 0) {
      target = 0;
    } else if (available < config.minPairsPerType) {
      target = available;  // Use all (below minimum)
    } else if (available < config.targetPairsPerType) {
      target = available;  // Use all (below target)
    } else if (available <= config.maxPairsPerType) {
      target = config.targetPairsPerType;  // Sample target amount
    } else {
      target = config.maxPairsPerType;  // Cap at maximum
    }

    targetCounts[type] = target;

    // Random sampling without replacement
    if (target > 0) {
      const sampled = random.sample(candidates, target);
      selectedPairs.push(...sampled);
    }
  }

  return { pairs: selectedPairs, stats: {...}, allPairsByType: pairsByType };
}
```

**Sampling Logic**:

```
Available Pairs | Min | Target | Max | Action
----------------|-----|--------|-----|--------
0               | 30  | 50     | 100 | None (warning)
25              | 30  | 50     | 100 | Use all 25 (below min)
45              | 30  | 50     | 100 | Use all 45 (below target)
80              | 30  | 50     | 100 | Sample 50 (at target)
150             | 30  | 50     | 100 | Sample 100 (capped at max)
```

**Example Output**:
```
Building optimal policy pairs:
  - Total policies: 200
  - Max possible pairs: 19,900

  Pair type distribution (all possible):
    - semantic_equivalent: 850 pairs
    - structural_variant: 320 pairs
    - weak_equivalent: 1,230 pairs
    - controlled_difference: 17,500 pairs

  Applying stratified sampling...
    ✓ semantic_equivalent: Sampling 50 from 850 pairs
    ✓ structural_variant: Using all 320 pairs (capped at max 100)
    ✓ weak_equivalent: Sampling 50 from 1,230 pairs
    ✓ controlled_difference: Sampling 100 from 17,500 pairs (capped at max)

  Final pair selection:
    - Total pairs: 300
    - Total unique policies: 185
    - Data utilization: 92.5%
```

---

### Pair Record Structure

**Function**: `createPairRecord` ([data_generator.js:184](../data_generator.js#L184))

Each pair is stored with full metadata:

```javascript
function createPairRecord(policyA, policyB, pairType, metadata) {
  return {
    pairId: `${policyA.policyId}::${policyB.policyId}`,
    pairType,
    policies: [
      {
        policyId: policyA.policyId,
        semantics: policyA.semantics,
        structure: policyA.structure,
        executionProfile: policyA.executionProfile,
        features: policyA.features  // Array of 5 execution features
      },
      {
        policyId: policyB.policyId,
        semantics: policyB.semantics,
        structure: policyB.structure,
        executionProfile: policyB.executionProfile,
        features: policyB.features
      }
    ],
    semanticSimilarity: metadata.similarity,
    structuralDistance: metadata.structureHashEqual ? 0 : 1,
    executionDifferences: metadata.executionDiffs || 0,
    metadata: {
      generatedAt: new Date().toISOString(),
      structureHashEqual: metadata.structureHashEqual,
      ...metadata
    }
  };
}
```

**Example Pair**:
```javascript
{
  pairId: "singleton-5::singleton-23",
  pairType: "semantic_equivalent",

  policies: [
    {
      policyId: "singleton-5",
      semantics: {
        primaryDuoTerm: "DS",
        duoTerms: [1],
        icd10Scope: { id: "NEOPLASMS", label: "Neoplasms" },
        logicNormalized: "DS"
      },
      structure: {
        whitelistSize: 16,
        merkleDepth: 5,
        proofType: "merkle_proof",
        policyHash: "0xabc..."
      },
      executionProfile: {
        gas_pad: true,
        event_pad: false,
        path_unify: true,
        batch_pattern: "baseline"
      },
      features: [
        { executionId: 0, features: { commitGasUsed: 485234, ... }, satisfy: 1 },
        { executionId: 1, features: { commitGasUsed: 487891, ... }, satisfy: 0 },
        // ... 3 more executions
      ]
    },
    {
      policyId: "singleton-23",
      semantics: {
        primaryDuoTerm: "DS",
        duoTerms: [1],
        icd10Scope: { id: "NEOPLASMS", label: "Neoplasms" },
        logicNormalized: "DS"
      },
      structure: {
        whitelistSize: 24,  // Different
        merkleDepth: 6,     // Different
        proofType: "merkle_proof",
        policyHash: "0xdef..."  // Different
      },
      executionProfile: {
        gas_pad: true,
        event_pad: false,
        path_unify: true,
        batch_pattern: "baseline"
      },
      features: [
        { executionId: 0, features: { commitGasUsed: 492100, ... }, satisfy: 1 },
        { executionId: 1, features: { commitGasUsed: 490234, ... }, satisfy: 0 },
        // ... 3 more executions
      ]
    }
  ],

  semanticSimilarity: 1.0,
  structuralDistance: 1,
  executionDifferences: 0,

  metadata: {
    generatedAt: "2025-12-04T10:30:00.000Z",
    structureHashEqual: false,
    similarity: 1.0
  }
}
```

---

## Complete Workflow

### Main Entry Point

**Function**: `executePIDataset` ([pi_data_generator.js:345](../pi_data_generator.js#L345))

```javascript
async function executePIDataset(dataset, contract, config) {
  // Phase 1: Execute policies
  const executionResults = [];
  for (let i = 0; i < dataset.length; i++) {
    const result = await executePolicy(dataset[i], contract);
    executionResults.push(result);
  }

  // Phase 2: Aggregate policies
  const policies = aggregatePolicies(executionResults);

  // Phase 3: Build pairs with optimal sampling
  const pairResult = buildPairsOptimal(policies, config);

  return {
    executionResults,
    policies: pairResult.policies,
    pairs: pairResult.pairs,
    stats: pairResult.stats,
    config
  };
}
```

### Complete Data Flow

```
Input Configuration
    ↓
┌─────────────────────────────────────────────────┐
│ Phase 1A: Generate Policies                     │
│   generateDataset()                             │
│   - 200 policies (diverse DUO combinations)     │
│   - 5 executions each                           │
│   Output: 1000 execution specs with metadata    │
│           (semantics ✅, structure ✅,           │
│            execution ✅, features ❌)            │
└────────────────────┬────────────────────────────┘
                     │
                     ├─→ [OPTIONAL] Build pairs immediately
                     │   buildPairsOptimal(policies) ← Uses metadata only
                     │   Output: Pairs classified by type (no blockchain)
                     │   Use case: Validate pair distribution before execution
                     │
                     ↓
┌─────────────────────────────────────────────────┐
│ Phase 1B: Execute On-Chain (Optional)           │
│   executePolicy() × 1000                        │
│   For each execution:                           │
│     - Generate ZK proof                         │
│     - Submit commit transaction                 │
│     - Submit access transaction                 │
│     - Extract observable features               │
│   Output: 1000 execution results with features  │
│           (ALL metadata + features ✅)          │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Phase 1C: Aggregate by Policy                   │
│   aggregatePolicies()                           │
│   - Group 5 executions per policy               │
│   - Collect features array per policy           │
│   Output: 200 policies with features            │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Phase 2A: Generate All Pairs                    │
│   buildPairsOptimal() - Step 1                  │
│   - Enumerate all C(200,2) = 19,900 pairs       │
│   - Compute similarity for each                 │
│   - Classify into 4 types                       │
│   Uses: semantics, structure, execution         │
│   Output: 19,900 classified pairs               │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Phase 2B: Stratified Sampling                   │
│   buildPairsOptimal() - Step 2                  │
│   - Sample semantic_equivalent (50)             │
│   - Sample structural_variant (50)              │
│   - Sample weak_equivalent (50)                 │
│   - Sample controlled_difference (100)          │
│   Output: ~250 balanced pairs                   │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Phase 3: Attack Evaluation (Requires features)  │
│   evaluateDistinguishability()                  │
│   - Extract feature vectors from policies       │
│   - Train classifier on feature differences     │
│   - Compute accuracy by pair type               │
│   Uses: features ✅ (from Phase 1B)             │
│   Output: Attack metrics, privacy leakage       │
└─────────────────────────────────────────────────┘

Final Dataset:
  - 200 policies with on-chain features (if executed)
  - ~250 pairs (balanced across types)
  - ~185 unique policies used (92.5% utilization)

Note: Phase 2 (pair construction) can run BEFORE Phase 1B (execution)
      Phase 3 (attack evaluation) REQUIRES Phase 1B (execution)
```

---

## Key Design Principles

### 1. Reuse vs. Specialization

**Reused from PCH**:
- Policy generation (semantic layers, DUO combinations)
- Policy compilation (circuit artifacts)
- On-chain execution (ZK proofs, transactions)
- Feature extraction (gas, calldata, events)

**PI-Specific**:
- Fewer executions per policy (5 vs 20)
- Pair-centric evaluation
- Stratified sampling for balanced types
- Similarity metrics for pair classification

### 2. Pair-Centric Philosophy

```
PCH Evaluation:
  Policy → Features → Classifier → Predict(DUO Term)

PI Evaluation:
  Pair(Policy0, Policy1) → Feature Difference → Classifier → Predict(0 or 1)
```

**Why this matters**:
- PCH asks: "What policy is this?"
- PI asks: "Are these two policies the same?"
- PI is closer to real-world attack scenarios (e.g., "Is Alice using the same policy as Bob?")

### 3. Statistical Power Through Stratification

**Problem with Greedy Approach** (original [data_generator.js](../data_generator.js)):
```
Generated pairs:
  - semantic_equivalent: 5 pairs
  - structural_variant: 3 pairs (only 3 found!)
  - weak_equivalent: 12 pairs
  - controlled_difference: 5 pairs

Total: 25 pairs from 200 policies (12.5% utilization)
```

**Solution with Stratified Sampling** ([pi_data_generator.js](../pi_data_generator.js)):
```
Generated pairs:
  - semantic_equivalent: 50 pairs (sampled from 850 available)
  - structural_variant: 50 pairs (sampled from 320 available)
  - weak_equivalent: 50 pairs (sampled from 1,230 available)
  - controlled_difference: 100 pairs (sampled from 17,500 available)

Total: 250 pairs from 200 policies (92.5% utilization)
```

**Benefits**:
- **Balanced dataset**: Equal representation of each pair type
- **Statistical power**: Sufficient samples for reliable evaluation
- **Efficient data use**: Nearly all policies contribute to pairs
- **Reproducibility**: Seeded random sampling ensures consistency

### 4. Observable Features Only

**Excluded**: `proofGenerationTime` (client-side, not on-chain)

**Included** ([data_generator.js:26](../data_generator.js#L26)):
```javascript
const FEATURE_KEYS = [
  'commitGasUsed',          // Observable from transaction receipt
  'commitCalldataLength',   // Observable from transaction data
  'accessGasUsed',
  'accessCalldataLength',
  'proofSize',              // Observable from transaction data
  'commitLogsCount',        // Observable from event logs
  'commitLogsSize',
  'accessLogsCount',
  'accessLogsSize',
  'blockDifference'         // Observable from block numbers
];
```

**Rationale**: PI evaluates whether policies are distinguishable based **only on blockchain-observable features**, not client-side timing.

---

## Configuration Parameters

### PI-Specific Configuration

```javascript
const PI_DEFAULT_CONFIG = {
  // Policy generation (inherited from PCH)
  policyCount: 200,
  executionsPerPolicy: 5,
  satisfyRatio: 0.5,

  // Pair sampling (PI-specific)
  minPairsPerType: 30,        // Warn if below this
  targetPairsPerType: 50,     // Ideal sample size
  maxPairsPerType: 100,       // Cap to avoid imbalance

  // Reproducibility
  randomSeed: null,           // null = auto-generate

  // Sampling strategy
  ensureBalancedSampling: true
};
```

### Tuning Guidelines

**For Quick Prototyping**:
```javascript
{
  policyCount: 50,
  executionsPerPolicy: 3,
  minPairsPerType: 10,
  targetPairsPerType: 20,
  maxPairsPerType: 30
}
// Result: ~80 pairs in 5-10 minutes
```

**For Statistical Power**:
```javascript
{
  policyCount: 300,
  executionsPerPolicy: 10,
  minPairsPerType: 50,
  targetPairsPerType: 100,
  maxPairsPerType: 200
}
// Result: ~400 pairs in 30-60 minutes
```

**For Maximum Coverage**:
```javascript
{
  policyCount: 500,
  executionsPerPolicy: 5,
  minPairsPerType: 100,
  targetPairsPerType: 200,
  maxPairsPerType: 500
}
// Result: ~800 pairs in 45-90 minutes
```

---

## Usage Examples

### Example 1: Generate Complete PI Dataset

```javascript
const { generatePIDataset, executePIDataset } = require('./pi_data_generator');
const { ethers } = require('hardhat');

async function main() {
  // Step 1: Generate policies
  const { dataset, config } = await generatePIDataset({
    policyCount: 200,
    executionsPerPolicy: 5,
    randomSeed: 'experiment-001'
  });

  // Step 2: Deploy contract
  const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();

  const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
  const contract = await PolicyPrivacy.deploy(await verifier.getAddress());
  await contract.waitForDeployment();

  // Step 3: Execute and build pairs
  const result = await executePIDataset(dataset, contract, config);

  console.log(`Generated ${result.pairs.length} pairs`);
  console.log(`Data utilization: ${(result.stats.utilizationRate * 100).toFixed(1)}%`);

  // Save results
  const fs = require('fs');
  fs.writeFileSync('pi_pairs.json', JSON.stringify(result.pairs, null, 2));
}

main();
```

### Example 2: Analyze Pair Distribution

```javascript
const { buildPairsFromExecutionResults } = require('./pi_data_generator');
const fs = require('fs');

// Load execution results from previous run
const executionResults = JSON.parse(fs.readFileSync('execution_results.json'));

// Build pairs with custom targets
const { pairs, stats } = buildPairsFromExecutionResults(executionResults, {
  minPairsPerType: 20,
  targetPairsPerType: 40,
  maxPairsPerType: 80,
  randomSeed: 12345
});

// Analyze distribution
console.log('Pair Statistics:');
for (const [type, info] of Object.entries(stats.distribution)) {
  console.log(`${type}:`);
  console.log(`  Available: ${info.available}`);
  console.log(`  Selected: ${info.selected}`);
  console.log(`  Sampling rate: ${(info.samplingRate * 100).toFixed(1)}%`);
}
```

### Example 3: Custom Pair Type Filtering

```javascript
const { buildPairsOptimal } = require('./pi_data_generator');

// Suppose you already have policies
const policies = [...]; // from aggregatePolicies()

// Focus only on semantic equivalent pairs
const result = buildPairsOptimal(policies, {
  minPairsPerType: 0,
  targetPairsPerType: 100,
  maxPairsPerType: 100,
  randomSeed: 'semantic-only'
});

// Filter to specific type
const semanticPairs = result.pairs.filter(
  pair => pair.pairType === 'semantic_equivalent'
);

console.log(`Found ${semanticPairs.length} semantic equivalent pairs`);
```

---

## Comparison: Original vs. Optimized Generator

### Original Generator ([data_generator.js](../data_generator.js))

**Approach**: Greedy pair construction with target counts

```javascript
function buildPairs(policies, targets) {
  const remaining = { ...targets };
  const pairs = [];

  // Phase 1: Match within semantic groups
  for (const group of semanticGroups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const { type } = determinePairType(group[i], group[j]);
        if (remaining[type] > 0) {
          pairs.push(createPairRecord(group[i], group[j], type));
          remaining[type]--;
        }
      }
    }
  }

  // Phase 2: Fallback matching across all policies
  // (similar nested loop)

  return pairs;
}
```

**Problems**:
- ❌ Stops as soon as target reached (early pairs dominate)
- ❌ No randomization (always same pairs for same input)
- ❌ Low data utilization (many policies unused)
- ❌ Imbalanced types (hard to find rare types)

**Typical Output**:
```
semantic_equivalent: 5 pairs (target: 5) ✓
structural_variant: 3 pairs (target: 5) ✗ (insufficient)
weak_equivalent: 5 pairs (target: 5) ✓
controlled_difference: 5 pairs (target: 5) ✓

Total: 18 pairs from 200 policies (9% utilization)
```

---

### Optimized Generator ([pi_data_generator.js](../pi_data_generator.js))

**Approach**: Stratified random sampling from all possible pairs

```javascript
function buildPairsOptimal(policies, config) {
  // Step 1: Generate ALL possible pairs
  const allPairs = [];
  const pairsByType = { /* 4 categories */ };

  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const pair = classifyPair(policies[i], policies[j]);
      allPairs.push(pair);
      pairsByType[pair.type].push(pair);
    }
  }

  // Step 2: Random sample from each type
  const selectedPairs = [];
  for (const [type, candidates] of Object.entries(pairsByType)) {
    const target = determineTarget(candidates.length, config);
    const sampled = randomSample(candidates, target);
    selectedPairs.push(...sampled);
  }

  return selectedPairs;
}
```

**Advantages**:
- ✅ Explores full pair space (all 19,900 pairs)
- ✅ Random sampling (different pairs each run with different seed)
- ✅ High data utilization (90%+ policies used)
- ✅ Balanced types (adaptive target setting)
- ✅ Transparent statistics (know what's available)

**Typical Output**:
```
semantic_equivalent: 50 pairs (target: 50, available: 850) ✓
structural_variant: 50 pairs (target: 50, available: 320) ✓
weak_equivalent: 50 pairs (target: 50, available: 1230) ✓
controlled_difference: 100 pairs (target: 100, available: 17500) ✓

Total: 250 pairs from 200 policies (92.5% utilization)
```

---

## Performance Considerations

### Time Complexity

```
Phase 1A: Generate Policies
  O(P) where P = policyCount
  Time: ~1 second for 200 policies

Phase 1B: Execute On-Chain
  O(P × E × C) where E = executionsPerPolicy, C = circuit/contract cost
  Time: ~20 seconds for 1000 executions (200 × 5)
  Bottleneck: ZK proof generation + blockchain transactions

Phase 1C: Aggregate Policies
  O(P × E)
  Time: negligible (<1 second)

Phase 2A: Generate All Pairs
  O(P²) for enumeration, O(P²) for similarity computation
  Time: ~5 seconds for C(200,2) = 19,900 pairs

Phase 2B: Stratified Sampling
  O(T × log(P²)) where T = total target pairs
  Time: negligible (<1 second)

Total: ~30 seconds dominated by Phase 1B
```

### Memory Usage

```
Policies: 200 × 50KB = ~10MB
Execution results: 1000 × 5KB = ~5MB
All pairs: 19,900 × 2KB = ~40MB
Selected pairs: 250 × 20KB = ~5MB

Peak: ~60MB (during pair generation)
Final: ~20MB (after sampling)
```

### Optimization Tips

1. **Reduce policy count for prototyping**:
   ```javascript
   { policyCount: 50, executionsPerPolicy: 3 }
   // 5x faster, sufficient for testing
   ```

2. **Parallel execution** (if supported):
   ```javascript
   // Execute policies in batches
   const batchSize = 10;
   for (let i = 0; i < dataset.length; i += batchSize) {
     await Promise.all(
       dataset.slice(i, i + batchSize).map(p => executePolicy(p, contract))
     );
   }
   ```

3. **Cache execution results**:
   ```javascript
   const fs = require('fs');
   const cacheFile = 'execution_cache.json';

   if (fs.existsSync(cacheFile)) {
     executionResults = JSON.parse(fs.readFileSync(cacheFile));
   } else {
     executionResults = await executeAllPolicies(...);
     fs.writeFileSync(cacheFile, JSON.stringify(executionResults));
   }
   ```

---

## Integration with Evaluation Pipeline

The PI dataset feeds into attack evaluation:

### Attack Workflow

```
PI Dataset
    ↓
┌─────────────────────────────────────────────────┐
│ Attack: Feature-Based Pair Distinguishing       │
│                                                  │
│ For each pair (P0, P1):                         │
│   1. Extract feature vectors:                   │
│      f0 = aggregate(P0.features)                │
│      f1 = aggregate(P1.features)                │
│                                                  │
│   2. Compute feature difference:                │
│      Δf = |f0 - f1|                             │
│                                                  │
│   3. Train classifier:                          │
│      C(Δf) → {0, 1}                             │
│      (predict which policy is which)            │
└────────────────────┬────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────┐
│ Evaluation Metrics                              │
│   - Accuracy (by pair type)                     │
│   - AUC-ROC (by pair type)                      │
│   - Distinguishability score                    │
│   - Privacy leakage quantification              │
└─────────────────────────────────────────────────┘
```

### Attack Implementation

See [attacks.js](../attacks.js) for full implementation:

```javascript
function evaluatePairDistinguishability(pairs) {
  const results = [];

  for (const pair of pairs) {
    const [policy0, policy1] = pair.policies;

    // Aggregate features across executions
    const features0 = aggregateFeatures(policy0.features);
    const features1 = aggregateFeatures(policy1.features);

    // Compute feature difference
    const diff = computeFeatureDiff(features0, features1);

    // Classifier prediction
    const prediction = classifier.predict(diff);

    results.push({
      pairId: pair.pairId,
      pairType: pair.pairType,
      prediction,
      groundTruth: 0,  // or 1 (randomized)
      correct: prediction === groundTruth
    });
  }

  // Compute metrics by pair type
  const metricsByType = {};
  for (const type of ['semantic_equivalent', ...]) {
    const typePairs = results.filter(r => r.pairType === type);
    metricsByType[type] = {
      accuracy: computeAccuracy(typePairs),
      auc: computeAUC(typePairs)
    };
  }

  return metricsByType;
}
```

---

## Summary: Execution Dependency

### Quick Answer to "Does pair construction depend on execution results?"

**Short Answer**: **NO**

**Detailed Answer**:

| Task | Requires Execution? | Uses | Cost | When to Run |
|------|---------------------|------|------|-------------|
| **Pair Type Classification** | ❌ NO | semantics, structure, execution config | ~5 sec | Immediately after `generateDataset()` |
| **Attack Evaluation** | ✅ YES | on-chain features (gas, calldata, etc.) | ~30 sec | After `executeDataset()` |

### Practical Workflow Options

**Option 1: Generate → Execute → Pair → Evaluate** (Standard)
```javascript
// 1. Generate policies
const { dataset } = await generatePIDataset({ policyCount: 200 });

// 2. Deploy contract and execute
const contract = await deployContract();
const { pairs, policies } = await executePIDataset(dataset, contract);

// 3. Evaluate attacks
const results = evaluateDistinguishability(pairs, policies);
```

**Option 2: Generate → Pair → Execute → Evaluate** (Optimized)
```javascript
// 1. Generate policies
const { dataset } = await generatePIDataset({ policyCount: 200 });

// 2. Build pairs BEFORE execution (validate distribution)
const policies = extractPolicyMetadata(dataset);
const { pairs, stats } = buildPairsOptimal(policies);
console.log('Pair distribution:', stats.distribution);

// If distribution is good, proceed with execution
if (stats.distribution.semantic_equivalent.selected >= 50) {
  // 3. Deploy contract and execute
  const contract = await deployContract();
  const executionResults = await executeDataset(dataset, contract);

  // 4. Aggregate features
  const policiesWithFeatures = aggregatePolicies(executionResults);

  // 5. Evaluate attacks (reuse pairs from step 2)
  const results = evaluateDistinguishability(pairs, policiesWithFeatures);
}
```

**Option 3: Generate → Pair Only** (Dry Run)
```javascript
// 1. Generate policies
const { dataset } = await generatePIDataset({ policyCount: 200 });

// 2. Build pairs (no blockchain needed)
const policies = extractPolicyMetadata(dataset);
const { pairs, stats } = buildPairsOptimal(policies);

// 3. Analyze pair distribution
console.log('Found pairs:', stats.distribution);
// semantic_equivalent: 850 available → 50 selected
// structural_variant: 320 available → 50 selected
// ...

// 4. Adjust policy generation if needed
if (stats.distribution.structural_variant.available < 50) {
  console.log('Need more diverse execution protections!');
  // Regenerate with different config
}
```

### Key Takeaways

1. **Pair classification is cheap and fast** (no blockchain, ~5 seconds)
2. **Can validate pair distribution before expensive execution** (saves time/gas)
3. **Execution is only needed for attack evaluation** (actual privacy leakage)
4. **Two-stage design enables iterative optimization** (adjust → validate → execute)

---

## Conclusion

The Policy Indistinguishability dataset generation pipeline is a sophisticated two-phase system:

1. **Phase 1**: Reuses proven PCH infrastructure for policy generation and on-chain execution
2. **Phase 2**: Introduces novel stratified sampling for balanced pair construction

**Key Innovations**:
- **Pair-centric evaluation**: Closer to real-world attack scenarios
- **Stratified random sampling**: Ensures balanced, representative dataset
- **High data utilization**: Nearly all generated policies contribute to pairs
- **Transparent statistics**: Full visibility into pair distribution
- **Execution independence**: Pair classification without blockchain (fast validation)

**Recommended Usage**:
- Use [pi_data_generator.js](../pi_data_generator.js) for new experiments (optimized)
- Use [data_generator.js](../data_generator.js) only for reproducing legacy results
- **Validate pairs before execution** to save time and ensure good distribution

**Next Steps**:
1. Generate PI dataset: `generatePIDataset()`
2. **(Optional)** Validate pairs: `buildPairsOptimal()` - no blockchain needed
3. Execute on-chain: `executePIDataset()` - only if pair distribution is good
4. Evaluate attacks: `evaluatePairDistinguishability()`
5. Analyze results: Metrics by pair type, privacy leakage quantification

This dataset enables rigorous evaluation of policy indistinguishability under blockchain-observable adversaries.
