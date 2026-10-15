# Policy Content Hiding Evaluation Report

**Date:** 10/14/2026, 3:01:45 PM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 10
- **DUO Terms (observed):** 10
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 1277
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) is the primary single-split privacy diagnostic.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.5002 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5111 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5330 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4799 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4702 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.5149 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.4917 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.5364 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.5193 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.4674 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 2.45%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.5002 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.5111 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5330 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4799 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4702 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.5149 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.4917 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.5364 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.5193 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.4674 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.500 ± 0.046 | 0% | 0.533 ± 0.042 | 0% | 114 | ✓ PASS |
| DUO DS | 0.472 ± 0.077 | 0% | 0.512 ± 0.065 | 0% | 114 | ✓ PASS |
| DUO RS | 0.468 ± 0.042 | 0% | 0.491 ± 0.055 | 0% | 114 | ✓ PASS |
| DUO POA | 0.504 ± 0.031 | 0% | 0.544 ± 0.051 | 0% | 114 | ✓ PASS |
| DUO GS | 0.494 ± 0.044 | 0% | 0.524 ± 0.049 | 0% | 114 | ✓ PASS |
| DUO CC | 0.505 ± 0.049 | 0% | 0.554 ± 0.048 | 0% | 114 | ✓ PASS |
| DUO NCU | 0.491 ± 0.072 | 0% | 0.479 ± 0.040 | 0% | 114 | ✓ PASS |
| DUO HMB | 0.486 ± 0.050 | 0% | 0.501 ± 0.051 | 0% | 114 | ✓ PASS |
| DUO NMDS | 0.513 ± 0.061 | 0% | 0.504 ± 0.051 | 0% | 114 | ✓ PASS |
| DUO GSO | 0.483 ± 0.082 | 0% | 0.491 ± 0.042 | 0% | 114 | ✓ PASS |
| ICD ch0 | 0.514 ± 0.195 | 0% | 0.491 ± 0.033 | 0% | 101 | ✓ PASS |
| ICD ch1 | 0.596 ± 0.076 | 0% | 0.521 ± 0.048 | 0% | 101 | ✓ PASS |
| ICD ch2 | 0.415 ± 0.088 | 0% | 0.517 ± 0.065 | 0% | 101 | ✓ PASS |
| ICD ch3 | 0.435 ± 0.089 | 0% | 0.484 ± 0.028 | 0% | 101 | ✓ PASS |
| ICD ch4 | 0.472 ± 0.076 | 0% | 0.481 ± 0.041 | 0% | 101 | ✓ PASS |
| ICD ch5 | 0.521 ± 0.087 | 0% | 0.511 ± 0.051 | 0% | 101 | ✓ PASS |
| ICD ch6 | 0.506 ± 0.070 | 0% | 0.540 ± 0.058 | 0% | 101 | ✓ PASS |
| ICD ch7 | 0.503 ± 0.084 | 0% | 0.492 ± 0.069 | 0% | 101 | ✓ PASS |
| ICD ch8 | 0.497 ± 0.089 | 0% | 0.463 ± 0.040 | 0% | 101 | ✓ PASS |
| ICD ch9 | 0.529 ± 0.075 | 0% | 0.458 ± 0.036 | 0% | 101 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
