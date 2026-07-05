# Privacy Evaluation Metrics Guide

> ⚠️ **ARCHIVED — superseded.** This document describes the pre-multiseed, single-split
> PASS/FAIL design (a single AUC≤0.55-and-Advantage≤5% threshold check). The current
> authoritative privacy verdict is a 30-seed policy-disjoint double criterion
> (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`), implemented in
> `experiments/core/multiseed_criterion.js`. Some file/API references below (e.g.
> `evaluator.js`, `classifiers.js`, `mock_demo.js`) no longer exist as standalone files.
> Kept for historical context only — do not use as a spec of current behavior.

> **Why Accuracy Was Removed from Privacy Evaluation**

## Executive Summary

**Problem**: Accuracy is misleading for privacy evaluation with imbalanced datasets.

**Solution**: Use **AUC (Area Under ROC Curve)** and **Advantage over Random Baseline** as primary privacy metrics.

**Impact**: Prevents false sense of security and correctly identifies privacy leakage even when accuracy appears low.

---

## Table of Contents

1. [The Problem with Accuracy](#the-problem-with-accuracy)
2. [Primary Privacy Metrics](#primary-privacy-metrics)
3. [Real-World Example](#real-world-example)
4. [Interpretation Guide](#interpretation-guide)
5. [Implementation Details](#implementation-details)
6. [References](#references)

---

## The Problem with Accuracy

### Case Study: DUO Term 1 Privacy Breach

#### Misleading Accuracy Result

```text
Accuracy: 47.78%  ← Looks bad (below random baseline of 50%)
AUC: 0.5691       ← Actually concerning (exceeds 0.55 threshold)
Precision: 0%     ← Classifier never predicts positive class
Recall: 0%        ← Classifier never predicts positive class
```

#### What Actually Happened

1. **Imbalanced Test Set**: 52.2% negative samples, 47.8% positive samples
2. **Lazy Learning**: Classifier learned to "always predict negative class"
3. **Deceptive Accuracy**: 52.2% accuracy by simply predicting the majority class
4. **Hidden Threat**: AUC reveals the classifier's probability scores can still rank positive samples higher

#### Why This Matters for Privacy

**Privacy attacks don't require high accuracy.** Adversaries win by:

- **Ranking samples** by likelihood (measured by AUC, not accuracy)
- **Probabilistic ordering** to prioritize targets (even with wrong predictions)
- **Being slightly better than random** (measured by Advantage)

**Key Insight**: An AUC > 0.55 means privacy leakage, even if accuracy < 50%.

## Primary Privacy Metrics

### Metric 1: AUC (Area Under ROC Curve) ⭐⭐⭐⭐⭐

#### Definition

**AUC** measures the probability that a classifier ranks a random positive sample higher than a random negative sample.

#### Privacy Interpretation Scale

| AUC Value | Privacy Level | Meaning |
|-----------|---------------|---------|
| **0.50** | ✅ Perfect Privacy | Random guessing - adversary has no advantage |
| **0.50-0.55** | ✅ Good Privacy | Minimal leakage within acceptable threshold |
| **0.55-0.60** | ⚠️ Borderline | Slight information leakage - review needed |
| **0.60-0.70** | ❌ Privacy Leak | Moderate leakage - adversary has advantage |
| **0.70+** | ❌ Severe Breach | Significant leakage - system compromised |
| **1.00** | ❌ Total Failure | Perfect classification - complete privacy loss |

#### Why AUC > Accuracy for Privacy

| Property | AUC | Accuracy |
|----------|-----|----------|
| **Threshold Independent** | ✅ Uses probability scores | ❌ Depends on 0.5 cutoff |
| **Imbalance Robust** | ✅ Unaffected by class distribution | ❌ Misleading with imbalance |
| **Adversary Model** | ✅ Reflects ranking attack | ❌ Assumes binary decisions |
| **Privacy Relevant** | ✅ Measures discriminative power | ❌ Can hide true capability |

#### Privacy Threshold

**Goal**: **AUC ≤ 0.55** (≤10% better than random)

---

### Metric 2: Advantage over Random Baseline ⭐⭐⭐⭐

#### Definition

**Advantage** measures how much better the classifier performs compared to random guessing.

**Formula**:
```
Advantage = Accuracy - RandomBaseline
RandomBaseline = 1 / NumClasses  (0.5 for binary classification)
```

#### Privacy Interpretation

| Advantage | Privacy Status | Interpretation |
|-----------|----------------|----------------|
| **≤ 0%** | ✅ Safe | Performs same as or worse than random |
| **0-5%** | ✅ Acceptable | Minimal improvement within threshold |
| **5-10%** | ⚠️ Concerning | Noticeable improvement - investigate |
| **10-20%** | ❌ Breach | Significant privacy leakage |
| **20%+** | ❌ Critical | Severe privacy breach |

#### Limitations

⚠️ **Class Imbalance Impact**: Advantage still uses accuracy, so can be affected by imbalanced datasets (but less misleading than raw accuracy).

💡 **Use Together**: Always evaluate Advantage **alongside AUC** for complete picture.

#### Privacy Threshold

**Goal**: **Advantage ≤ 5%**

---

### Secondary Metrics (Diagnostic Only)

#### Precision, Recall, F1 Score

**Purpose**: Understanding classifier behavior and debugging

**Use Cases**:
- **Precision/Recall = 0%**: Indicates classifier always predicts one class (class imbalance issue)
- **High Recall, Low Precision**: Classifier predicts positive frequently (liberal strategy)
- **High Precision, Low Recall**: Classifier predicts positive rarely (conservative strategy)

**Specific Attack Scenarios**:
- Adversary prioritizes finding positives → High **Recall** matters
- Adversary prioritizes accuracy of positives → High **Precision** matters

⚠️ **Not Used for Privacy Thresholds**: These metrics depend on classification threshold (typically 0.5) and class distribution.

## Real-World Example

### Scenario: The Accuracy Paradox

**Setup**: Imbalanced dataset with 30% positive, 70% negative samples

| Strategy | Accuracy | AUC | Privacy Safe? | Explanation |
|----------|----------|-----|---------------|-------------|
| **Naive Baseline** | 70% | 0.50 | ✅ Yes | Always predicts negative (majority class) |
| **ML Attack Model** | 70% | 0.75 | ❌ No | Uses features to rank samples by probability |

#### The Paradox

**Both strategies achieve 70% accuracy**, but:

- **Naive Baseline**: No privacy leakage (AUC = 0.5 = random)
- **ML Attack**: Severe privacy breach (AUC = 0.75 = 50% better than random)

**Conclusion**: Accuracy alone cannot distinguish between a harmless baseline and a successful privacy attack!

---

## Interpretation Guide

### ✅ Good Privacy Protection

```text
Task: DUO Term 2 Presence
  Test Set: 78/180 positive (43.3%)
  ✓ AUC: 0.4893 (threshold: ≤0.55)
  ✓ Advantage: 0.00%
     → Adversary performs 0.00% better than random guessing
  Precision: 44.44%, Recall: 61.54%, F1: 51.61%
```

**Interpretation**:
- ✅ AUC below threshold → No ranking advantage
- ✅ Zero advantage → No better than random
- **Verdict**: Privacy is preserved ✅

---

### ⚠️ Borderline Case

```text
Task: DUO Term 1 Presence
  Test Set: 91/180 positive (50.6%)
  ✗ AUC: 0.5270 (threshold: ≤0.55)
  ✓ Advantage: 0.00%
     → Adversary performs 0.00% better than random guessing
  Precision: 51.72%, Recall: 16.48%, F1: 25.00%
```

**Interpretation**:
- ⚠️ AUC slightly below threshold → Minimal ranking advantage
- ✅ Zero advantage → No better than random on predictions
- 💡 Note: Low recall (16.48%) indicates conservative classifier
- **Verdict**: Acceptable but monitor closely ⚠️

---

### ❌ Privacy Breach

```text
Task: DUO Term 0 Presence
  Test Set: 93/180 positive (51.7%)
  ✗ AUC: 0.5720 (threshold: ≤0.55)
  ✗ Advantage: 5.56%
     → Adversary performs 5.56% better than random guessing
  Precision: 61.02%, Recall: 38.71%, F1: 47.37%
```

**Interpretation**:
- ❌ AUC exceeds threshold by 0.022 → 14% better than random at ranking
- ❌ Advantage exceeds threshold by 0.56% → Statistically significant improvement
- **Verdict**: Privacy leakage detected ❌
- **Action Required**: Investigate features causing leakage, enable additional protections

---

## System Features

### Automatic Class Imbalance Detection

The system automatically detects and warns about severe class imbalance during training:

```text
Training classifier for DUO term 2...
  Train: 58/420 positive (13.8%)
  Test: 78/180 positive (43.3%)
  ⚠️  Class imbalance detected - Accuracy metric may be misleading!
```

**Trigger Conditions**:
- Positive samples < 30% of test set, OR
- Positive samples > 70% of test set

**Why This Matters**: Alerts users that accuracy-based metrics may be unreliable for this task.

### Visual Indicators

| Symbol | Meaning |
|--------|---------|
| ✅ | Metric passes privacy threshold |
| ✗ | Metric fails privacy threshold |
| ⚠️ | Warning or borderline case |
| → | Interpretation/explanation follows |

## Implementation Details

### Files Modified

#### 1. `run_experiment.js`

**Training Phase (lines 477-509)**:
```javascript
// Added class imbalance detection
const trainRatio = trainPositives / trainY.length;
const testRatio = testPositives / testY.length;

if (testRatio < 0.3 || testRatio > 0.7) {
  console.log(`⚠️ Class imbalance detected - Accuracy metric may be misleading!`);
}

// Pass class distribution to results
classDistribution: {
  testPositive: testPositives,
  testTotal: testY.length,
  testRatio: testRatio
}
```

**Console Output (lines 551-575)**:
```javascript
// Show class distribution
console.log(`Test Set: ${dist.testPositive}/${dist.testTotal} positive`);

// Primary metrics with status indicators
const aucStatus = result.auc <= aucThreshold ? '✓' : '✗';
console.log(`${aucStatus} AUC: ${result.auc.toFixed(4)} (threshold: ≤${aucThreshold})`);

// Interpretation text
console.log(`→ Adversary performs ${(result.advantage * 100).toFixed(2)}% better than random guessing`);
```

**Markdown Report (lines 649-679)**:
- Removed accuracy from primary metrics
- Added privacy metric explanation
- Listed AUC first with PASS/FAIL status
- Added interpretation for each result

#### 2. `evaluator.js`

**Binary Classification (lines 108-133)**:
```javascript
function evaluateBinaryClassification(yTrue, yPred, yProba, taskName, classDistribution = null) {
  // ... existing calculations ...

  const result = { /* ... */ };

  // Include class distribution if provided
  if (classDistribution) {
    result.classDistribution = classDistribution;
  }

  return result;
}
```

**Task Evaluation (lines 163-192)**:
```javascript
// Pass class distribution from input to evaluation
evaluateBinaryClassification(
  result.yTrue,
  result.yPred,
  result.yProba,
  result.taskName,
  result.classDistribution  // <-- Pass through
);
```

### Backward Compatibility

✅ **No Breaking Changes**:
- Accuracy is **still calculated and saved** in JSON reports
- Old evaluation reports remain compatible
- All existing metrics are preserved in data
- **Only display and emphasis changed**, not data collection

### Quick Reference

| Metric | Privacy Score | Threshold | Used For | Removed From Display |
|--------|---------------|-----------|----------|---------------------|
| **AUC** | ⭐⭐⭐⭐⭐ | ≤ 0.55 | Primary privacy evaluation | ❌ No (emphasized) |
| **Advantage** | ⭐⭐⭐⭐ | ≤ 5% | Secondary privacy check | ❌ No (emphasized) |
| **Accuracy** | ⭐ | N/A | Saved in JSON only | ✅ Yes (misleading) |
| **P/R/F1** | ⭐⭐ | N/A | Diagnostic understanding | ❌ No (kept for debug) |

---

## References

### Academic Literature

1. **Fawcett, T.** (2006). "An introduction to ROC analysis." *Pattern Recognition Letters*, 27(8), 861-874.
   - **Key Point**: Explains why AUC is superior to accuracy for imbalanced datasets
   - **Relevance**: Foundation for using AUC in privacy evaluation

2. **Saito, T., & Rehmsmeier, M.** (2015). "The Precision-Recall Plot Is More Informative than the ROC Plot When Evaluating Binary Classifiers on Imbalanced Datasets." *PLOS ONE*, 10(3).
   - **Key Point**: Discusses limitations of ROC/AUC with extreme imbalance
   - **Relevance**: Understanding when to supplement with precision-recall analysis

3. **Dwork, C., McSherry, F., Nissim, K., & Smith, A.** (2006). "Calibrating Noise to Sensitivity in Private Data Analysis." *TCC 2006*.
   - **Key Point**: Foundation of differential privacy
   - **Relevance**: Theoretical framework for privacy guarantees

4. **Shokri, R., Stronati, M., Song, C., & Shmatikov, V.** (2017). "Membership Inference Attacks Against Machine Learning Models." *IEEE S&P*.
   - **Key Point**: Demonstrates privacy attacks using probability scores
   - **Relevance**: Why AUC (ranking ability) matters more than accuracy for privacy

### Related Documentation

- [Gas Padding Summary](../../docs/GAS_PADDING_SUMMARY.md) - How gas padding reduces observable differences
- [Output Examples](./example_output.md) - Before/after comparison of evaluation output
- [Evaluator Implementation](./evaluator.js) - Source code for metric calculation

---

## Frequently Asked Questions

### Q: Why is accuracy still calculated if it's not used?

**A**: Backward compatibility and data completeness. Researchers may want to analyze accuracy alongside other metrics in post-processing. It's just not displayed as a primary metric to avoid confusion.

### Q: Can AUC be misleading too?

**A**: Yes, but only in extreme cases:
- **Extreme imbalance** (e.g., 1% positive): Precision-Recall AUC may be more informative
- **Multi-class**: AUC becomes more complex (one-vs-rest or pairwise)
- **Perfect separation**: AUC = 1.0 but not meaningful if data is synthetic

For our use case (binary classification with 30-70% class distribution), AUC is highly reliable.

### Q: What if AUC passes but Advantage fails?

**A**: This indicates:
- The classifier has good **ranking ability** (low AUC)
- But poor **prediction accuracy** beyond threshold (high advantage)

This can happen with calibration issues. **Verdict**: Still a privacy concern - investigate the discrepancy.

### Q: What if Advantage passes but AUC fails?

**A**: This is **more concerning**:
- The classifier has poor predictions (low advantage)
- But good ranking ability (high AUC)

This is exactly the scenario where accuracy misleads! The adversary can use probability scores to prioritize targets. **Verdict**: Privacy breach.

### Q: Should I always prioritize AUC over Advantage?

**A**: **Yes, for privacy evaluation**. AUC directly measures the adversary's ability to rank targets by likelihood, which is the most realistic attack model for privacy breaches.
