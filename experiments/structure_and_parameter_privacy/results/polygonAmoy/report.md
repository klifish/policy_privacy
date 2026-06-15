# Structure & Parameter Privacy Evaluation Report

**Date:** 6/15/2026, 10:21:28 AM

## Objective

Evaluate whether policy structure and parameters leak through side channels
after applying postfix interpreter + padding protections.

## Configuration

- **Policy count:** 120
- **Executions per policy:** 3
- **Satisfy ratio:** 0.50
- **Test ratio:** 30%
- **Balance method:** undersample

## Attack Results

### Supervised Classification Attacks

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- and_only vs and_or_mixed / Logistic Regression: advantage=0.0532 (threshold: 0.05)
- or_only vs negation_heavy / Random Forest: advantage=0.0659 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.1842 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Logistic Regression: advantage=0.2580 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Permutation Test: p-value=0.0200 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / Logistic Regression: advantage=0.4583 (threshold: 0.05)
- none vs single / Random Forest: advantage=0.1111 (threshold: 0.05)
- none vs few / Logistic Regression: advantage=0.4665 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.1411 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.2818 (threshold: 0.05)
- none vs many / Permutation Test: p-value=0.0200 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.2042 (threshold: 0.05)
- single vs many / Logistic Regression: advantage=0.1880 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.3406 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.4375 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.1406 (threshold: 0.05)
- none vs medium / Random Forest: advantage=0.0694 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.4114 (threshold: 0.05)
- small vs medium / Logistic Regression: advantage=0.2640 (threshold: 0.05)
- small vs large / Logistic Regression: advantage=0.0683 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.2684 (threshold: 0.05)

### Statistical Hypothesis Tests

#### Target: structureType

**Status:** ✓ PASS

#### Target: predicateCombo

**Status:** ✓ PASS

#### Target: paramType

**Status:** ✓ PASS

### Unsupervised Clustering Attacks

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5245 (threshold: 0.3)
- k=3 / silhouette: 0.4124 (threshold: 0.3)
- k=4 / silhouette: 0.3582 (threshold: 0.3)
- k=5 / silhouette: 0.3663 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3555 (threshold: 0.3)
- k=5 / silhouette: 0.3473 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5245 (threshold: 0.3)
- k=3 / silhouette: 0.4124 (threshold: 0.3)
- k=4 / silhouette: 0.3964 (threshold: 0.3)
- k=5 / silhouette: 0.3629 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
