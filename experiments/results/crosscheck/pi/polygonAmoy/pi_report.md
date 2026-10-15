# Policy Indistinguishability (within-pair attack)

- **Overall:** PASS
- **Pairs:** controlled_difference 10, semantic_equivalent 10, weak_equivalent 10
- **Seeds:** 30; positive-control shift 0.75 SD

| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |
|---|---:|---:|---:|---:|---:|---|
| semantic_equivalent | 0.518 | 0.00 | 0.534 | 0.10 | 0.638 / 0.597 | PASS |
| weak_equivalent | 0.498 | 0.03 | 0.477 | 0.00 | 0.622 / 0.572 | PASS |
| controlled_difference | 0.517 | 0.13 | 0.494 | 0.00 | 0.622 / 0.585 | PASS |
