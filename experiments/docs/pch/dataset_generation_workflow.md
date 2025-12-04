# Policy Content Hiding - Dataset Generation Workflow

## Overview

The `generateDataset` function is the core data generation pipeline for the Policy Content Hiding experiment. It generates a comprehensive dataset of policy configurations and execution instances to evaluate privacy leakage through blockchain-observable features.

**Location**: [experiments/policy_content_hiding/data_generator.js:1168-1321](../data_generator.js#L1168-L1321)

**Purpose**: Generate a stratified dataset that:
- Contains diverse policy configurations (DUO term combinations, ontology scopes)
- Simulates multiple execution instances per policy
- Provides ground truth labels for privacy evaluation
- Ensures reproducibility through deterministic random generation

---

## Function Signature

```javascript
async function generateDataset(config = {})
```

### Input Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `seed` | string | `'policy-dataset'` | Seed for deterministic random number generation |
| `policyCount` | number | `200` | Target number of unique policies to generate |
| `executionsPerPolicy` | number | `20` | Number of execution instances per policy |
| `satisfyRatio` | number | `0.5` | Ratio of executions that satisfy the policy (0.5 = 50%) |
| `semanticLayers` | Array | `DEFAULT_SEMANTIC_LAYERS` | Stratified sampling layers for policy diversity |
| `duoTerms` | Array\|null | `null` | Whitelist of allowed DUO terms (null = all allowed) |
| `attributeOrder` | Array | `['GR','DS','RS','POA','GS','CC']` | Order of policy attributes |
| `whitelistBuckets` | Array | `[4, 8, 16, 24, 32]` | Possible whitelist sizes for Merkle trees |
| `merkleDepthOptions` | Array | `[3, 4, 5, 6, 7]` | Possible Merkle tree depths |
| `proofTypes` | Array | `['merkle_proof', 'range_proof', ...]` | Types of ZK proofs to use |
| `executionProtections` | Object | `DEFAULT_EXECUTION_PROTECTIONS` | Privacy protection configurations |
| `logicOptions` | Object | `{}` | Options for policy logic generation |
| `duoConflicts` | Array | `[]` | Conflict rules between DUO terms |
| `icd10Scopes` | Array | `ICD10_SCOPE_LIBRARY` | Available ICD-10 disease chapters |
| `obiScopes` | Array | `OBI_SCOPE_LIBRARY` | Available OBI research types |
| `policyDepth` | number | `10` | Maximum policy tree depth |

### Output

Returns an array of dataset entries with attached metadata:

```javascript
{
  [
    { /* dataset entry 0 */ },
    { /* dataset entry 1 */ },
    // ... (policyCount × executionsPerPolicy entries)
  ],
  __meta: {
    seed: string,
    policyCount: number,
    executionsPerPolicy: number,
    satisfyRatio: number,
    attributeOrder: string[],
    coverage: {
      layers: Object,
      layerExecutions: Object,
      duoTerms: Object,
      combos: Object,
      icd10: Object,
      proofTypes: Object
    }
  }
}
```

---

## Execution Pipeline

The dataset generation follows a 6-phase pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Initialization & Configuration                    │
│  • Extract config parameters                                 │
│  • Create deterministic RNG from seed                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: DUO Term Filtering & Layer Normalization          │
│  • Filter allowed DUO terms                                  │
│  • Canonicalize combinations                                 │
│  • Remove invalid layers                                     │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Policy Blueprint Generation                        │
│  • Allocate policies across semantic layers                  │
│  • Create blueprints with:                                   │
│    - Logic expressions                                       │
│    - Merkle whitelists for ontologies                        │
│    - Compiled policy artifacts                               │
│    - Randomized execution protections                        │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Coverage Statistics                                │
│  • Track layer distribution                                  │
│  • Track DUO term distribution                               │
│  • Track ICD-10 scope distribution                           │
│  • Track proof type distribution                             │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 5: Execution Instance Expansion                       │
│  • For each blueprint × executionsPerPolicy:                 │
│    - Generate satisfaction plan                              │
│    - Generate requester attributes                           │
│    - Create dataset entry                                    │
└────────────────────┬────────────────────────────────────────┘
                     ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 6: Metadata Attachment & Return                       │
│  • Attach coverage statistics                                │
│  • Return complete dataset                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Initialization & Configuration

**Lines**: 1168-1189

### Process

1. **Extract configuration parameters** from input config object with defaults
2. **Create deterministic RNG** using Mulberry32 algorithm:
   ```javascript
   const rng = createDeterministicRng(seed);
   ```

### Key Features

- **Deterministic Random Generation**: Same seed produces identical dataset
- **Configurable Parameters**: All aspects of generation can be controlled
- **Default Values**: Sensible defaults for quick experimentation

### Example

```javascript
const dataset = await generateDataset({
  seed: 'experiment-001',
  policyCount: 100,
  executionsPerPolicy: 10
});
// Generates 100 policies × 10 executions = 1000 entries
```

---

## Phase 2: DUO Term Filtering & Layer Normalization

**Lines**: 1191-1210

### Process

1. **Create allowed codes set** (if duoTerms specified):
   ```javascript
   const allowedCodes = duoTerms
     ? new Set(duoTerms.map(canonicalizeAttributeCode))
     : null;  // null = all allowed
   ```

2. **Normalize semantic layers**:
   ```javascript
   const normalizedLayers = semanticLayers
     .map(layer => ({
       ...layer,
       combos: layer.combos
         .map(canonicalizeDuoCombination)
         .filter(combo =>
           !allowedCodes ||
           combo.every(code => allowedCodes.has(code))
         )
     }))
     .filter(layer => layer.combos.length > 0);
   ```

### Canonicalization

The `canonicalizeDuoCombination` function:
- Accepts multiple input formats: `'DS'`, `'DISEASE_SPECIFIC'`, `1`, `['DS', 'RS']`
- Converts to canonical codes: `['DS']`, `['DS', 'RS']`
- Removes duplicates
- Validates against `POLICY_ATTRIBUTE_ORDER`

### Example

```javascript
// Input
semanticLayers = [
  {
    name: 'singleton',
    combos: [['GR'], ['DS'], ['RS'], ['POA']]
  },
  {
    name: 'pair',
    combos: [['GR', 'DS'], ['DS', 'RS'], ['POA', 'GS']]
  }
]
duoTerms = ['DS', 'RS']  // Only allow disease-specific and research-specific

// Output normalizedLayers
[
  {
    name: 'singleton',
    combos: [['DS'], ['RS']]  // GR and POA filtered out
  },
  {
    name: 'pair',
    combos: [['DS', 'RS']]  // Other combinations filtered out
  }
]
```

---

## Phase 3: Policy Blueprint Generation

**Lines**: 1213-1229

### Process

1. **Assemble blueprint configuration**:
   ```javascript
   const blueprintConfig = {
     seed,
     policyCount,
     semanticLayers: normalizedLayers,
     attributeOrder,
     whitelistBuckets,
     merkleDepthOptions,
     proofTypes,
     executionProtections,
     // ...
   };
   ```

2. **Generate blueprints**:
   ```javascript
   const blueprints = await buildPolicyBlueprints(blueprintConfig, rng);
   ```

### Blueprint Generation Algorithm

The `buildPolicyBlueprints` function implements stratified sampling:

#### Step 1: Calculate Layer Allocation

```javascript
// Example with default layers
layers = [
  { name: 'singleton', combos: [['GR'], ['DS'], ['RS']], minPolicies: 60 },
  { name: 'pair', combos: [['GR','DS'], ['GR','RS'], ['DS','RS']], minPolicies: 40 }
]

// Total minimum required: 60 + 40 = 100
// Target policy count: max(200, 100) = 200
// Remaining allocation: 200 - 100 = 100
// Per-layer bonus: floor(100 / 2) = 50
// Leftover: 100 - 50×2 = 0

layerTargets = [
  { layer: 'singleton', target: 60 + 50 = 110 },
  { layer: 'pair', target: 40 + 50 = 90 }
]
```

#### Step 2: Round-Robin Combination Selection

```javascript
for (const { layer, target } of layerTargets) {
  let comboIndex = 0;
  for (let i = 0; i < target; i++) {
    // Round-robin through combinations
    const combo = layer.combos[comboIndex % layer.combos.length];
    comboIndex++;

    const blueprint = await createPolicyBlueprint({
      layerName: layer.name,
      combo,
      rng,
      config,
      index: policyIndex++
    });
    blueprints.push(blueprint);
  }
}
```

**Result**:
- `singleton` layer: 110 policies (37 GR + 37 DS + 36 RS)
- `pair` layer: 90 policies (30 GR+DS + 30 GR+RS + 30 DS+RS)

### Blueprint Structure

Each blueprint contains:

```javascript
{
  // Identification
  id: "singleton-0",
  layerName: "singleton",
  index: 0,
  duoTerms: ["DS"],

  // Semantics (what the policy means)
  semantics: {
    layer: "singleton",
    duoTerms: ["DS"],
    duoTermValues: [1],
    primaryDuoTerm: "DS",
    primaryDuoTermValue: 1,
    hasOntology: true,
    hasObligation: false,
    hasCredential: false,
    predicateCount: 1,
    icd10Scope: {
      id: "NEOPLASMS",
      label: "Neoplasms",
      level: "chapter",
      codeRange: "C00-D49"
    },
    obiScope: null,
    logicOriginal: "DS",
    logicNormalized: "DS"
  },

  // Structure (how the policy is implemented)
  structure: {
    whitelistSize: 16,
    merkleDepth: 5,
    proofType: "merkle_proof",
    policyDepth: 10,
    policyHash: "0xabc123...",
    randomizer: "67890...",
    policyCommitment: "12345...",
    paramsCommitment: "54321...",
    predicateRoots: {
      0: "0xdef456..."  // Merkle root for DS ontology
    },
    whitelists: {
      0: {
        namespace: "ICD10",
        scopeId: "NEOPLASMS",
        scopeLabel: "Neoplasms",
        codeRange: "C00-D49",
        configHash: "0x789...",
        leafCount: 16,
        selectedTerms: ["C00", "C15", "C34", "C50", "C61", ...]
      }
    }
  },

  // Execution (privacy protections)
  execution: {
    path_unify: true,
    gas_pad: true,
    event_pad: false,
    proof_pad: false,
    batch_pattern: "baseline"
  },

  // Compiled artifacts
  artifacts: {
    policy: [0, 1, 0, 0, 0, 0, ...],  // Policy vector
    tokens: [...],                     // Compiled tokens
    numOperations: 3,
    randomizer: "67890...",
    policyCommitment: "12345...",
    logic: {
      original: "DS",
      normalized: "DS"
    },
    depth: 10,
    policyHash: "0xabc123..."
  },

  // Predicate mapping
  predicateSlots: [0],              // DS uses slot 0
  predicateValuesBySlot: { 0: 1 },  // NEOPLASMS = 1
  attributeOrder: ["GR", "DS", "RS", "POA", "GS", "CC"],
  satisfyPlanSeed: 0.42  // RNG state for execution plan
}
```

### Key Blueprint Generation Steps

#### 1. Logic Expression Generation

```javascript
const logic = buildLogicFromCombination(rng, combination, {
  notProbability: 0.2,      // 20% chance to negate individual terms
  groupNotProbability: 0.1, // 10% chance to negate groups
  operators: ['AND', 'OR']
});
```

**Examples**:
- `['DS']` → `"DS"` or `"!DS"`
- `['DS', 'RS']` → `"(DS & RS)"` or `"(DS | RS)"` or `"!(DS & RS)"`
- Complex: `"!((DS | !RS) & GR)"`

#### 2. Ontology Whitelist Construction

For ontology-linked DUO terms (DS, RS, POA, GS, CC):

```javascript
if (combination.includes('DS')) {
  // Choose random ICD-10 chapter
  const chosenScope = randomChoice(rng, ICD10_SCOPE_LIBRARY);
  // e.g., NEOPLASMS with whitelistTerms: ["C00", "C15", "C34", ...]

  // Choose random whitelist size and Merkle depth
  const whitelistSize = randomChoice(rng, [4, 8, 16, 24, 32]);
  const merkleDepth = ensureDepthForSize([3, 4, 5, 6, 7], whitelistSize);

  // Build Merkle tree whitelist
  const whitelist = await buildOntologyWhitelistForScope({
    rng,
    namespace: 'ICD10',
    availableTerms: chosenScope.whitelistTerms,
    whitelistSize,
    merkleDepth
  });

  // Store Merkle root in predicate slot 0
  structure.predicateRoots[0] = whitelist.rootHex;
}
```

**ICD-10 Scope Library** (10 chapters):
- INFECTIOUS (A00-B99)
- NEOPLASMS (C00-D49)
- BLOOD (D50-D89)
- ENDOCRINE (E00-E89)
- MENTAL (F01-F99)
- NERVOUS (G00-G99)
- CIRCULATORY (I00-I99)
- RESPIRATORY (J00-J99)
- DIGESTIVE (K00-K95)
- MUSCULOSKELETAL (M00-M99)

Each chapter has 12 representative codes for whitelist sampling.

#### 3. Policy Compilation

```javascript
const artifacts = await generatePolicyArtifacts(
  {
    policy_id: "singleton-0",
    attributes: { 'GR': false, 'DS': true, 'RS': false, ... },
    predicates: predicateTemplates,  // With Merkle roots filled in
    logic: "DS"
  },
  {
    depth: 10,
    attributeOrder: ["GR", "DS", "RS", "POA", "GS", "CC"]
  }
);
```

**Outputs**:
- `policy`: Encoded policy vector for circuit
- `tokens`: Tokenized representation
- `policyHash`: Unique identifier
- `policyCommitment`: Pedersen commitment for blockchain
- `numOperations`: Number of logic operations

#### 4. Execution Protection Randomization

```javascript
const execution = {};
Object.entries(executionProtections).forEach(([key, values]) => {
  execution[key] = randomChoice(rng, values);
});

// Example:
executionProtections = {
  path_unify: [false, true],
  gas_pad: [true],              // Always enabled
  event_pad: [false, true],
  proof_pad: [false],
  batch_pattern: ['baseline', 'batched', 'staggered']
}

// Randomly assigned:
execution = {
  path_unify: true,
  gas_pad: true,
  event_pad: false,
  proof_pad: false,
  batch_pattern: "staggered"
}
```

---

## Phase 4: Coverage Statistics

**Lines**: 1232-1251

### Process

Track distribution statistics across all blueprints:

```javascript
const coverage = {
  layers: new Map(),           // Policies per layer
  layerExecutions: new Map(),  // Executions per layer (updated in Phase 5)
  duoTerms: new Map(),         // Frequency of each DUO term
  combos: new Map(),           // Frequency of each combination
  icd10: new Map(),            // Frequency of each ICD-10 chapter
  proofTypes: new Map()        // Frequency of each proof type
};

blueprints.forEach((blueprint) => {
  incrementCounter(coverage.layers, blueprint.layerName);
  incrementCounter(coverage.combos, blueprint.duoTerms.join('+'));
  blueprint.duoTerms.forEach((code) =>
    incrementCounter(coverage.duoTerms, code)
  );

  if (blueprint.semantics.icd10Scope) {
    incrementCounter(coverage.icd10, blueprint.semantics.icd10Scope.id);
  }

  incrementCounter(coverage.proofTypes, blueprint.structure.proofType);
});
```

### Example Output

```javascript
coverage = {
  layers: {
    'singleton': 110,
    'pair': 90
  },

  duoTerms: {
    'GR': 73,
    'DS': 73,
    'RS': 54
  },

  combos: {
    'GR': 37,
    'DS': 36,
    'RS': 37,
    'GR+DS': 30,
    'GR+RS': 30,
    'DS+RS': 30
  },

  icd10: {
    'INFECTIOUS': 12,
    'NEOPLASMS': 11,
    'BLOOD': 9,
    'ENDOCRINE': 10,
    'MENTAL': 8,
    'NERVOUS': 7,
    'CIRCULATORY': 9,
    'RESPIRATORY': 11,
    'DIGESTIVE': 10,
    'MUSCULOSKELETAL': 6
  },

  proofTypes: {
    'merkle_proof': 52,
    'range_proof': 48,
    'credential_proof': 51,
    'null_proof': 49
  }
}
```

---

## Phase 5: Execution Instance Expansion

**Lines**: 1254-1302

This is the **most critical phase** where each blueprint is expanded into multiple execution instances.

### Process

```javascript
blueprints.forEach((blueprint, blueprintIndex) => {
  // 1. Generate satisfaction plan
  const plan = buildSatisfactionPlan(executionsPerPolicy, satisfyRatio, rng);

  // 2. Create execution instances
  plan.forEach((satisfy, execIndex) => {
    // 2a. Generate requester attributes
    const requesterAttrs = generateRequesterAttrs(
      blueprint.duoTerms,
      satisfy,
      { attributeOrder, rng }
    );

    // 2b. Build dataset entry
    const datasetEntry = { /* ... */ };

    // 2c. Add ontology information
    if (datasetEntry.predicateSlots.length > 0) {
      // Extract ontology namespace and value
    }

    // 2d. Push to dataset
    dataset.push(datasetEntry);

    // 2e. Update execution coverage
    incrementCounter(coverage.layerExecutions, blueprint.layerName);
  });
});
```

### Step 1: Satisfaction Plan Generation

```javascript
function buildSatisfactionPlan(executionsPerPolicy, satisfyRatio, rng) {
  const satisfyCount = Math.round(executionsPerPolicy * satisfyRatio);
  const plan = Array.from(
    { length: executionsPerPolicy },
    (_, idx) => idx < satisfyCount
  );
  shuffleInPlace(rng, plan);  // Randomize order
  return plan;
}
```

**Example** (executionsPerPolicy=20, satisfyRatio=0.5):
```javascript
plan = [
  true,  false, true,  true,  false,  // 0-4
  false, true,  false, true,  false,  // 5-9
  true,  false, true,  false, true,   // 10-14
  false, true,  false, true,  true    // 15-19
]
// 10 true, 10 false, randomly shuffled
```

### Step 2a: Requester Attribute Generation

```javascript
function generateRequesterAttrs(selection, satisfy, options) {
  const activeCodes = resolveActiveCodes(selection);  // e.g., ["DS"]
  const attrs = attributeOrder.map(() => 0);

  if (satisfy) {
    // Set all required attributes to 1
    activeCodes.forEach((code) => {
      const idx = attributeOrder.indexOf(code);
      if (idx >= 0) {
        attrs[idx] = 1;
      }
    });
    return attrs;
  }

  // Don't satisfy: randomly fail 1 to N attributes
  const failCount = randomInt(rng, 1, activeCodes.length);
  const codesToFail = sampleWithoutReplacement(rng, activeCodes, failCount);
  const codesToPartiallySatisfy = activeCodes.filter(
    code => !codesToFail.includes(code)
  );

  // Partially satisfy some attributes (60% chance)
  codesToPartiallySatisfy.forEach((code) => {
    const idx = attributeOrder.indexOf(code);
    if (idx >= 0 && rng() < 0.6) {
      attrs[idx] = 1;
    }
  });

  return attrs;
}
```

**Examples**:

| Blueprint DUO Terms | Satisfy | Requester Attrs | Explanation |
|---------------------|---------|-----------------|-------------|
| `["DS"]` | `true` | `[0,1,0,0,0,0]` | DS attribute set to 1 |
| `["DS"]` | `false` | `[0,0,0,0,0,0]` | DS attribute failed (set to 0) |
| `["GR", "DS"]` | `true` | `[1,1,0,0,0,0]` | Both GR and DS set to 1 |
| `["GR", "DS"]` | `false` | `[1,0,0,0,0,0]` | DS failed, GR partially satisfied (60% chance) |
| `["GR", "DS"]` | `false` | `[0,0,0,0,0,0]` | Both failed |
| `["DS", "RS"]` | `false` | `[0,1,0,0,0,0]` | RS failed, DS partially satisfied |

### Step 2b: Dataset Entry Construction

```javascript
const datasetEntry = {
  // Execution identification
  policyIndex: blueprintIndex,      // 0-199
  policyId: blueprint.id,           // "singleton-0"
  executionId: execIndex,           // 0-19
  layer: blueprint.layerName,       // "singleton"

  // DUO term information
  duoTerm: ATTRIBUTE_CODE_TO_DUO_TERM[blueprint.semantics.primaryDuoTerm],
  duoTerms: blueprint.duoTerms.map((code) => ATTRIBUTE_CODE_TO_DUO_TERM[code]),
  duoTermCodes: blueprint.duoTerms.slice(),

  // Inherited from blueprint (shared across all executions)
  semantics: blueprint.semantics,
  structure: blueprint.structure,
  execution: blueprint.execution,
  policy: blueprint.artifacts.policy,
  tokens: blueprint.artifacts.tokens,
  numOperations: blueprint.artifacts.numOperations,
  predicateSlots: blueprint.predicateSlots.slice(),
  predicateValuesBySlot: { ...blueprint.predicateValuesBySlot },
  attributeOrder: blueprint.attributeOrder.slice(),
  randomizer: blueprint.artifacts.randomizer,
  policyCommitment: blueprint.artifacts.policyCommitment,

  // Unique to this execution
  requesterAttrs: [0, 1, 0, 0, 0, 0],  // Generated per execution
  satisfy: true                         // From satisfaction plan
};
```

### Step 2c: Ontology Information Extraction

```javascript
if (datasetEntry.predicateSlots.length > 0) {
  const primarySlot = datasetEntry.predicateSlots[0];
  const slotInfo = POLICY_PREDICATE_SLOTS.find(
    (slot) => slot.slot === primarySlot
  );

  datasetEntry.ontologyNamespace = slotInfo ? slotInfo.namespace : null;
  datasetEntry.ontologyValue = datasetEntry.predicateValuesBySlot[primarySlot];
  datasetEntry.requiresOntology = true;
} else {
  datasetEntry.ontologyNamespace = null;
  datasetEntry.ontologyValue = null;
  datasetEntry.requiresOntology = false;
}
```

**Example**:
```javascript
// Blueprint with DS (Disease Specific)
predicateSlots: [0]
predicateValuesBySlot: { 0: 1 }  // NEOPLASMS

// Result
ontologyNamespace: "ICD10"
ontologyValue: 1
requiresOntology: true
```

### Data Expansion Illustration

```
Blueprint 0 (singleton-0, DS, ICD10=NEOPLASMS)
├─ Execution 0:  satisfy=true,  requesterAttrs=[0,1,0,0,0,0]
├─ Execution 1:  satisfy=false, requesterAttrs=[0,0,0,0,0,0]
├─ Execution 2:  satisfy=true,  requesterAttrs=[0,1,0,0,0,0]
├─ Execution 3:  satisfy=false, requesterAttrs=[0,0,0,0,0,0]
├─ ...
└─ Execution 19: satisfy=true,  requesterAttrs=[0,1,0,0,0,0]

Blueprint 1 (singleton-1, GR)
├─ Execution 0:  satisfy=false, requesterAttrs=[0,0,0,0,0,0]
├─ Execution 1:  satisfy=true,  requesterAttrs=[1,0,0,0,0,0]
├─ ...
└─ Execution 19: satisfy=false, requesterAttrs=[0,0,0,0,0,0]

...

Blueprint 199 (pair-89, DS+RS, ICD10=MENTAL, OBI=RCT)
├─ Execution 0:  satisfy=true,  requesterAttrs=[0,1,1,0,0,0]
├─ ...
└─ Execution 19: satisfy=false, requesterAttrs=[0,1,0,0,0,0]
```

**Result**: 200 blueprints × 20 executions = **4000 dataset entries**

---

## Phase 6: Metadata Attachment & Return

**Lines**: 1304-1320

### Process

```javascript
dataset.__meta = {
  seed: 'policy-dataset',
  policyCount: blueprints.length,      // Actual policy count (200)
  executionsPerPolicy: 20,
  satisfyRatio: 0.5,
  attributeOrder: ['GR', 'DS', 'RS', 'POA', 'GS', 'CC'],

  coverage: {
    layers: mapToObject(coverage.layers),
    layerExecutions: mapToObject(coverage.layerExecutions),
    duoTerms: mapToObject(coverage.duoTerms),
    combos: mapToObject(coverage.combos),
    icd10: mapToObject(coverage.icd10),
    proofTypes: mapToObject(coverage.proofTypes)
  }
};

return dataset;
```

### Metadata Structure

```javascript
{
  seed: "policy-dataset",
  policyCount: 200,
  executionsPerPolicy: 20,
  satisfyRatio: 0.5,
  attributeOrder: ["GR", "DS", "RS", "POA", "GS", "CC"],

  coverage: {
    layers: {
      "singleton": 110,
      "pair": 90
    },

    layerExecutions: {
      "singleton": 2200,  // 110 × 20
      "pair": 1800        // 90 × 20
    },

    duoTerms: {
      "GR": 73,
      "DS": 73,
      "RS": 54
    },

    combos: {
      "GR": 37,
      "DS": 36,
      "RS": 37,
      "GR+DS": 30,
      "GR+RS": 30,
      "DS+RS": 30
    },

    icd10: {
      "INFECTIOUS": 12,
      "NEOPLASMS": 11,
      "BLOOD": 9,
      // ... other chapters
    },

    proofTypes: {
      "merkle_proof": 52,
      "range_proof": 48,
      "credential_proof": 51,
      "null_proof": 49
    }
  }
}
```

---

## Complete Dataset Structure

### Array of Entries

```javascript
[
  // Entry 0: Blueprint 0, Execution 0
  {
    policyIndex: 0,
    policyId: "singleton-0",
    executionId: 0,
    layer: "singleton",

    duoTerm: 1,                    // DISEASE_SPECIFIC
    duoTerms: [1],
    duoTermCodes: ["DS"],

    semantics: {
      layer: "singleton",
      primaryDuoTerm: "DS",
      hasOntology: true,
      icd10Scope: {
        id: "NEOPLASMS",
        label: "Neoplasms",
        codeRange: "C00-D49"
      },
      // ...
    },

    structure: {
      whitelistSize: 16,
      merkleDepth: 5,
      proofType: "merkle_proof",
      policyCommitment: "12345...",
      predicateRoots: { 0: "0xdef..." },
      // ...
    },

    execution: {
      gas_pad: true,
      event_pad: false,
      path_unify: true,
      batch_pattern: "baseline"
    },

    policy: [0, 1, 0, 0, 0, 0, ...],
    tokens: [...],
    numOperations: 3,

    predicateSlots: [0],
    predicateValuesBySlot: { 0: 1 },
    attributeOrder: ["GR", "DS", "RS", "POA", "GS", "CC"],

    requesterAttrs: [0, 1, 0, 0, 0, 0],
    satisfy: true,

    ontologyNamespace: "ICD10",
    ontologyValue: 1,
    requiresOntology: true,

    randomizer: "67890...",
    policyCommitment: "12345..."
  },

  // Entry 1: Blueprint 0, Execution 1
  {
    policyIndex: 0,
    policyId: "singleton-0",
    executionId: 1,
    // ... same semantics/structure/execution as Entry 0
    requesterAttrs: [0, 0, 0, 0, 0, 0],  // Different
    satisfy: false                        // Different
  },

  // Entries 2-19: Blueprint 0, Executions 2-19
  // ...

  // Entry 20: Blueprint 1, Execution 0
  {
    policyIndex: 1,
    policyId: "singleton-1",
    executionId: 0,
    layer: "singleton",
    duoTermCodes: ["GR"],
    // New semantics/structure/execution
    requesterAttrs: [1, 0, 0, 0, 0, 0],
    satisfy: true,
    ontologyNamespace: null,
    ontologyValue: null,
    requiresOntology: false
  },

  // Entries 21-3999
  // ...
]
```

### Metadata Object

Attached as `dataset.__meta` property.

---

## Key Design Principles

### 1. Two-Level Expansion

```
Policy Blueprints (1 → 200)
    ↓
Execution Instances (200 → 4000)
```

- **Policy Level**: Diverse policy configurations (DUO combinations, ontologies)
- **Execution Level**: Multiple access requests per policy (satisfy/not satisfy)

### 2. Stratified Sampling

```
Semantic Layers ensure diversity:
├─ singleton layer: Simple policies (single DUO term)
│   ├─ GR: General Research (non-ontology)
│   ├─ DS: Disease Specific (ICD-10)
│   └─ RS: Research Specific (OBI)
│
└─ pair layer: Complex policies (two DUO terms)
    ├─ GR + DS
    ├─ GR + RS
    └─ DS + RS
```

### 3. Deterministic Randomness

```javascript
const rng = createDeterministicRng('policy-dataset');
// Same seed → identical dataset (reproducible experiments)
```

All randomness sources use the seeded RNG:
- Blueprint allocation
- Ontology scope selection
- Whitelist term sampling
- Execution protection configuration
- Satisfaction plan generation
- Requester attribute generation

### 4. Balanced Classification

```
executionsPerPolicy = 20
satisfyRatio = 0.5

Result per policy:
├─ 10 executions satisfy (label: 1)
└─ 10 executions don't satisfy (label: 0)

Overall: 2000 positive + 2000 negative = 4000 balanced samples
```

### 5. Rich Ground Truth

Each entry contains:
- **Policy semantics**: What the policy restricts (DUO terms, ontology scopes)
- **Policy structure**: How it's implemented (whitelist size, Merkle depth, proof type)
- **Privacy protections**: Which countermeasures are active
- **Execution context**: Requester attributes, satisfaction status

This enables:
- Privacy leakage evaluation
- Countermeasure effectiveness analysis
- Multi-target attack simulation

---

## Known Issues & TODOs

### Issue 1: Ontology Predicate Consideration (Line 1253)

```javascript
// TODO: need to be confirmed further, seems not consider ontology
// predicates when generate requester attributes
```

**Problem**:
- `generateRequesterAttrs` only considers DUO term attributes
- Does not validate against ontology predicate values
- Example:
  ```javascript
  Policy: DS=1 AND ICD10=NEOPLASMS
  Requester: requesterAttrs=[0,1,0,0,0,0] (DS=1)

  // But requester might have ICD10=INFECTIOUS (wrong disease)
  // This should be satisfy=false, but may be labeled satisfy=true
  ```

**Current Assumption**:
- Ontology validation occurs in ZK circuit, not in attribute vector
- `requesterAttrs` only encodes DUO term matching
- Actual ontology proof is generated separately during execution

**Impact**: May not affect experiment if ontology proofs are properly generated during blockchain execution phase.

### Issue 2: ICD-10 Coverage Tracking (Line 1246)

```javascript
// TODO: Track ICD-10 scope coverage only in this experiment
```

**Context**: Currently only tracks ICD-10 scopes, but other ontologies (OBI, HANCESTRO, etc.) are also used. Consider tracking all ontology namespaces.

---

## Usage Examples

### Example 1: Generate Default Dataset

```javascript
const { generateDataset } = require('./data_generator');

const dataset = await generateDataset();

console.log(`Generated ${dataset.length} entries`);
console.log('Metadata:', dataset.__meta);
// Output: Generated 4000 entries (200 policies × 20 executions)
```

### Example 2: Small Experiment

```javascript
const dataset = await generateDataset({
  seed: 'test-run-001',
  policyCount: 50,
  executionsPerPolicy: 5
});

// Result: 50 policies × 5 executions = 250 entries
```

### Example 3: Focus on Disease-Specific Policies

```javascript
const dataset = await generateDataset({
  seed: 'disease-only',
  duoTerms: ['DS'],  // Only disease-specific
  policyCount: 100,
  semanticLayers: [
    { name: 'singleton', combos: [['DS']], minPolicies: 100 }
  ]
});

// All 100 policies will be DS-only
// Each will have a random ICD-10 chapter and whitelist size
```

### Example 4: Unbalanced Satisfaction

```javascript
const dataset = await generateDataset({
  seed: 'high-success',
  satisfyRatio: 0.8,  // 80% satisfy, 20% don't
  executionsPerPolicy: 10
});

// Each policy: 8 satisfying executions + 2 non-satisfying executions
```

### Example 5: Custom Semantic Layers

```javascript
const dataset = await generateDataset({
  seed: 'custom-layers',
  semanticLayers: [
    {
      name: 'simple',
      combos: [['GR'], ['DS']],
      minPolicies: 80
    },
    {
      name: 'complex',
      combos: [['DS', 'RS'], ['GR', 'DS', 'RS']],
      minPolicies: 120
    }
  ],
  policyCount: 200
});
```

---

## Performance Considerations

### Time Complexity

```
O(P × E × M)

Where:
P = policyCount (200)
E = executionsPerPolicy (20)
M = merkle tree construction cost (depends on depth)

Main bottlenecks:
1. Merkle tree construction: O(P × M) - for each blueprint with ontology
2. Policy compilation: O(P × C) - circuit compilation per blueprint
3. Requester attribute generation: O(P × E × A) - very fast

Total for default config: ~5-10 seconds
```

### Memory Usage

```
Blueprints: ~200 × 50KB = ~10MB
Dataset entries: ~4000 × 5KB = ~20MB
Total: ~30MB

Dominated by:
- Policy artifacts (compiled circuits)
- Merkle tree data (paths, roots)
- Whitelist terms
```

### Optimization Tips

1. **Use smaller policyCount for prototyping**:
   ```javascript
   const dataset = await generateDataset({ policyCount: 20 });
   ```

2. **Reduce executionsPerPolicy if only testing policy diversity**:
   ```javascript
   const dataset = await generateDataset({ executionsPerPolicy: 5 });
   ```

3. **Limit ontology-linked terms for faster generation**:
   ```javascript
   const dataset = await generateDataset({
     duoTerms: ['GR'],  // No ontology required
     semanticLayers: [
       { name: 'simple', combos: [['GR']], minPolicies: 100 }
     ]
   });
   ```

4. **Smaller whitelist sizes**:
   ```javascript
   const dataset = await generateDataset({
     whitelistBuckets: [4, 8],  // Only small whitelists
     merkleDepthOptions: [3, 4]
   });
   ```

---

## Integration with Evaluation Pipeline

The generated dataset is consumed by:

1. **`executeDataset`** ([data_generator.js:1560](../data_generator.js#L1560))
   - Executes policies on blockchain
   - Generates ZK proofs
   - Collects observable features

2. **Feature Extractors** ([feature_extractor.js](../feature_extractor.js))
   - Extracts gas usage, calldata size, proof size, etc.
   - Computes derived features

3. **Classifiers** ([classifiers.js](../classifiers.js))
   - Trains machine learning models
   - Evaluates privacy leakage

### Workflow

```
generateDataset()
    ↓ dataset[4000]
executeDataset()
    ↓ dataset[4000] + features
extractFeatures()
    ↓ featureMatrix[4000 × F]
trainClassifier()
    ↓ metrics (accuracy, AUC, etc.)
```

---

## Conclusion

The `generateDataset` function implements a sophisticated stratified sampling strategy to generate diverse, balanced, and reproducible datasets for privacy evaluation. Key achievements:

1. **Diversity**: Stratified sampling across semantic layers, DUO combinations, ontology scopes
2. **Balance**: Equal distribution of positive/negative samples
3. **Reproducibility**: Deterministic RNG enables exact dataset recreation
4. **Rich Ground Truth**: Comprehensive metadata for multi-target evaluation
5. **Scalability**: Configurable parameters for different experiment scales

This dataset serves as the foundation for evaluating policy content hiding mechanisms in privacy-preserving data access control systems.
