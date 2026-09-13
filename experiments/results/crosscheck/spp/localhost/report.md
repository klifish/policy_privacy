# Structure & Parameter Privacy Evaluation Report

**Date:** 6/13/2026, 12:28:53 PM

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

**Status:** ✗ FAIL

**Failures:**
- none vs single / Random Forest: advantage=0.1667 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Random Forest: advantage=0.1667 (threshold: 0.05)

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
- k=2 / silhouette: 0.5716 (threshold: 0.3)
- k=3 / silhouette: 0.5390 (threshold: 0.3)
- k=4 / silhouette: 0.5576 (threshold: 0.3)
- k=5 / silhouette: 0.5856 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5716 (threshold: 0.3)
- k=3 / silhouette: 0.5427 (threshold: 0.3)
- k=4 / silhouette: 0.4752 (threshold: 0.3)
- k=5 / silhouette: 0.5823 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.5716 (threshold: 0.3)
- k=3 / silhouette: 0.5427 (threshold: 0.3)
- k=4 / silhouette: 0.5207 (threshold: 0.3)
- k=5 / silhouette: 0.5814 (threshold: 0.3)

## Conclusion

**Overall Status:** ✗ FAIL

Potential leakage detected in structure or parameters. Further hardening recommended.
