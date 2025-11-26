# Policy Indistinguishability (PI) Specialized Generator

## Overview

The `pi_data_generator.js` is a specialized data generator designed specifically for Policy Indistinguishability experiments. Unlike the original PCH (Policy Content Hiding) generator which focuses on individual policy samples, this generator treats **policy pairs** as the primary evaluation unit.

## Problem with Original Generator

The original `data_generator.js` (reused from PCH) had severe limitations for PI experiments:

### Issues:
1. **Low data utilization**: Only 20% of generated policies were used
   - Generated: 200 policies × 2 executions = 400 samples
   - Used: 20 pairs × 2 policies × 2 executions = 80 samples
   - **Wasted: 320 samples (80%)**

2. **Insufficient statistical power**:
   - Only 5 pairs per type → 6 test samples per type
   - 95% CI for accuracy with n=6: [0.54, 1.00] (meaningless)
   - AUC=1.0 results were statistical noise, not real signals

3. **Selection bias**:
   - Greedy first-match algorithm
   - Non-random sampling of policies
   - Systematic bias toward policies generated earlier

4. **Hard-coded targets**:
   ```javascript
   DEFAULT_PAIR_TARGETS = {
     semantic_equivalent: 5,      // Way too low!
     structural_variant: 5,
     weak_equivalent: 5,
     controlled_difference: 5
   }
   ```

## New Generator Design

### Key Improvements

#### 1. **Optimal Pairing Strategy**
```javascript
function buildPairsOptimal(policies, config) {
  // Generate ALL possible pairs: C(n,2) = n*(n-1)/2
  // Classify each pair by type
  // Apply stratified random sampling
  // Maximize data utilization
}
```

**Algorithm:**
- Step 1: Generate all possible policy pairs (O(n²))
- Step 2: Classify each pair by similarity/difference
- Step 3: Random sampling from each category
- Step 4: Return balanced dataset

#### 2. **Configurable Targets**
```javascript
PI_DEFAULT_CONFIG = {
  minPairsPerType: 30,      // Statistical minimum for reliable CI
  targetPairsPerType: 50,   // Target for good power (80%+)
  maxPairsPerType: 100,     // Cap for performance
  ensureBalancedSampling: true
}
```

#### 3. **Full Data Utilization**
- Uses **all** available policies when possible
- Expected utilization: 60-90% (vs 10% before)
- Random sampling eliminates selection bias

#### 4. **Detailed Statistics Tracking**
```javascript
stats: {
  totalPolicies: 200,
  totalPossiblePairs: 19900,
  selectedPairs: 200,
  utilizationRate: 0.85,
  distribution: {
    semantic_equivalent: {
      available: 45,
      selected: 45,
      samplingRate: 1.0
    },
    // ... other types
  }
}
```

## Usage

### Basic Usage

```bash
cd experiments/policy_indistinguishability
node run_experiment.js --output ./results/pi_optimal
```

### With Custom Configuration

```bash
node run_experiment.js \
  --policy-count 200 \
  --executions-per-policy 5 \
  --target-pairs-per-type 50 \
  --min-pairs-per-type 30 \
  --max-pairs-per-type 100 \
  --output ./results/pi_run
```

### Command-Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--policy-count <n>` | Number of policies to generate | 200 |
| `--executions-per-policy <n>` | Executions per policy | 5 |
| `--min-pairs-per-type <n>` | Minimum pairs per type | 30 |
| `--target-pairs-per-type <n>` | Target pairs per type | 50 |
| `--max-pairs-per-type <n>` | Maximum pairs per type | 100 |
| `--test-ratio <float>` | Train/test split | 0.3 |
| `--seed <value>` | Random seed for reproducibility | auto |

### Phased Execution

```bash
# Phase 1: Generate and execute policies
npm run experiment:policy:pi:phase1

# Phase 2: Build pairs with new generator
npm run experiment:policy:pi:phase2

# Phase 3: Run attacks and generate reports
npm run experiment:policy:pi:phase3
```

## Expected Results

### Data Utilization

| Metric | Old Generator | New Generator | Improvement |
|--------|--------------|---------------|-------------|
| Policies used | 21 (10.5%) | ~170 (85%) | **+8x** |
| Total pairs | 20 | 200 | **+10x** |
| Test samples/type | 6 | 30+ | **+5x** |
| 95% CI width | ±0.46 | ±0.18 | **+2.5x precision** |

### Statistical Power

With 50 pairs per type (30 test samples per type):

```python
# Sample size calculation
n = 30  # test samples
observed_accuracy = 0.75

# 95% Confidence Interval
CI = [0.61, 0.87]  # Much narrower!

# Power to detect medium effect (d=0.5)
power = 0.92  # 92% vs 15% before
```

### Example Output

