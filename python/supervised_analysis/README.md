# `supervised_analysis/` — Python supervised privacy cross-checks

Independent Python (scikit-learn) re-runs of the supervised attack layer for
Policy Content Hiding (PCH), Policy Indistinguishability (PI), and Structure &
Parameter Privacy (SPP). These scripts complement the label-free clustering
cross-check in [`../clustering_analysis/`](../clustering_analysis/): if mature,
well-tuned sklearn classifiers — given labels and training data, i.e. the
strongest attacker — still cannot beat the privacy verdict, that is stronger
supporting evidence than the bespoke JS models alone.

This is **supporting evidence, not a source of record.** The paper tables are
driven by the JavaScript pipeline (see below); nothing here overwrites them.

## Outputs and isolation from the JS results

All outputs go to `python/results/supervised_analysis/` (which is **gitignored**,
`.gitignore` line `python/results/`), so this code never touches — and cannot
overwrite — the JS results tracked under `experiments/**/results/`.

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

The JS sources of record (separate tree, git-tracked) that these are compared
against:

- PCH: `experiments/policy_content_hiding/results/polygonAmoy/evaluation_report.json`
- PI: `experiments/policy_indistinguishability/results/polygonAmoy/pi_report.json`
- SPP: `experiments/structure_and_parameter_privacy/results/polygonAmoy/report.json`
- Ablation: `experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json`

## Shared methodology

- **Features:** the 9 observable public-chain keys used by the JS attack modules
  (gas, calldata length, proof size, log counts/sizes). `blockDifference` and all
  `proof*Time` are excluded (confounded / off-chain). Zero-variance columns are
  dropped per training fold; if none survive the attacker degenerates to AUC =
  0.5.
- **Models:** RandomForest (50 trees, `max_depth=10`, `class_weight='balanced'`) and
  standardized LogisticRegression. RF probabilities are the raw uncalibrated vote
  fractions — AUC is rank-based and sigmoid calibration is monotonic, so omitting
  calibration keeps the run cheaper and close to the JS attack framing.
- **Protocol:** group-disjoint `GroupShuffleSplit` (test 0.3), 30 seeds by
  default. PCH/SPP group by `policyId`; PI Level-I scopes also group by
  `policyId`, matching the JS source-of-record split.
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
- **SPP:** `spp_supervised.py` covers all pairwise binary contrasts within
  `structureType`, `predicateCombo`, and `paramType`.
- **Ablation delta:** `deltaLeakage = |AUC_b1 - 0.5| - |AUC_b2 - 0.5|` (per seed,
  bootstrapped), matching `ablation_report.json`'s `effectDefinition`.

## Usage

```bash
cd python/supervised_analysis

# PCH cross-check on the unified dataset (30 seeds).
../.venv/bin/python pch_supervised.py --seeds 30 --jobs -1

# PI cross-check; auto-generates a gitignored pi_pairs_generated.json if needed.
../.venv/bin/python pi_supervised.py --seeds 30 --jobs -1

# SPP cross-check on the unified dataset (30 seeds).
../.venv/bin/python spp_supervised.py --data-dir ../data --seeds 30 --jobs -1

# Gas-padding ablation cross-check (b1_unpadded vs b2_padded).
../.venv/bin/python run_ablation_supervised.py --seeds 30 --jobs -1

# Compare a Python verdict with the JS source-of-record report.
../.venv/bin/python compare_with_js_verdict.py --experiment pch
../.venv/bin/python compare_with_js_verdict.py --experiment pi
../.venv/bin/python compare_with_js_verdict.py --experiment spp
```

`--jobs` parallelizes the independent per-seed evaluations across processes
(`-1` = all cores). With `--jobs 1` a single RandomForest fit uses all cores;
with `--jobs > 1` each fit is single-threaded to avoid oversubscription. Results
are deterministic for a fixed input dataset and seed configuration.

## Relationship to `run_policy_privacy_experiments.py`

`python/run_policy_privacy_experiments.py` remains useful as a broad legacy
sanity-check runner and visualization generator across PCH/PI/SPP. The scripts
in this directory are the preferred Python layer when the goal is to cross-check
the JS source-of-record verdicts, because they mirror the shared multi-seed AUC +
permutation criterion more directly. The JS reports under `experiments/**/results/`
remain authoritative.
