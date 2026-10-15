# Policy Indistinguishability Evaluation Report

**Date:** 9/20/2026, 11:28:42 AM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 100
- **Executions per policy:** 2
- **Satisfy ratio:** 0.50
- **Test ratio:** 20%

## Pair Composition

- **semantic_equivalent:** 100
- **weak_equivalent:** 17
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.4947 (threshold 0.55)
  - Permutation p-value: 0.5788 (threshold 0.05)
  - Top features: commitGasUsed (0.282), accessGasUsed (-0.073), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.5402 (threshold 0.55)
  - Permutation p-value: 0.3234 (threshold 0.05)
  - Top features: accessGasUsed (-0.373), commitGasUsed (0.238), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.0000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (-0.518), commitGasUsed (-0.115), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.5519 (threshold 0.55)
  - Permutation p-value: 0.2754 (threshold 0.05)
  - Top features: commitGasUsed (0.374), accessGasUsed (0.210), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS

### Level II

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: commitGasUsed (1.058), accessGasUsed (1.010), commitCalldataLength (0.000)
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
| overall | 0.433 ± 0.076 | 0% | 0.413 ± 0.071 | 0% | 85.5 | ✓ PASS |
| semantic_equivalent | 0.515 ± 0.084 | 7% | 0.462 ± 0.103 | 0% | 39 | ✓ PASS |
| weak_equivalent | 0.526 ± 0.255 | 0% | 0.512 ± 0.233 | 0% | 6 | — (underpowered, non-gating) |
| controlled_difference | 0.483 ± 0.088 | 3% | 0.439 ± 0.075 | 0% | 40 | — (diagnostic, non-gating) |

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
