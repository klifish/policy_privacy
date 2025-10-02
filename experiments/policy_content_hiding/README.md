# Policy Content Hiding Evaluation Experiment

This experiment evaluates whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.

## Background

Policy Content Hiding is the baseline property of Policy Privacy:

- Policies are committed via Pedersen commitments and verified with ZK proofs
- On-chain, only transaction metadata (gas, calldata length, proof size, events, timing) is observable
- We verify empirically that no information about hidden policy content leaks through these channels

## Experiment Structure

### 1. Data Generation (`data_generator.js`)
- Generate policies combining DUO terms + ICD-10 chapters
- Execute each policy multiple times (satisfy + non-satisfy cases)
- Collect observable features from blockchain transactions

### 2. Feature Extraction (`feature_extractor.js`)
- Extract observable features:
  - Calldata length, logs size, events count
  - Gas used, verification gas, proof size
  - Timing / latency metrics
- Normalize features for machine learning

### 3. Attack Modeling (`classifiers.js`)
- Implement classifiers (Logistic Regression, Decision Tree, Random Forest)
- Train on prediction tasks:
  - DUO term presence (binary classification)
  - ICD-10 chapter (multi-class classification)

### 4. Evaluation (`evaluator.js`)
- Calculate metrics: Accuracy, AUC, Advantage (Acc − Acc_random)
- Privacy thresholds: AUC ≈ 0.5, Advantage ≤ 0.05

### 5. Reporting
- Generate detailed evaluation reports (JSON and Markdown)
- Compare against random baseline

## Usage

### Running the Full Experiment

```bash
# Ensure dependencies are installed
npm install

# Build circuits (required for proof generation)
npm run build:circuit

# Run the experiment
npx hardhat run experiments/policy_content_hiding/run_experiment.js
```

### Running Tests

```bash
# Run the experiment test
npx mocha test/experiments/policy_content_hiding_test.js --timeout 300000
```

### Custom Configuration

```javascript
const { runExperiment } = require('./run_experiment');

runExperiment({
  numDuoTerms: 5,              // Number of DUO terms to test
  numIcd10Chapters: 10,         // Number of ICD-10 chapters to test
  executionsPerPolicy: 10,      // Executions per policy combination
  testRatio: 0.3,              // Train/test split ratio
  aucThreshold: 0.55,          // AUC privacy threshold
  advantageThreshold: 0.05     // Advantage privacy threshold
});
```

## Output

The experiment generates the following outputs in `experiments/policy_content_hiding/results/`:

- `execution_results.json` - Raw execution data with observable features
- `features.json` - Extracted and normalized features
- `evaluation_report.json` - Detailed evaluation metrics
- `evaluation_report.md` - Human-readable report

## Privacy Thresholds

### Success Criteria

The system achieves Policy Content Hiding if:

1. **AUC ≈ 0.5** (close to random for binary classification)
2. **Advantage ≤ 0.05** (accuracy improvement over random baseline ≤ 5%)

### Interpretation

- **PASS**: Adversaries cannot infer policy content better than random guessing
- **FAIL**: Observable features leak information about policy content

## Experiment Phases

### Phase 1: Data Generation and Execution
Generate policy dataset and execute on blockchain to collect observable features.

### Phase 2: Feature Extraction
Extract and normalize observable features from transaction data.

### Phase 3: Attack Modeling
Train classifiers to attempt inferring policy content from features.

### Phase 4: Evaluation
Calculate metrics and compare against privacy thresholds.

### Phase 5: Reporting
Generate comprehensive evaluation reports.

## Implementation Notes

- Uses lightweight ML implementations (no heavy dependencies)
- Reuses existing proof generation infrastructure
- Executes real ZK proofs and smart contract transactions
- Minimal changes to existing codebase

## Future Extensions

- Test leaky vs secure configurations
- Add more sophisticated attack models
- Evaluate temporal correlation attacks
- Test with larger datasets
- Add visualization of results
