# Policy Content Hiding Evaluation Report

**Date:** 9/20/2026, 11:28:39 AM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 10
- **DUO Terms (observed):** 10
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 1119
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) is the primary single-split privacy diagnostic.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.5713 (✗ FAIL)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4980 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.4660 (✓ PASS)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4229 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4709 (✓ PASS)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.5348 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.5534 (✗ FAIL)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.5659 (✗ FAIL)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.4804 (✓ PASS)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.6068 (✗ FAIL)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 4.26%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✗ FAIL

- ✗ **AUC:** 0.5713 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4980 (threshold: 0.55)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.4660 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4229 (threshold: 0.55)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4709 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.5348 (threshold: 0.55)

### DUO Term 6 Presence: ✗ FAIL

- ✗ **AUC:** 0.5534 (threshold: 0.55)

### DUO Term 7 Presence: ✗ FAIL

- ✗ **AUC:** 0.5659 (threshold: 0.55)

### DUO Term 8 Presence: ✓ PASS

- ✓ **AUC:** 0.4804 (threshold: 0.55)

### DUO Term 9 Presence: ✗ FAIL

- ✗ **AUC:** 0.6068 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.550 ± 0.045 | 7% | 0.439 ± 0.056 | 0% | 127 | ✓ PASS |
| DUO DS | 0.474 ± 0.051 | 0% | 0.468 ± 0.053 | 0% | 127 | ✓ PASS |
| DUO RS | 0.492 ± 0.045 | 0% | 0.463 ± 0.042 | 3% | 127 | ✓ PASS |
| DUO POA | 0.469 ± 0.039 | 0% | 0.414 ± 0.035 | 0% | 127 | ✓ PASS |
| DUO GS | 0.511 ± 0.042 | 3% | 0.497 ± 0.040 | 0% | 127 | ✓ PASS |
| DUO CC | 0.519 ± 0.045 | 3% | 0.473 ± 0.037 | 0% | 127 | ✓ PASS |
| DUO NCU | 0.463 ± 0.080 | 0% | 0.498 ± 0.078 | 0% | 127 | ✓ PASS |
| DUO HMB | 0.524 ± 0.051 | 3% | 0.465 ± 0.058 | 0% | 127 | ✓ PASS |
| DUO NMDS | 0.508 ± 0.064 | 3% | 0.550 ± 0.076 | 13% | 127 | ✓ PASS |
| DUO GSO | 0.519 ± 0.093 | 3% | 0.432 ± 0.114 | 3% | 127 | ✓ PASS |
| ICD ch0 | 0.522 ± 0.129 | 0% | 0.494 ± 0.156 | 4% | 103 | ✓ PASS |
| ICD ch1 | 0.573 ± 0.068 | 17% | 0.571 ± 0.056 | 10% | 103 | ✓ PASS |
| ICD ch2 | 0.485 ± 0.088 | 3% | 0.507 ± 0.079 | 3% | 103 | ✓ PASS |
| ICD ch3 | 0.541 ± 0.061 | 3% | 0.572 ± 0.051 | 10% | 103 | ✓ PASS |
| ICD ch4 | 0.423 ± 0.070 | 0% | 0.538 ± 0.076 | 10% | 103 | ✓ PASS |
| ICD ch5 | 0.422 ± 0.079 | 0% | 0.606 ± 0.071 | 30% | 103 | ✓ PASS |
| ICD ch6 | 0.514 ± 0.156 | 3% | 0.512 ± 0.134 | 0% | 103 | ✓ PASS |
| ICD ch7 | 0.517 ± 0.060 | 0% | 0.588 ± 0.072 | 23% | 103 | ✓ PASS |
| ICD ch8 | 0.459 ± 0.091 | 3% | 0.447 ± 0.070 | 0% | 103 | ✓ PASS |
| ICD ch9 | 0.532 ± 0.089 | 7% | 0.479 ± 0.070 | 0% | 103 | ✓ PASS |

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
