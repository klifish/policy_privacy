# Policy Indistinguishability (PI) Experiment

Policy Indistinguishability is a strengthened privacy evaluation that verifies whether two semantically equivalent (or near-equivalent) access policies remain indistinguishable when only on-chain artefacts (gas, calldata, events, proofs) are observable. It extends the Policy Content Hiding (PCH) experiment by modelling an adversary that tries to decide which policy was executed without seeing the policy text itself.

> **Goal:** For every policy pair `(P0, P1)` the best on-chain adversary should not perform better than random guessing, i.e. `Pr[ b̂ = b ] ≈ 1/2`.

## Experiment Layout

1. **Policy Pair Generation**  
   - Builds a pool of policies via the existing PCH generator.  
   - Groups them into four pair archetypes:
     - `semantic_equivalent`: identical normalized logic, different policy artefacts.
     - `structural_variant`: identical semantics but diverging execution protections (gas / event / proof padding etc.).
     - `weak_equivalent`: high semantic overlap (≥ 0.95 similarity score) with minor scope differences.
     - `controlled_difference`: small, targeted structural deltas used as regression controls.

2. **Execution & Feature Capture**  
   - Deploys a fresh `PolicyPrivacy` contract and replays every policy, logging gas, calldata, proof and event statistics.

3. **Attack Modelling** (progressively stronger adversaries)
   - **Level I – Single-sample classifiers** (Logistic Regression, Random Forest).  
     Trains on individual executions to guess whether a transcript came from `P0` or `P1`.
   - **Level II – Pairwise (Siamese) classifier.**  
     Learns decision boundaries on absolute feature deltas between two executions.
   - **Level III – Two-sample statistics.**  
     Runs KS, MMD, and permutation-based diagnostics to surface distributional drift.

4. **Evaluation & Reporting**  
   - Computes accuracy, AUC, advantage, entropy, permutation `p`-values, KS statistics, and MMD distances.  
   - Applies privacy thresholds (configurable) and renders both JSON + Markdown summaries.

## Quickstart

```bash
cd experiments/policy_indistinguishability
node run_experiment.js --output ./results/pi_run
```

**New Feature: Real-time Progress Tracking**

The experiment now displays real-time progress with estimated completion time:

**Main Progress:**
```
▶ [3/8] [███████████░░░░░░░░░░░░░░░░░░░] 37.5% | Executing dataset on-chain (1000 executions)
   Time elapsed: 5m 23s | ETA: 7m 12s
```

**Fine-grained Policy Execution Progress:**
```
▶ [3/8] [███████████░░░░░░░░░░░░░░░░░░░] 37.5% | Executing dataset on-chain (1000 executions)
   └─ [523/1000] [██████████░░░░░░░░░░] 52.3% | Executing policy 523/1000 | ETA: 3m 45s
```

Features:
- **Main progress bar** showing overall experiment completion
- **Sub-progress tracking** for policy execution with per-policy ETA
- Real-time updates during dataset execution (most time-consuming phase)
- **Accurate ETA calculation** based on average policy execution time
- Visual progress bars at both step and sub-step levels
- Total elapsed time tracking

Phased execution (resume between steps) mirrors the PCH pipeline:

```bash
npm run experiment:policy:pi:phase1          # generate dataset + on-chain executions
npm run experiment:policy:pi:phase2          # rebuild pairs from cached executions
npm run experiment:policy:pi:phase3          # run attacks + regenerate reports
```

Common flags:

| Flag | Description |
| --- | --- |
| `--policy-count <n>` | Base policies to generate (default aligns with PCH defaults). |
| `--executions-per-policy <n>` | Number of executions per policy (default: 8). |
| `--pair-targets <json>` | Override target counts per pair type, e.g. `{"semantic_equivalent":4,"structural_variant":4}`. |
| `--test-ratio <float>` | Train/test split for classifiers (default: 0.3). |
| `--auc-threshold <float>` | Max acceptable AUC before flagging leakage (default: 0.55). |
| `--permutation-min <float>` | Minimum acceptable permutation p-value (default: 0.05). |

Outputs are written to the specified `--output` folder:

- `pi_dataset.json`: cached dataset blueprint (includes `__meta` coverage stats).  
- `pi_execution_results.json`: raw execution traces per policy instance.  
- `pi_pairs.json`: paired policy aggregates used for attacks.  
- `pi_analysis.json`: cached attack outcomes and threshold checks.  
- `pi_report.json`: machine-readable experiment result bundle.  
- `pi_report.md`: human-readable summary (status, metrics, diagnostics).

## Interpreting Results

- **PASS** – All checked classifiers remain at/below the configured AUC & advantage limits and statistical tests show no significant drift (`p > 0.05`, small MMD).
- **FAIL** – At least one classifier exceeds thresholds or statistical tests detect distinguishable distributions. The report highlights the offending level, scope, and top-leaking features (based on logistic weights).

## Important Note on Features

**Only on-chain observable features are included in the attack model:**
- Gas metrics: `commitGasUsed`, `accessGasUsed`
- Calldata: `commitCalldataLength`, `accessCalldataLength`
- Proof: `proofSize` (calldata size)
- Events: `commitLogsCount`, `commitLogsSize`, `accessLogsCount`, `accessLogsSize`
- Timing: `blockDifference`

**Excluded:** `proofGenerationTime` - This is client-side timing information not visible on-chain. Including it would overestimate the adversary's capability.

## Notes & Next Steps

- The experiment reuses the PCH generator ensuring compatibility with existing policy circuits.
- Additional attack models (e.g. boosted trees, neural siamese networks) can be plugged in by extending `attacks.js`.
- For regression tracking, commit generated reports and compare successive runs to ensure newly introduced protections keep all metrics within the privacy envelope.
- **Known leakage sources (as of latest tests):**
  - `accessGasUsed` - Primary leakage, especially for controlled_difference pairs
  - `commitGasUsed` - Secondary leakage despite gas padding
  - Non-linear patterns detectable by RandomForest classifiers
