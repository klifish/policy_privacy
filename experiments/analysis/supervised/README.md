# `analysis/supervised/` — Python supervised privacy attacks

The supervised attack layer for Policy Content Hiding (PCH), Policy
Indistinguishability (PI), and Structure & Parameter Privacy (SPP), implemented
with scikit-learn. It pairs with the label-free clustering analysis in
[`../clustering/`](../clustering/).

**These scripts are the source of record for the active MDPI manuscript's
supervised privacy verdicts.** The corresponding tables under
`paper_mdpi/tables/` cite the verdict JSON files produced here. The JavaScript
pipeline under `experiments/analysis/crosscheck/` implements the same criterion
independently and is retained as a cross-check.

The earlier IEEE manuscript under `paper/` retains its historical JavaScript
provenance. See [`docs/EXPERIMENT_PIPELINE.md`](../../../docs/EXPERIMENT_PIPELINE.md)
before updating either manuscript.

## Outputs

Outputs go to `experiments/results/supervised/`. The verdicts, summaries,
split manifests, comparison reports, and ablation statistics used by the MDPI
manuscript are git-tracked. Bulky generated PI-pair files and interactive
dashboard payloads are gitignored and regenerated on demand.

| File | Produced by |
|---|---|
| `pch_supervised_summary.csv` | `pch_supervised.py` — PCH DUO and ICD-10 one-vs-rest AUC/sigFraction/verdict rows |
| `pch_supervised_verdict.json` | `pch_supervised.py` — PCH overall verdict + criterion + per-task detail |
| `pi_supervised_summary.csv` | `pi_supervised.py` — PI overall and pair-type AUC/sigFraction/verdict rows |
| `pi_supervised_verdict.json` | `pi_supervised.py` — PI overall verdict + criterion + per-scope detail |
| `spp_supervised_summary.csv` | `spp_supervised.py` — per (dataset, target, class0, class1, model) AUC/sigFraction/verdict |
| `spp_supervised_verdict.json` | `spp_supervised.py` — overall verdict + criterion + per-contrast detail |
| `spp_ablation_deltaLeakage.csv` | `run_ablation_supervised.py` — per-contrast b1/b2 leakage delta + bootstrap CI |
| `*_js_comparison.json` | `compare_with_js_verdict.py` — JSON diff against JS `multiseedVerdict` |

The independent JavaScript reports compared by
`compare_with_js_verdict.py` are:

- PCH: `experiments/results/crosscheck/pch/polygonAmoy/evaluation_report.json`
- PI: `experiments/results/crosscheck/pi/polygonAmoy/pi_report.json`
- SPP: `experiments/results/crosscheck/spp/polygonAmoy/report.json`
- Ablation: `experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json`

## Shared methodology

- **Features:** the 9 observable public-chain keys used by the JS attack modules
  (gas, calldata length, proof size, log counts/sizes). `blockDifference` and all
  `proof*Time` are excluded (confounded / off-chain). Zero-variance columns are
  dropped per training fold. In the committed padded Amoy capture, the seven
  transcript-shape features are constant, so the effective feature set is the
  two gas measurements described by the manuscript.
- **Models:** RandomForest (50 trees, `max_depth=10`, `class_weight='balanced'`) and
  standardized LogisticRegression. RF probabilities are the raw uncalibrated vote
  fractions — AUC is rank-based and sigmoid calibration is monotonic, so omitting
  calibration keeps the run cheaper and close to the JS attack framing.
- **Protocol:** deterministic repeated stratified group holdout (test 0.3), 30
  seeds by default. Each seed evaluates 512 whole-policy candidates and selects
  the closest valid label-stratified partition. PCH/SPP/PI all group by
  `policyId`; the PI splitter supports policies that occur on both pair sides.
- **Metric / verdict:** AUC + a 500-shuffle permutation test (no retraining).
  Per (task/contrast, model) `legFails = (aucMean > 0.55) AND (sigFraction >=
  0.5)`; a task FAILs if either model's leg fails, and is non-gating when
  `medianTestN < 20`. Overall PASS iff all gating tasks pass.

## Experiment-specific framing

- **PCH:** DUO term presence tasks (`DUO GR`, `DUO DS`, ...) and ICD-10 chapter
  one-vs-rest tasks (`ICD ch...`) are built from `pch_dataset.json` and aligned
  with the JS PCH `multiseedVerdict` task names.
- **PI:** `pi_supervised.py` reads `pi_pairs.json` when available, or generates a
  gitignored pair file in the output directory from `pi_dataset.json`. It reports
  the JS single-sample verdict scopes: `overall` plus pair types such as
  `semantic_equivalent`, `structural_variant`, `weak_equivalent`, and
  diagnostic `controlled_difference` (reported but non-gating, matching JS).
