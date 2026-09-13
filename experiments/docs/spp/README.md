# Structure & Parameter Privacy (SPP)

The SPP experiment verifies that our postfix interpreter + padding defenses hide **policy shape and parameter sizes** even when an attacker observes every on-chain metadata field (gas, calldata, proof size, logs, block timing, etc.). The experiment now reuses the same data-generation and execution stack as the **Policy Content Hiding (PCH)** and **Policy Indistinguishability (PI)** studies:

- Policies are compiled with `compiler/policy_generator.js`
- Contexts/whitelists come from `experiments/core/data_generator.js`
- Proofs are executed against the real `PolicyPrivacy` contract
- The resulting metadata is analysed with the SPP attack suite

## What SPP Tries to Distinguish

Each policy run is automatically labelled along three axes before execution:

| Axis | Buckets |
|------|---------|
| **Structure type** (`structureType`) | `trivial`, `and_only`, `or_only`, `and_or_mixed`, `negation_heavy` |
| **Predicate combo** (`predicateCombo`) | see `classifyPredicateCount` in `data_generator.js` |
| **Parameter type** (`paramType`) | see `classifySetSize` in `data_generator.js` (set-size dimension only) |

Two additional axes — **nesting depth** (`nestingDepth`) and **range width** (`rangeWidth`) — are
computed and tracked at generation time (see `classifyNestingDepth` / `classifyRangeWidth`) for
dataset-balance diagnostics, but are **not** currently fed to the attack suite: only
`structureType`, `predicateCombo`, and `paramType` are passed to `runSupervisedAttacks` /
statistical / clustering attacks in `run_experiment.js` (`targetAttributes = ['structureType',
'predicateCombo', 'paramType']`). So SPP currently attacks 3 axes, not 5.

The attack suite tries to recover those (3) labels using on-chain side channels only. Success would indicate information leakage.

`negation_heavy` remains in the analyzer so historical captures stay readable.
The production DUO V3 compiler rejects `NOT`, therefore new capture generation
uses only the other four structure buckets and excludes `negation_heavy` from
generation-time balance gates.

## Threat Model

- **Adversary:** Global observer of all PolicyPrivacy transactions
- **Visibility:** Gas usage, calldata length, proof sizes, logs, block deltas (no plaintext policies or inputs)
- **Goal:** Distinguish between different structure/predicate/parameter buckets better than random guessing

## Attack Pipeline

1. **Supervised classification** – logistic regression + random forest + permutation tests
2. **Statistical tests** – pairwise KS tests per feature + RBF MMD over full vectors
3. **Unsupervised clustering** – k-means, silhouette scores, ARI when k matches true class count

**The authoritative PASS/FAIL verdict** comes from the shared multi-seed criterion in
`experiments/core/multiseed_criterion.js` (identical engine to PCH/PI):

```
FAIL  iff  AUC_mean > 0.55 (over 30 policy-disjoint seeds)  AND  significant-seed fraction >= 0.5
PASS  otherwise
```

