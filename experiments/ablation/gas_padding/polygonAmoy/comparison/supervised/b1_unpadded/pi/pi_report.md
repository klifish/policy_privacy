# Policy Indistinguishability Evaluation Report

**Date:** 6/27/2026, 4:27:16 PM

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
  - AUC: 0.3698 (threshold 0.55)
  - Advantage: 0.0070 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: commitGasUsed (-0.048), accessGasUsed (-0.043), commitCalldataLength (0.000)
- **overall / RandomForest:** ✓ PASS
  - Advantage: 0.0070 (threshold 0.05)
- **semantic_equivalent / LogisticRegression:** ✗ FAIL
  - AUC: 0.4274 (threshold 0.55)
  - Advantage: 0.1827 (threshold 0.05)
  - Permutation p-value: 0.8942 (threshold 0.05)
  - Top features: accessGasUsed (-0.101), commitGasUsed (-0.100), commitCalldataLength (0.000)
- **semantic_equivalent / RandomForest:** ✗ FAIL
  - Advantage: 0.1827 (threshold 0.05)
- **structural_variant / LogisticRegression:** ✗ FAIL
  - AUC: 0.3912 (threshold 0.55)
  - Advantage: 0.3000 (threshold 0.05)
  - Permutation p-value: 0.9162 (threshold 0.05)
  - Top features: commitGasUsed (-0.385), accessGasUsed (0.212), commitCalldataLength (0.000)
- **structural_variant / RandomForest:** ✗ FAIL
  - Advantage: 0.3000 (threshold 0.05)
- **weak_equivalent / LogisticRegression:** ✓ PASS
  - AUC: 0.2222 (threshold 0.55)
  - Advantage: -0.3333 (threshold 0.05)
  - Permutation p-value: 0.9481 (threshold 0.05)
  - Top features: accessGasUsed (0.486), commitGasUsed (0.363), commitCalldataLength (0.000)
- **weak_equivalent / RandomForest:** ✓ PASS
  - Advantage: 0.0000 (threshold 0.05)
- **controlled_difference / LogisticRegression:** ✓ PASS
  - AUC: 0.3595 (threshold 0.55)
  - Advantage: -0.0100 (threshold 0.05)
  - Permutation p-value: 0.9980 (threshold 0.05)
  - Top features: commitGasUsed (-0.030), accessGasUsed (-0.022), commitCalldataLength (0.000)
- **controlled_difference / RandomForest:** ✓ PASS
  - Advantage: -0.0100 (threshold 0.05)

### Level II

- **overall / LogisticRegression:** ✗ FAIL
  - AUC: 0.5000 (threshold 0.55)
  - Advantage: 0.5000 (threshold 0.05)
  - Permutation p-value: 1.0000 (threshold 0.05)
  - Top features: accessGasUsed (0.045), commitGasUsed (0.041), commitCalldataLength (0.000)
- **overall / RandomForest:** ✗ FAIL
  - Advantage: 0.5000 (threshold 0.05)

### Level III

- **structural_variant / Two-sample statistics:** ✗ FAIL
  - MMD: 0.4889 (threshold 0.05)
  - KS p-value mean: 0.0000 (threshold 0.05)
- **controlled_difference / Two-sample statistics:** ✗ FAIL
  - MMD: 0.4309 (threshold 0.05)
  - KS p-value mean: 0.2135 (threshold 0.05)

## Two-sample Diagnostics

- **structural_variant:** MMD 0.4889
  - commitGasUsed: KS mean 0.0000, p-value mean 1.0000
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.7000, p-value mean 0.0000
  - accessCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - proofSize: KS mean 0.0000, p-value mean 1.0000
  - commitLogsCount: KS mean 0.0000, p-value mean 1.0000
  - commitLogsSize: KS mean 0.0000, p-value mean 1.0000
  - accessLogsCount: KS mean 0.0000, p-value mean 1.0000
  - accessLogsSize: KS mean 0.0000, p-value mean 1.0000
- **controlled_difference:** MMD 0.4309
  - commitGasUsed: KS mean 0.3900, p-value mean 0.6100
  - commitCalldataLength: KS mean 0.0000, p-value mean 1.0000
  - accessGasUsed: KS mean 0.5100, p-value mean 0.2135
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
| overall | 0.451 ± 0.146 | 20% | 0.574 ± 0.076 | 60% | 267.5 | ✗ FAIL |
| semantic_equivalent | 0.491 ± 0.164 | 17% | 0.360 ± 0.169 | 3% | 22.5 | ✓ PASS |
| structural_variant | 0.486 ± 0.145 | 17% | 0.439 ± 0.125 | 10% | 48.5 | ✓ PASS |
| weak_equivalent | 0.277 ± 0.171 | 0% | 0.391 ± 0.238 | 0% | 6 | — (underpowered, non-gating) |
| controlled_difference | 0.415 ± 0.206 | 27% | 0.611 ± 0.119 | 67% | 149 | — (diagnostic, non-gating) |

## Conclusion

**Status:** ✗ FAIL _(multi-seed, policy-disjoint; single split above is diagnostic)_

Potential leakage detected. Further hardening is required.
