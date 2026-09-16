# Policy Indistinguishability Evaluation Report

**Date:** 9/16/2026, 1:19:11 AM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 100
- **Executions per policy:** 2
- **Satisfy ratio:** 0.50
- **Test ratio:** 20%

## Pair Composition

- **semantic_equivalent:** 100
- **weak_equivalent:** 50
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.4870 (threshold 0.55)
  - Permutation p-value: 0.6188 (threshold 0.05)
  - Top features: commitGasUsed (0.119), accessGasUsed (0.026), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
- **semantic_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.6082 (threshold 0.55)
  - Permutation p-value: 0.1317 (threshold 0.05)
  - Top features: accessGasUsed (0.192), commitGasUsed (0.005), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.5000 (threshold 0.55)
  - Permutation p-value: 0.5349 (threshold 0.05)
  - Top features: commitGasUsed (-0.680), accessGasUsed (-0.357), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
- **controlled_difference / LogisticRegression:** ✓ PASS
  - AUC: 0.3389 (threshold 0.55)
  - Permutation p-value: 0.9561 (threshold 0.05)
  - Top features: commitGasUsed (0.301), accessGasUsed (-0.068), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS

### Level II

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (1.024), commitGasUsed (1.009), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS

### Level III

- **semantic_equivalent / Two-sample statistics:** ✓ PASS
  - MMD: 0.0102 (threshold 0.05)
  - KS p-value mean: 0.2365 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: 0.0059 (threshold 0.05)
  - KS p-value mean: 0.4816 (threshold 0.05)

## Two-sample Diagnostics

- **semantic_equivalent:** MMD 0.0102
  - commitGasUsed: KS mean 0.1667, p-value mean 0.7990
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2667, p-value mean 0.2365
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000
- **controlled_difference:** MMD 0.0059
  - commitGasUsed: KS mean 0.1920, p-value mean 0.6465
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2303, p-value mean 0.4816
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000

## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each scope is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker distinguishes the pair type. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Scope | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| overall | 0.428 ± 0.044 | 0% | 0.512 ± 0.054 | 13% | 156 | ✓ PASS |
| semantic_equivalent | 0.543 ± 0.086 | 17% | 0.484 ± 0.081 | 0% | 40 | ✓ PASS |
| weak_equivalent | 0.539 ± 0.117 | 3% | 0.490 ± 0.114 | 7% | 21 | ✓ PASS |
| controlled_difference | 0.456 ± 0.095 | 3% | 0.501 ± 0.081 | 7% | 96 | — (diagnostic, non-gating) |

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
