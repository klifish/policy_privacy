# Policy Content Hiding Evaluation Report

**Date:** 6/13/2026, 12:28:52 PM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 6
- **DUO Terms (observed):** 6
- **ICD-10 Chapters:** 3
- **Executions per Policy:** 2
- **Total Executions:** 20
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.6667 (✗ FAIL)
- **Advantage:** -10.00% (✓ PASS)
  - *Interpretation: Adversary performs -10.00% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5000 (✓ PASS)
- **Advantage:** 50.00% (✗ FAIL)
  - *Interpretation: Adversary performs 50.00% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5000 (✓ PASS)
- **Advantage:** 50.00% (✗ FAIL)
  - *Interpretation: Adversary performs 50.00% better than random guessing*

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.3333 (✓ PASS)
- **Advantage:** 10.00% (✗ FAIL)
  - *Interpretation: Adversary performs 10.00% better than random guessing*

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.5000 (✓ PASS)
- **Advantage:** 50.00% (✗ FAIL)
  - *Interpretation: Adversary performs 50.00% better than random guessing*

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.5000 (✓ PASS)
- **Advantage:** 50.00% (✗ FAIL)
  - *Interpretation: Adversary performs 50.00% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -100.00% (✓ PASS)
  - *Interpretation: Adversary performs -100.00% better than random guessing*
- **Macro F1:** 0.00%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✗ FAIL

- ✗ **AUC:** 0.6667 (threshold: 0.55)
- ✓ **Advantage:** -0.1000 (threshold: 0.05)

### DUO Term 1 Presence: ✗ FAIL

- ✓ **AUC:** 0.5000 (threshold: 0.55)
- ✗ **Advantage:** 0.5000 (threshold: 0.05)

### DUO Term 2 Presence: ✗ FAIL

- ✓ **AUC:** 0.5000 (threshold: 0.55)
- ✗ **Advantage:** 0.5000 (threshold: 0.05)

### DUO Term 3 Presence: ✗ FAIL

- ✓ **AUC:** 0.3333 (threshold: 0.55)
- ✗ **Advantage:** 0.1000 (threshold: 0.05)

### DUO Term 4 Presence: ✗ FAIL

- ✓ **AUC:** 0.5000 (threshold: 0.55)
- ✗ **Advantage:** 0.5000 (threshold: 0.05)

### DUO Term 5 Presence: ✗ FAIL

- ✓ **AUC:** 0.5000 (threshold: 0.55)
- ✗ **Advantage:** 0.5000 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -1.0000 (threshold: 0.05)

## Overall Result

**Status:** ✗ **FAIL**

## Conclusion

WARNING: System may leak policy content information. Some classifiers exceed privacy thresholds.

**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.
