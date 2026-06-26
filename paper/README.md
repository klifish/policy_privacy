# `paper/` — Evaluation chapter (LaTeX)

Drop-in LaTeX for the **Privacy Evaluation** chapter. The chapter now follows the
paper's intended argument order:

1. evaluation setup and threat model;
2. headline supervised privacy results;
3. per-property supervised results for PCH, PI, and SPP;
4. unsupervised clustering as a label-free cross-check;
5. gas-padding ablation as mechanism attribution.

Every committed result in the supervised tables is transcribed from the current
multi-seed verdict files, not from older single-split reports.

## How to use

In the manuscript preamble:

```latex
\usepackage{booktabs}
\usepackage{amsmath}
\usepackage{amssymb}
\usepackage{graphicx}
```

Then, from a manuscript whose working directory is the repo root:

```latex
\input{paper/evaluation.tex}
```

`evaluation.tex` inputs the section bodies and tables with `paper/...` paths. If
copying into Overleaf, copy the whole `paper/` tree or adjust the input paths.

## Files

| File | Role |
|---|---|
| `evaluation.tex` | Top-level chapter assembly. |
| `sec_threat_model.tex` | Passive on-chain observer and observable features. |
| `sec_methodology.tex` | Multi-seed supervised attack criterion and clustering cross-check methodology. |
| `sec_pch.tex` / `sec_pi.tex` / `sec_spp.tex` | Per-property supervised result narratives. |
| `sec_clustering.tex` | Consolidated unsupervised clustering cross-check. |
| `sec_ablation.tex` | Gas-padding mechanism-attribution ablation. |
| `tables/tab_privacy_summary.tex` | Main headline privacy table. |
| `tables/tab_pch_terms.tex` / `tab_pch_icd10.tex` | PCH supervised result tables. |
| `tables/tab_pi_pairs.tex` | PI supervised result table. |
| `tables/tab_spp_contrasts.tex` | SPP supervised result table. |
| `tables/tab_clustering_summary.tex` | Unsupervised clustering summary. |
| `tables/tab_ablation_gas_padding.tex` | Ablation design / pending report table. |
| `_smoke.tex` | Standalone compile check; not part of the manuscript. |

## Provenance

All main supervised tables use the Polygon Amoy fixed-circuit, commitment-only,
access-gas-padded dataset and 30 policy-disjoint seeds.

| Table | Source of record |
|---|---|
| `tab_privacy_summary.tex` | `experiments/multiseed_results/polygonAmoy/{pch,pi,spp}_verdict.txt` |
| `tab_pch_terms.tex` | `experiments/multiseed_results/polygonAmoy/pch_verdict.txt` |
| `tab_pch_icd10.tex` | `experiments/multiseed_results/polygonAmoy/pch_verdict.txt` |
| `tab_pi_pairs.tex` | `experiments/multiseed_results/polygonAmoy/pi_verdict.txt` |
| `tab_spp_contrasts.tex` | `experiments/multiseed_results/polygonAmoy/spp_verdict.txt` |

Older per-experiment markdown/JSON reports under `experiments/*/results/` are
diagnostics only. They may contain stale single-split numbers and should not be
used for manuscript tables unless explicitly regenerated and promoted to a
committed source of record.

## Clustering Sources

The clustering section is a complementary label-free cross-check over the same
executions exported to `python/data/polygonAmoy/`.

| Table / figure | Source |
|---|---|
| `tab_clustering_summary.tex` | `python/results/pch_clustering_analysis/pch_global_duo_clustering.csv`, `pch_global_icd10_clustering.csv`, `python/results/pi_clustering_analysis/pi_balanced_debiased.csv`, `python/results/spp_clustering_analysis/spp_clustering_summary.csv` |
| Fig. `fig:clust-spp` | `python/results/spp_clustering_analysis/spp_detailed_analysis.png` |
| Fig. `fig:clust-pi` | `python/results/pi_clustering_analysis/pi_analysis_by_type.png` |

`python/results/` is gitignored. Before sharing the manuscript or pushing to
Overleaf, regenerate those PNGs or copy the needed figures into a tracked
`paper/figures/` directory; `sec_clustering.tex` already includes `figures/` in
its `\graphicspath`.

## Ablation Source

The gas-padding ablation table is intentionally a design/pending-report table
until the paired comparison is generated. The intended source is:

```text
experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json
experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.md
```

Do not fill B1/B2 leakage deltas or gas overhead from scratchpad or smoke-test
artifacts. Use the paired comparison report after B1/B2 alignment has been
verified.

## Compile Check

```sh
latexmk -pdf -outdir=/tmp/papersmoke paper/_smoke.tex
```

If no LaTeX toolchain is installed, at minimum check table column counts, input
paths, and stale-number searches before exporting.
