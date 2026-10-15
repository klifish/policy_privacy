# Polygon Amoy capture — unpadded (B1), of-record (2026-10-15)

Of-record capture of the corrected implementation (protocol v3.0.0-rc2) with
designed PI pairs and granted and denied requests, run on Polygon Amoy without
gas padding (protection profile B1) as 4 concurrent shards against one
deployment (experiments/capture/run_shards.sh) and merged.

It replays the 1977 executions of the padded (B2) capture
`experiments/data/polygonAmoy-b2-padded/` with the same definitions,
randomizers and planned outcomes (`experiments/ablation/gas_padding/prepare.js
--all`), calling the unpadded entry points `commitPolicy` and
`requestAccessBound`. Gas padding was dropped from the evaluated design after
the B1/B2 ablation showed no measurable effect; the contract code still has
the padded entry points, which this capture does not call. This directory is a
byte-identical copy of
`experiments/ablation/gas_padding/polygonAmoy/b1_unpadded/`, which the
ablation reads.

| Field | Value |
|---|---|
| Code | `f9039e1` (branch `revision/mdpi-blockchains-r2-2`), clean working tree (`metadata.json`) |
| Circuits | `build/protocol/v3.0.0-rc2/circuits` (zkey sha256 9a018e91…), rapidsnark prover |
| Config | `config.json` (decoupled capture config with `piLayer`), seed `unified-decoupled-2026` |
| Network / contract | Polygon Amoy (chainId 80002), PolicyPrivacy `0x89281182b4385AEc4634335c838e5059f4Eca1C6` |
| Protection profile | B1 unpadded |
| Run | 2026-10-15 06:44–09:56 (UTC+8) on the 2-vCPU server, 4 shards (495 + 494 + 494 + 494); no shard failed or resumed; one access tx (shard 2) crossed an hour boundary and was re-proved |
| Policies / executions | 1077 / 1977 |
| PI layer | 10 pairs each of `semantic_equivalent`, `weak_equivalent`, `controlled_difference`; 60 policies × (8 granted + 8 denied) = 960 |
| Coverage | 1017 policies × 1 execution, split evenly into granted and denied within each (layer, DUO term set) group |
| Outcomes | every recorded ACM decision matches its plan (989 granted, 988 denied) |
| Tx status | 1 for all 5931 commit, resource and access txs |
| Access gas (min/med/max) | 723,446 / 723,530 / 741,458 |
| Commit gas (min/med/max) | 219,688 / 219,724 / 237,664 |
| Resource gas (min/med/max) | 91,604 / 91,616 / 91,616 |

Without padding, each gasUsed is 21,000 plus the EIP-2028 calldata cost plus a
per-transaction-type execution cost (access 695,254 when denied and 695,264
when granted; commit 196,964; resource 70,400); the first transaction of each
sending address costs a further 17,940 (one per shard address). Each shard used
its own deployer and TPS address (`merge_manifest.json`; shard 0 used the
default wallets), assigned by position in the label-independent execution
order. `shards/` holds each shard's run, log and metadata;
`executionSequence` is the planned position in the seeded order. The B1/B2
alignment of all 1977 executions is recorded in
`experiments/ablation/gas_padding/polygonAmoy/comparison/alignment.json`.
