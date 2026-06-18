# `paper/` — Evaluation chapter (LaTeX)

Drop-in LaTeX for the **Privacy Evaluation** chapter, covering all three privacy
properties (PCH, PI, SPP) under **two attack families**: supervised classifiers and
unsupervised clustering. Every number is transcribed from a committed source of record
(no recomputation here).

## How to use in your manuscript

In your main document preamble:

```latex
\usepackage{booktabs}
\usepackage{amsmath}   % \text, \mathrm in math mode
\usepackage{amssymb}   % \checkmark
\usepackage{graphicx}  % only if you uncomment the figures
```

Then, from a manuscript whose working directory is the repo root:

```latex
\input{paper/evaluation.tex}
```

`evaluation.tex` only `\input`s the section bodies and tables (paths are
`paper/...`-relative to the repo root). If your manuscript lives elsewhere (e.g. an
Overleaf project), copy the `paper/` tree in and adjust the `\input` paths, or flatten
the files. Section/table `\label`s (`sec:eval-pch`, `tab:pch-terms`, …) are stable for
cross-referencing.

## Files

| File | Role |
|---|---|
| `evaluation.tex` | Top-level chapter; assembles everything via `\input`. |
| `sec_threat_model.tex` | Passive on-chain observer + 9 observable features. |
| `sec_methodology.tex` | Supervised (multi-seed + LR/RF + permutation + positive control + unified verdict) and unsupervised (K-Means/DBSCAN + ARI/NMI; PI pairs add balanced resampling + permutation debias). |
| `sec_pch.tex` / `sec_pi.tex` / `sec_spp.tex` | Per-property bodies. |
| `sec_clustering.tex` | Cross-property clustering view + PI rebalancing/debias. |
| `tables/tab_*.tex` | One table per file (see provenance below). |
| `_smoke.tex` | Standalone compile check; **not** part of the manuscript. |

## Provenance (each table → its source of record)

All tables come from the **same Polygon Amoy dataset** (fixed circuit, commitment-only
interface, access-gas padded to a randomized 750k ±10% target). The supervised and
unsupervised attacks are two independent attack families on one dataset, not two datasets.

**Supervised** — verdicts from `experiments/multiseed_results/polygonAmoy/`:

| Table | Source |
|---|---|
| `tab_pch_terms.tex` | `experiments/multiseed_results/polygonAmoy/pch_verdict.txt` (DUO terms; same generation as PI/SPP) |
| `tab_pch_icd10.tex` | `experiments/policy_content_hiding/results/polygonAmoy/evaluation_report.md` ("Multi-seed Verdict" table; the per-chapter ICD-10 rows exist only here) |
| `tab_pi_pairs.tex` | `experiments/multiseed_results/polygonAmoy/pi_verdict.txt` |
| `tab_spp_contrasts.tex` | `experiments/multiseed_results/polygonAmoy/spp_verdict.txt` |

**Unsupervised** — clustering over the same executions exported to
`python/data/polygonAmoy/`, run by `python/clustering_analysis/run_all_clustering.py`
(PCH clustered globally, no layering; PI debias = 20 K-Means seeds vs 200 label permutations):

| Table | Source |
|---|---|
| `tab_clustering_summary.tex` | `python/results/pch_clustering_analysis/pch_global_duo_clustering.csv`, `.../pch_global_icd10_clustering.csv`, `python/results/pi_clustering_analysis/pi_balanced_debiased.csv`, `python/results/spp_clustering_analysis/spp_clustering_summary.csv` |

> **One dataset, two attack families.** Both the supervised verdicts and the clustering
> results are computed on the Polygon Amoy executions; their numbers are reported
> separately (different metrics) but are not in conflict. Per-task sample sizes vary and
> live in the result tables. (Note: `python/policy_privacy_report.json` is a stale
> artifact of an earlier supervised run on a different local path and is **not** the
> source for any table here.)

> The single-split markdown reports under each experiment's `results/` directory
> (e.g. "2004 executions", "1077 policies") are **diagnostics only** and are
> superseded by the multi-seed verdict files; they are not used in these tables.

## Figures (embedded)

`sec_clustering.tex` embeds two figures via `\includegraphics`. A `\graphicspath` at the
top of that file resolves them whether you compile **from the repo root** (it points into
the `python/results/...` trees) or **inside Overleaf** (it also looks in `figures/` and
`./`). The PNGs are produced by `python/clustering_analysis/run_all_clustering.py`.

| Embedded as | File | Shows |
|---|---|---|
| Fig.\ `fig:clust-spp` | `python/results/spp_clustering_analysis/spp_detailed_analysis.png` | SPP ARI/NMI by target. |
| Fig.\ `fig:clust-pi` | `python/results/pi_clustering_analysis/pi_analysis_by_type.png` | PI ARI/NMI by pair type. |

> **Note:** `python/results/` is gitignored, so these PNGs are *not* tracked in git.
> Before sharing the manuscript (or pushing an Overleaf project), regenerate them with
> `python/clustering_analysis/run_all_clustering.py`, or copy the three files into a
> tracked `paper/figures/` directory (the `\graphicspath` already includes `figures/`).

Other available PNGs you may want to add: `pch_duo_vs_icd10_comparison.png`,
`pi_detailed_analysis.png`, and per-target `{logicStructure,nestingDepth,predicateCount,setSize}_kmeans.png`.

## Compile check

```sh
# from repo root
latexmk -pdf -outdir=/tmp/papersmoke paper/_smoke.tex
```

If no LaTeX toolchain is installed, the files are plain `booktabs`/`amssymb` and were
checked for brace/column balance by hand (no live `pdflatex` run in the authoring
environment).