SPP gates on **both** a logistic-regression and a random-forest classifier independently (a
task fails if either classifier's double criterion fires). Because logistic regression tends
to over-separate on SPP's near-constant features and yields a degenerate AUC, the operative
signal in practice comes from the calibrated random-forest score. Raw "advantage"
(`|accuracy − 0.5|`) is retained only as a legacy diagnostic field and does not gate.
Tasks whose median test-set size is below 20 are reported but excluded from gating.

The table below lists the **single-split diagnostic thresholds** still computed and reported
per run (statistical/clustering legs, and the pre-multiseed supervised summary) — these are
informative but do **not** decide the overall verdict:

| Metric | Diagnostic threshold |
|--------|-----------|
| AUC (single split) | ≤ 0.55 |
| Permutation p-value (single split) | ≥ 0.05 |
| MMD | ≤ 0.05 |
| KS p-value | ≥ 0.05 |
| Silhouette | ≤ 0.30 |

## Running the Experiment

The runner expects a Hardhat environment (same as PCH). Always execute through `npx hardhat run ...` or an equivalent Hardhat task.

```bash
node experiments/analysis/crosscheck/spp/run_experiment.js --network <target> \
  --output ./experiments/.work/spp/default \
  --policy-count 60 \
  --executions-per-policy 3 \
  --satisfy-ratio 0.5 \
  --test-ratio 0.3
```

### CLI Options

```
--output <dir>                Output directory (default ./results)
--policy-count <n>            Number of base policies (default 120)
--executions-per-policy <n>   Executions per policy (default 3)
--satisfy-ratio <float>       Satisfying execution ratio (default 0.5)
--test-ratio <float>          Train/test split (default 0.3)
--permutation-iterations <n>  Permutation test iterations (default 500)
--phase <1|2|3>               Resume pipeline at given phase
--dataset <path>              Reuse an existing dataset JSON (phase ≥2)
--execution-results <path>    Reuse cached execution results (phase ≥2)
--seed <value>                Deterministic policy generation seed
```

### Phases

1. **Dataset generation & execution**
   - Calls `policy_content_hiding` generator to build real DUO policies
   - Annotates each execution with structure/parameter buckets
   - Deploys `PolicyPrivacy` + `PolicyPrivacyMainVerifier`
   - Executes every policy and stores raw metadata in `execution_results.json`

2. **Attack modelling**
   - Runs supervised, statistical, and clustering attacks for all three target axes

3. **Evaluation & reporting**
   - Compares every metric to the privacy thresholds
   - Emits `report.json` + `report.md`

Use `--phase 2 --dataset <path> --execution-results <path>` to skip on-chain replay after the initial run.

## Outputs

```
results/<name>/
├── dataset.json             # Annotated executions with structure labels
├── execution_results.json   # On-chain metadata (gas, calldata, logs, etc.)
├── report.json              # Machine-readable attack results
└── report.md                # Human summary
```

`dataset.json` now contains a flat list of execution plans (one per commit/access pair) along with:

```json
{
  "policyId": "layer-0_exec_0",
  "structureType": "complex",
  "predicateCombo": "multi_predicate",
  "paramType": "large_set",
  "structureStats": {
    "hasOr": true,
    "hasNot": false,
    "maxDepth": 3,
    "predicateNamespaces": ["ICD10","OBI"]
  },
  "...": "..."
}
```

## Implementation Notes

- **Shared infrastructure:** Reuses the generator and execution helpers from `experiments/core/`
- **Annotation logic:** `experiments/analysis/crosscheck/spp/data_generator.js`
  - Parses normalized logic from the compiler to detect OR depth, predicate diversity, etc.
  - Buckets Merkle depths to approximate “range width” padding
- **Execution:** `run_experiment.js` deploys new contracts per run (same as PCH/PI)
- **Attacks:** `attacks.js` implements the supervised (LR+RF), statistical (KS/MMD), and clustering (k-means/silhouette) attacks over real on-chain metadata; shuffling and RNG use the shared unbiased Fisher-Yates/seeded generators in `experiments/core/random.js`
- **Tests:** `test/experiments/structure_parameter_privacy_test.js` covers annotation helpers + attack utilities

## Typical Workflow

```bash
# Phase 1: generate + execute (needs funded signer)
node experiments/analysis/crosscheck/spp/run_experiment.js --network <net> \
  --output ./results/spp_baseline --policy-count 60 --executions-per-policy 3

# Phase 2/3 only (reuse metadata, tweak analysis knobs)
node experiments/analysis/crosscheck/spp/run_experiment.js --network <net> \
  --phase 2 \
  --dataset ./results/spp_baseline/dataset.json \
  --execution-results ./results/spp_baseline/execution_results.json \
  --output ./results/spp_baseline \
  --permutation-iterations 1000
```

## Interpreting the Report

- **Supervised verdict (authoritative)** – 30-seed policy-disjoint double criterion above:
  AUC not meaningfully above chance, or not statistically reproducible across seeds
- **Statistical PASS (diagnostic)** – MMD/KS never exceed thresholds, meaning feature distributions overlap
- **Clustering PASS (diagnostic)** – silhouette ≤ 0.30 and ARI low ⇒ unsupervised grouping fails

Any failure pinpoints the leaking attribute (structure/predicate/parameter) and the specific comparison (e.g., `with_sets vs complex`). Use that to inspect gas padding, proof sizes, or log differences for those families.

## Relationship to Other Experiments

- **Policy Content Hiding (PCH):** Supplies the base dataset, ontology whitelists, padding controls, and execute infrastructure.
- **Policy Indistinguishability (PI):** Shares the progress tracker, execution balance preflight, and reporting style.
- **SPP:** Provides the structure-aware labelling + multi-axis attack harness to prove that the interpreter/padding stack hides policy topology and parameter magnitudes.
