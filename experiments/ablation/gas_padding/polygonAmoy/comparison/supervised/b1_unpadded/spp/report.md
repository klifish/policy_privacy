# Structure & Parameter Privacy Evaluation Report

**Date:** 6/26/2026, 4:02:57 PM

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
- and_only vs or_only / Random Forest: advantage=0.2174 (threshold: 0.05)
- and_only vs negation_heavy / Random Forest: advantage=0.1600 (threshold: 0.05)
- and_only vs and_or_mixed / Random Forest: advantage=0.2111 (threshold: 0.05)
- or_only vs negation_heavy / Logistic Regression: advantage=0.0536 (threshold: 0.05)
- or_only vs negation_heavy / Random Forest: advantage=0.0714 (threshold: 0.05)
- or_only vs and_or_mixed / Logistic Regression: advantage=0.1222 (threshold: 0.05)
- or_only vs and_or_mixed / Permutation Test: p-value=0.0200 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Logistic Regression: advantage=0.1000 (threshold: 0.05)
- negation_heavy vs and_or_mixed / Random Forest: advantage=0.1600 (threshold: 0.05)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- none vs few / Logistic Regression: advantage=0.2887 (threshold: 0.05)
- none vs few / Random Forest: advantage=0.2324 (threshold: 0.05)
- none vs many / Logistic Regression: advantage=0.3889 (threshold: 0.05)
- single vs few / Logistic Regression: advantage=0.2763 (threshold: 0.05)
- single vs few / Random Forest: advantage=0.0789 (threshold: 0.05)
- single vs few / Permutation Test: p-value=0.0040 (threshold: 0.05)
- single vs many / Logistic Regression: advantage=0.2907 (threshold: 0.05)
- single vs many / Random Forest: advantage=0.2907 (threshold: 0.05)
- single vs many / Permutation Test: p-value=0.0020 (threshold: 0.05)
- few vs many / Logistic Regression: advantage=0.0526 (threshold: 0.05)
- few vs many / Random Forest: advantage=0.2500 (threshold: 0.05)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- none vs small / Logistic Regression: advantage=0.3500 (threshold: 0.05)
- none vs small / Random Forest: advantage=0.2000 (threshold: 0.05)
- none vs small / Permutation Test: p-value=0.0140 (threshold: 0.05)
- none vs medium / Logistic Regression: advantage=0.1034 (threshold: 0.05)
- none vs medium / Random Forest: advantage=0.0517 (threshold: 0.05)
- none vs large / Logistic Regression: advantage=0.3077 (threshold: 0.05)
- none vs large / Random Forest: advantage=0.2692 (threshold: 0.05)
- small vs medium / Logistic Regression: advantage=0.2808 (threshold: 0.05)
- small vs medium / Random Forest: advantage=0.2534 (threshold: 0.05)
- small vs medium / Permutation Test: p-value=0.0020 (threshold: 0.05)
- small vs large / Logistic Regression: advantage=0.0814 (threshold: 0.05)
- small vs large / Random Forest: advantage=0.1977 (threshold: 0.05)
- small vs large / Permutation Test: p-value=0.0020 (threshold: 0.05)
- medium vs large / Logistic Regression: advantage=0.2051 (threshold: 0.05)

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
- k=4 / silhouette: 0.5290 (threshold: 0.3)
- k=5 / silhouette: 0.5008 (threshold: 0.3)

#### Target: predicateCombo

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5090 (threshold: 0.3)
- k=5 / silhouette: 0.4587 (threshold: 0.3)

#### Target: paramType

**Status:** ✗ FAIL

**Failures:**
- k=2 / silhouette: 0.9990 (threshold: 0.3)
- k=3 / silhouette: 0.5559 (threshold: 0.3)
- k=4 / silhouette: 0.5157 (threshold: 0.3)
- k=5 / silhouette: 0.5008 (threshold: 0.3)

## Conclusion

**Overall Status:** ? INCONCLUSIVE _(multi-seed, policy-disjoint; single-split table below is diagnostic)_

INCONCLUSIVE: the positive control was not separable, so the attack pipeline shows no discriminative power — a PASS cannot be distinguished from a powerless attack. No privacy claim is made.
