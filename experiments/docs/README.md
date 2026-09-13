# Policy Privacy experiment documentation

This directory documents capture generation and the analysis implementations.
The repository-wide responsibility boundary and current MDPI result provenance are defined in
[`docs/EXPERIMENT_PIPELINE.md`](../../docs/EXPERIMENT_PIPELINE.md).

## Start here

- [Unified dataset overview](unified/README_UNIFIED_DATASET.md)
- [Unified dataset workflow](unified/UNIFIED_DATASET_WORKFLOW.md)
- [Recorded-parameter audit](RECORDED_PARAMETERS_AUDIT.md)
- [Documentation organization](DOCUMENTATION_ORGANIZATION.md)

## Dataset generation

- [Generation strategies](unified/GENERATION_STRATEGIES.md) (historical design notes; may discuss pre-V3 negation sampling)
- [SPP and PI generation constraints](unified/SPP_PI_CHALLENGE.md) (historical design notes; not the current DUO V3 protocol contract)
- [PCH dataset workflow](pch/dataset_generation_workflow.md)
- [SPP dataset workflow (English)](spp/dataset_generation_workflow_en.md)
- [SPP dataset workflow (Chinese)](spp/dataset_generation_workflow_zh.md)
- [PI dataset workflow](pi/dataset_generation_workflow.md)

## JavaScript analysis implementation

- [PCH dashboard](pch/DASHBOARD_README.md)
- [PCH term-counting rules](pch/correct_term_counting.md)
- [PCH ICD-10 correction notes](pch/ICD10_FIX_SUMMARY.md)
- [SPP implementation overview](spp/README.md)
- [SPP design evaluation](spp/SPP_DESIGN_EVALUATION.md)
- [SPP summary](spp/SUMMARY.md)
- [PI implementation overview](pi/README.md)
- [PI attack levels](pi/ATTACK_LEVELS_REPORT.md)

These JavaScript analyses remain useful as an independent implementation of
the supervised privacy criterion. On the active MDPI branch, the table-level
supervised verdicts come from `experiments/analysis/supervised/`; clustering and
statistical figures come from `experiments/analysis/clustering/`.

## Historical material

Archived PCH plans, reports, and exploratory analyses live under `pch/archive/`.
They document earlier iterations and must not be treated as current result
provenance.
