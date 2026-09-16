# Rehearsal analysis outputs (run 2026-09-16 on root@8.136.33.123, 2 vCPU)

Inputs: the dataset in the parent directory (sha256 in ../MANIFEST.sha256).
Code: commit bdd7b01. Runtime 00:22–01:19 server time (analysis_run.log).

- `python/` — of-record Python pipeline (`pch|spp|pi_supervised`, 30 seeds,
  500 permutation iterations) redirected with `--data-dir/--output-dir`;
  `*_js_comparison.json` from `compare_with_js_verdict`.
- `clustering/` — `run_all_clustering` outputs (PCH global, SPP per axis,
  PI balanced 30-vs-30 on the depth layer).
- `crosscheck/` — JS cross-check reports (`exp:pch|spp|pi`, network=localhost);
  the regenerable `features.json` and `pi_pairs.json` (47 MB) are omitted.

Verdicts on this localhost data (indicative only, see ../README.md):
PCH 20/20 PASS, SPP 21/21 PASS, PI per-type PASS but the pooled "overall"
task fails the Python double criterion (RF AUC 0.563, significant seeds
16/30) while the JS cross-check passes it (AUC 0.512) — under investigation.
