# Run logs — 2026-10-15 Amoy capture and result regeneration

Operational logs of the runs that produced the of-record data and results.
They record what ran, when and with what outcome; the data and results
themselves are in `experiments/data/polygonAmoy/`,
`experiments/ablation/gas_padding/polygonAmoy/` and `experiments/results/`.
All hex strings of 64 digits in these logs are transaction hashes; no keys.

## capture_server/

Polygon Amoy capture on the 2-core server (code f9039e1, 4 shards).

- `amoy-2026-10-15/`: driver `run_full.sh` and one log per step: `fund_b2`,
  `capture_b2`, `prepare_b1`, `fund_b1`, `capture_b1`, `verify_ablation`
  (`.done` marks a finished step); `driver.log` has the step timeline,
  `mem.log` the server memory, `fund_*.log` the shard wallet transfers.
- `smoke-2026-10-15/`: the 37-execution smoke capture (B2 and the B1 replay)
  run before the full capture to check sharding, gas and timing on Amoy.
  Not of-record.

## compute_server/

Regeneration of the results on the 32-core server from the committed data.

- `regen/regen.sh`: supervised analysis, Python ablation and figure, calldata
  value gates (B2, B1), clustering, JS ablation, criterion sensitivity.
- `regen/regen_spp.sh`: SPP supervised analysis and criterion sensitivity
  rerun after the dataset lookup fix (a03f97f). The first run's
  `supervised.log` and `criterion_sensitivity.log` read SPP from shard 0
  only and are superseded by `spp_fix.log` and `criterion_sensitivity_fix.log`.
- `regen/regen_js.sh`: JS cross-check (`--concurrency=30`), comparison with
  the Python verdicts and `evaluation:verify`. `driver.log` also records an
  aborted first attempt that ran serially because a nested `npm run`
  swallowed the concurrency flag.
