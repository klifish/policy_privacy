# Policy Content Hiding Evaluation Report

**Date:** 6/26/2026, 4:02:51 PM

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
- **AUC:** 0.4625 (✓ PASS)
- **Advantage:** 46.23% (✗ FAIL)
  - *Interpretation: Adversary performs 46.23% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5775 (✗ FAIL)
- **Advantage:** 5.94% (✗ FAIL)
  - *Interpretation: Adversary performs 5.94% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5978 (✗ FAIL)
- **Advantage:** 10.87% (✗ FAIL)
  - *Interpretation: Adversary performs 10.87% better than random guessing*

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.3463 (✓ PASS)
- **Advantage:** 6.52% (✗ FAIL)
  - *Interpretation: Adversary performs 6.52% better than random guessing*

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.5972 (✗ FAIL)
- **Advantage:** 7.68% (✗ FAIL)
  - *Interpretation: Adversary performs 7.68% better than random guessing*

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.2532 (✓ PASS)
- **Advantage:** -0.72% (✓ PASS)
  - *Interpretation: Adversary performs -0.72% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -7.94% (✓ PASS)
  - *Interpretation: Adversary performs -7.94% better than random guessing*
- **Macro F1:** 1.07%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✗ FAIL

- ✓ **AUC:** 0.4625 (threshold: 0.55)
- ✗ **Advantage:** 0.4623 (threshold: 0.05)

### DUO Term 1 Presence: ✗ FAIL

- ✗ **AUC:** 0.5775 (threshold: 0.55)
- ✗ **Advantage:** 0.0594 (threshold: 0.05)

### DUO Term 2 Presence: ✗ FAIL

- ✗ **AUC:** 0.5978 (threshold: 0.55)
- ✗ **Advantage:** 0.1087 (threshold: 0.05)

### DUO Term 3 Presence: ✗ FAIL

- ✓ **AUC:** 0.3463 (threshold: 0.55)
- ✗ **Advantage:** 0.0652 (threshold: 0.05)

### DUO Term 4 Presence: ✗ FAIL

- ✗ **AUC:** 0.5972 (threshold: 0.55)
- ✗ **Advantage:** 0.0768 (threshold: 0.05)

### DUO Term 5 Presence: ✓ PASS

- ✓ **AUC:** 0.2532 (threshold: 0.55)
- ✓ **Advantage:** -0.0072 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -0.0794 (threshold: 0.05)

## Multi-seed Verdict (authoritative)

Criterion: a task FAILs iff AUC_mean > 0.55 **and** significant-seed fraction ≥ 0.5 (permutation α=0.05). Over 30 policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Advantage reported, not gating.

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

**Status:** ? **INCONCLUSIVE** _(multi-seed, policy-disjoint; single split shown above is diagnostic)_

## Conclusion

INCONCLUSIVE: the positive control was not separable, so the attack pipeline shows no discriminative power — a PASS cannot be distinguished from a powerless attack. No privacy claim is made.

**Inconclusive:** the positive control (a known-distinguishable task) was not separated by the attack pipeline, so the near-chance AUC on real tasks cannot be read as privacy. The attack must be made effective (verified on the control) before any PASS is meaningful.
