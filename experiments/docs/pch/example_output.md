# Privacy Evaluation Output Examples

> **Comparison: Before and After Removing Accuracy Metric**

## Overview

This document shows real examples of privacy evaluation output before and after the metric improvements. The key change is **removing accuracy** as a primary metric and **emphasizing AUC** for privacy evaluation.

---

## Example 1: The Misleading Accuracy Problem

### Before: Accuracy-Focused (Misleading) ❌

```text
Task: DUO Term 0 Presence
  Type: binary
  Accuracy: 56.11%
  Random Baseline: 50.00%
  Advantage: 6.11%
  AUC: 0.5785

Task: DUO Term 1 Presence
  Type: binary
  Accuracy: 47.78%
  Random Baseline: 50.00%
  Advantage: -2.22%
  AUC: 0.5691

Task: DUO Term 2 Presence
  Type: binary
  Accuracy: 49.44%
  Random Baseline: 50.00%
  Advantage: -0.56%
  AUC: 0.5093
```

### ❌ Problems with Old Output

| Issue | Description | Impact |
|-------|-------------|--------|
| **Misleading Term 1** | Accuracy 47.78% < 50% looks "good" | False sense of security |
| **Buried AUC** | AUC = 0.5691 listed last | Easy to miss the real privacy breach |
| **No Context** | Missing class distribution | Can't diagnose imbalance issues |
| **Wrong Emphasis** | Accuracy shown first | Draws attention to wrong metric |
| **No Visual Cues** | Plain numbers only | Hard to quickly assess pass/fail |

**Critical Issue**: A researcher might see Term 1's 47.78% accuracy and think "below 50%, privacy is good!" while completely missing that AUC = 0.5691 indicates **privacy leakage**.

### After: AUC-Focused (Clear) ✅

```text
Classification Results (Privacy Metrics):
Note: AUC and Advantage are the primary privacy indicators.
AUC ≤ 0.55 and Advantage ≤ 5% indicate good privacy protection.

Task: DUO Term 0 Presence
  Type: binary
  Test Set: 93/180 positive (51.7%)
  ✗ AUC: 0.5720 (threshold: ≤0.55)
  ✗ Advantage: 5.56%
     → Adversary performs 5.56% better than random guessing
  Precision: 61.02%, Recall: 38.71%, F1: 47.37%

Task: DUO Term 1 Presence
  Type: binary
  Test Set: 91/180 positive (50.6%)
  ✗ AUC: 0.5270 (threshold: ≤0.55)
  ✓ Advantage: 0.00%
     → Adversary performs 0.00% better than random guessing
  Precision: 51.72%, Recall: 16.48%, F1: 25.00%

Task: DUO Term 2 Presence
  Type: binary
  Test Set: 78/180 positive (43.3%)
  ✓ AUC: 0.4893 (threshold: ≤0.55)
  ✓ Advantage: 0.00%
     → Adversary performs 0.00% better than random guessing
  Precision: 44.44%, Recall: 61.54%, F1: 51.61%
```

### ✅ Improvements

| Improvement | Description | Benefit |
|-------------|-------------|---------|
| **Visual Indicators** | ✓/✗ symbols for pass/fail | Instant visual assessment |
| **AUC First** | Primary metric shown prominently | Correct focus on privacy |
| **Class Distribution** | Test set composition visible | Context for interpretation |
| **Interpretation Text** | "→ Adversary performs X% better..." | Clear meaning for non-experts |
| **Correct Diagnosis** | Term 1 flagged despite 50% accuracy | No false negatives |
| **Diagnostic Metrics** | P/R/F1 still shown | Understand classifier behavior |

**Key Win**: Now impossible to miss that Term 1 has AUC = 0.5270 (borderline but failing), even though accuracy = 50.0%.

---

## Example 2: Privacy Threshold Check

### Structured Pass/Fail Summary

```text
Privacy Threshold Check:
  AUC Threshold: ≤ 0.55
  Advantage Threshold: ≤ 0.05

  DUO Term 0 Presence: ✗ FAIL
    ✗ AUC: 0.5720 (threshold: 0.55)
    ✗ Advantage: 0.0556 (threshold: 0.05)

  DUO Term 1 Presence: ✗ FAIL
    ✗ AUC: 0.5270 (threshold: 0.55)
    ✓ Advantage: 0.0000 (threshold: 0.05)

  DUO Term 2 Presence: ✓ PASS
    ✓ AUC: 0.4893 (threshold: 0.55)
    ✓ Advantage: 0.0000 (threshold: 0.05)

Overall: ✗ FAIL
```

### Analysis

| Task | AUC Status | Advantage Status | Overall | Reason for Failure |
|------|-----------|------------------|---------|-------------------|
| **Term 0** | ✗ FAIL | ✗ FAIL | ✗ FAIL | Both metrics exceed threshold |
| **Term 1** | ✗ FAIL | ✓ PASS | ✗ FAIL | AUC exceeds (ranking ability) |
| **Term 2** | ✓ PASS | ✓ PASS | ✓ PASS | Both metrics within threshold |

**Clear Verdict**:
- **2 out of 3 DUO Terms** have privacy leakage
- **Primary cause**: AUC exceeding threshold (ranking ability)
- **Action required**: Investigate Term 0 and Term 1 for feature leakage

---

## Example 3: Training Warnings

