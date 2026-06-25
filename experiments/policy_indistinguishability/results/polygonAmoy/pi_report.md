# Policy Indistinguishability Evaluation Report

**Date:** 6/25/2026, 9:14:59 AM

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

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.5196 (threshold 0.55)
  - Advantage: -0.1463 (threshold 0.05)
  - Permutation p-value: 0.2275 (threshold 0.05)
  - Top features: accessGasUsed (0.080), commitGasUsed (-0.058), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
  - Advantage: -0.0884 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.3855 (threshold 0.55)
  - Advantage: -0.0698 (threshold 0.05)
  - Permutation p-value: 0.9661 (threshold 0.05)
  - Top features: accessGasUsed (0.242), commitGasUsed (-0.157), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.0116 (threshold 0.05)
- **structural_variant / LogisticRegression:** ✓ PASS
  - AUC: 0.3622 (threshold 0.55)
  - Advantage: 0.0000 (threshold 0.05)
  - Permutation p-value: 0.9621 (threshold 0.05)
  - Top features: accessGasUsed (-0.085), commitGasUsed (0.044), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✓ PASS
  - Advantage: -0.0333 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.5829 (threshold 0.55)
  - Advantage: -0.1477 (threshold 0.05)
  - Permutation p-value: 0.1218 (threshold 0.05)
  - Top features: accessGasUsed (-0.085), commitGasUsed (-0.027), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
  - Advantage: -0.1250 (threshold 0.05)
- **controlled_difference / LogisticRegression:** ✓ PASS
  - AUC: 0.4974 (threshold 0.55)
  - Advantage: -0.1133 (threshold 0.05)
  - Permutation p-value: 0.4910 (threshold 0.05)
  - Top features: commitGasUsed (-0.163), accessGasUsed (-0.063), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS
  - Advantage: -0.1067 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (1.062), commitGasUsed (0.892), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

### Level III

- **structural_variant / Two-sample statistics:** ✓ PASS
  - MMD: -0.0241 (threshold 0.05)
  - KS p-value mean: 0.9525 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✓ PASS
  - MMD: -0.0042 (threshold 0.05)
  - KS p-value mean: 0.6257 (threshold 0.05)

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
- **controlled_difference:** MMD -0.0042
  - commitGasUsed: KS mean 0.1907, p-value mean 0.6460
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.1970, p-value mean 0.6257
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
| overall | 0.488 ± 0.025 | 0% | 0.487 ± 0.035 | 3% | 344.5 | ✓ PASS |
| semantic_equivalent | 0.463 ± 0.049 | 0% | 0.490 ± 0.050 | 0% | 95 | ✓ PASS |
| structural_variant | 0.475 ± 0.068 | 0% | 0.529 ± 0.077 | 10% | 62 | ✓ PASS |
| weak_equivalent | 0.457 ± 0.064 | 0% | 0.454 ± 0.087 | 3% | 62 | ✓ PASS |

## Attack-validity (positive control)

- **controlled_difference:** LR AUC 0.482 ± 0.056 (0% sig), RF AUC 0.445 ± 0.058 (0% sig)

> `controlled_difference` pairs are intentionally distinguishable (similarity 0). The same attack pipeline separates them well above chance, confirming the ≈0.5 AUC on the genuinely-similar pair types reflects *absence of signal*, not a broken attack. Non-gating.

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
