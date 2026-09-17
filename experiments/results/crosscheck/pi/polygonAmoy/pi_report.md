# Policy Indistinguishability Evaluation Report

**Date:** 9/17/2026, 10:21:53 AM

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
  - AUC: 0.4444 (threshold 0.55)
  - Permutation p-value: 0.9002 (threshold 0.05)
  - Top features: accessGasUsed (0.245), commitGasUsed (-0.030), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.4224 (threshold 0.55)
  - Permutation p-value: 0.8204 (threshold 0.05)
  - Top features: accessGasUsed (-0.466), commitGasUsed (0.445), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
- **weak_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.6231 (threshold 0.55)
  - Permutation p-value: 0.1477 (threshold 0.05)
  - Top features: commitGasUsed (-0.298), accessGasUsed (0.111), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
- **controlled_difference / LogisticRegression:** ✓ PASS
  - AUC: 0.3900 (threshold 0.55)
  - Permutation p-value: 0.8683 (threshold 0.05)
  - Top features: accessGasUsed (0.268), commitGasUsed (-0.059), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS

### Level II

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (1.070), commitGasUsed (1.044), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS

### Level III

- **semantic_equivalent / Two-sample statistics:** ✓ PASS
  - MMD: -0.0232 (threshold 0.05)
  - KS p-value mean: 0.5860 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: -0.0019 (threshold 0.05)
  - KS p-value mean: 0.5161 (threshold 0.05)

## Two-sample Diagnostics

- **semantic_equivalent:** MMD -0.0232
  - commitGasUsed: KS mean 0.2000, p-value mean 0.5860
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2000, p-value mean 0.5860
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000
- **controlled_difference:** MMD -0.0019
  - commitGasUsed: KS mean 0.2193, p-value mean 0.5161
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2063, p-value mean 0.5924
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
| overall | 0.445 ± 0.033 | 0% | 0.512 ± 0.051 | 10% | 99.5 | ✓ PASS |
| semantic_equivalent | 0.536 ± 0.061 | 3% | 0.517 ± 0.079 | 7% | 40 | ✓ PASS |
| weak_equivalent | 0.596 ± 0.112 | 13% | 0.505 ± 0.117 | 7% | 21 | ✓ PASS |
| controlled_difference | 0.420 ± 0.077 | 0% | 0.525 ± 0.086 | 10% | 39 | — (diagnostic, non-gating) |

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