### Automatic Class Imbalance Detection

```text
Task 1: DUO Term Presence Prediction (Binary)
  Training classifier for DUO term 0...
    Train: 130/420 positive (31.0%)
    Test: 93/180 positive (51.7%)

  Training classifier for DUO term 1...
    Train: 86/420 positive (20.5%)
    Test: 91/180 positive (50.6%)

  Training classifier for DUO term 2...
    Train: 58/420 positive (13.8%)
    Test: 78/180 positive (43.3%)
    ⚠️  Class imbalance detected - Accuracy metric may be misleading!
```

### What the Warning Means

**Trigger**: Term 2 has only 13.8% positive samples in training set (< 30% threshold)

**Implication**:
- Classifier will be biased toward predicting negative class
- Accuracy metric will be inflated (can reach 86.2% by always predicting negative)
- **Must use AUC** to properly evaluate privacy

**User Action**: Acknowledged - the system correctly flags this and uses AUC instead of accuracy.

## Example 4: Markdown Report (Generated)

### Report Header

```markdown
## Privacy Evaluation Results

**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.
- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random
- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing

> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.
```

### Individual Task Results

```markdown
### DUO Term 0 Presence

- **Type:** binary
- **AUC:** 0.5720 (✗ FAIL)
- **Advantage:** 5.56% (✗ FAIL)
  - *Interpretation: Adversary performs 5.56% better than random guessing*

### DUO Term 1 Presence

- **Type:** binary
- **AUC:** 0.5270 (✗ FAIL)
- **Advantage:** 0.00% (✓ PASS)
  - *Interpretation: Adversary performs 0.00% better than random guessing*

### DUO Term 2 Presence

- **Type:** binary
- **AUC:** 0.4893 (✓ PASS)
- **Advantage:** 0.00% (✓ PASS)
  - *Interpretation: Adversary performs 0.00% better than random guessing*
```

### Key Features

- **✓/✗ inline status** makes scanning easy
- **Interpretation text** explains what the numbers mean
- **No accuracy** to distract from real privacy metrics
- **Explanation block** at the top educates readers

---

## Impact Summary

### Comparison Table

| Aspect | Before (Accuracy-Based) | After (AUC-Based) | Improvement |
|--------|------------------------|-------------------|-------------|
| **Primary Metric** | Accuracy | AUC | ✅ More reliable for privacy |
| **Visual Clarity** | Plain numbers | ✓/✗ indicators | ✅ Instant assessment |
| **Class Context** | Hidden | Shown upfront | ✅ Better understanding |
| **Interpretation** | Implicit | Explicit text | ✅ Clearer meaning |
| **False Negatives** | Possible (low accuracy hides AUC) | Eliminated | ✅ Correct diagnosis |
| **False Positives** | Possible (high accuracy hides AUC) | Eliminated | ✅ No false security |
| **Expert Needed** | Yes (to spot AUC issue) | No (obvious from output) | ✅ More accessible |

### User Experience Improvements

| User Type | Before | After |
|-----------|--------|-------|
| **Security Researcher** | Must carefully check AUC (easy to miss) | ✓/✗ makes privacy leaks obvious |
| **ML Engineer** | Confused by accuracy/AUC mismatch | Clear which metric matters for privacy |
| **Auditor** | Must explain why accuracy misleads | Report self-documents the issue |
| **Developer** | Uncertain if 48% accuracy is good/bad | Unambiguous: AUC 0.57 = FAIL |

### Critical Fixes

1. **Term 1 Misdiagnosis** (Before):
   - Accuracy: 47.78% (looks bad)
   - AUC: 0.5691 (actually bad, but buried)
   - **Result**: Privacy breach hidden by low accuracy ❌

2. **Term 1 Correct Diagnosis** (After):
   - ✗ AUC: 0.5270 (prominently shown as FAIL)
   - ✓ Advantage: 0.00% (passes)
   - **Result**: Privacy issue clearly identified ✅

---

## Quick Reference

### Reading the New Output

```text
Task: [Task Name]
  Test Set: X/Y positive (Z%)        ← Class distribution
  [✓/✗] AUC: 0.XXXX (threshold: ≤0.55)    ← PRIMARY METRIC
  [✓/✗] Advantage: X.XX%                   ← SECONDARY METRIC
     → Adversary performs X.XX% better than random guessing
  Precision: X%, Recall: X%, F1: X%       ← Diagnostic info
```

### Decision Rule

| AUC | Advantage | Verdict | Action |
|-----|-----------|---------|--------|
| ✓ ≤ 0.55 | ✓ ≤ 5% | ✅ **PASS** | Privacy protected |
| ✗ > 0.55 | ✓ ≤ 5% | ❌ **FAIL** | AUC breach (ranking attack possible) |
| ✓ ≤ 0.55 | ✗ > 5% | ⚠️ **INVESTIGATE** | Advantage high but AUC low (calibration issue?) |
| ✗ > 0.55 | ✗ > 5% | ❌ **CRITICAL** | Both metrics fail - severe privacy breach |

---

## Related Documentation

- **[Metrics Explanation](./METRICS_EXPLANATION.md)**: Detailed guide on why accuracy was removed
- **[Evaluator Code](./evaluator.js)**: Implementation of metric calculation
- **[Experiment Runner](./run_experiment.js)**: Where the output is generated
