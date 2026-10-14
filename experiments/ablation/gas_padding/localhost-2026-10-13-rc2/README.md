# Gas-padding ablation, local rehearsal — v3.0.0-rc2 (2026-10-13)

**Not of-record.** Paired B1/B2 ablation built from the rc2 local rehearsal
dataset (`experiments/data/localhost-2026-10-13-rc2/`) on a Hardhat node.

| Directory | Contents |
|---|---|
| `shared/` | Replay definitions, source config, selected source indices |
| `b2_padded/` | The 1119 selected executions copied from the main B2 capture |
| `b1_unpadded/` | The same 1119 executions (423 policies) replayed without padding at commit `d687129` |
| `execution_manifest.json` | Selection rules, per-class coverage and source hashes |

Selection keeps the 24 depth-layer policies (≥30 executions) and requires at
least 70 rows and 8 policies per class on each attack dimension. Every tx has
status 1. B1 access gas (min/med/max) 553,486 / 553,570 / 570,658; B2
947,240 / 1,051,047 / 1,157,120.

Caveat: the first 724 B1 access txs were sent with an `estimateGas` gas limit;
the remainder use the fixed 980k limit introduced in `d687129`.

`MANIFEST.sha256` pins the file contents.
