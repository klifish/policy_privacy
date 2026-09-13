# Policy Indistinguishability Evaluation Report

**Date:** 6/27/2026, 3:49:54 PM

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
  - AUC: 0.5060 (threshold 0.55)
  - Permutation p-value: 0.4032 (threshold 0.05)
  - Top features: accessGasUsed (0.167), commitGasUsed (-0.083), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.5221 (threshold 0.55)
  - Permutation p-value: 0.4251 (threshold 0.05)
  - Top features: commitGasUsed (-0.310), accessGasUsed (0.087), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
- **structural_variant / LogisticRegression:** ✓ PASS
  - AUC: 0.5402 (threshold 0.55)
  - Permutation p-value: 0.3333 (threshold 0.05)
  - Top features: accessGasUsed (0.114), commitGasUsed (0.060), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✓ PASS
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.5450 (threshold 0.55)
  - Permutation p-value: 0.3253 (threshold 0.05)
  - Top features: accessGasUsed (-0.124), commitGasUsed (-0.054), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.5696 (threshold 0.55)
  - Permutation p-value: 0.2555 (threshold 0.05)
  - Top features: accessGasUsed (0.258), commitGasUsed (0.075), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS

### Level II

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5000 (threshold 0.55)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (1.002), commitGasUsed (0.970), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS

### Level III

- **structural_variant / Two-sample statistics:** ✓ PASS
  - MMD: -0.0241 (threshold 0.05)
  - KS p-value mean: 0.9525 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: 0.0039 (threshold 0.05)
  - KS p-value mean: 0.5831 (threshold 0.05)

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
- **controlled_difference:** MMD 0.0039
  - commitGasUsed: KS mean 0.1950, p-value mean 0.6232
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2093, p-value mean 0.5831
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
| overall | 0.507 ± 0.031 | 3% | 0.516 ± 0.030 | 10% | 270 | ✓ PASS |
| semantic_equivalent | 0.498 ± 0.087 | 10% | 0.511 ± 0.082 | 13% | 71 | ✓ PASS |
| structural_variant | 0.488 ± 0.051 | 0% | 0.524 ± 0.071 | 0% | 40 | ✓ PASS |
| weak_equivalent | 0.486 ± 0.077 | 0% | 0.494 ± 0.085 | 7% | 54.5 | ✓ PASS |
| controlled_difference | 0.510 ± 0.076 | 3% | 0.508 ± 0.071 | 7% | 68 | — (diagnostic, non-gating) |

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
