# Local rehearsal dataset — PI layer and denied requests (2026-10-14)

**Not of-record.** Full-scale dry run on a local Hardhat node of the capture
design with designed PI pairs and denied requests. Gas values are localhost gas
(Amoy prices BN254 precompiles and cold storage differently) and block timing
is meaningless under automine, so verdicts from this data are indicative only.

| Field | Value |
|---|---|
| Code | `6007a96` plus uncommitted changes (`metadata.json`: `workingTreeClean: false`, `workingTreeDiffSha256` 98461a8b…; the diff is `working_tree.patch`). Applied to `6007a96`, the patch gives the tree of `3a863ee` except `experiments/ablation/gas_padding/analyze.js` and `experiments/analysis/crosscheck/pch/run_experiment.js` (a `--permutation-iterations` option added after the capture) and the then-untracked `test/pi_layer_design_test.js` |
| Config | `config.json` (decoupled capture config with `piLayer`) |
| Seed | `unified-decoupled-2026` |
| Network | Hardhat localhost (automine) |
| Circuits | `build/protocol/v3.0.0-rc2/circuits` (zkey sha256 9a018e91…) |
| Protection profile | B2 padded |
| Policies / executions | 1077 / 1977 |
| PI layer | 10 pairs each of `semantic_equivalent`, `weak_equivalent`, `controlled_difference` (2 per 0–4 differing SPP axes); 60 policies × (8 granted + 8 denied) = 960 |
| Coverage | 1017 policies × 1 execution, 509 granted / 508 denied, split within each (layer, DUO term set) group |
| Outcomes | every recorded outcome matches its plan (989 granted, 988 denied) |
| Tx status | 1 for every commit, resource and access tx |
| Access gas (min/med/max) | 947,203 / 1,052,593 / 1,156,983 |
| Commit gas (min/med/max) | 271,416 / 300,936 / 337,296 |

Every execution commits its own policy instance with a fresh randomizer. The
B1 (unpadded) replay of a 1277-execution subset is in
`experiments/ablation/gas_padding/localhost-2026-10-14-rc2/`. Analysis outputs
and logs are in `experiments/.work/rehearsal-2026-10-14/` (gitignored).
