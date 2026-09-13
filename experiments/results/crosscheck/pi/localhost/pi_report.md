# Policy Indistinguishability Evaluation Report

**Date:** 6/14/2026, 2:33:53 PM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 100
- **Executions per policy:** 2
- **Satisfy ratio:** 0.50
- **Test ratio:** 20%

## Pair Composition

- **semantic_equivalent:** 2
- **structural_variant:** 22
- **weak_equivalent:** 1
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.4498 (threshold 0.55)
  - Advantage: 0.0727 (threshold 0.05)
  - Permutation p-value: 0.8323 (threshold 0.05)
  - Top features: commitGasUsed (-0.666), accessGasUsed (-0.023), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
  - Advantage: 0.0182 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** _skipped_ (Insufficient samples (<10))
- **structural_variant / LogisticRegression:** ✗ FAIL
  - AUC: 0.6000 (threshold 0.55)
  - Advantage: 0.0556 (threshold 0.05)
  - Permutation p-value: 0.3453 (threshold 0.05)
  - Top features: accessGasUsed (0.283), commitGasUsed (0.222), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✗ FAIL
  - Advantage: 0.1667 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** _skipped_ (Insufficient samples (<10))
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.8798 (threshold 0.55)
  - Advantage: 0.3125 (threshold 0.05)
  - Permutation p-value: 0.0020 (threshold 0.05)
  - Top features: commitGasUsed (-0.431), accessGasUsed (-0.081), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✗ FAIL
  - Advantage: 0.0625 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (0.637), commitGasUsed (0.493), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

### Level III

- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: -0.1002 (threshold 0.05)
  - KS p-value mean: 0.5933 (threshold 0.05)

## Two-sample Diagnostics

- **controlled_difference:** MMD -0.1002
  - commitGasUsed: KS mean 0.4786, p-value mean 0.5933
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.3500, p-value mean 0.8530
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000

## Conclusion

**Status:** ✗ FAIL

Potential leakage detected. Further hardening is required.
