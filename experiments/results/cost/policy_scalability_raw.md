# Fixed-circuit policy complexity and TPS load benchmark

Host: Apple M1 (8 cores), Node v22.22.0.
RC1 dimensions: DEPTH=64, MERKLE_LEVELS=8; 30 measured proofs per policy after 5 warm-ups.

## Policy complexity

| Policy | Tokens | Active slots | Total ms median/p95 | Witness ms median/p95 | Prove ms median/p95 | Verify ms median/p95 |
|---|---:|---:|---:|---:|---:|---:|
| Simple | 3 | 1 | 925/1170 | 354/418 | 545/746 | 12/14 |
| Ontology-heavy | 19 | 5 | 880/939 | 349/391 | 506/550 | 10/12 |
| Profile-heavy | 31 | 1 | 1479/1516 | 337/349 | 492/522 | 10/11 |
| Max-mixed | 61 | 11 | 1468/1538 | 335/346 | 484/537 | 10/10 |

## TPS load

| Concurrency | Requests | Throughput proofs/s | Latency ms median/p95 |
|---:|---:|---:|---:|
| 1 | 100 | 0.805 | 1230/1659 |
| 2 | 100 | 0.787 | 2492/3805 |
| 4 | 100 | 0.936 | 4113/5854 |
