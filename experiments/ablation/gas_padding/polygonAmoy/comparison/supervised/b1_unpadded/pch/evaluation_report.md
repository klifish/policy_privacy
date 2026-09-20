# Policy Content Hiding Evaluation Report

**Date:** 9/20/2026, 9:43:24 AM

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
- **AUC:** 0.9000 (✗ FAIL)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4216 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.6836 (✗ FAIL)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.7313 (✗ FAIL)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.7553 (✗ FAIL)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4726 (✓ PASS)

### DUO Term 6 Presence

- **Type:** binary
- **AUC:** 0.7971 (✗ FAIL)

### DUO Term 7 Presence

- **Type:** binary
- **AUC:** 0.8680 (✗ FAIL)

### DUO Term 8 Presence

- **Type:** binary
- **AUC:** 0.7918 (✗ FAIL)

### DUO Term 9 Presence

- **Type:** binary
- **AUC:** 0.6944 (✗ FAIL)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 4.19%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✗ FAIL

- ✗ **AUC:** 0.9000 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4216 (threshold: 0.55)

### DUO Term 2 Presence: ✗ FAIL

- ✗ **AUC:** 0.6836 (threshold: 0.55)

### DUO Term 3 Presence: ✗ FAIL

- ✗ **AUC:** 0.7313 (threshold: 0.55)

### DUO Term 4 Presence: ✗ FAIL

- ✗ **AUC:** 0.7553 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4726 (threshold: 0.55)

### DUO Term 6 Presence: ✗ FAIL

- ✗ **AUC:** 0.7971 (threshold: 0.55)

### DUO Term 7 Presence: ✗ FAIL

- ✗ **AUC:** 0.8680 (threshold: 0.55)

### DUO Term 8 Presence: ✗ FAIL

- ✗ **AUC:** 0.7918 (threshold: 0.55)

### DUO Term 9 Presence: ✗ FAIL

- ✗ **AUC:** 0.6944 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.882 ± 0.025 | 100% | 0.879 ± 0.024 | 100% | 127 | ✗ FAIL |
| DUO DS | 0.689 ± 0.058 | 87% | 0.683 ± 0.061 | 87% | 127 | ✗ FAIL |
| DUO RS | 0.516 ± 0.037 | 3% | 0.557 ± 0.043 | 37% | 127 | ✓ PASS |
| DUO POA | 0.619 ± 0.035 | 77% | 0.685 ± 0.036 | 100% | 127 | ✗ FAIL |
| DUO GS | 0.561 ± 0.032 | 10% | 0.660 ± 0.039 | 93% | 127 | ✗ FAIL |
| DUO CC | 0.567 ± 0.047 | 27% | 0.657 ± 0.051 | 90% | 127 | ✗ FAIL |
| DUO NCU | 0.834 ± 0.024 | 100% | 0.648 ± 0.096 | 70% | 127 | ✗ FAIL |
| DUO HMB | 0.872 ± 0.028 | 100% | 0.884 ± 0.024 | 100% | 127 | ✗ FAIL |
| DUO NMDS | 0.839 ± 0.022 | 100% | 0.686 ± 0.092 | 83% | 127 | ✗ FAIL |
| DUO GSO | 0.793 ± 0.054 | 97% | 0.585 ± 0.097 | 33% | 127 | ✗ FAIL |
| ICD ch0 | 0.781 ± 0.155 | 50% | 0.521 ± 0.122 | 0% | 102 | ✗ FAIL |
| ICD ch1 | 0.474 ± 0.068 | 3% | 0.462 ± 0.035 | 0% | 102 | ✓ PASS |
| ICD ch2 | 0.530 ± 0.091 | 3% | 0.534 ± 0.074 | 7% | 102 | ✓ PASS |
| ICD ch3 | 0.562 ± 0.072 | 17% | 0.511 ± 0.038 | 3% | 102 | ✓ PASS |
| ICD ch4 | 0.514 ± 0.063 | 0% | 0.483 ± 0.049 | 0% | 102 | ✓ PASS |
| ICD ch5 | 0.510 ± 0.099 | 13% | 0.466 ± 0.045 | 0% | 102 | ✓ PASS |
| ICD ch6 | 0.764 ± 0.147 | 45% | 0.602 ± 0.103 | 31% | 102 | ✓ PASS |
| ICD ch7 | 0.472 ± 0.070 | 0% | 0.511 ± 0.049 | 3% | 102 | ✓ PASS |
| ICD ch8 | 0.451 ± 0.086 | 3% | 0.472 ± 0.027 | 0% | 102 | ✓ PASS |
| ICD ch9 | 0.448 ± 0.078 | 0% | 0.478 ± 0.036 | 0% | 102 | ✓ PASS |

## Overall Result

**Status:** ✗ **FAIL** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

WARNING: System may leak policy content information. Multi-seed attack exceeds privacy thresholds.

**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.
