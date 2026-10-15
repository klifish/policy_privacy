# Policy Content Hiding Evaluation Report

**Date:** 10/14/2026, 3:05:24 PM

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
- **AUC:** 0.5146 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4550 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.4747 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.5044 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.5071 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4924 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.4937 (✓ PASS)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.4667 (✓ PASS)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.5170 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.4979 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 5.21%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.5146 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4550 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.4747 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.5044 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.5071 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4924 (threshold: 0.55)

### DUO Term 6 Presence: ✓ PASS

- ✓ **AUC:** 0.4937 (threshold: 0.55)

### DUO Term 7 Presence: ✓ PASS

- ✓ **AUC:** 0.4667 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.5170 (threshold: 0.55)

### DUO Term 9 Presence: ✓ PASS

- ✓ **AUC:** 0.4979 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.455 ± 0.061 | 0% | 0.478 ± 0.061 | 0% | 113 | ✓ PASS |
| DUO DS | 0.515 ± 0.079 | 0% | 0.489 ± 0.081 | 0% | 113 | ✓ PASS |
| DUO RS | 0.559 ± 0.048 | 0% | 0.536 ± 0.048 | 0% | 113 | ✓ PASS |
| DUO POA | 0.496 ± 0.044 | 0% | 0.530 ± 0.044 | 0% | 113 | ✓ PASS |
| DUO GS | 0.509 ± 0.046 | 0% | 0.504 ± 0.048 | 0% | 113 | ✓ PASS |
| DUO CC | 0.548 ± 0.033 | 0% | 0.504 ± 0.032 | 0% | 113 | ✓ PASS |
| DUO NCU | 0.470 ± 0.076 | 0% | 0.458 ± 0.083 | 0% | 113 | ✓ PASS |
| DUO HMB | 0.535 ± 0.062 | 0% | 0.493 ± 0.047 | 0% | 113 | ✓ PASS |
| DUO NMDS | 0.542 ± 0.052 | 0% | 0.450 ± 0.063 | 0% | 113 | ✓ PASS |
| DUO GSO | 0.523 ± 0.083 | 0% | 0.447 ± 0.077 | 0% | 113 | ✓ PASS |
| ICD ch0 | 0.452 ± 0.181 | 0% | 0.463 ± 0.179 | 0% | 100 | ✓ PASS |
| ICD ch1 | 0.502 ± 0.115 | 0% | 0.550 ± 0.098 | 0% | 100 | ✓ PASS |
| ICD ch2 | 0.533 ± 0.104 | 0% | 0.443 ± 0.097 | 0% | 100 | ✓ PASS |
| ICD ch3 | 0.532 ± 0.108 | 0% | 0.489 ± 0.089 | 0% | 100 | ✓ PASS |
| ICD ch4 | 0.485 ± 0.088 | 0% | 0.480 ± 0.092 | 0% | 100 | ✓ PASS |
| ICD ch5 | 0.531 ± 0.088 | 0% | 0.520 ± 0.087 | 0% | 100 | ✓ PASS |
| ICD ch6 | 0.478 ± 0.090 | 0% | 0.456 ± 0.093 | 0% | 100 | ✓ PASS |
| ICD ch7 | 0.431 ± 0.055 | 0% | 0.508 ± 0.064 | 0% | 100 | ✓ PASS |
| ICD ch8 | 0.559 ± 0.075 | 0% | 0.540 ± 0.115 | 0% | 100 | ✓ PASS |
| ICD ch9 | 0.526 ± 0.067 | 0% | 0.553 ± 0.088 | 0% | 100 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
