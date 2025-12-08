# Dataset Balancing Implementation for SPP Attacks

## Overview

This document describes the dataset balancing implementation added to the Structure & Parameter Privacy (SPP) attack modeling pipeline to address class imbalance issues that were causing model degradation.

## Problem Statement

The original attack modeling suffered from severe class imbalance (e.g., 2.5:1 ratio between `and_only` and `negation_heavy`), causing:
- Logistic Regression models to degenerate (predicting only majority class)
- Attack advantages to be artificially inflated (e.g., 21.6% advantage)
- Unreliable security evaluation results

## Solution

Implemented three balancing strategies with configurable application:

### 1. Oversampling (SMOTE-like)
- Duplicates minority class samples with ±1% random noise
- Preserves all minority class information
- Increases training set size

### 2. Undersampling
- Randomly removes majority class samples to match minority count
- Reduces training set size but maintains data quality
- Faster training

### 3. Hybrid (Both)
- Balances to midpoint between minority and majority counts
- Applies oversampling to minority and undersampling to majority
- Best balance between data preservation and computational efficiency

### 4. None
- No balancing applied (original behavior)
- Useful for baseline comparisons

## Implementation Details

### Modified Files

#### 1. `attacks.js`

**New Functions (lines 68-152):**

```javascript
function oversampleMinorityClass(minorityData, targetCount)
```
- Generates synthetic samples with ±1% noise
- Returns augmented minority dataset

```javascript
function undersampleMajorityClass(majorityData, targetCount)
```
- Randomly shuffles and samples majority class
- Returns reduced majority dataset

```javascript
function balanceDataset(class0Data, class1Data, method = 'both')
```
- Main balancing orchestrator
- Supports: 'oversample', 'undersample', 'both', 'none'
- Returns balanced datasets for both classes

**Modified Function:**

`runSupervisedAttacks(executionResults, config = {})`
- Added `balanceMethod` parameter (default: 'both')
- Calculates imbalance ratio before balancing
- Applies balancing before train/test split
- Logs original vs balanced counts
- Records balancing metadata in results:
  - `originalCount0`, `originalCount1`: Pre-balancing counts
  - `balancedCount0`, `balancedCount1`: Post-balancing counts
  - `imbalanceRatio`: Original ratio (max/min)
  - `balanceMethod`: Method used

#### 2. `run_experiment.js`

**Configuration Changes:**

- Added `balanceMethod: 'both'` to `DEFAULT_CONFIG` (line 84)
- Added `--balance-method <method>` CLI argument (line 135)
- Updated help text (line 174)
- Passed `balanceMethod` to all three `runSupervisedAttacks()` calls:
  - structureType (line 561)
  - predicateCombo (line 568)
  - paramType (line 575)
- Added `balanceMethod` to report config (line 650)
- Added balance method to markdown report (line 343)

## Usage

### Command Line

```bash
# Use default (hybrid balancing)
node run_experiment.js --phase 2 --execution-results <path>

# Use oversampling only
node run_experiment.js --phase 2 --execution-results <path> --balance-method oversample

# Use undersampling only
node run_experiment.js --phase 2 --execution-results <path> --balance-method undersample

# Disable balancing (baseline)
node run_experiment.js --phase 2 --execution-results <path> --balance-method none
```

### Programmatic

```javascript
const { runSupervisedAttacks } = require('./attacks');

const results = runSupervisedAttacks(executionResults, {
  targetAttribute: 'structureType',
  testRatio: 0.3,
  balanceMethod: 'both'  // or 'oversample', 'undersample', 'none'
});
```

## Expected Improvements

Based on the analysis of the `and_only vs negation_heavy` case:

### Before Balancing
- Original ratio: 2.5:1 (71.6% vs 28.4%)
- Model behavior: Degenerated (TP=0, FP=0)
- Attack advantage: 21.6% (FAIL)

### After Balancing (Predicted)
- Balanced ratio: 1:1
- Model behavior: Proper classification
- Attack advantage: <5% (PASS)

## Testing

Integration tested with mock data:

```javascript
// Test configuration
- Original: 15 vs 6 samples (2.5:1 ratio)
- Method: 'both'
- Result: 11 vs 11 samples (balanced)
- Metadata: All fields correctly recorded
```

## Notes

1. **Noise Range**: ±1% noise ensures synthetic samples are realistic while preventing exact duplicates
2. **Balancing Timing**: Applied BEFORE train/test split to ensure both sets benefit from balancing
3. **Minimum Samples**: If either class has < 5 samples, training is skipped (insufficient data)
4. **Backward Compatibility**: Default method is 'both', but 'none' preserves original behavior
5. **Metadata Tracking**: All balancing operations are fully logged in results for reproducibility

## Future Enhancements

Potential improvements:
1. **Advanced SMOTE**: Use k-nearest neighbors for more sophisticated synthetic samples
2. **Stratified Balancing**: Balance within strata (e.g., satisfy/not_satisfy)
3. **Adaptive Thresholds**: Adjust imbalance ratio thresholds based on total sample count
4. **ADASYN**: Adaptive Synthetic Sampling for harder-to-learn regions

## References

- Original issue: Class imbalance causing LR model degradation
- Analysis: `and_only_vs_negation_heavy_analysis.md`
- SPP experiment results: `experiments/structure_and_parameter_privacy/results/report.md`
