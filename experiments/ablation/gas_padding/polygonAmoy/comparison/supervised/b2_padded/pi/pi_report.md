# Policy Indistinguishability Evaluation Report

**Date:** 6/26/2026, 4:07:39 PM

## Objective

Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.

## Configuration

- **Policies generated:** 100
- **Executions per policy:** 2
- **Satisfy ratio:** 0.50
- **Test ratio:** 20%

## Pair Composition

- **semantic_equivalent:** 50
- **structural_variant:** 100
- **weak_equivalent:** 17
- **controlled_difference:** 100

## Attack Outcomes

### Level I

- **overall / LogisticRegression:** ✓ PASS
  - AUC: 0.4804 (threshold 0.55)
  - Advantage: 0.0070 (threshold 0.05)
  - Permutation p-value: 0.7764 (threshold 0.05)
  - Top features: accessGasUsed (0.070), commitGasUsed (-0.065), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
  - Advantage: 0.0030 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.5563 (threshold 0.55)
  - Advantage: 0.1827 (threshold 0.05)
  - Permutation p-value: 0.1537 (threshold 0.05)
  - Top features: accessGasUsed (0.207), commitGasUsed (-0.205), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✗ FAIL
  - Advantage: 0.1827 (threshold 0.05)
- **structural_variant / LogisticRegression:** ✗ FAIL
  - AUC: 0.3063 (threshold 0.55)
  - Advantage: 0.3000 (threshold 0.05)
  - Permutation p-value: 0.9980 (threshold 0.05)
  - Top features: accessGasUsed (-0.698), commitGasUsed (0.018), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✗ FAIL
  - Advantage: 0.3000 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.0000 (threshold 0.55)
  - Advantage: -0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (0.561), commitGasUsed (-0.206), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
  - Advantage: 0.0000 (threshold 0.05)
- **controlled_difference / LogisticRegression:** ✗ FAIL
  - AUC: 0.5622 (threshold 0.55)
  - Advantage: -0.0100 (threshold 0.05)
  - Permutation p-value: 0.1377 (threshold 0.05)
  - Top features: accessGasUsed (0.177), commitGasUsed (0.017), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS
  - Advantage: -0.0100 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: commitGasUsed (0.188), accessGasUsed (0.131), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

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

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each scope is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker distinguishes the pair type. Advantage reported, not gating.

| Scope | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| overall | 0.468 ± 0.048 | 3% | 0.478 ± 0.044 | 0% | 267.5 | ✓ PASS |
| semantic_equivalent | 0.491 ± 0.116 | 0% | 0.479 ± 0.106 | 0% | 22.5 | ✓ PASS |
| structural_variant | 0.491 ± 0.104 | 7% | 0.559 ± 0.109 | 27% | 48.5 | ✓ PASS |
| weak_equivalent | 0.278 ± 0.285 | 0% | 0.492 ± 0.260 | 0% | 6 | — (underpowered, non-gating) |
| controlled_difference | 0.512 ± 0.051 | 3% | 0.515 ± 0.054 | 13% | 149 | — (diagnostic, non-gating) |

## Attack-validity (positive control)

- **CONTROL: gas>median:** LR AUC 0.993 ± 0.004 (100% sig), RF AUC 0.999 ± 0.003 (100% sig)
- **P/R/F1:** LR 0.88 / 0.99 / 0.93, RF 1.00 / 1.00 / 1.00

> The same PI Level-I pipeline recovers a synthetic, known-separable label derived from observable commit gas (`gas > training median`). This confirms the near-chance AUC on the real pair scopes reflects absence of detected signal, not a broken attack. Non-gating.

## Conclusion

**Status:** ✓ PASS _(multi-seed, policy-disjoint; single split above is diagnostic)_

Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).
