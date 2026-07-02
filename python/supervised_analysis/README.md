# `supervised_analysis/` — Supervised SPP privacy cross-check (sklearn)

An **independent** Python (scikit-learn) re-run of the Structure & Parameter
Privacy (SPP) supervised attack. It complements the label-free clustering
cross-check in [`../clustering_analysis/`](../clustering_analysis/): if mature,
well-tuned sklearn classifiers — given labels and training data, i.e. the
strongest attacker — still cannot beat the privacy verdict, that is stronger
evidence than the bespoke JS models alone.

This is **supporting evidence, not a source of record.** The paper tables are
driven by the JavaScript pipeline (see below); nothing here overwrites them.

## Outputs and isolation from the JS results

All outputs go to `python/results/supervised_analysis/` (which is **gitignored**,
`.gitignore` line `python/results/`), so this code never touches — and cannot
overwrite — the JS results tracked under `experiments/**/results/`.

| File | Produced by |
|---|---|
| `spp_supervised_summary.csv` | `spp_supervised.py` — per (dataset, target, class0, class1, model) AUC/sigFraction/verdict |
| `spp_supervised_verdict.json` | `spp_supervised.py` — overall verdict + criterion + per-contrast detail |
| `spp_ablation_deltaLeakage.csv` | `run_ablation_supervised.py` — per-contrast b1/b2 leakage delta + bootstrap CI |

The JS source of record (separate tree, git-tracked) that these are compared
against:
- `experiments/structure_and_parameter_privacy/results/polygonAmoy/report.json`
- `experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json`

## Methodology (mirrors the JS pipeline, sklearn models)

- **Targets / contrasts:** `structureType`, `predicateCombo`, `paramType`; all
  pairwise binary contrasts within each (matches `attacks.js`).
- **Features:** the 9 observable keys from `attacks.js` (gas, calldata length,
  proof size, log counts/sizes). `blockDifference` and all `proof*Time` are
  excluded (confounded / off-chain). Zero-variance columns are dropped per
  training fold; if none survive the attacker degenerates to AUC = 0.5.
- **Models:** RandomForest (200 trees, `class_weight='balanced'`) and
  standardized LogisticRegression. RF probabilities are the raw (uncalibrated)
  vote fractions — AUC is rank-based and sigmoid calibration is monotonic, so
  calibration barely changes AUC while tripling cost; omitting it also matches
  the JS pipeline.
- **Protocol:** policy-disjoint `GroupShuffleSplit` (test 0.3) grouped by
  `policyId`, 30 seeds. Balancing via `class_weight` on training only; test set
  kept at natural prevalence.
- **Metric / verdict:** AUC + a 500-shuffle permutation test (no retraining).
  Per (contrast, model) `legFails = (aucMean > 0.55) AND (sigFraction >= 0.5)`;
  a contrast FAILs if either model's leg fails, and is non-gating when
  `medianTestN < 20`. Overall PASS iff all gating contrasts pass.
- **Ablation delta:** `deltaLeakage = |AUC_b1 - 0.5| - |AUC_b2 - 0.5|`
  (per seed, bootstrapped), matching `ablation_report.json`'s `effectDefinition`.

## Datasets

- **Primary:** the full unified deployment, `python/data/polygonAmoy/`
  (identical export of `experiments/unified/artifacts_data/polygonAmoy/`).
- **Ablation:** `experiments/ablation/gas_padding/polygonAmoy/{b1_unpadded,b2_padded}/`.

## Usage

```bash
cd python/supervised_analysis

# Main cross-check on the unified dataset (30 seeds).
../.venv/bin/python spp_supervised.py --data-dir ../data --seeds 30 --jobs -1

# Gas-padding ablation cross-check (b1_unpadded vs b2_padded).
../.venv/bin/python run_ablation_supervised.py --seeds 30 --jobs -1
```

`--jobs` parallelizes the (independent) per-seed evaluations across processes
(`-1` = all cores). With `--jobs 1` a single RandomForest fit uses all cores;
with `--jobs > 1` each fit is single-threaded to avoid oversubscription. Results
are identical regardless of `--jobs` (each seed is independently seeded).
Both `spp_supervised.py` and `run_ablation_supervised.py` checkpoint after each
completed contrast (CSV row appended + flushed, JSON verdict rewritten), so an
interrupted run keeps all contrasts finished so far.
