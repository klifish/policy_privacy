# Policy Content Hiding Evaluation Report

**Date:** 11/8/2025, 7:18:57 PM

## Objective

Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Experiment Configuration

- **DUO Terms (requested):** 3
- **DUO Terms (observed):** 3
- **ICD-10 Chapters:** 11
- **Executions per Policy:** 3
- **Total Executions:** 597
- **Test Ratio:** 30%

## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.

### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.5345 (✓ PASS)
- **Advantage:** 0.28% (✓ PASS)
  - *Interpretation: Adversary performs 0.28% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5455 (✓ PASS)
- **Advantage:** 3.07% (✓ PASS)
  - *Interpretation: Adversary performs 3.07% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.5003 (✓ PASS)
- **Advantage:** 0.28% (✓ PASS)
  - *Interpretation: Adversary performs 0.28% better than random guessing*

### ICD-10 Chapter Prediction (RandomForest)

- **Type:** multi-class
- **Advantage:** -9.09% (✓ PASS)
  - *Interpretation: Adversary performs -9.09% better than random guessing*
- **Macro F1:** 0.00%

## Privacy Threshold Check

- **AUC Threshold:** ≤ 0.55
- **Advantage Threshold:** ≤ 0.05

### DUO Term 0 Presence: ✓ PASS

- ✓ **AUC:** 0.5345 (threshold: 0.55)
- ✓ **Advantage:** 0.0028 (threshold: 0.05)

### DUO Term 1 Presence: ✓ PASS

- ✓ **AUC:** 0.5455 (threshold: 0.55)
- ✓ **Advantage:** 0.0307 (threshold: 0.05)

### DUO Term 2 Presence: ✓ PASS

- ✓ **AUC:** 0.5003 (threshold: 0.55)
- ✓ **Advantage:** 0.0028 (threshold: 0.05)

### ICD-10 Chapter Prediction (RandomForest): ✓ PASS

- ✓ **Advantage:** -0.0909 (threshold: 0.05)

## Overall Result

**Status:** ✓ **PASS**

## Conclusion

System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing.

The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.
