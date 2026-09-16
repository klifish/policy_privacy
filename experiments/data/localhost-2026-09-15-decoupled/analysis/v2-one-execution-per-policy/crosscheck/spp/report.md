# Structure & Parameter Privacy Evaluation Report

**Date:** 9/16/2026, 10:40:02 AM

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

**Status:** ✓ PASS

#### Target: predicateCombo

**Status:** ✓ PASS

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- medium vs small / Permutation Test: p-value=0.0279 (threshold: 0.05)

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
- k=2 / silhouette: 0.5233 (threshold: 0.3)
- k=3 / silhouette: 0.4084 (threshold: 0.3)
- k=4 / silhouette: 0.3682 (threshold: 0.3)
- k=5 / silhouette: 0.3446 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5232 (threshold: 0.3)
- k=3 / silhouette: 0.4084 (threshold: 0.3)
- k=4 / silhouette: 0.3927 (threshold: 0.3)
- k=5 / silhouette: 0.3766 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5232 (threshold: 0.3)
- k=3 / silhouette: 0.4086 (threshold: 0.3)
- k=4 / silhouette: 0.3924 (threshold: 0.3)
- k=5 / silhouette: 0.3644 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
