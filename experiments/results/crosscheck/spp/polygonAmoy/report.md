# Structure & Parameter Privacy Evaluation Report

**Date:** 9/17/2026, 10:22:57 AM

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
- large vs none / Permutation Test: p-value=0.0479 (threshold: 0.05)
- small vs none / Permutation Test: p-value=0.0419 (threshold: 0.05)

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
- k=2 / silhouette: 0.5609 (threshold: 0.3)
- k=3 / silhouette: 0.4696 (threshold: 0.3)
- k=4 / silhouette: 0.4077 (threshold: 0.3)
- k=5 / silhouette: 0.3557 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5605 (threshold: 0.3)
- k=3 / silhouette: 0.4696 (threshold: 0.3)
- k=4 / silhouette: 0.4077 (threshold: 0.3)
- k=5 / silhouette: 0.4057 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5605 (threshold: 0.3)
- k=3 / silhouette: 0.4692 (threshold: 0.3)
- k=4 / silhouette: 0.4077 (threshold: 0.3)
- k=5 / silhouette: 0.3726 (threshold: 0.3)

## Conclusion

**Overall Status:** ✗ FAIL _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Potential leakage detected in structure or parameters. Further hardening recommended.
