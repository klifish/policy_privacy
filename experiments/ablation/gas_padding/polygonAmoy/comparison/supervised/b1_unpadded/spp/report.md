# Structure & Parameter Privacy Evaluation Report

**Date:** 6/27/2026, 4:27:19 PM

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
- and_only vs or_only / Random Forest: advantage=0.1875 (threshold: 0.05)
- and_only vs negation_heavy / Logistic Regression: advantage=0.1724 (threshold: 0.05)
- and_only vs negation_heavy / Random Forest: advantage=0.2069 (threshold: 0.05)
- and_only vs negation_heavy / Permutation Test: p-value=0.0020 (threshold: 0.05)
- and_only vs and_or_mixed / Logistic Regression: advantage=0.1000 (threshold: 0.05)
- and_only vs and_or_mixed / Random Forest: advantage=0.2333 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.1341 (threshold: 0.05)
- or_only vs and_or_mixed / Random Forest: advantage=0.1341 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Logistic Regression: advantage=0.0800 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs single / Logistic Regression: advantage=0.3000 (threshold: 0.05)
- none vs single / Random Forest: advantage=0.1000 (threshold: 0.05)
- none vs single / Permutation Test: p-value=0.0319 (threshold: 0.05)
- none vs few / Logistic Regression: advantage=0.4836 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.3361 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.4600 (threshold: 0.05)
- none vs many / Random Forest: advantage=0.1400 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.2368 (threshold: 0.05)
- single vs few / Random Forest: advantage=0.2632 (threshold: 0.05)
- single vs few / Permutation Test: p-value=0.0020 (threshold: 0.05)
- single vs many / Logistic Regression: advantage=0.1279 (threshold: 0.05)
- single vs many / Random Forest: advantage=0.1977 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.0625 (threshold: 0.05)
- few vs many / Random Forest: advantage=0.1375 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.4500 (threshold: 0.05)
- none vs medium / Logistic Regression: advantage=0.4483 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.4583 (threshold: 0.05)
- none vs large / Random Forest: advantage=0.1250 (threshold: 0.05)
- small vs medium / Logistic Regression: advantage=0.2922 (threshold: 0.05)
- small vs medium / Random Forest: advantage=0.2403 (threshold: 0.05)
- small vs medium / Permutation Test: p-value=0.0040 (threshold: 0.05)
- small vs large / Logistic Regression: advantage=0.2692 (threshold: 0.05)
- small vs large / Random Forest: advantage=0.2179 (threshold: 0.05)
- small vs large / Permutation Test: p-value=0.0020 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.0789 (threshold: 0.05)

### Statistical Hypothesis Tests

#### Target: structureType

**Status:** ✗ FAIL

**Failures:**
- and_only vs or_only / MMD: 0.0619 (threshold: 0.05)
- and_only vs negation_heavy / MMD: 0.0687 (threshold: 0.05)
- and_only vs and_or_mixed / MMD: 0.0508 (threshold: 0.05)

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
- k=4 / silhouette: 0.5059 (threshold: 0.3)
- k=5 / silhouette: 0.4998 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5290 (threshold: 0.3)
- k=5 / silhouette: 0.5127 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5290 (threshold: 0.3)
- k=5 / silhouette: 0.4993 (threshold: 0.3)

## Conclusion

**Overall Status:** ✗ FAIL _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

Potential leakage detected in structure or parameters. Further hardening recommended.
