# Analysis Files

> ⚠️ **ARCHIVED — superseded.** This document describes the pre-multiseed, single-split
> PASS/FAIL design (a single AUC≤0.55-and-Advantage≤5% threshold check). The current
> authoritative privacy verdict is a 30-seed policy-disjoint double criterion
> (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`), implemented in
> `experiments/core/multiseed_criterion.js`. Some file/API references below (e.g.
> `evaluator.js`, `classifiers.js`, `mock_demo.js`) no longer exist as standalone files.
> Kept for historical context only — do not use as a spec of current behavior.

This folder contains all analysis scripts and related reports for the policy content hiding experiments.

## Analysis Scripts

- **analyze_features.js** - Feature analysis script
- **analyze_gas_details.js** - Detailed gas consumption analysis
- **analyze_gas_patterns.js** - Gas pattern analysis
- **analyze_outlier.js** - Outlier detection and analysis
- **analyze_term2_leak.js** - Term2 privacy leak analysis

## Analysis Reports

- **ANALYSIS_SUMMARY_CN.md** - 分析总结（中文版）
- **FINAL_ANALYSIS_REPORT.md** - Final comprehensive analysis report
- **PRIVACY_LEAK_ANALYSIS.md** - Privacy leak analysis report
- **QUICK_SUMMARY.txt** - Quick summary of findings
- **README_ANALYSIS.md** - Analysis methodology and guidelines
