# Structure & Parameter Privacy Evaluation Report

**Date:** 9/20/2026, 9:43:38 AM

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
- single vs many / Permutation Test: p-value=0.0020 (threshold: 0.05)
- few vs many / Permutation Test: p-value=0.0020 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- large vs none / Permutation Test: p-value=0.0020 (threshold: 0.05)

### Statistical Hypothesis Tests

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- trivial vs and_only / MMD: 0.0774 (threshold: 0.05)
- trivial vs or_only / MMD: 0.1473 (threshold: 0.05)
- trivial vs and_or_mixed / MMD: 0.1254 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- single vs few / MMD: 0.0790 (threshold: 0.05)
- single vs many / MMD: 0.0900 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- medium vs none / MMD: 0.0927 (threshold: 0.05)
- large vs none / MMD: 0.0914 (threshold: 0.05)
- small vs none / MMD: 0.0895 (threshold: 0.05)

### Unsupervised Clustering Attacks

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.6168 (threshold: 0.3)
- k=3 / silhouette: 0.8830 (threshold: 0.3)
- k=4 / silhouette: 0.6878 (threshold: 0.3)
- k=5 / silhouette: 0.5560 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=3 / silhouette: 0.8830 (threshold: 0.3)
- k=4 / silhouette: 0.7400 (threshold: 0.3)
- k=5 / silhouette: 0.6976 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.6168 (threshold: 0.3)
- k=3 / silhouette: 0.8830 (threshold: 0.3)
- k=4 / silhouette: 0.6875 (threshold: 0.3)
- k=5 / silhouette: 0.7357 (threshold: 0.3)

## Conclusion

**Overall Status:** ✗ FAIL _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Potential leakage detected in structure or parameters. Further hardening recommended.
