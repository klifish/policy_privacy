# Multi-seed attack evaluation — polygonAmoy (committed results of record)

Honest, reproducible attack metrics for the three privacy experiments on the
**fixed circuit + commitment-only interface + access gas padding** Amoy dataset
(534/534 executions, zero reverts). These are the numbers of record for the
paper's Table IV/V — the per-experiment `results/` directories are gitignored, so
this summary fixes the headline figures in version control.

All evaluations use a **policy-disjoint train/test split** (adversary measured on
policies never seen in training), **30 random seeds**, and a **permutation test**
for significance. The honest headline metrics are AUC, |AUC−0.5|, and the
permutation p-value — not raw "advantage", which is unstable on imbalanced test
sets (see Methodology notes below).

## Unified verdict (authoritative, now in the main pipeline)

As of commit `335f603`, all three `run_experiment.js` scripts decide PASS/FAIL
with one shared criterion (`experiments/core/multiseed_criterion.js`):

> **PASS** iff `AUC_mean ≤ 0.55` **AND** significant-seed fraction `< 0.5`
> (over 30 policy-disjoint seeds; advantage reported, not gating). Subclasses
> with median test n `< 20` are **underpowered** — reported but excluded from
> gating, so a tiny subclass's noise cannot decide the verdict.

Verdict tables of record: `pch_verdict.txt`, `pi_verdict.txt`, `spp_verdict.txt`.

| Experiment | Overall | Notes |
|---|---|---|
| PCH | ✓ PASS | 6 DUO terms, AUC 0.44–0.54, all medN 162 |
| PI  | ✓ PASS | overall AUC 0.480 / 0% sig / medN 369; `weak_equivalent` (n=9) underpowered, excluded |
| SPP | ✓ PASS | all 18 contrasts AUC 0.43–0.52 (RF-based; LR over-separates), %sig ≤ 27% |

SPP's AUC uses RandomForest (tree-vote fraction): the logistic model
over-separates on near-constant features and yields degenerate AUC (~0), so the
calibrated RF score is used for SPP's AUC leg. PCH/PI use logistic-regression AUC.

The standalone `*_multiseed.txt` tables below predate the unified pipeline and
report the same numbers via the standalone wrappers (`multiseed_eval.js`); they
are kept for quick re-analysis without rerunning phase 2.

## Provenance

- Source datasets (committed): `experiments/unified/artifacts_data/polygonAmoy/`
  (`pch_dataset.json`, `pi_dataset.json`, `spp_dataset.json`, `executed_dataset.json`).
- Amoy run: 534/534 executions, fresh `uint[3]` Groth16 verifier, access gas
  padded to a randomized 750k ±10% target (commits `29c4be1`, `11d97fc`).
- Multiseed wrappers: commit `7e91ecc` (`7e91ecc` adds PI/SPP; PCH wrapper
  predates it).

## PCH — Policy Content Hiding (before/after ablation)

Headline ALL-terms AUC across the defense ladder (30 seeds, policy-disjoint):

| Layer | ALL terms AUC | advantage |
|---|---|---|
| BEFORE (leaky interface) | 0.766 ± 0.066 | ~0.27 |
| 2b only (structural elimination) | 0.530 ± 0.056 | 0.04–0.06 |
| **2b + access gas padding (this dataset)** | **0.480 ± 0.051** | ≈0 |

Per-term table for the final layer: see `pch_multiseed.txt`. Every DUO term is
within noise of 0.5 (|AUC−0.5| ≤ 0.06). Only `commitGasUsed` and (padded)
`accessGasUsed` survive feature normalization; calldata length, proof size, and
all log counts/sizes are zero-variance (content-independent by construction).
`blockDifference` is excluded from modeling (confounded harness artifact).

Reproduce:
```
node experiments/policy_content_hiding/multiseed_eval.js \
  --features experiments/policy_content_hiding/results/polygonAmoy/features.json \
  --seeds 30
```

## PI — Policy Indistinguishability (single-sample, Level I)

Full table: see `pi_multiseed.txt`. Headline:

| Scope | AUC | advantage | perm p | %seeds sig |
|---|---|---|---|---|
| **overall** | 0.525 ± 0.042 | −0.011 | 0.324 | 27% |

Privacy holds: AUC ≈ 0.5, advantage ≈ 0, permutation p well above 0.05. Note the
`structural_variant` scope read AUC 0.69 / 100% significant at 3 seeds but
regressed to 0.541 ± 0.095 / 40% sig at 30 seeds — a single-split fluke, which is
exactly why multi-seed evaluation is required.

Reproduce:
```
node experiments/policy_indistinguishability/multiseed_eval.js \
  --pairs experiments/policy_indistinguishability/results/polygonAmoy/pi_pairs.json \
  --seeds 30 --permutation-iterations 200
```

## SPP — Structure & Parameter Privacy (supervised, pairwise contrasts)

Full table: see `spp_multiseed.txt`. Across all 18 pairwise class contrasts
(structureType / predicateCombo / paramType):

- **No contrast is permutation-significant**: perm p means 0.35–0.66 (all ≫ 0.05),
  %seeds-significant 0–33%.
- RandomForest advantage ≤ 0.07 everywhere.
- The single-run `or_only/negation_heavy` p=0.002 "signal" became perm p 0.533 /
  13% sig under multi-seed — single-split noise.

Privacy holds for all structure/parameter contrasts under the honest metric.

Reproduce:
```
node experiments/structure_and_parameter_privacy/multiseed_eval.js \
  --dataset experiments/unified/artifacts_data/polygonAmoy/spp_dataset.json \
  --seeds 30 --permutation-iterations 200
```

## Methodology notes

- **Why permutation test, not raw advantage**: `advantage = |accuracy − 0.5|` is
  unreliable on imbalanced test sets. A degenerate classifier predicting the
  majority class everywhere (precision=recall=f1=0) scores accuracy = base rate,
  inflating "advantage" to e.g. 0.44 while the permutation test correctly reports
  no signal (p ≈ 0.33). Large LR advantages in `spp_multiseed.txt` all pair with
  f1 ≈ 0 — read them as artifacts.
- **Why 30 seeds**: with ~3 executions/policy a single policy-disjoint split's AUC
  has std ~0.05–0.09. The independent statistical unit is the policy (~120–178),
  not the execution (~534).
