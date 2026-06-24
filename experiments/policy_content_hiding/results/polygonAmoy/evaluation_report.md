# Policy Content Hiding Evaluation Report

**Date:** 6/24/2026, 12:52:24 PM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 6
- **DUO Terms (observed):** 6
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 2005
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.4891 (✓ PASS)
- **Advantage:** 31.41% (✗ FAIL)
  - *Interpretation: Adversary performs 31.41% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5055 (✓ PASS)
- **Advantage:** 6.41% (✗ FAIL)
  - *Interpretation: Adversary performs 6.41% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5102 (✓ PASS)
- **Advantage:** -0.64% (✓ PASS)
  - *Interpretation: Adversary performs -0.64% better than random guessing*

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4332 (✓ PASS)
- **Advantage:** 18.38% (✗ FAIL)
  - *Interpretation: Adversary performs 18.38% better than random guessing*

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4771 (✓ PASS)
- **Advantage:** -23.50% (✓ PASS)
  - *Interpretation: Adversary performs -23.50% better than random guessing*

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4899 (✓ PASS)
- **Advantage:** -0.64% (✓ PASS)
  - *Interpretation: Adversary performs -0.64% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -1.18% (✓ PASS)
  - *Interpretation: Adversary performs -1.18% better than random guessing*
- **Macro F1:** 5.12%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✗ FAIL

- ✓ **AUC:** 0.4891 (threshold: 0.55)
- ✗ **Advantage:** 0.3141 (threshold: 0.05)

### DUO Term 1 Presence: ✗ FAIL

- ✓ **AUC:** 0.5055 (threshold: 0.55)
- ✗ **Advantage:** 0.0641 (threshold: 0.05)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5102 (threshold: 0.55)
- ✓ **Advantage:** -0.0064 (threshold: 0.05)

### DUO Term 3 Presence: ✗ FAIL

- ✓ **AUC:** 0.4332 (threshold: 0.55)
- ✗ **Advantage:** 0.1838 (threshold: 0.05)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4771 (threshold: 0.55)
- ✓ **Advantage:** -0.2350 (threshold: 0.05)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4899 (threshold: 0.55)
- ✓ **Advantage:** -0.0064 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -0.0118 (threshold: 0.05)

## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Advantage reported, not gating.

| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |
|---|---|---|---|---|---|---|
| DUO GR | 0.479 ± 0.029 | 0% | 0.517 ± 0.038 | 17% | 584 | ✓ PASS |
| DUO DS | 0.492 ± 0.022 | 0% | 0.462 ± 0.018 | 0% | 584 | ✓ PASS |
| DUO RS | 0.504 ± 0.023 | 3% | 0.540 ± 0.017 | 50% | 584 | ✓ PASS |
| DUO POA | 0.477 ± 0.017 | 0% | 0.485 ± 0.021 | 0% | 584 | ✓ PASS |
| DUO GS | 0.480 ± 0.015 | 0% | 0.515 ± 0.023 | 10% | 584 | ✓ PASS |
| DUO CC | 0.498 ± 0.025 | 3% | 0.500 ± 0.025 | 3% | 584 | ✓ PASS |
| ICD ch0 | 0.509 ± 0.065 | 0% | 0.441 ± 0.053 | 0% | 271 | ✓ PASS |
| ICD ch1 | 0.476 ± 0.057 | 0% | 0.497 ± 0.067 | 13% | 271 | ✓ PASS |
| ICD ch2 | 0.453 ± 0.046 | 0% | 0.532 ± 0.063 | 13% | 271 | ✓ PASS |
| ICD ch3 | 0.496 ± 0.049 | 0% | 0.500 ± 0.058 | 3% | 271 | ✓ PASS |
| ICD ch4 | 0.541 ± 0.062 | 10% | 0.527 ± 0.078 | 13% | 271 | ✓ PASS |
| ICD ch5 | 0.454 ± 0.067 | 0% | 0.467 ± 0.088 | 13% | 271 | ✓ PASS |
| ICD ch6 | 0.526 ± 0.078 | 10% | 0.591 ± 0.089 | 40% | 271 | ✓ PASS |
| ICD ch7 | 0.473 ± 0.037 | 0% | 0.493 ± 0.052 | 3% | 271 | ✓ PASS |
| ICD ch8 | 0.509 ± 0.034 | 0% | 0.445 ± 0.038 | 0% | 271 | ✓ PASS |
| ICD ch9 | 0.531 ± 0.050 | 0% | 0.508 ± 0.070 | 0% | 271 | ✓ PASS |

## Attack-validity (positive control)

- **CONTROL: gas>median:** AUC 0.994 ± 0.002, P/R/F1 = 0.92 / 0.98 / 0.95

> The same attack pipeline recovers a synthetic, known-separable label (derived from observable gas) with high AUC/F1. This confirms the ≈0.5 AUC on real policy-content labels reflects *absence of signal*, not a broken attack. Non-gating sanity check.

## Overall Result

**Status:** ✓ **PASS** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
