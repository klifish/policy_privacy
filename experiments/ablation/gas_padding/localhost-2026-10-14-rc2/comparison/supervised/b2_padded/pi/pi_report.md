# Policy Indistinguishability (within-pair attack)

- **Overall:** INCONCLUSIVE
- **Pairs:** controlled_difference 10, semantic_equivalent 10, weak_equivalent 10
- **Seeds:** 30; positive-control shift 0.75 SD

| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |
|---|---:|---:|---:|---:|---:|---|
| semantic_equivalent | 0.580 | 0.00 | 0.541 | 0.00 | 0.674 / 0.620 | INCONCLUSIVE |
| weak_equivalent | 0.488 | 0.00 | 0.492 | 0.00 | 0.617 / 0.579 | INCONCLUSIVE |
| controlled_difference | 0.473 | 0.00 | 0.536 | 0.00 | 0.595 / 0.601 | INCONCLUSIVE |
