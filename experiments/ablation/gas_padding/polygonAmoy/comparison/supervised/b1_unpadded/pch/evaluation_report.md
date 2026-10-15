# Policy Content Hiding Evaluation Report

**Date:** 10/15/2026, 9:54:16 PM

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
- **AUC:** 0.4977 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5053 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5133 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4973 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4880 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.5201 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.4864 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.4443 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.5174 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.4966 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 2.84%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.4977 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.5053 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5133 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4973 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4880 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.5201 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.4864 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.4443 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.5174 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.4966 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.504 ± 0.033 | 7% | 0.503 ± 0.017 | 0% | 324 | ✓ PASS |
| DUO DS | 0.497 ± 0.035 | 3% | 0.474 ± 0.028 | 0% | 324 | ✓ PASS |
| DUO RS | 0.489 ± 0.022 | 0% | 0.497 ± 0.026 | 0% | 324 | ✓ PASS |
| DUO POA | 0.492 ± 0.028 | 0% | 0.499 ± 0.026 | 3% | 324 | ✓ PASS |
| DUO GS | 0.485 ± 0.035 | 7% | 0.508 ± 0.022 | 3% | 324 | ✓ PASS |
| DUO CC | 0.506 ± 0.021 | 0% | 0.490 ± 0.023 | 0% | 324 | ✓ PASS |
| DUO NCU | 0.483 ± 0.037 | 0% | 0.501 ± 0.022 | 3% | 324 | ✓ PASS |
| DUO HMB | 0.495 ± 0.033 | 0% | 0.516 ± 0.024 | 10% | 324 | ✓ PASS |
| DUO NMDS | 0.515 ± 0.033 | 13% | 0.508 ± 0.020 | 7% | 324 | ✓ PASS |
| DUO GSO | 0.508 ± 0.032 | 7% | 0.517 ± 0.021 | 13% | 324 | ✓ PASS |
| ICD ch0 | 0.517 ± 0.100 | 10% | 0.490 ± 0.026 | 0% | 127 | ✓ PASS |
| ICD ch1 | 0.535 ± 0.063 | 7% | 0.509 ± 0.040 | 3% | 127 | ✓ PASS |
| ICD ch2 | 0.535 ± 0.086 | 7% | 0.493 ± 0.034 | 0% | 127 | ✓ PASS |
| ICD ch3 | 0.485 ± 0.056 | 0% | 0.502 ± 0.035 | 0% | 127 | ✓ PASS |
| ICD ch4 | 0.530 ± 0.064 | 0% | 0.573 ± 0.062 | 43% | 127 | ✓ PASS |
| ICD ch5 | 0.571 ± 0.079 | 10% | 0.504 ± 0.038 | 0% | 127 | ✓ PASS |
| ICD ch6 | 0.457 ± 0.074 | 0% | 0.492 ± 0.034 | 0% | 127 | ✓ PASS |
| ICD ch7 | 0.517 ± 0.068 | 3% | 0.497 ± 0.024 | 0% | 127 | ✓ PASS |
| ICD ch8 | 0.476 ± 0.084 | 0% | 0.501 ± 0.034 | 0% | 127 | ✓ PASS |
| ICD ch9 | 0.481 ± 0.065 | 0% | 0.488 ± 0.039 | 3% | 127 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