```
Building optimal policy pairs:
  - Total policies: 200
  - Max possible pairs: 19900

  Pair type distribution (all possible):
    - semantic_equivalent: 52 pairs
    - structural_variant: 48 pairs
    - weak_equivalent: 623 pairs
    - controlled_difference: 19177 pairs

  Applying stratified sampling...
    ✓  semantic_equivalent: Using all 52 pairs (below target 50)
    ✓  structural_variant: Using all 48 pairs (below target 50)
    ✓  weak_equivalent: Sampling 50 from 623 pairs
    ✓  controlled_difference: Sampling 50 from 19177 pairs

  Final pair selection:
    - Total pairs: 200
    - Total unique policies: 172
    - Data utilization: 86.0%
```

## Implementation Details

### Pair Type Classification

```javascript
determinePairType(policyA, policyB) {
  similarity = computeSemanticSimilarity(...)
  executionDiffs = countExecutionDifferences(...)
  structureHashEqual = ...

  if (similarity >= 0.999 && !structureHashEqual) {
    if (executionDiffs > 0) return 'structural_variant'
    return 'semantic_equivalent'
  }
  if (similarity >= 0.95) return 'weak_equivalent'
  return 'controlled_difference'
}
```

### Stratified Sampling

```javascript
class SeededRandom {
  sample(array, n) {
    // Fisher-Yates shuffle with seeded RNG
    // Returns first n elements
    // Ensures reproducibility with --seed
  }
}
```

### Data Structure

Each pair contains:
```javascript
{
  pairId: "policy-1::policy-2",
  pairType: "weak_equivalent",
  policies: [
    {
      policyId: "policy-1",
      semantics: {...},
      structure: {...},
      executionProfile: {...},
      features: [
        { execution: 0, commitGas: 500000, ... },
        { execution: 1, commitGas: 495000, ... },
        ...
      ]
    },
    { policyId: "policy-2", ... }
  ],
  semanticSimilarity: 0.96,
  structuralDistance: 1,
  executionDifferences: 2
}
```

## Migration Guide

### From Old Generator

If you have existing results from the old generator:

1. **Re-run Phase 2** with new generator:
   ```bash
   node run_experiment.js \
     --phase 2 \
     --execution-results ./results/pi_execution_results.json \
     --output ./results
   ```

2. **Compare results**:
   - Old: 20 pairs, 80 samples
   - New: 200 pairs, 800 samples
   - Statistical power dramatically improved

### Backwards Compatibility

The new generator is **compatible** with existing:
- Phase 1 outputs (execution results)
- Phase 3 attack modules
- Reporting infrastructure

Only Phase 2 (pairing) is replaced.

## Performance

### Time Complexity

| Operation | Old | New | Notes |
|-----------|-----|-----|-------|
| Pair generation | O(n) | O(n²) | Acceptable for n≤500 |
| Classification | O(1) | O(1) | Per pair |
| Sampling | O(1) | O(k log k) | k = pairs to sample |
| **Total** | O(n) | O(n²) | ~5s for n=200 |

### Memory Usage

- Old: Stores 20 pairs + 21 policies
- New: Stores 200 pairs + 200 policies
- Increase: ~10x (still < 50MB for typical configs)

## Validation

### Test Suite

Run validation tests:
```bash
cd experiments/policy_indistinguishability
npm test  # or node test_pi_generator.js
```

### Manual Validation

Check pair statistics:
```bash
jq '.stats' results/pi_pairs.json
```

Expected output:
```json
{
  "totalPolicies": 200,
  "totalPossiblePairs": 19900,
  "selectedPairs": 200,
  "utilizationRate": 0.86,
  "distribution": {...}
}
```

## Troubleshooting

### Issue: "Only X pairs available (below minimum Y)"

**Cause:** Not enough policies with required similarity.

**Solutions:**
1. Increase `--policy-count`
2. Decrease `--min-pairs-per-type`
3. Adjust similarity thresholds in `PAIR_TYPE_THRESHOLDS`

### Issue: High memory usage

**Cause:** Too many policy pairs (n=500+ gives 124k+ pairs).

**Solution:** Use `--max-pairs-per-type` to cap:
```bash
node run_experiment.js --max-pairs-per-type 50
```

### Issue: Slow pair generation

**Cause:** O(n²) algorithm.

**Solution:**
- Reduce `--policy-count` if < 200
- Use phased execution to cache results
- Consider parallelization (future work)

## Future Improvements

1. **Similarity-guided generation**: Generate policies specifically to create diverse pair types
2. **Parallelized pairing**: Distribute O(n²) work across workers
3. **Adaptive sampling**: Adjust targets based on available pairs
4. **Cross-validation splits**: Built-in k-fold CV for attack evaluation

## References

- Original PCH generator: `../policy_content_hiding/data_generator.js`
- PI experiment paper: [Link to paper]
- Statistical power calculator: [Link]

## Contact

For issues or questions about the PI generator, please file an issue on GitHub or contact the maintainers.
