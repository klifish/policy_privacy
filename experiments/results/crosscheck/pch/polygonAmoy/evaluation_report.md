# Policy Content Hiding Evaluation Report

**Date:** 10/15/2026, 8:34:06 PM

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
- **AUC:** 0.4613 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4971 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.4582 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4777 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.5058 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4815 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.5092 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.5252 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.5207 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.5013 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 1.64%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.4613 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4971 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.4582 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4777 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.5058 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4815 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.5092 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.5252 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.5207 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.5013 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.511 ± 0.028 | 10% | 0.507 ± 0.019 | 0% | 324 | ✓ PASS |
| DUO DS | 0.498 ± 0.038 | 3% | 0.480 ± 0.029 | 0% | 324 | ✓ PASS |
| DUO RS | 0.487 ± 0.025 | 0% | 0.499 ± 0.029 | 3% | 324 | ✓ PASS |
| DUO POA | 0.493 ± 0.030 | 0% | 0.516 ± 0.028 | 13% | 324 | ✓ PASS |
| DUO GS | 0.480 ± 0.035 | 3% | 0.513 ± 0.030 | 7% | 324 | ✓ PASS |
| DUO CC | 0.507 ± 0.020 | 0% | 0.498 ± 0.024 | 0% | 324 | ✓ PASS |
| DUO NCU | 0.482 ± 0.040 | 3% | 0.497 ± 0.024 | 3% | 324 | ✓ PASS |
| DUO HMB | 0.491 ± 0.040 | 3% | 0.521 ± 0.025 | 17% | 324 | ✓ PASS |
| DUO NMDS | 0.515 ± 0.035 | 7% | 0.508 ± 0.018 | 3% | 324 | ✓ PASS |
| DUO GSO | 0.509 ± 0.035 | 7% | 0.519 ± 0.021 | 13% | 324 | ✓ PASS |
| ICD ch0 | 0.515 ± 0.106 | 10% | 0.500 ± 0.036 | 3% | 127 | ✓ PASS |
| ICD ch1 | 0.596 ± 0.078 | 23% | 0.529 ± 0.072 | 17% | 127 | ✓ PASS |
| ICD ch2 | 0.546 ± 0.075 | 10% | 0.479 ± 0.034 | 0% | 127 | ✓ PASS |
| ICD ch3 | 0.512 ± 0.068 | 3% | 0.501 ± 0.036 | 0% | 127 | ✓ PASS |
| ICD ch4 | 0.493 ± 0.081 | 0% | 0.548 ± 0.063 | 17% | 127 | ✓ PASS |
| ICD ch5 | 0.566 ± 0.098 | 13% | 0.504 ± 0.043 | 3% | 127 | ✓ PASS |
| ICD ch6 | 0.456 ± 0.068 | 0% | 0.481 ± 0.035 | 0% | 127 | ✓ PASS |
| ICD ch7 | 0.478 ± 0.066 | 3% | 0.488 ± 0.032 | 0% | 127 | ✓ PASS |
| ICD ch8 | 0.484 ± 0.069 | 0% | 0.507 ± 0.043 | 7% | 127 | ✓ PASS |
| ICD ch9 | 0.473 ± 0.080 | 0% | 0.503 ± 0.046 | 3% | 127 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
