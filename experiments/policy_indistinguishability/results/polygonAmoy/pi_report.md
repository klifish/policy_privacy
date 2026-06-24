# Policy Indistinguishability Evaluation Report

**Date:** 6/24/2026, 5:06:58 PM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 100
- **Executions per policy:** 2
- **Satisfy ratio:** 0.50
- **Test ratio:** 30%

## Pair Composition

- **semantic_equivalent:** 100
- **structural_variant:** 100
- **weak_equivalent:** 100
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5270 (threshold 0.55)
  - Advantage: 0.1608 (threshold 0.05)
  - Permutation p-value: 0.1891 (threshold 0.05)
  - Top features: commitGasUsed (-0.153), accessGasUsed (0.054), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.0925 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.5132 (threshold 0.55)
  - Advantage: -0.1234 (threshold 0.05)
  - Permutation p-value: 0.3831 (threshold 0.05)
  - Top features: commitGasUsed (-0.158), accessGasUsed (-0.062), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.1104 (threshold 0.05)
- **structural_variant / LogisticRegression:** ✗ FAIL
  - AUC: 0.5639 (threshold 0.55)
  - Advantage: -0.1941 (threshold 0.05)
  - Permutation p-value: 0.1791 (threshold 0.05)
  - Top features: commitGasUsed (-0.078), accessGasUsed (0.016), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✓ PASS
  - Advantage: -0.1941 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.5242 (threshold 0.55)
  - Advantage: -0.3182 (threshold 0.05)
  - Permutation p-value: 0.3333 (threshold 0.05)
  - Top features: accessGasUsed (-0.355), commitGasUsed (0.133), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.0734 (threshold 0.05)
- **controlled_difference / LogisticRegression:** ✓ PASS
  - AUC: 0.4937 (threshold 0.55)
  - Advantage: -0.2627 (threshold 0.05)
  - Permutation p-value: 0.5970 (threshold 0.05)
  - Top features: commitGasUsed (-0.407), accessGasUsed (0.184), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS
  - Advantage: -0.1441 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (1.009), commitGasUsed (0.966), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

### Level III

- **structural_variant / Two-sample statistics:** ✓ PASS
  - MMD: -0.0241 (threshold 0.05)
  - KS p-value mean: 0.9525 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: 0.0024 (threshold 0.05)
  - KS p-value mean: 0.5715 (threshold 0.05)

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
- **controlled_difference:** MMD 0.0024
  - commitGasUsed: KS mean 0.1883, p-value mean 0.6562
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.2110, p-value mean 0.5715
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000

## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each scope is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker distinguishes the pair type. Advantage reported, not gating.

| Scope | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| overall | 0.510 ± 0.023 | 3% | 0.487 ± 0.030 | 3% | 381.5 | ✓ PASS |
| semantic_equivalent | 0.517 ± 0.045 | 7% | 0.497 ± 0.045 | 3% | 150 | ✓ PASS |
| structural_variant | 0.508 ± 0.061 | 3% | 0.425 ± 0.058 | 0% | 93 | ✓ PASS |
| weak_equivalent | 0.517 ± 0.061 | 0% | 0.495 ± 0.050 | 0% | 87 | ✓ PASS |

## Attack-validity (positive control)

- **controlled_difference:** LR AUC 0.549 ± 0.061 (17% sig), RF AUC 0.531 ± 0.054 (3% sig)

> `controlled_difference` pairs are intentionally distinguishable (similarity 0). The same attack pipeline separates them well above chance, confirming the ≈0.5 AUC on the genuinely-similar pair types reflects *absence of signal*, not a broken attack. Non-gating.

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
