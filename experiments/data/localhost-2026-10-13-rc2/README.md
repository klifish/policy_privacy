# Local rehearsal dataset — v3.0.0-rc2 (2026-10-13)

**Not of-record.** Full-scale dry run on a local Hardhat node with the fixed
implementation (protocol v3.0.0-rc2: blinded parameter commitment, normalized
pseudonym encoding, seed-shuffled execution order, raw calldata recorded).
Gas values are localhost gas (Amoy prices BN254 precompiles and cold storage
differently) and block timing is meaningless under automine, so verdicts from
this data are indicative only.

| Field | Value |
|---|---|
| Generator commit | `9c9497c` (branch `revision/mdpi-blockchains-r2-2`, per `metadata.json`) |
| Config | `config.json` (decoupled capture config) |
| Seed | `unified-decoupled-2026` |
| Network | Hardhat localhost (automine) |
| Circuits | `build/protocol/v3.0.0-rc2/circuits` (zkey sha256 9a018e91…) |
| Protection profile | B2 padded |
| Policies / executions | 1077 / 1773 (all satisfying, satisfyRatio 1) |
| Tx status | 1 for every commit, resource and access tx |
| Access gas (min/med/max) | 947,240 / 1,051,587 / 1,157,120 |
| Commit gas (min/med/max) | 271,416 / 301,656 / 331,446 |

`MANIFEST.sha256` pins the file contents. The B1 (unpadded) ablation replay of
a 1119-execution subset is in
`experiments/ablation/gas_padding/localhost-2026-10-13-rc2/`.
