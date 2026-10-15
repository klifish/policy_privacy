# Polygon Amoy B2 (padded) capture — PI layer and denied requests (2026-10-15)

Capture of the corrected implementation (protocol v3.0.0-rc2) with designed
PI pairs and granted and denied requests, run on Polygon Amoy with gas padding
(protection profile B2) as 4 concurrent shards against one deployment
(experiments/capture/run_shards.sh) and merged.

**Role.** This capture was first made the of-record dataset (e9aeed8). Gas
padding has since been dropped from the evaluated design, and the unpadded (B1)
replay of the same 1977 executions in `experiments/data/polygonAmoy/` is now
the of-record capture. This padded capture is the B2 arm of the gas-padding
ablation: `experiments/ablation/gas_padding/prepare.js` reads it, and its
datasets are copied into `experiments/ablation/gas_padding/polygonAmoy/b2_padded/`.

| Field | Value |
|---|---|
| Code | `f9039e1` (branch `revision/mdpi-blockchains-r2-2`), clean working tree (`metadata.json`) |
| Circuits | `build/protocol/v3.0.0-rc2/circuits` (zkey sha256 9a018e91…), rapidsnark prover |
| Config | `config.json` (decoupled capture config with `piLayer`), seed `unified-decoupled-2026` |
| Network / contract | Polygon Amoy (chainId 80002), PolicyPrivacy `0x2Bac834Bc38b75711d3608e2F0BBd6981Cc0E8D0` |
| Protection profile | B2 padded |
| Run | 2026-10-15 03:39–06:43 (UTC+8) on the 2-vCPU server, 4 shards (495 + 494 + 494 + 494); no shard failed or resumed; one access tx (shard 1) crossed an hour boundary and was re-proved |
| Policies / executions | 1077 / 1977 |
| PI layer | 10 pairs each of `semantic_equivalent`, `weak_equivalent`, `controlled_difference`; 60 policies × (8 granted + 8 denied) = 960 |
| Coverage | 1017 policies × 1 execution, split evenly into granted and denied within each (layer, DUO term set) group |
| Outcomes | every recorded ACM decision matches its plan (989 granted, 988 denied) |
| Tx status | 1 for all 5931 commit, resource and access txs |
| Access gas (min/med/max) | 949,826 / 1,050,700 / 1,159,547 |
| Commit gas (min/med/max) | 269,278 / 304,626 / 333,876 |

Each shard used its own deployer and TPS address (`merge_manifest.json`;
shard 0 used the default wallets), so the transactions come from 4 deployer
and 4 TPS addresses, assigned by position in the label-independent execution
order. Every execution commits its own policy instance with a fresh
randomizer. `shards/` holds each shard's run, log and metadata;
`executionSequence` is the planned position in the seeded order. The unpadded
(B1) replay of all 1977 executions is in
`experiments/ablation/gas_padding/polygonAmoy/b1_unpadded/` and, as the
of-record capture, in `experiments/data/polygonAmoy/`.
