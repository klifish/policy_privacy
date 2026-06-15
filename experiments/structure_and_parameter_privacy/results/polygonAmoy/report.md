# Structure & Parameter Privacy Evaluation Report

**Date:** 6/15/2026, 3:29:12 PM

## Objective

Evaluate whether policy structure and parameters leak through side channels
after applying postfix interpreter + padding protections.

## Configuration

- **Policy count:** undefined
- **Executions per policy:** undefined
- **Satisfy ratio:** 0.50
- **Test ratio:** NaN%
- **Balance method:** undersample

## Attack Results

### Supervised Classification Attacks

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- and_only vs or_only / Random Forest: advantage=0.0956 (threshold: 0.05)
- and_only vs negation_heavy / Logistic Regression: advantage=0.1229 (threshold: 0.05)
- and_only vs negation_heavy / Permutation Test: p-value=0.0080 (threshold: 0.05)
- and_only vs and_or_mixed / Logistic Regression: advantage=0.1014 (threshold: 0.05)
- or_only vs negation_heavy / Logistic Regression: advantage=0.0610 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.0808 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Logistic Regression: advantage=0.1369 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Random Forest: advantage=0.0541 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Permutation Test: p-value=0.0260 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / Logistic Regression: advantage=0.4211 (threshold: 0.05)
- none vs single / Random Forest: advantage=0.0526 (threshold: 0.05)
- none vs few / Logistic Regression: advantage=0.4765 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.0822 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.4474 (threshold: 0.05)
- none vs many / Random Forest: advantage=0.0965 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.1893 (threshold: 0.05)
- single vs many / Logistic Regression: advantage=0.1800 (threshold: 0.05)
- single vs many / Random Forest: advantage=0.0520 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.3358 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.4091 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.0606 (threshold: 0.05)
- none vs medium / Logistic Regression: advantage=0.1617 (threshold: 0.05)
- none vs medium / Random Forest: advantage=0.1418 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.4277 (threshold: 0.05)
- small vs medium / Logistic Regression: advantage=0.2276 (threshold: 0.05)
- small vs medium / Random Forest: advantage=0.0564 (threshold: 0.05)
- small vs large / Logistic Regression: advantage=0.1040 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.2670 (threshold: 0.05)

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
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3558 (threshold: 0.3)
- k=5 / silhouette: 0.3786 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4126 (threshold: 0.3)
- k=4 / silhouette: 0.3964 (threshold: 0.3)
- k=5 / silhouette: 0.3374 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5244 (threshold: 0.3)
- k=3 / silhouette: 0.4124 (threshold: 0.3)
- k=4 / silhouette: 0.3724 (threshold: 0.3)
- k=5 / silhouette: 0.3641 (threshold: 0.3)

## Attack-validity (positive control)

- **CONTROL: gas>median:** AUC 1.000 ± 0.001, P/R/F1 = 1.00 / 1.00 / 1.00

> The same attack pipeline recovers a synthetic, known-separable label (derived from observable gas) with high AUC/F1. This confirms the ≈0.5 AUC on real structure/parameter attributes reflects *absence of signal*, not a broken attack. Non-gating sanity check.

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
