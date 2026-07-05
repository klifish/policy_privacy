# Policy Content Hiding Evaluation

> ⚠️ **ARCHIVED — superseded.** This document describes the pre-multiseed, single-split
> PASS/FAIL design (a single AUC≤0.55-and-Advantage≤5% threshold check). The current
> authoritative privacy verdict is a 30-seed policy-disjoint double criterion
> (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`), implemented in
> `experiments/core/multiseed_criterion.js`. Some file/API references below (e.g.
> `evaluator.js`, `classifiers.js`, `mock_demo.js`) no longer exist as standalone files.
> Kept for historical context only — do not use as a spec of current behavior.

> **Evaluating Privacy Protection for DUO Terms in Zero-Knowledge Policies**

## 📋 Quick Navigation

- **[Why Accuracy Was Removed](./METRICS_EXPLANATION.md)** - Detailed explanation of privacy metrics
- **[Output Examples](./example_output.md)** - Before/after comparison with real examples
- **[Experiment Runner](./run_experiment.js)** - Main entry point

---

## 🎯 Purpose

Evaluate whether the Policy Privacy system successfully **hides policy content** from adversaries observing blockchain transactions.

**What we protect**:
- DUO terms (Data Use Ontology attributes)
- ICD-10 disease codes
- Policy structure and predicates

**What adversaries can observe**:
- Gas consumption
- Calldata length
- Event logs
- Transaction timing
- Block numbers

---

## 🚀 Quick Start

### Run Complete Experiment
```bash
node run_experiment.js
```

### With Custom Configuration
```bash
node run_experiment.js \
  --num-duo-terms 3 \
  --policy-count 200 \
  --executions-per-policy 3
```

### Resume from Checkpoint
```bash
node run_experiment.js --phase 3 --features results/features.json
```

---

## 📊 Key Metrics (Updated)

### ⭐ Primary: AUC (Area Under ROC Curve)
- **Threshold**: ≤ 0.55
- **Measures**: Adversary's ability to rank samples by likelihood
- **Why it matters**: Reflects real-world attack scenarios

### ⭐ Secondary: Advantage over Random
- **Threshold**: ≤ 5%
- **Measures**: Improvement over random guessing
- **Formula**: `Accuracy - (1 / NumClasses)`

### 🔧 Diagnostic: Precision, Recall, F1
- **Purpose**: Understanding classifier behavior
- **Not used for pass/fail**: Depend on threshold and class distribution

### ❌ Removed: Accuracy
- **Why removed**: Misleading for imbalanced datasets
- **See**: [METRICS_EXPLANATION.md](./METRICS_EXPLANATION.md) for full explanation

---

## 📚 Documentation

| Document | Lines | Purpose |
|----------|-------|---------|
| **[METRICS_EXPLANATION.md](./METRICS_EXPLANATION.md)** | 402 | Why accuracy misleads, AUC interpretation |
| **[example_output.md](./example_output.md)** | 280 | Before/after output comparison |
| **README.md** (this file) | - | Quick reference and guide |

---

## 🔄 Experiment Phases

### Phase 1: Data Generation & Execution ⚙️
1. Generate diverse policies with DUO terms
2. Deploy contracts to blockchain
3. Execute transactions (commit + access)
4. Collect observable features

**Output**: `dataset_*.json`, `execution_results.json`

### Phase 2: Feature Extraction 📊
1. Parse transaction data
2. Calculate feature statistics
3. Normalize for ML training

**Output**: `features.json`

### Phase 3: Attack Modeling 🎯
1. Train binary classifiers (DUO term presence)
2. Train multi-class classifiers (ICD-10 chapter)
3. Generate predictions on test set

**Models**: Logistic Regression, Random Forest

### Phase 4: Evaluation 🔍
Calculate privacy metrics:
- ✅ AUC ≤ 0.55
- ✅ Advantage ≤ 5%
- 📊 Precision/Recall/F1 (diagnostic)

### Phase 5: Reporting 📝
Generate reports:
- Console output with ✓/✗ indicators
- `evaluation_report.json`
- `evaluation_report.md`

---

## 📖 Reading Results

### ✅ Good Privacy Protection
```text
Task: DUO Term 2 Presence
  Test Set: 78/180 positive (43.3%)
  ✓ AUC: 0.4893 (threshold: ≤0.55)
  ✓ Advantage: 0.00%
     → Adversary performs 0.00% better than random guessing
```
**Verdict**: Privacy is preserved

### ⚠️ Borderline
```text
Task: DUO Term 1 Presence
  Test Set: 91/180 positive (50.6%)
  ✗ AUC: 0.5270 (threshold: ≤0.55)
  ✓ Advantage: 0.00%
```
**Verdict**: Slight ranking ability but acceptable

### ❌ Privacy Breach
```text
Task: DUO Term 0 Presence
  Test Set: 93/180 positive (51.7%)
  ✗ AUC: 0.5720 (threshold: ≤0.55)
  ✗ Advantage: 5.56%
```
**Verdict**: Action required - investigate feature leakage

---

## ⚙️ Configuration Options

```bash
# Dataset
--num-duo-terms <n>           # DUO terms to test (default: 3)
--policy-count <n>            # Policies to generate (default: 200)
--executions-per-policy <n>   # Executions per policy (default: 3)

# Evaluation
--test-ratio <float>          # Train/test split (default: 0.3)
--auc-threshold <float>       # AUC threshold (default: 0.55)
--advantage-threshold <float> # Advantage threshold (default: 0.05)

# Resume
--phase <n>                   # Start from phase 1-3
--features <path>             # Use existing features
--execution-results <path>    # Use existing execution data
--dataset <path>              # Use existing dataset

# Quality
--evaluate-dataset            # Run dataset quality checks
```

---

## 🔍 Understanding Output

### Output Format
```text
Task: [Task Name]
  Test Set: X/Y positive (Z%)          ← Class distribution
  [✓/✗] AUC: 0.XXXX (threshold: ≤0.55) ← PRIMARY METRIC
  [✓/✗] Advantage: X.XX%                ← SECONDARY METRIC
     → Adversary performs X.XX% better than random guessing
  Precision: X%, Recall: X%, F1: X%    ← Diagnostic info
```

### Decision Rule

| AUC | Advantage | Verdict |
|-----|-----------|---------|
| ✓ ≤ 0.55 | ✓ ≤ 5% | ✅ **PASS** - Privacy protected |
| ✗ > 0.55 | ✓ ≤ 5% | ❌ **FAIL** - Ranking attack possible |
| ✓ ≤ 0.55 | ✗ > 5% | ⚠️ **INVESTIGATE** - Calibration issue |
| ✗ > 0.55 | ✗ > 5% | ❌ **CRITICAL** - Severe privacy breach |

---

## 🛠️ Troubleshooting

### "No signer available"
```bash
export AMOY_PRIVATE_KEY="0x..."
# Or add to .env file
```

### "Insufficient balance"
Get testnet tokens from Polygon Amoy faucet

### "Class imbalance detected"
This is informational - system automatically uses AUC instead of accuracy

### "Wrong compiler version"
```bash
npm install -g circom@2.1.0
circom --version
```

---

## 📁 Output Files

```
results/
├── dataset_<timestamp>.json      # Generated policies
├── execution_results.json        # Transaction data + features
├── features.json                 # Normalized features
├── evaluation_report.json        # Complete metrics
├── evaluation_report.md          # Human-readable report
└── dataset_quality.json          # Dataset statistics
```

---

## 💡 Best Practices

### For Accurate Results
- Use ≥200 policies with ≥3 executions each
- Check dataset quality with `--evaluate-dataset`
- Run multiple times with different seeds
- Investigate features causing leakage

### For Cost Efficiency
- Start with `--policy-count 50` for testing
- Use testnet (Polygon Amoy)
- Resume from checkpoint with `--phase`
- Test config changes with Phase 3 only

---

## 🔗 Related Documentation

- [Gas Padding Summary](../../docs/GAS_PADDING_SUMMARY.md)
- [Gas Padding Improvements](../../docs/GAS_PADDING_IMPROVEMENTS.md)
- [Policy Generator](../../compiler/policy_generator.js)

---

## ❓ FAQ

**Q: Why was accuracy removed?**  
A: Accuracy is misleading for imbalanced datasets. A classifier can achieve high accuracy by always predicting the majority class, while still leaking information through probability scores (measured by AUC). See [METRICS_EXPLANATION.md](./METRICS_EXPLANATION.md).

**Q: What if AUC passes but Advantage fails?**  
A: This suggests a calibration issue. The classifier has good ranking (low AUC) but poor threshold selection (high advantage). Still a privacy concern.

**Q: Should I always trust AUC over Advantage?**  
A: Yes, for privacy evaluation. AUC measures ranking ability, which is the most realistic attack model.

**Q: What does negative Advantage mean?**  
A: The classifier performs worse than random guessing (good for privacy).

---

## 📝 Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Primary Metric** | Accuracy (misleading) | AUC (robust) |
| **Visual Clarity** | Plain numbers | ✓/✗ indicators |
| **Class Context** | Hidden | Shown upfront |
| **False Positives** | Possible | Eliminated |
| **Expert Required** | Yes | No |

**Key Improvement**: Prevents false sense of security from low accuracy hiding high AUC (privacy breach).
