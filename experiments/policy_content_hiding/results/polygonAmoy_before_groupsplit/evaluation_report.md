# Policy Content Hiding Evaluation Report

**Date:** 6/12/2026, 10:34:10 AM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 6
- **DUO Terms (observed):** 6
- **ICD-10 Chapters:** 11
- **Executions per Policy:** 2
- **Total Executions:** 534
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.7735 (✗ FAIL)
- **Advantage:** 31.48% (✗ FAIL)
  - *Interpretation: Adversary performs 31.48% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5644 (✗ FAIL)
- **Advantage:** 1.85% (✓ PASS)
  - *Interpretation: Adversary performs 1.85% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.7613 (✗ FAIL)
- **Advantage:** 11.73% (✗ FAIL)
  - *Interpretation: Adversary performs 11.73% better than random guessing*

### DUO Term 3 Presence

- **Type:** binary
- **AUC:** 0.6556 (✗ FAIL)
- **Advantage:** 12.96% (✗ FAIL)
  - *Interpretation: Adversary performs 12.96% better than random guessing*

### DUO Term 4 Presence

- **Type:** binary
- **AUC:** 0.6874 (✗ FAIL)
- **Advantage:** 24.07% (✗ FAIL)
  - *Interpretation: Adversary performs 24.07% better than random guessing*

### DUO Term 5 Presence

- **Type:** binary
- **AUC:** 0.7452 (✗ FAIL)
- **Advantage:** 17.28% (✗ FAIL)
  - *Interpretation: Adversary performs 17.28% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -9.09% (✓ PASS)
  - *Interpretation: Adversary performs -9.09% better than random guessing*
- **Macro F1:** 0.00%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✗ FAIL

- ✗ **AUC:** 0.7735 (threshold: 0.55)
- ✗ **Advantage:** 0.3148 (threshold: 0.05)

### DUO Term 1 Presence: ✗ FAIL

- ✗ **AUC:** 0.5644 (threshold: 0.55)
- ✓ **Advantage:** 0.0185 (threshold: 0.05)

### DUO Term 2 Presence: ✗ FAIL

- ✗ **AUC:** 0.7613 (threshold: 0.55)
- ✗ **Advantage:** 0.1173 (threshold: 0.05)

### DUO Term 3 Presence: ✗ FAIL

- ✗ **AUC:** 0.6556 (threshold: 0.55)
- ✗ **Advantage:** 0.1296 (threshold: 0.05)

### DUO Term 4 Presence: ✗ FAIL

- ✗ **AUC:** 0.6874 (threshold: 0.55)
- ✗ **Advantage:** 0.2407 (threshold: 0.05)

### DUO Term 5 Presence: ✗ FAIL

- ✗ **AUC:** 0.7452 (threshold: 0.55)
- ✗ **Advantage:** 0.1728 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -0.0909 (threshold: 0.05)

## Overall Result

**Status:** ✗ **FAIL**

## Conclusion

WARNING: System may leak policy content information. Some classifiers exceed privacy thresholds.

**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.
