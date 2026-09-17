# Policy Content Hiding Evaluation Report

**Date:** 9/17/2026, 10:21:47 AM

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
- **AUC:** 0.4993 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4443 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.4814 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.5519 (✗ FAIL)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4935 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4797 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.4774 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.4817 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.4677 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.5271 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 4.62%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.4993 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4443 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.4814 (threshold: 0.55)

### DUO Term 3 Presence: ✗ FAIL

- ✗ **AUC:** 0.5519 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4935 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4797 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.4774 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.4817 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.4677 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.5271 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.542 ± 0.028 | 27% | 0.499 ± 0.029 | 0% | 324 | ✓ PASS |
| DUO DS | 0.510 ± 0.022 | 3% | 0.507 ± 0.027 | 3% | 324 | ✓ PASS |
| DUO RS | 0.498 ± 0.021 | 0% | 0.508 ± 0.024 | 0% | 324 | ✓ PASS |
| DUO POA | 0.481 ± 0.022 | 0% | 0.426 ± 0.024 | 0% | 324 | ✓ PASS |
| DUO GS | 0.498 ± 0.016 | 0% | 0.506 ± 0.027 | 0% | 324 | ✓ PASS |
| DUO CC | 0.485 ± 0.024 | 0% | 0.481 ± 0.025 | 0% | 324 | ✓ PASS |
| DUO NCU | 0.513 ± 0.039 | 13% | 0.515 ± 0.029 | 7% | 324 | ✓ PASS |
| DUO HMB | 0.514 ± 0.028 | 7% | 0.488 ± 0.031 | 0% | 324 | ✓ PASS |
| DUO NMDS | 0.490 ± 0.037 | 0% | 0.523 ± 0.025 | 3% | 324 | ✓ PASS |
| DUO GSO | 0.505 ± 0.038 | 3% | 0.527 ± 0.034 | 17% | 324 | ✓ PASS |
| ICD ch0 | 0.451 ± 0.077 | 0% | 0.423 ± 0.054 | 0% | 127 | ✓ PASS |
| ICD ch1 | 0.559 ± 0.066 | 13% | 0.559 ± 0.073 | 20% | 127 | ✓ PASS |
| ICD ch2 | 0.493 ± 0.081 | 7% | 0.510 ± 0.066 | 3% | 127 | ✓ PASS |
| ICD ch3 | 0.560 ± 0.078 | 17% | 0.544 ± 0.060 | 17% | 127 | ✓ PASS |
| ICD ch4 | 0.433 ± 0.065 | 0% | 0.544 ± 0.058 | 3% | 127 | ✓ PASS |
| ICD ch5 | 0.393 ± 0.063 | 0% | 0.580 ± 0.079 | 17% | 127 | ✓ PASS |
| ICD ch6 | 0.488 ± 0.055 | 0% | 0.490 ± 0.058 | 0% | 127 | ✓ PASS |
| ICD ch7 | 0.541 ± 0.071 | 3% | 0.521 ± 0.065 | 0% | 127 | ✓ PASS |
| ICD ch8 | 0.475 ± 0.086 | 0% | 0.470 ± 0.091 | 0% | 127 | ✓ PASS |
| ICD ch9 | 0.521 ± 0.069 | 0% | 0.490 ± 0.084 | 3% | 127 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
