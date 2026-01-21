# Policy Content Hiding Evaluation - Quick Start Guide

## What is this?

This experiment evaluates whether the Policy Privacy system achieves **Policy Content Hiding** - i.e., adversaries observing blockchain transactions cannot infer policy details (DUO terms or ICD-10 codes) better than random guessing.

## 30-Second Quick Start

Want to see it in action immediately? Run the mock demo:

```bash
node experiments/policy_content_hiding/mock_demo.js
```

This runs a complete simulation with mock data (no circuit builds required).

## 5-Minute Quick Start

### 1. Run Unit Tests

```bash
npx mocha test/experiments/policy_content_hiding_test.js --timeout 60000
```

Expected output: `17 passing`

### 2. View the Documentation

```bash
cat experiments/policy_content_hiding/README.md
cat experiments/policy_content_hiding/SUMMARY.md
```

### 3. Explore the Code

```bash
# View the main experiment runner
cat experiments/policy_content_hiding/run_experiment.js

# View the classifiers
cat experiments/policy_content_hiding/classifiers.js

# View the evaluation metrics
cat experiments/policy_content_hiding/evaluator.js
```

## Full Experiment (Requires Circuit Builds)

### Prerequisites

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build circuits** (this takes significant time - 10-30 minutes):
   ```bash
   npm run build:circuit:full
   ```

### Run the Experiment

```bash
npx hardhat run experiments/policy_content_hiding/run_experiment.js
```

### View Results

Results are saved in `experiments/policy_content_hiding/results/`:
- `execution_results.json` - Raw execution data
- `features.json` - Extracted features
- `evaluation_report.json` - Detailed metrics
- `evaluation_report.md` - Human-readable report

## Understanding the Output

### Success (Policy Content Hiding Achieved) ✓

```
Privacy Threshold Check:
  ✓ DUO Term 0 Presence (AUC: 0.51, Advantage: 0.02)
  ✓ DUO Term 1 Presence (AUC: 0.49, Advantage: 0.01)
  ✓ ICD-10 Chapter Prediction (Advantage: 0.03)
  
Overall: ✓ PASS
```

**Interpretation:** Adversaries cannot infer policy content better than random guessing.

### Failure (Potential Information Leakage) ✗

```
Privacy Threshold Check:
  ✗ DUO Term 0 Presence (AUC: 0.75, Advantage: 0.25)
  ✓ DUO Term 1 Presence (AUC: 0.52, Advantage: 0.03)
  
Overall: ✗ FAIL
```

**Interpretation:** Some classifiers exceeded privacy thresholds, suggesting potential information leakage.

## Key Metrics Explained

### Accuracy
Percentage of correct predictions.
- **Random baseline:** 50% (binary), 20% (5-class)
- **Target:** Should be close to random baseline

### AUC (Area Under ROC Curve)
Classifier's ability to distinguish classes (binary tasks only).
- **Random baseline:** 0.5
- **Target:** ≤ 0.55 (close to random)

### Advantage
Improvement over random baseline.
- **Formula:** Accuracy - Random_Baseline
- **Target:** ≤ 0.05 (≤5% improvement)

## Customizing the Experiment

Create a custom configuration:

```javascript
const { runExperiment } = require('./experiments/policy_content_hiding/run_experiment');

runExperiment({
  numDuoTerms: 5,              // Use more DUO terms
  numIcd10Chapters: 10,         // Use more ICD-10 chapters
  executionsPerPolicy: 20,      // More executions per policy
  testRatio: 0.3,              // 30% test, 70% train
  aucThreshold: 0.55,          // Privacy threshold for AUC
  advantageThreshold: 0.05,    // Privacy threshold for advantage
  outputDir: './my_results'    // Custom output directory
}).then(report => {
  console.log('Experiment complete!');
  console.log('Overall passed:', report.privacyCheck.overallPassed);
});
```

## Troubleshooting

### "Cannot find module" errors
```bash
npm install
```

### "Circuit WASM file not found"
```bash
npm run build:circuit:full
```

### Tests timing out
Increase timeout:
```bash
npx mocha test/experiments/policy_content_hiding_test.js --timeout 300000
```

### Want to test without circuit builds?
Use the mock demo:
```bash
node experiments/policy_content_hiding/mock_demo.js
```

## File Structure

```
experiments/policy_content_hiding/
├── README.md              # Full documentation
├── SUMMARY.md             # Implementation summary
├── QUICKSTART.md          # This file
├── data_generator.js      # Generate & execute policies
├── feature_extractor.js   # Extract observable features
├── classifiers.js         # ML classifiers (LR, DT, RF)
├── evaluator.js           # Calculate metrics
├── run_experiment.js      # Main experiment runner
└── mock_demo.js           # Mock demo (no circuits)
```

## Next Steps

1. **Run the mock demo** to see how it works
2. **Run the unit tests** to verify everything is working
3. **Read the documentation** (README.md, SUMMARY.md)
4. **Build circuits** if you want to run the full experiment
5. **Customize the experiment** for your specific needs

## Getting Help

- Read the full documentation: `experiments/policy_content_hiding/README.md`
- View implementation details: `experiments/policy_content_hiding/SUMMARY.md`
- Check the test suite: `test/experiments/policy_content_hiding_test.js`
- Run the mock demo: `node experiments/policy_content_hiding/mock_demo.js`

## What This Experiment Proves

✅ **Empirical Privacy Validation** - Verifies Policy Content Hiding property  
✅ **Observable Features** - Tests all channels adversaries could monitor  
✅ **Statistical Rigor** - Uses established ML metrics (AUC, Accuracy)  
✅ **Clear Thresholds** - Pass/fail criteria based on random baseline  
✅ **Reproducible** - Can be run multiple times with different configurations

This experiment provides confidence that the Policy Privacy system achieves its core privacy property: adversaries observing blockchain transactions cannot infer hidden policy content.
