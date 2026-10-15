# Policy Indistinguishability Evaluation Report

**Date:** 9/20/2026, 9:43:26 AM

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
  - AUC: 0.0952 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (-0.080), commitGasUsed (-0.079), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.3293 (threshold 0.55)
  - Permutation p-value: 0.9741 (threshold 0.05)
  - Top features: commitGasUsed (-0.171), accessGasUsed (-0.167), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.0000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: commitGasUsed (-0.149), accessGasUsed (-0.147), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.8185 (threshold 0.55)
  - Permutation p-value: 0.0020 (threshold 0.05)
  - Top features: accessGasUsed (0.591), commitGasUsed (-0.048), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS

### Level II

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (0.081), commitGasUsed (0.071), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS

### Level III

- **semantic_equivalent / Two-sample statistics:** ✓ PASS
  - MMD: -0.0075 (threshold 0.05)
  - KS p-value mean: 0.7990 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✗ FAIL
  - MMD: 0.6145 (threshold 0.05)
  - KS p-value mean: 0.2400 (threshold 0.05)

## Two-sample Diagnostics

- **semantic_equivalent:** MMD -0.0075
  - commitGasUsed: KS mean 0.0000, p-value mean 1.0000
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.1667, p-value mean 0.7990
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000
- **controlled_difference:** MMD 0.6145
  - commitGasUsed: KS mean 0.3200, p-value mean 0.6800
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.6143, p-value mean 0.2400
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
| overall | 0.450 ± 0.107 | 17% | 0.583 ± 0.079 | 43% | 85.5 | ✓ PASS |
| semantic_equivalent | 0.436 ± 0.099 | 0% | 0.456 ± 0.090 | 0% | 39 | ✓ PASS |
| weak_equivalent | 0.355 ± 0.205 | 0% | 0.635 ± 0.226 | 0% | 6 | — (underpowered, non-gating) |
| controlled_difference | 0.708 ± 0.080 | 70% | 0.714 ± 0.071 | 77% | 40 | — (diagnostic, non-gating) |

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
