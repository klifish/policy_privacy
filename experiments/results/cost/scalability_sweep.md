# Scalability study source of record

Generated: 2026-09-22T14:46:03.725Z

## Circuit capacity

| Sweep | DEPTH | Merkle levels | Constraints | zkey MB | Witness ms median/p95 | Prove ms median/p95 |
|---|---:|---:|---:|---:|---:|---:|
| depth | 32 | 8 | 64,945 | 38.7 | 285/343 | 411/562 |
| depth | 64 | 8 | 81,740 | 52.2 | 350/414 | 521/761 |
| depth | 128 | 8 | 134,009 | 87.5 | 535/682 | 734/984 |
| merkle | 64 | 4 | 73,876 | 48.3 | 352/415 | 512/605 |
| merkle | 64 | 8 | 81,740 | 52.2 | 347/354 | 499/539 |
| merkle | 64 | 12 | 89,604 | 56.0 | 358/395 | 552/632 |
| merkle | 64 | 16 | 97,468 | 59.9 | 370/456 | 571/713 |

## Fixed-circuit policy complexity

| Policy | Tokens | Active slots | Total ms median/p95 | Prove ms median/p95 |
|---|---:|---:|---:|---:|
| Simple | 3 | 1 | 925/1170 | 545/746 |
| Ontology-heavy | 19 | 5 | 880/939 | 506/550 |
| Profile-heavy | 31 | 1 | 1479/1516 | 492/522 |
| Max-mixed | 61 | 11 | 1468/1538 | 484/537 |

## TPS load

| Concurrency | Requests | Throughput proofs/s | Latency ms median/p95 |
|---:|---:|---:|---:|
| 1 | 100 | 0.805 | 1230/1659 |
| 2 | 100 | 0.787 | 2492/3805 |
| 4 | 100 | 0.936 | 4113/5854 |

## Scenario-based daily workload

| Accesses/day | Average requests/s | Access gas/day | POL/day at 30 gwei | TPS instances (+50% headroom) |
|---:|---:|---:|---:|---:|
| 1,000 | 0.012 | 1,056,674,000 | 31.70 | 1 |
| 10,000 | 0.116 | 10,566,740,000 | 317.00 | 1 |
| 100,000 | 1.157 | 105,667,400,000 | 3170.02 | 2 |

One policy commit is 304,098 gas, or 0.009 POL at 30 gwei; it is reported separately because no commit/access ratio is assumed.

The workload rows are scenarios, not measurements of a hospital trace or public-chain throughput.
