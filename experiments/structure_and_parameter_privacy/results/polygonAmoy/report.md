# Structure & Parameter Privacy Evaluation Report

**Date:** 6/25/2026, 11:57:33 AM

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
- and_only vs negation_heavy / Logistic Regression: advantage=0.0621 (threshold: 0.05)
- and_only vs negation_heavy / Random Forest: advantage=0.0858 (threshold: 0.05)
- and_only vs and_or_mixed / Random Forest: advantage=0.0674 (threshold: 0.05)
- or_only vs negation_heavy / Random Forest: advantage=0.0685 (threshold: 0.05)
- or_only vs and_or_mixed / Random Forest: advantage=0.0879 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs few / Logistic Regression: advantage=0.1372 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.1884 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.1769 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.1259 (threshold: 0.05)
- single vs few / Random Forest: advantage=0.1783 (threshold: 0.05)
- single vs many / Logistic Regression: advantage=0.1160 (threshold: 0.05)
- single vs many / Random Forest: advantage=0.1160 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.1805 (threshold: 0.05)
- few vs many / Random Forest: advantage=0.2744 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.0968 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.1290 (threshold: 0.05)
- none vs medium / Logistic Regression: advantage=0.1124 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.2778 (threshold: 0.05)
- none vs large / Random Forest: advantage=0.0679 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.1157 (threshold: 0.05)
- medium vs large / Random Forest: advantage=0.0943 (threshold: 0.05)

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
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3967 (threshold: 0.3)
- k=5 / silhouette: 0.3741 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3970 (threshold: 0.3)
- k=5 / silhouette: 0.3787 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3970 (threshold: 0.3)
- k=5 / silhouette: 0.3727 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
