# Local rehearsal dataset — structure-decoupled config (2026-09-15)

**Not of-record.** Full-scale dry run of the capture pipeline on a local Hardhat
node, used to exercise the analysis chain before the Polygon Amoy rerun. Gas
values are localhost gas (lower than Amoy; cold-storage costs differ) and block
timing features are meaningless under automine, so privacy verdicts computed
from this data are indicative only.

| Field | Value |
|---|---|
| Generator commit | `bdd7b01` (branch `revision/mdpi-blockchains-r1`) |
| Config | `experiments/capture/configs/unified_dataset_config_decoupled.json` |
| Seed | `unified-decoupled-2026` |
| Network | Hardhat localhost (`npx hardhat node`, automine) |
| Circuits | `build/protocol/v3.0.0-rc1/circuits` (release zkey sha256 92e616d0…) |
| Protection profile | B2 padded (TPS access-gas pad base 750k ±10%) |
| Policies / executions | 1077 / 1773 (24 depth-layer policies × 30 + 1053 coverage × 1) |
| Outcome check | 1773/1773 on-chain events match the plan (all Granted, satisfyRatio 1); tx status 1 throughout |
| Access gas (min/med/max) | 679,136 / 750,717 / 827,090 |
| Commit gas (min/med/max) | 271,416 / 301,566 / 331,446 |
| Prove time p50 / p95 | 506 ms / 729 ms (rapidsnark) |
| Wall time | 14:40–17:30 local (≈2 h 50 min, ≈10 executions/min) |

Files are byte-identical copies of `experiments/data/localhost/` at completion
(`MANIFEST.sha256`); `capture_run.log` is the pipeline log. The original
`localhost/` directory is gitignored and gets overwritten by any later local run.
