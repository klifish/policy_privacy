# Structure & Parameter Privacy Evaluation Report

**Date:** 7/2/2026, 11:17:33 AM

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
- or_only vs negation_heavy / Permutation Test: p-value=0.0140 (threshold: 0.05)
- negation_heavy vs and_only / Permutation Test: p-value=0.0379 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- single vs few / Permutation Test: p-value=0.0100 (threshold: 0.05)
- single vs many / Permutation Test: p-value=0.0020 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- small vs medium / Permutation Test: p-value=0.0020 (threshold: 0.05)
- small vs large / Permutation Test: p-value=0.0020 (threshold: 0.05)

### Statistical Hypothesis Tests

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- trivial vs or_only / MMD: 0.1253 (threshold: 0.05)
- trivial vs negation_heavy / MMD: 0.1204 (threshold: 0.05)
- trivial vs and_only / MMD: 0.0611 (threshold: 0.05)
- trivial vs and_or_mixed / MMD: 0.1113 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / MMD: 0.3078 (threshold: 0.05)
- none vs few / MMD: 0.2707 (threshold: 0.05)
- none vs many / MMD: 0.2474 (threshold: 0.05)
- single vs few / MMD: 0.0805 (threshold: 0.05)
- single vs many / MMD: 0.0816 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / MMD: 0.3031 (threshold: 0.05)
- none vs medium / MMD: 0.2574 (threshold: 0.05)
- none vs large / MMD: 0.2671 (threshold: 0.05)
- small vs large / MMD: 0.0632 (threshold: 0.05)

### Unsupervised Clustering Attacks

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5290 (threshold: 0.3)
- k=5 / silhouette: 0.4861 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5290 (threshold: 0.3)
- k=5 / silhouette: 0.4116 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5090 (threshold: 0.3)
- k=5 / silhouette: 0.4790 (threshold: 0.3)

## Conclusion

**Overall Status:** ✗ FAIL _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Potential leakage detected in structure or parameters. Further hardening recommended.
