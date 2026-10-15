# Policy Indistinguishability (within-pair attack)

- **Overall:** PASS
- **Pairs:** controlled_difference 10, semantic_equivalent 10, weak_equivalent 10
- **Seeds:** 30; positive-control shift 0.75 SD

| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |
|---|---:|---:|---:|---:|---:|---|
| semantic_equivalent | 0.528 | 0.07 | 0.544 | 0.23 | 0.656 / 0.623 | PASS |
| weak_equivalent | 0.472 | 0.00 | 0.496 | 0.00 | 0.603 / 0.585 | PASS |
| controlled_difference | 0.474 | 0.00 | 0.435 | 0.00 | 0.605 / 0.553 | PASS |
