# Policy Content Hiding Evaluation Report

**Date:** 7/2/2026, 11:17:27 AM

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
- **AUC:** 0.3385 (✓ PASS)

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5362 (✓ PASS)

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5903 (✗ FAIL)

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4062 (✓ PASS)

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.6719 (✗ FAIL)

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.3650 (✓ PASS)

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Macro F1:** 2.09%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.3385 (threshold: 0.55)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.5362 (threshold: 0.55)

### DUO Term 2 Presence: ✗ FAIL

- ✗ **AUC:** 0.5903 (threshold: 0.55)

### DUO Term 3 Presence: ✓ PASS

- ✓ **AUC:** 0.4062 (threshold: 0.55)

### DUO Term 4 Presence: ✗ FAIL

- ✗ **AUC:** 0.6719 (threshold: 0.55)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.3650 (threshold: 0.55)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS


## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.328 ± 0.078 | 0% | 0.595 ± 0.088 | 73% | 374 | ✗ FAIL |
| DUO DS | 0.509 ± 0.104 | 37% | 0.506 ± 0.067 | 30% | 374 | ✓ PASS |
| DUO RS | 0.594 ± 0.082 | 70% | 0.487 ± 0.087 | 27% | 374 | ✗ FAIL |
| DUO POA | 0.518 ± 0.108 | 50% | 0.616 ± 0.059 | 80% | 374 | ✗ FAIL |
| DUO GS | 0.624 ± 0.064 | 93% | 0.574 ± 0.083 | 60% | 374 | ✗ FAIL |
| DUO CC | 0.447 ± 0.079 | 7% | 0.572 ± 0.080 | 70% | 374 | ✗ FAIL |
| ICD ch0 | 0.477 ± 0.083 | 0% | 0.554 ± 0.045 | 60% | 192 | ✗ FAIL |
| ICD ch1 | 0.732 ± 0.155 | 60% | 0.539 ± 0.083 | 3% | 192 | ✗ FAIL |
| ICD ch2 | 0.586 ± 0.233 | 21% | 0.546 ± 0.115 | 14% | 192 | ✓ PASS |
| ICD ch3 | 0.470 ± 0.177 | 3% | 0.499 ± 0.051 | 0% | 192 | ✓ PASS |
| ICD ch4 | 0.350 ± 0.203 | 3% | 0.502 ± 0.057 | 0% | 192 | ✓ PASS |
| ICD ch5 | 0.412 ± 0.185 | 0% | 0.518 ± 0.080 | 3% | 192 | ✓ PASS |
| ICD ch6 | 0.434 ± 0.098 | 3% | 0.485 ± 0.017 | 0% | 192 | ✓ PASS |
| ICD ch7 | 0.625 ± 0.135 | 40% | 0.513 ± 0.038 | 13% | 192 | ✓ PASS |
| ICD ch8 | 0.732 ± 0.171 | 50% | 0.651 ± 0.164 | 40% | 192 | ✗ FAIL |
| ICD ch9 | 0.467 ± 0.107 | 10% | 0.512 ± 0.027 | 7% | 192 | ✓ PASS |

## Overall Result

**Status:** ✗ **FAIL** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

WARNING: System may leak policy content information. Multi-seed attack exceeds privacy thresholds.

**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.
