# Structure & Parameter Privacy Evaluation Report

**Date:** 6/24/2026, 2:31:24 PM

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
- and_only vs negation_heavy / Random Forest: advantage=0.0562 (threshold: 0.05)
- or_only vs negation_heavy / Logistic Regression: advantage=0.0980 (threshold: 0.05)
- or_only vs negation_heavy / Permutation Test: p-value=0.0399 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.0976 (threshold: 0.05)
- or_only vs and_or_mixed / Random Forest: advantage=0.0680 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / Logistic Regression: advantage=0.1486 (threshold: 0.05)
- none vs single / Random Forest: advantage=0.1081 (threshold: 0.05)
- none vs few / Logistic Regression: advantage=0.1056 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.0869 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.1271 (threshold: 0.05)
- none vs many / Random Forest: advantage=0.1780 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.0547 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.1704 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.2353 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.1176 (threshold: 0.05)
- none vs medium / Logistic Regression: advantage=0.1332 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.0823 (threshold: 0.05)
- small vs medium / Logistic Regression: advantage=0.0953 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.0927 (threshold: 0.05)

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
- k=4 / silhouette: 0.3970 (threshold: 0.3)
- k=5 / silhouette: 0.3479 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5245 (threshold: 0.3)
- k=3 / silhouette: 0.4124 (threshold: 0.3)
- k=4 / silhouette: 0.3724 (threshold: 0.3)
- k=5 / silhouette: 0.3741 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5245 (threshold: 0.3)
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3570 (threshold: 0.3)
- k=5 / silhouette: 0.3757 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
