# Policy Content Hiding Evaluation Report

**Date:** 7/2/2026, 11:21:53 AM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 6
- **DUO Terms (observed):** 6
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 1206
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) is the primary single-split privacy diagnostic.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.4800 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5258 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5069 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4933 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4951 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4834 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 1.45%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.4800 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.5258 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5069 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4933 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4951 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4834 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.511 ± 0.028 | 3% | 0.487 ± 0.038 | 0% | 374 | ✓ PASS |
| DUO DS | 0.529 ± 0.024 | 13% | 0.501 ± 0.040 | 13% | 374 | ✓ PASS |
| DUO RS | 0.496 ± 0.023 | 0% | 0.521 ± 0.033 | 17% | 374 | ✓ PASS |
| DUO POA | 0.488 ± 0.026 | 0% | 0.491 ± 0.027 | 0% | 374 | ✓ PASS |
| DUO GS | 0.479 ± 0.022 | 0% | 0.507 ± 0.023 | 0% | 374 | ✓ PASS |
| DUO CC | 0.509 ± 0.029 | 3% | 0.504 ± 0.028 | 7% | 374 | ✓ PASS |
| ICD ch0 | 0.499 ± 0.082 | 3% | 0.444 ± 0.054 | 0% | 192 | ✓ PASS |
| ICD ch1 | 0.447 ± 0.090 | 0% | 0.412 ± 0.139 | 3% | 192 | ✓ PASS |
| ICD ch2 | 0.479 ± 0.115 | 0% | 0.511 ± 0.121 | 0% | 192 | ✓ PASS |
| ICD ch3 | 0.535 ± 0.088 | 3% | 0.454 ± 0.127 | 0% | 192 | ✓ PASS |
| ICD ch4 | 0.532 ± 0.109 | 14% | 0.524 ± 0.081 | 0% | 192 | ✓ PASS |
| ICD ch5 | 0.453 ± 0.129 | 0% | 0.462 ± 0.112 | 0% | 192 | ✓ PASS |
| ICD ch6 | 0.528 ± 0.041 | 0% | 0.526 ± 0.066 | 7% | 192 | ✓ PASS |
| ICD ch7 | 0.421 ± 0.044 | 0% | 0.425 ± 0.075 | 0% | 192 | ✓ PASS |
| ICD ch8 | 0.506 ± 0.131 | 0% | 0.392 ± 0.148 | 0% | 192 | ✓ PASS |
| ICD ch9 | 0.530 ± 0.044 | 3% | 0.480 ± 0.066 | 0% | 192 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