- **SPP:** `spp_supervised.py` covers all 28 pairwise binary contrasts within
  `structureType`, `predicateCombo`, `paramType`, and `nestingDepth`.
- **Ablation delta:** `deltaLeakage = |AUC_b1 - 0.5| - |AUC_b2 - 0.5|` (per seed,
  bootstrapped), matching `ablation_report.json`'s `effectDefinition`.

## Usage

```bash
cd <repository-root>

# PCH on the unified dataset (30 seeds).
.venv/bin/python -m experiments.analysis.supervised.pch_supervised --seeds 30 --jobs -1

# PI; auto-generates a gitignored pi_pairs_generated.json if needed.
.venv/bin/python -m experiments.analysis.supervised.pi_supervised --seeds 30 --jobs -1

# SPP on the unified dataset (30 seeds).
.venv/bin/python -m experiments.analysis.supervised.spp_supervised --seeds 30 --jobs -1

# Gas-padding ablation (b1_unpadded vs b2_padded).
.venv/bin/python -m experiments.analysis.supervised.run_ablation_supervised --seeds 30 --jobs -1

# Compare an MDPI verdict with the independent JS report.
.venv/bin/python -m experiments.analysis.supervised.compare_with_js_verdict --experiment pch
.venv/bin/python -m experiments.analysis.supervised.compare_with_js_verdict --experiment pi
.venv/bin/python -m experiments.analysis.supervised.compare_with_js_verdict --experiment spp

# Refresh an interactive protocol dashboard (probe + build HTML in one step,
# then open it). One command to remember per experiment.
./refresh_viz.sh                 # PCH, 30 seeds (default)
./refresh_viz.sh spp             # SPP, 30 seeds
./refresh_viz.sh pi              # PI, 30 seeds (prefers of-record pi_pairs.json)
./refresh_viz.sh pch --seeds 10  # any probe flag passes through
# from the repo root, equivalently: npm run viz:pch / viz:spp / viz:pi
```

The dashboards (`experiments/results/supervised/{pch,spp,pi}_protocol_viz.html`,
gitignored) are self-contained debug views of the attack protocol: the
double-criterion decision space, permutation null distributions, per-seed AUC
spread, a training-data health panel, and the raw per-execution rows (including
each policy's human-readable logic expression). Supporting/diagnostic only; they
never touch the of-record outputs.

Architecture: `viz_common.py` holds the task-agnostic framework (per-seed probe,
permutation histogram, training-data inspection, shared row pool, `run_probe`
driver). Each experiment is a thin adapter that supplies a loader and a
`build_tasks` returning tasks tagged with dataset `indices`:
- `viz_probe.py` — PCH; delegates to `pch_supervised.build_tasks`.
- `spp_viz_probe.py` — SPP; within-attribute pairwise contrasts.
- `pi_viz_probe.py` — PI; pairs (not a flat dataset), so it builds its own row
  pool of pair-side executions and passes `row_pool=` to `run_probe`. Label =
  pair side (0/1), grouped by policyId; scopes are `overall` + each pairType;
  `controlled_difference` is a diagnostic positive control (non-gating via the
  task's `diagnostic` flag). Prefers the of-record `pi_pairs.json`, else runs
  `scripts/generate_pi_pairs.js`.

`build_viz_html.py` inlines any `viz_data*.json` into the shared
`pch_protocol_viz.template.html` (data-driven; titles itself from
`DATA.experiment`). `refresh_viz.sh <pch|spp|pi>` chains probe + build; run it
after the dataset or criterion changes.

`--jobs` parallelizes the independent per-seed evaluations across processes
(`-1` = all cores). With `--jobs 1` a single RandomForest fit uses all cores;
with `--jobs > 1` each fit is single-threaded to avoid oversubscription. Results
are deterministic for a fixed input dataset and seed configuration.

Each runner accepts `--split-manifest-in`, `--split-manifest-out`, and
`--split-candidates`. Verdict JSON includes per-class policy-count diagnostics
and `powerWarning`; warnings remain diagnostic and do not change the JS-aligned
PASS/FAIL criterion. PI defaults to the JS pairing seed `pi-experiment` and
records the pair artifact SHA-256.

## Relationship to `run_policy_privacy_experiments.py`

`experiments/legacy/run_policy_privacy_experiments.py` is a broad legacy sanity-check runner
and visualization generator across PCH/PI/SPP. It does not produce the verdicts
cited by the active MDPI manuscript; use the focused scripts in this directory.
