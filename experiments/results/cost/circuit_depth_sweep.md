# Circuit cost sweep over DEPTH

Host: Apple M1 (8 cores), Node v22.22.0, prover backend rapidsnark.
N=13, M=11, K=5, MERKLE_LEVELS=8, RANGE_BITS=32 fixed (RC1 parameters); only DEPTH varies.
Groth16 setup is benchmark-grade (no ceremony). Verification cost is independent of DEPTH: the
statement keeps 5 public signals, so on-chain verifier gas and the padded access/commit gas do not change.

| DEPTH | constraints | wires | zkey (MB) | wasm (MB) | witness ms (median) | prove ms (median) | verify ms (median) | proofs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 32 | 64,945 | 64,441 | 38.7 | 8.6 | 282 | 382 | 11 | 5 |
| 64 | 81,740 | 80,884 | 52.2 | 8.7 | 343 | 494 | 10 | 5 |
| 128 | 134,009 | 132,449 | 87.5 | 10.1 | 542 | 730 | 11 | 5 |

RC1 release reference (DEPTH=64, O2): {"wires":80884,"constraints":81740,"privateInputs":496,"publicInputs":4,"outputs":1}

Representative policy: `(DS OR RS) AND HMB AND US AND TS` (15 tokens at DEPTH=32).
