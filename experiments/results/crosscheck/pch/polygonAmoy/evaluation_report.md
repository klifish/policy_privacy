# Policy Content Hiding Evaluation Report

**Date:** 10/15/2026, 5:01:00 PM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 10
- **DUO Terms (observed):** 10
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 1977
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) is the primary single-split privacy diagnostic.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.4832 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4793 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5065 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4887 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.5257 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.5252 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.5103 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.5104 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.4158 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.4583 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 4.81%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.4832 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4793 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5065 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4887 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.5257 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.5252 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.5103 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.5104 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.4158 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.4583 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.482 ± 0.025 | 0% | 0.477 ± 0.033 | 0% | 323 | ✓ PASS |
| DUO DS | 0.475 ± 0.023 | 0% | 0.525 ± 0.027 | 17% | 323 | ✓ PASS |
| DUO RS | 0.515 ± 0.029 | 3% | 0.490 ± 0.026 | 0% | 323 | ✓ PASS |
| DUO POA | 0.501 ± 0.026 | 3% | 0.504 ± 0.031 | 7% | 323 | ✓ PASS |
| DUO GS | 0.507 ± 0.026 | 3% | 0.503 ± 0.033 | 7% | 323 | ✓ PASS |
| DUO CC | 0.528 ± 0.027 | 17% | 0.526 ± 0.023 | 10% | 323 | ✓ PASS |
| DUO NCU | 0.530 ± 0.035 | 10% | 0.501 ± 0.031 | 0% | 323 | ✓ PASS |
| DUO HMB | 0.464 ± 0.035 | 0% | 0.499 ± 0.035 | 10% | 323 | ✓ PASS |
| DUO NMDS | 0.437 ± 0.035 | 0% | 0.535 ± 0.032 | 20% | 323 | ✓ PASS |
| DUO GSO | 0.449 ± 0.027 | 0% | 0.499 ± 0.043 | 7% | 323 | ✓ PASS |
| ICD ch0 | 0.533 ± 0.078 | 7% | 0.520 ± 0.090 | 3% | 127 | ✓ PASS |
| ICD ch1 | 0.470 ± 0.055 | 0% | 0.506 ± 0.064 | 3% | 127 | ✓ PASS |
| ICD ch2 | 0.608 ± 0.085 | 27% | 0.610 ± 0.090 | 30% | 127 | ✓ PASS |
| ICD ch3 | 0.433 ± 0.076 | 0% | 0.476 ± 0.070 | 3% | 127 | ✓ PASS |
| ICD ch4 | 0.497 ± 0.107 | 7% | 0.480 ± 0.072 | 3% | 127 | ✓ PASS |
| ICD ch5 | 0.481 ± 0.091 | 0% | 0.471 ± 0.087 | 3% | 127 | ✓ PASS |
| ICD ch6 | 0.510 ± 0.070 | 3% | 0.458 ± 0.058 | 3% | 127 | ✓ PASS |
| ICD ch7 | 0.519 ± 0.071 | 0% | 0.546 ± 0.102 | 17% | 127 | ✓ PASS |
| ICD ch8 | 0.474 ± 0.100 | 3% | 0.602 ± 0.095 | 27% | 127 | ✓ PASS |
| ICD ch9 | 0.520 ± 0.083 | 13% | 0.532 ± 0.075 | 3% | 127 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
