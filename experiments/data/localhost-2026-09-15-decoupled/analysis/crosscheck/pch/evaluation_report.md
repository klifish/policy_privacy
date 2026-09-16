# Policy Content Hiding Evaluation Report

**Date:** 9/16/2026, 1:17:21 AM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 10
- **DUO Terms (observed):** 10
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 1773
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) is the primary single-split privacy diagnostic.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.4723 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4594 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5500 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4613 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4920 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.5256 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.4833 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.4739 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.5060 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.4201 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 0.70%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.4723 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4594 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5500 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4613 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4920 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.5256 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.4833 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.4739 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.5060 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.4201 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.504 ± 0.029 | 3% | 0.497 ± 0.024 | 3% | 540.5 | ✓ PASS |
| DUO DS | 0.475 ± 0.015 | 0% | 0.501 ± 0.024 | 0% | 540.5 | ✓ PASS |
| DUO RS | 0.516 ± 0.025 | 20% | 0.520 ± 0.024 | 23% | 540.5 | ✓ PASS |
| DUO POA | 0.477 ± 0.021 | 0% | 0.501 ± 0.022 | 3% | 540.5 | ✓ PASS |
| DUO GS | 0.514 ± 0.024 | 13% | 0.502 ± 0.021 | 3% | 540.5 | ✓ PASS |
| DUO CC | 0.508 ± 0.022 | 3% | 0.526 ± 0.020 | 20% | 540.5 | ✓ PASS |
| DUO NCU | 0.482 ± 0.025 | 0% | 0.458 ± 0.028 | 0% | 540.5 | ✓ PASS |
| DUO HMB | 0.497 ± 0.030 | 7% | 0.513 ± 0.026 | 13% | 540.5 | ✓ PASS |
| DUO NMDS | 0.521 ± 0.023 | 13% | 0.502 ± 0.021 | 3% | 540.5 | ✓ PASS |
| DUO GSO | 0.502 ± 0.028 | 0% | 0.490 ± 0.025 | 0% | 540.5 | ✓ PASS |
| ICD ch0 | 0.507 ± 0.060 | 3% | 0.530 ± 0.051 | 0% | 228.5 | ✓ PASS |
| ICD ch1 | 0.483 ± 0.064 | 0% | 0.509 ± 0.066 | 3% | 228.5 | ✓ PASS |
| ICD ch2 | 0.459 ± 0.059 | 0% | 0.488 ± 0.066 | 3% | 228.5 | ✓ PASS |
| ICD ch3 | 0.500 ± 0.063 | 0% | 0.493 ± 0.059 | 0% | 228.5 | ✓ PASS |
| ICD ch4 | 0.529 ± 0.083 | 13% | 0.518 ± 0.088 | 7% | 228.5 | ✓ PASS |
| ICD ch5 | 0.554 ± 0.054 | 3% | 0.528 ± 0.066 | 3% | 228.5 | ✓ PASS |
| ICD ch6 | 0.521 ± 0.048 | 10% | 0.513 ± 0.058 | 10% | 228.5 | ✓ PASS |
| ICD ch7 | 0.470 ± 0.059 | 0% | 0.522 ± 0.046 | 3% | 228.5 | ✓ PASS |
| ICD ch8 | 0.439 ± 0.063 | 0% | 0.575 ± 0.047 | 23% | 228.5 | ✓ PASS |
| ICD ch9 | 0.560 ± 0.080 | 37% | 0.554 ± 0.083 | 10% | 228.5 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
