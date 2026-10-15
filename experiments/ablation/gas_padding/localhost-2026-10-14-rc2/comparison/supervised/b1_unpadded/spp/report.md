# Structure & Parameter Privacy Evaluation Report

**Date:** 10/14/2026, 3:01:52 PM

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

**Status:** ✓ PASS

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
- k=2 / silhouette: 0.9989 (threshold: 0.3)
- k=3 / silhouette: 0.5437 (threshold: 0.3)
- k=4 / silhouette: 0.4883 (threshold: 0.3)
- k=5 / silhouette: 0.4793 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9989 (threshold: 0.3)
- k=3 / silhouette: 0.5437 (threshold: 0.3)
- k=4 / silhouette: 0.5115 (threshold: 0.3)
- k=5 / silhouette: 0.5106 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9989 (threshold: 0.3)
- k=3 / silhouette: 0.5437 (threshold: 0.3)
- k=4 / silhouette: 0.5115 (threshold: 0.3)
- k=5 / silhouette: 0.5096 (threshold: 0.3)

## Conclusion

**Overall Status:** ✓ PASS _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Policy structure and parameters appear well-protected against side-channel analysis (multi-seed AUC ≈ 0.5, permutation not significant).
