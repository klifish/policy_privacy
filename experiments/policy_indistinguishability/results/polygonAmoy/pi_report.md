# Policy Indistinguishability Evaluation Report

**Date:** 6/15/2026, 11:36:25 AM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 1077
- **Executions per policy:** 2
- **Satisfy ratio:** 1.00
- **Test ratio:** 30%

## Pair Composition

- **semantic_equivalent:** 100
- **structural_variant:** 100
- **weak_equivalent:** 100
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5744 (threshold 0.55)
  - Advantage: 0.0886 (threshold 0.05)
  - Permutation p-value: 0.0120 (threshold 0.05)
  - Top features: commitGasUsed (-0.081), accessGasUsed (0.058), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.0696 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.4618 (threshold 0.55)
  - Advantage: -0.2033 (threshold 0.05)
  - Permutation p-value: 0.6866 (threshold 0.05)
  - Top features: commitGasUsed (-0.200), accessGasUsed (0.003), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.1923 (threshold 0.05)
- **structural_variant / LogisticRegression:** ✓ PASS
  - AUC: 0.5395 (threshold 0.55)
  - Advantage: -0.3480 (threshold 0.05)
  - Permutation p-value: 0.2555 (threshold 0.05)
  - Top features: accessGasUsed (0.468), commitGasUsed (-0.259), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✓ PASS
  - Advantage: -0.1667 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.5322 (threshold 0.55)
  - Advantage: 0.2065 (threshold 0.05)
  - Permutation p-value: 0.2934 (threshold 0.05)
  - Top features: accessGasUsed (-0.459), commitGasUsed (0.111), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✗ FAIL
  - Advantage: 0.1304 (threshold 0.05)
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.6072 (threshold 0.55)
  - Advantage: 0.1118 (threshold 0.05)
  - Permutation p-value: 0.0599 (threshold 0.05)
  - Top features: commitGasUsed (-0.315), accessGasUsed (0.200), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✗ FAIL
  - Advantage: 0.1118 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: commitGasUsed (1.056), accessGasUsed (1.029), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

### Level III

- **structural_variant / Two-sample statistics:** ✓ PASS
  - MMD: -0.0241 (threshold 0.05)
  - KS p-value mean: 0.9525 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: 0.0049 (threshold 0.05)
  - KS p-value mean: 0.5471 (threshold 0.05)

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
- **controlled_difference:** MMD 0.0049
  - commitGasUsed: KS mean 0.1907, p-value mean 0.6484
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2190, p-value mean 0.5471
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
