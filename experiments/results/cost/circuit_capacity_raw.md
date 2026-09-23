# Circuit capacity scalability benchmark

Host: Apple M1 (8 cores), Node v22.22.0; backend rapidsnark.
Every row keeps N=13, M=11, K=5, RANGE_BITS=32 and five public signals.
The setups are benchmark-grade and do not replace the frozen RC1 artifacts.

## Program-length capacity

| DEPTH | Merkle levels | Constraints | zkey MB | WASM MB | Witness ms median/p95 | Prove ms median/p95 | Verify ms median/p95 | Proofs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 32 | 8 | 64,945 | 38.7 | 8.6 | 285/343 | 411/562 | 11/16 | 30 |
| 64 | 8 | 81,740 | 52.2 | 8.7 | 350/414 | 521/761 | 11/22 | 30 |
| 128 | 8 | 134,009 | 87.5 | 10.1 | 535/682 | 734/984 | 11/15 | 30 |

## Merkle capacity

| DEPTH | Merkle levels | Constraints | zkey MB | WASM MB | Witness ms median/p95 | Prove ms median/p95 | Verify ms median/p95 | Proofs |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 64 | 4 | 73,876 | 48.3 | 8.6 | 352/415 | 512/605 | 11/17 | 30 |
| 64 | 8 | 81,740 | 52.2 | 8.7 | 347/354 | 499/539 | 11/16 | 30 |
| 64 | 12 | 89,604 | 56.0 | 8.7 | 358/395 | 552/632 | 10/15 | 30 |
| 64 | 16 | 97,468 | 59.9 | 8.7 | 370/456 | 571/713 | 10/13 | 30 |

Depth policy: `(DS OR RS) AND HMB AND US AND TS`.
Merkle policy: `DS AND RS AND POA AND GS AND CC`.
