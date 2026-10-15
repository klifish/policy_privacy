# Local B1/B2 ablation rehearsal (2026-10-14)

**Not of-record.** B2 is a 1277-execution subset of
`experiments/data/localhost-2026-10-14-rc2/` (all 60 PI-paired policies and
317 coverage policies, chosen by `prepare.js` for label coverage); B1 replays
the same definitions, randomizers and outcomes without gas padding on the same
local Hardhat node.

| Field | Value |
|---|---|
| Code | `6007a96` plus uncommitted changes (`metadata.json`: `workingTreeClean: false`, `workingTreeDiffSha256` 98461a8b…; the diff is `working_tree.patch`). Applied to `6007a96`, the patch gives the tree of `3a863ee` except `experiments/ablation/gas_padding/analyze.js` and `experiments/analysis/crosscheck/pch/run_experiment.js` (a `--permutation-iterations` option added after the capture) and the then-untracked `test/pi_layer_design_test.js` |
| Executions | 1277 per profile (633 granted, 644 denied), 377 policies |
| B1 access gas (min/med/max) | 553,488 / 553,560 / 570,658 |
| B1 commit gas (min/med/max) | 197,008 / 197,044 / 214,144 |
| Tx status | 1 for every tx |

`comparison/ablation_report.{json,md}` was produced with
`--permutation-iterations=1` (no permutation tests in this run), so its
significance columns are not meaningful; the B1/B2 AUC deltas are.
