# Structure & Parameter Privacy Evaluation Report

**Date:** 10/15/2026, 9:54:22 PM

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
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5451 (threshold: 0.3)
- k=4 / silhouette: 0.4736 (threshold: 0.3)
- k=5 / silhouette: 0.5168 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5451 (threshold: 0.3)
- k=4 / silhouette: 0.3839 (threshold: 0.3)
- k=5 / silhouette: 0.5122 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5451 (threshold: 0.3)
- k=4 / silhouette: 0.5227 (threshold: 0.3)
- k=5 / silhouette: 0.5156 (threshold: 0.3)

## Conclusion

**Overall Status:** ✗ FAIL _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Potential leakage detected in structure or parameters. Further hardening recommended.
