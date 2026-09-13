# `paper/` — Full manuscript (LaTeX)

This directory holds the complete TPS-ZKPI manuscript (BRAINS 2026). `main.tex` is
the top-level IEEEtran document; it `\input`s modular front matter, intro, related
work, problem/threat model, and design sections, then the modular **Privacy
Evaluation** chapter (`evaluation.tex`), then discussion and conclusion. The
evaluation follows the intended argument order:

1. evaluation setup and threat model;
2. headline supervised privacy results;
3. per-property supervised results for PCH, PI, and SPP;
4. unsupervised clustering as a label-free cross-check (with NMI finite-sample sensitivity);
5. gas-padding ablation as mechanism attribution.

Every committed result in the supervised tables is transcribed from the current
deterministic multi-seed verdict files (`experiments/results/crosscheck/*/polygonAmoy/*report.json`),
not from older single-split or non-deterministic-RNG batches.

## How to use

All paths are relative to this `paper/` directory, so build **from `paper/`**:

```bash
cd paper
latexmk -pdf main.tex
# or: pdflatex main.tex && bibtex main && pdflatex main.tex && pdflatex main.tex
```

For **Overleaf**, upload the contents of this `paper/` directory at the project root
(keep the `figures/` and `tables/` subfolders, `reference.bib`, and all `sec_*.tex`),
set the main document to `main.tex`, and it compiles as-is — no path edits needed.

To reuse only the evaluation chapter inside another manuscript, ensure the preamble
loads `booktabs`, `amsmath`, `amssymb`, `graphicx`, set
`\graphicspath{{figures/}{./}}`, then `\input{evaluation.tex}` (with this directory on
the TeX input path).

## Files

| File | Role |
|---|---|
| `main.tex` | Top-level manuscript; preamble + assembly of all sections. |
| `sec_frontmatter.tex` | Title, authors, abstract, keywords. |
| `sec_introduction.tex` / `sec_related_work.tex` | Intro and related work. |
| `sec_problem.tex` | System/trust model, public-chain adversary, privacy objectives. |
| `sec_design.tex` | TPS-ZKPI design (representation, commitment/proof, transcript normalization). |
| `sec_discussion.tex` / `sec_conclusion.tex` | Discussion and conclusion. |
| `reference.bib` | Bibliography (57 entries). |
| `evaluation.tex` | Evaluation chapter assembly. |
| `sec_nmi_sensitivity.tex` | NMI finite-sample sensitivity (null-model simulation). |
| `figures/` | Tracked figures (architecture + clustering PNGs). |
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
| `tables/tab_ablation_gas_padding.tex` | Gas-padding ablation results (filled from `ablation_report.json`). |
| `_smoke.tex` | Standalone compile check; not part of the manuscript. |

## Provenance

All main supervised tables use the Polygon Amoy fixed-circuit, commitment-only,
access-gas-padded dataset and 30 policy-disjoint seeds.

| Table | Source of record |
|---|---|
| `tab_privacy_summary.tex` | PCH/PI/SPP `multiseedVerdict` in the per-experiment `report.json` files below |
| `tab_pch_terms.tex` | `experiments/results/crosscheck/pch/polygonAmoy/evaluation_report.json` |
| `tab_pch_icd10.tex` | `experiments/results/crosscheck/pch/polygonAmoy/evaluation_report.json` |
| `tab_pi_pairs.tex` | `experiments/results/crosscheck/pi/polygonAmoy/pi_report.json` |
| `tab_spp_contrasts.tex` | `experiments/results/crosscheck/spp/polygonAmoy/report.json` |

The PCH numbers are taken from `evaluation_report.json` (deterministic per-seed RNG,
commit `9261d2c` and later), which **supersedes** the older
`experiments/multiseed_results/polygonAmoy/pch_verdict.txt` batch (non-deterministic
RNG, ~Jun 24). PI and SPP agree between the two sources; only PCH differs. The
`*_verdict.txt` files should be regenerated with the deterministic pipeline before
being treated as of-record again.

## Clustering Sources

The clustering section is a complementary label-free cross-check over the same
executions in `experiments/data/polygonAmoy/`.

| Table / figure | Source |
|---|---|
| `tab_clustering_summary.tex` | `experiments/results/clustering/pch/pch_global_duo_clustering.csv`, `pch_global_icd10_clustering.csv`, `experiments/results/clustering/pi/pi_balanced_debiased.csv`, `experiments/results/clustering/spp/spp_clustering_summary.csv` |
| Fig. `fig:clust-spp` | `paper/figures/spp_detailed_analysis.png` (copied from `experiments/results/clustering/spp/`) |
| Fig. `fig:clust-pi` | `paper/figures/pi_analysis_by_type.png` (copied from `experiments/results/clustering/pi/`) |

Generated dashboard outputs are gitignored. The source clustering result PNGs
(and the `PP-TPS.png` architecture figure) are copied into the tracked
`paper/figures/` directory.
`sec_clustering.tex` and `main.tex` list `paper/figures/` first in their
`\graphicspath`, so the paper compiles after a fresh clone without regenerating
`experiments/results/clustering/`. If you regenerate the clustering analysis,
refresh `paper/figures/` from that directory.

## Ablation Source

The gas-padding ablation table (`tab_ablation_gas_padding.tex`) and the narrative in
`sec_ablation.tex` are filled from the committed paired comparison report:

```text
experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json
```

Supervised rows use the per-task `b1AucMean`/`b2AucMean` (calibrated RF) and the
bootstrap `deltaLeakage` (500 iterations); only rows whose 95% CI excludes zero are
shown as genuine leakage reduction. Clustering rows use `clustering.policyGroupBootstrap`
(B1/B2 ARI). Gas overhead uses `gas.{commitGasUsed,accessGasUsed}.percentIncrease`.
Note the report's own caveat: B2 reuses the deployed Amoy run, so B1/B2 are
non-contemporaneous and `blockDifference` is excluded from every attack model.

## Compile Check

```sh
latexmk -pdf -outdir=/tmp/papersmoke paper/_smoke.tex
```

If no LaTeX toolchain is installed, at minimum check table column counts, input
paths, and stale-number searches before exporting.
