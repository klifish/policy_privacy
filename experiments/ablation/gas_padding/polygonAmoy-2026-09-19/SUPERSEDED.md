# Superseded: do not use as evaluation data

This B1/B2 gas-padding ablation (B1 replayed 2026-09-19/20, commit 7fe0ef1)
pairs the 2026-09-17 Amoy capture with an unpadded replay of a subset of it.
Both profiles come from the implementation whose calldata values depended on
the policy (see `experiments/data/polygonAmoy-2026-09-17/SUPERSEDED.md`), so
its unpadded leakage reflects those value channels. It is kept for comparison
only. The evaluation ablation is `experiments/ablation/gas_padding/polygonAmoy/`
(captured 2026-10-15 at f9039e1).
