# Policy Content Hiding Evaluation Report

**Date:** 6/16/2026, 1:51:35 PM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 6
- **DUO Terms (observed):** 6
- **ICD-10 Chapters:** 10
- **Executions per Policy:** 2
- **Total Executions:** 2004
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.4198 (✓ PASS)
- **Advantage:** 37.85% (✗ FAIL)
  - *Interpretation: Adversary performs 37.85% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5109 (✓ PASS)
- **Advantage:** 5.45% (✗ FAIL)
  - *Interpretation: Adversary performs 5.45% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5182 (✓ PASS)
- **Advantage:** 8.72% (✗ FAIL)
  - *Interpretation: Adversary performs 8.72% better than random guessing*

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.4944 (✓ PASS)
- **Advantage:** 11.37% (✗ FAIL)
  - *Interpretation: Adversary performs 11.37% better than random guessing*

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.4886 (✓ PASS)
- **Advantage:** -5.14% (✓ PASS)
  - *Interpretation: Adversary performs -5.14% better than random guessing*

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.4971 (✓ PASS)
- **Advantage:** -3.27% (✓ PASS)
  - *Interpretation: Adversary performs -3.27% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -4.06% (✓ PASS)
  - *Interpretation: Adversary performs -4.06% better than random guessing*
- **Macro F1:** 3.82%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✗ FAIL

- ✓ **AUC:** 0.4198 (threshold: 0.55)
- ✗ **Advantage:** 0.3785 (threshold: 0.05)

### DUO Term 1 Presence: ✗ FAIL

- ✓ **AUC:** 0.5109 (threshold: 0.55)
- ✗ **Advantage:** 0.0545 (threshold: 0.05)

### DUO Term 2 Presence: ✗ FAIL

- ✓ **AUC:** 0.5182 (threshold: 0.55)
- ✗ **Advantage:** 0.0872 (threshold: 0.05)

### DUO Term 3 Presence: ✗ FAIL

- ✓ **AUC:** 0.4944 (threshold: 0.55)
- ✗ **Advantage:** 0.1137 (threshold: 0.05)

### DUO Term 4 Presence: ✓ PASS

- ✓ **AUC:** 0.4886 (threshold: 0.55)
- ✓ **Advantage:** -0.0514 (threshold: 0.05)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.4971 (threshold: 0.55)
- ✓ **Advantage:** -0.0327 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -0.0406 (threshold: 0.05)

## Multi-seed Verdict (authoritative)

Criterion: AUC_mean ≤ 0.55 AND significant-seed fraction < 0.5 (permutation α=0.05), over 30 policy-disjoint seeds. Advantage reported, not gating.

| Task | AUC mean±std | perm p mean | %sig seeds | median test n | Verdict |
|---|---|---|---|---|---|
| DUO GR | 0.479 ± 0.029 | 0.663 | 0% | 584 | ✓ PASS |
| DUO DS | 0.492 ± 0.022 | 0.582 | 0% | 584 | ✓ PASS |
| DUO RS | 0.504 ± 0.023 | 0.437 | 3% | 584 | ✓ PASS |
| DUO POA | 0.477 ± 0.017 | 0.771 | 0% | 584 | ✓ PASS |
| DUO GS | 0.480 ± 0.015 | 0.756 | 0% | 584 | ✓ PASS |
| DUO CC | 0.498 ± 0.025 | 0.511 | 0% | 584 | ✓ PASS |
| ICD ch0 | 0.502 ± 0.048 | 0.501 | 0% | 285.5 | ✓ PASS |
| ICD ch1 | 0.467 ± 0.062 | 0.641 | 0% | 285.5 | ✓ PASS |
| ICD ch2 | 0.453 ± 0.054 | 0.731 | 0% | 285.5 | ✓ PASS |
| ICD ch3 | 0.489 ± 0.048 | 0.547 | 0% | 285.5 | ✓ PASS |
| ICD ch4 | 0.568 ± 0.050 | 0.200 | 17% | 285.5 | ✗ FAIL |
| ICD ch5 | 0.464 ± 0.055 | 0.672 | 0% | 285.5 | ✓ PASS |
| ICD ch6 | 0.519 ± 0.070 | 0.447 | 3% | 285.5 | ✓ PASS |
| ICD ch7 | 0.487 ± 0.049 | 0.596 | 0% | 285.5 | ✓ PASS |
| ICD ch8 | 0.525 ± 0.054 | 0.397 | 7% | 285.5 | ✓ PASS |
| ICD ch9 | 0.534 ± 0.074 | 0.365 | 7% | 285.5 | ✓ PASS |

## Attack-validity (positive control)

- **CONTROL: gas>median:** AUC 0.994 ± 0.002, P/R/F1 = 0.92 / 0.98 / 0.95

> The same attack pipeline recovers a synthetic, known-separable label (derived from observable gas) with high AUC/F1. This confirms the ≈0.5 AUC on real policy-content labels reflects *absence of signal*, not a broken attack. Non-gating sanity check.

## Overall Result

**Status:** ✗ **FAIL** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

WARNING: System may leak policy content information. Multi-seed attack exceeds privacy thresholds.

**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.
