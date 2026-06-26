# Policy Content Hiding Evaluation Report

**Date:** 6/26/2026, 4:07:30 PM

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

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.6170 (✗ FAIL)
- **Advantage:** 45.82% (✗ FAIL)
  - *Interpretation: Adversary performs 45.82% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.4972 (✓ PASS)
- **Advantage:** -2.61% (✓ PASS)
  - *Interpretation: Adversary performs -2.61% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5188 (✓ PASS)
- **Advantage:** 22.13% (✗ FAIL)
  - *Interpretation: Adversary performs 22.13% better than random guessing*

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4810 (✓ PASS)
- **Advantage:** 9.23% (✗ FAIL)
  - *Interpretation: Adversary performs 9.23% better than random guessing*

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4577 (✓ PASS)
- **Advantage:** -7.84% (✓ PASS)
  - *Interpretation: Adversary performs -7.84% better than random guessing*

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4762 (✓ PASS)
- **Advantage:** -1.92% (✓ PASS)
  - *Interpretation: Adversary performs -1.92% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -5.59% (✓ PASS)
  - *Interpretation: Adversary performs -5.59% better than random guessing*
- **Macro F1:** 1.68%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✗ FAIL

- ✗ **AUC:** 0.6170 (threshold: 0.55)
- ✗ **Advantage:** 0.4582 (threshold: 0.05)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.4972 (threshold: 0.55)
- ✓ **Advantage:** -0.0261 (threshold: 0.05)

### DUO Term 2 Presence: ✗ FAIL

- ✓ **AUC:** 0.5188 (threshold: 0.55)
- ✗ **Advantage:** 0.2213 (threshold: 0.05)

### DUO Term 3 Presence: ✗ FAIL

- ✓ **AUC:** 0.4810 (threshold: 0.55)
- ✗ **Advantage:** 0.0923 (threshold: 0.05)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4577 (threshold: 0.55)
- ✓ **Advantage:** -0.0784 (threshold: 0.05)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4762 (threshold: 0.55)
- ✓ **Advantage:** -0.0192 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -0.0559 (threshold: 0.05)

## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Advantage reported, not gating.

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

## Attack-validity (positive control)

- **CONTROL: gas>median:** AUC 0.994 ± 0.002, P/R/F1 = 0.91 / 0.98 / 0.94

> The same attack pipeline recovers a synthetic, known-separable label (derived from observable gas) with high AUC/F1. This confirms the ≈0.5 AUC on real policy-content labels reflects *absence of signal*, not a broken attack. Non-gating sanity check.

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
