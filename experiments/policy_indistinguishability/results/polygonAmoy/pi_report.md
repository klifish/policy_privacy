# Policy Indistinguishability Evaluation Report

**Date:** 6/14/2026, 10:03:04 PM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 100
- **Executions per policy:** 2
- **Satisfy ratio:** 0.50
- **Test ratio:** 20%

## Pair Composition

- **semantic_equivalent:** 100
- **structural_variant:** 100
- **weak_equivalent:** 100
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5115 (threshold 0.55)
  - Advantage: 0.0108 (threshold 0.05)
  - Permutation p-value: 0.3333 (threshold 0.05)
  - Top features: commitGasUsed (-0.199), accessGasUsed (-0.022), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
  - Advantage: -0.0081 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.4743 (threshold 0.55)
  - Advantage: -0.0041 (threshold 0.05)
  - Permutation p-value: 0.7345 (threshold 0.05)
  - Top features: accessGasUsed (0.593), commitGasUsed (-0.308), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.0369 (threshold 0.05)
- **structural_variant / LogisticRegression:** ✓ PASS
  - AUC: 0.5088 (threshold 0.55)
  - Advantage: -0.0250 (threshold 0.05)
  - Permutation p-value: 0.4850 (threshold 0.05)
  - Top features: commitGasUsed (-0.241), accessGasUsed (0.096), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✓ PASS
  - Advantage: -0.1000 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.6201 (threshold 0.55)
  - Advantage: -0.0854 (threshold 0.05)
  - Permutation p-value: 0.1058 (threshold 0.05)
  - Top features: accessGasUsed (-0.360), commitGasUsed (-0.028), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.0854 (threshold 0.05)
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.5667 (threshold 0.55)
  - Advantage: 0.1585 (threshold 0.05)
  - Permutation p-value: 0.2475 (threshold 0.05)
  - Top features: commitGasUsed (-0.421), accessGasUsed (0.195), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✗ FAIL
  - Advantage: 0.1341 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: commitGasUsed (1.027), accessGasUsed (1.011), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

### Level III

- **structural_variant / Two-sample statistics:** ✓ PASS
  - MMD: -0.0241 (threshold 0.05)
  - KS p-value mean: 0.9525 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: 0.0011 (threshold 0.05)
  - KS p-value mean: 0.5657 (threshold 0.05)

## Two-sample Diagnostics

- **structural_variant:** MMD -0.0241
  - commitGasUsed: KS mean 0.0667, p-value mean 1.0000
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.1333, p-value mean 0.9525
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000
- **controlled_difference:** MMD 0.0011
  - commitGasUsed: KS mean 0.1973, p-value mean 0.6058
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2103, p-value mean 0.5657
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000

## Conclusion

**Status:** ✗ FAIL

Potential leakage detected. Further hardening is required.
