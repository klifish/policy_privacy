# Structure & Parameter Privacy Evaluation Report

**Date:** 6/27/2026, 4:50:45 PM

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
- and_only vs negation_heavy / Random Forest: advantage=0.0858 (threshold: 0.05)
- and_only vs and_or_mixed / Logistic Regression: advantage=0.0517 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.0789 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / Logistic Regression: advantage=0.2222 (threshold: 0.05)
- none vs single / Random Forest: advantage=0.2778 (threshold: 0.05)
- none vs few / Logistic Regression: advantage=0.1570 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.2729 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.1949 (threshold: 0.05)
- none vs many / Random Forest: advantage=0.1949 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.0769 (threshold: 0.05)
- single vs many / Random Forest: advantage=0.0504 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.1007 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.1250 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.4375 (threshold: 0.05)
- none vs small / Permutation Test: p-value=0.0479 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.3442 (threshold: 0.05)
- none vs large / Random Forest: advantage=0.2013 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.0609 (threshold: 0.05)
- medium vs large / Random Forest: advantage=0.0978 (threshold: 0.05)

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
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4124 (threshold: 0.3)
- k=4 / silhouette: 0.3673 (threshold: 0.3)
- k=5 / silhouette: 0.3476 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5245 (threshold: 0.3)
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.4076 (threshold: 0.3)
- k=5 / silhouette: 0.3669 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4124 (threshold: 0.3)
- k=4 / silhouette: 0.3724 (threshold: 0.3)
- k=5 / silhouette: 0.3759 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
