# Policy Indistinguishability (within-pair attack)

- **Overall:** INCONCLUSIVE
- **Pairs:** controlled_difference 10, semantic_equivalent 10, weak_equivalent 10
- **Seeds:** 30; positive-control shift 0.75 SD

| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |
|---|---:|---:|---:|---:|---:|---|
| semantic_equivalent | 0.476 | 0.00 | 0.470 | 0.00 | 0.629 / 0.580 | INCONCLUSIVE |
| weak_equivalent | 0.539 | 0.00 | 0.536 | 0.00 | 0.640 / 0.607 | INCONCLUSIVE |
| controlled_difference | 0.505 | 0.00 | 0.529 | 0.00 | 0.622 / 0.604 | INCONCLUSIVE |
