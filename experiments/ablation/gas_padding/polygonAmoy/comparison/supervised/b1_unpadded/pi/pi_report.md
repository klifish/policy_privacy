# Policy Indistinguishability (within-pair attack)

- **Overall:** PASS
- **Pairs:** controlled_difference 10, semantic_equivalent 10, weak_equivalent 10
- **Seeds:** 30; positive-control shift 0.75 SD

| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |
|---|---:|---:|---:|---:|---:|---|
| semantic_equivalent | 0.527 | 0.00 | 0.544 | 0.17 | 0.654 / 0.618 | PASS |
| weak_equivalent | 0.467 | 0.00 | 0.505 | 0.03 | 0.609 / 0.597 | PASS |
| controlled_difference | 0.479 | 0.00 | 0.442 | 0.00 | 0.614 / 0.560 | PASS |
