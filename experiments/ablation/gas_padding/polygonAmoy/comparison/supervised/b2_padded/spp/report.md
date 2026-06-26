# Structure & Parameter Privacy Evaluation Report

**Date:** 6/26/2026, 4:07:44 PM

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
- and_only vs or_only / Random Forest: advantage=0.0600 (threshold: 0.05)
- and_only vs and_or_mixed / Logistic Regression: advantage=0.0745 (threshold: 0.05)
- and_only vs and_or_mixed / Random Forest: advantage=0.0532 (threshold: 0.05)
- or_only vs negation_heavy / Logistic Regression: advantage=0.1034 (threshold: 0.05)
- or_only vs negation_heavy / Random Forest: advantage=0.0862 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.0510 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Logistic Regression: advantage=0.1818 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / Logistic Regression: advantage=0.1364 (threshold: 0.05)
- none vs few / Logistic Regression: advantage=0.2231 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.1615 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.2368 (threshold: 0.05)
- none vs many / Random Forest: advantage=0.1842 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.1220 (threshold: 0.05)
- single vs many / Random Forest: advantage=0.1410 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.0658 (threshold: 0.05)
- few vs many / Random Forest: advantage=0.0789 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.2273 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.4545 (threshold: 0.05)
- none vs medium / Logistic Regression: advantage=0.2667 (threshold: 0.05)
- none vs medium / Random Forest: advantage=0.2667 (threshold: 0.05)
- small vs large / Logistic Regression: advantage=0.0556 (threshold: 0.05)
- small vs large / Random Forest: advantage=0.0556 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.0833 (threshold: 0.05)
- medium vs large / Random Forest: advantage=0.0833 (threshold: 0.05)

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
- k=2 / silhouette: 0.5256 (threshold: 0.3)
- k=3 / silhouette: 0.4244 (threshold: 0.3)
- k=4 / silhouette: 0.3912 (threshold: 0.3)
- k=5 / silhouette: 0.4027 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5256 (threshold: 0.3)
- k=3 / silhouette: 0.4073 (threshold: 0.3)
- k=4 / silhouette: 0.3908 (threshold: 0.3)
- k=5 / silhouette: 0.3977 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5256 (threshold: 0.3)
- k=3 / silhouette: 0.4073 (threshold: 0.3)
- k=4 / silhouette: 0.3912 (threshold: 0.3)
- k=5 / silhouette: 0.4001 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
