# Policy Indistinguishability (within-pair attack)

- **Overall:** PASS
- **Pairs:** controlled_difference 10, semantic_equivalent 10, weak_equivalent 10
- **Seeds:** 30; positive-control shift 0.75 SD

| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |
|---|---:|---:|---:|---:|---:|---|
| semantic_equivalent | 0.515 | 0.00 | 0.530 | 0.10 | 0.638 / 0.601 | PASS |
| weak_equivalent | 0.499 | 0.03 | 0.480 | 0.00 | 0.626 / 0.577 | PASS |
| controlled_difference | 0.520 | 0.13 | 0.499 | 0.00 | 0.626 / 0.584 | PASS |
