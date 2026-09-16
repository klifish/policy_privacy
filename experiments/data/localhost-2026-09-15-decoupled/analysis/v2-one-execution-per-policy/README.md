# Re-analysis with one execution per policy per seed

Same dataset, same 30 seeds, after the supervised evaluation was changed to
sample one execution per policy per seed (Python `common.one_execution_per_group`,
JS `core/subsample.js`). Run locally (8 cores) on 2026-09-16.

| Experiment | Python | JS cross-check | Python/JS match |
|---|---|---|---|
| PCH (20 tasks) | PASS, max RF 0.640 (ICD ch8, sig 0.37, medN 127) | PASS (ICD ch8 0.646, sig 0.40) | yes |
| SPP (21 contrasts) | PASS, max RF 0.545 | PASS | yes |
| PI (overall + 3 types) | PASS, overall RF 0.522 sig 0.10 (was 0.561 / 0.53) | PASS, overall 0.537 sig 0.10 | yes |

The pooled PI failure in ../python (RF 0.561, 16/30 significant seeds) was a
big-group artifact: 9 depth-layer policies contributed 300 of 832 pooled rows,
so two or three of them dominated every 250-row test set and the row-level
permutation test treated their 30 executions as independent. Depth-layer
policies have no per-policy gas signature (access-gas ICC 0.005).
