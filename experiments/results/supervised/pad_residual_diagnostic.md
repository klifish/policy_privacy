# Pad-target residual diagnostic

Dataset: `polygonAmoy` — 1774 pad targets parsed from the capture logs.

`residual = accessGasUsed − pad target`. The pad target is drawn by the TPS from a CSPRNG, independently of the policy; the adversary never observes it. Row-level AUCs are rank-based (ties averaged); policy-level d is Cohen's d after collapsing executions to one mean per policy.

## PCH

| task | policies (+) | const. feat. | residual range | AUC gas | AUC target | AUC residual | d gas | d target | d residual | of-record |
|---|---|---|---|---|---|---|---|---|---|---|
| DUO GR | 1077 (302) | 7/9 | 4661–4750 | 0.461 | 0.461 | 0.503 | -0.17 | -0.17 | 0.03 | PASS |
| DUO DS | 1077 (422) | 7/9 | 4661–4750 | 0.495 | 0.495 | 0.521 | -0.07 | -0.07 | 0.04 | PASS |
| DUO RS | 1077 (412) | 7/9 | 4661–4750 | 0.496 | 0.496 | 0.520 | -0.03 | -0.03 | 0.06 | PASS |
| DUO POA | 1077 (392) | 7/9 | 4661–4750 | 0.517 | 0.517 | 0.508 | 0.03 | 0.03 | 0.00 | PASS |
| DUO GS | 1077 (382) | 7/9 | 4661–4750 | 0.488 | 0.488 | 0.517 | 0.01 | 0.01 | -0.02 | PASS |
| DUO CC | 1077 (392) | 7/9 | 4661–4750 | 0.504 | 0.504 | 0.510 | -0.00 | -0.00 | -0.00 | PASS |
| DUO NCU | 1077 (206) | 7/9 | 4661–4750 | 0.530 | 0.530 | 0.479 | 0.09 | 0.09 | -0.14 | PASS |
| DUO HMB | 1077 (331) | 7/9 | 4661–4750 | 0.491 | 0.491 | 0.478 | -0.07 | -0.07 | -0.09 | PASS |
| DUO NMDS | 1077 (237) | 7/9 | 4661–4750 | 0.514 | 0.514 | 0.498 | -0.00 | -0.00 | -0.06 | PASS |
| DUO GSO | 1077 (236) | 7/9 | 4661–4750 | 0.479 | 0.479 | 0.471 | -0.03 | -0.03 | -0.11 | PASS |
| ICD ch0 | 422 (44) | 7/9 | 4661–4750 | 0.508 | 0.508 | 0.519 | 0.01 | 0.01 | 0.09 | PASS |
| ICD ch1 | 422 (49) | 7/9 | 4661–4750 | 0.423 | 0.423 | 0.479 | -0.20 | -0.20 | -0.06 | PASS |
| ICD ch2 | 422 (33) | 7/9 | 4661–4750 | 0.517 | 0.517 | 0.483 | -0.03 | -0.03 | 0.09 | PASS |
| ICD ch3 | 422 (55) | 7/9 | 4661–4750 | 0.433 | 0.433 | 0.502 | -0.19 | -0.19 | 0.02 | PASS |
| ICD ch4 | 422 (41) | 7/9 | 4661–4750 | 0.485 | 0.485 | 0.497 | 0.12 | 0.12 | -0.08 | PASS |
| ICD ch5 | 422 (34) | 7/9 | 4661–4750 | 0.601 | 0.601 | 0.472 | 0.60 | 0.60 | -0.23 | FAIL |
| ICD ch6 | 422 (48) | 7/9 | 4661–4750 | 0.489 | 0.489 | 0.507 | 0.12 | 0.12 | 0.10 | PASS |
| ICD ch7 | 422 (48) | 7/9 | 4661–4750 | 0.494 | 0.494 | 0.493 | -0.13 | -0.13 | -0.02 | PASS |
| ICD ch8 | 422 (33) | 7/9 | 4661–4750 | 0.509 | 0.509 | 0.514 | 0.12 | 0.12 | -0.09 | PASS |
| ICD ch9 | 422 (37) | 7/9 | 4661–4750 | 0.524 | 0.524 | 0.508 | -0.20 | -0.20 | 0.13 | PASS |

### Protocol reruns on FAIL tasks

Same `analyze_contrast` (seeds, split selection, LR+RF, permutation test, double criterion) on three feature sets.

| task | features | LR AUC / sig | RF AUC / sig | verdict |
|---|---|---|---|---|
| ICD ch5 | ofRecord | 0.667 / 0.53 | 0.628 / 0.37 | FAIL |
| ICD ch5 | targetOnly | 0.686 / 0.63 | 0.606 / 0.30 | FAIL |
| ICD ch5 | residualSubstituted | 0.556 / 0.10 | 0.561 / 0.17 | PASS |

## SPP

| task | policies (+) | const. feat. | residual range | AUC gas | AUC target | AUC residual | d gas | d target | d residual | of-record |
|---|---|---|---|---|---|---|---|---|---|---|
| structureType: trivial/or_only | 433 (303) | 7/9 | 4661–4750 | 0.546 | 0.546 | 0.466 | 0.17 | 0.17 | -0.13 | PASS |
| structureType: trivial/and_only | 424 (294) | 7/9 | 4661–4750 | 0.532 | 0.532 | 0.471 | 0.11 | 0.11 | -0.09 | PASS |
| structureType: trivial/and_or_mixed | 480 (350) | 7/9 | 4661–4750 | 0.526 | 0.526 | 0.515 | 0.09 | 0.09 | 0.06 | PASS |
| structureType: or_only/and_only | 597 (294) | 7/9 | 4661–4750 | 0.483 | 0.483 | 0.506 | -0.06 | -0.06 | 0.04 | PASS |
| structureType: or_only/and_or_mixed | 653 (350) | 7/9 | 4661–4750 | 0.478 | 0.478 | 0.546 | -0.07 | -0.08 | 0.19 | PASS |
| structureType: and_only/and_or_mixed | 644 (350) | 7/9 | 4661–4750 | 0.494 | 0.494 | 0.542 | -0.02 | -0.02 | 0.14 | PASS |
| predicateCombo: single/few | 902 (645) | 7/9 | 4661–4750 | 0.502 | 0.502 | 0.491 | 0.00 | 0.00 | -0.02 | PASS |
| predicateCombo: single/many | 432 (175) | 7/9 | 4661–4750 | 0.467 | 0.467 | 0.502 | -0.13 | -0.13 | 0.00 | PASS |
| predicateCombo: few/many | 820 (175) | 7/9 | 4661–4750 | 0.464 | 0.464 | 0.511 | -0.13 | -0.13 | 0.02 | PASS |
| paramType: none/small | 379 (232) | 7/9 | 4661–4750 | 0.433 | 0.433 | 0.498 | -0.23 | -0.23 | 0.01 | PASS |
| paramType: none/medium | 499 (352) | 7/9 | 4661–4750 | 0.470 | 0.470 | 0.473 | -0.13 | -0.13 | -0.10 | PASS |
| paramType: none/large | 493 (346) | 7/9 | 4661–4750 | 0.442 | 0.442 | 0.542 | -0.22 | -0.22 | 0.16 | PASS |
| paramType: small/medium | 584 (352) | 7/9 | 4661–4750 | 0.535 | 0.535 | 0.474 | 0.10 | 0.10 | -0.11 | PASS |
| paramType: small/large | 578 (346) | 7/9 | 4661–4750 | 0.508 | 0.509 | 0.540 | 0.01 | 0.01 | 0.14 | PASS |
| paramType: medium/large | 698 (346) | 7/9 | 4661–4750 | 0.473 | 0.473 | 0.564 | -0.09 | -0.09 | 0.24 | PASS |
| nestingDepth: flat/shallow | 340 (210) | 7/9 | 4661–4750 | 0.545 | 0.545 | 0.474 | 0.16 | 0.16 | -0.07 | PASS |
| nestingDepth: flat/medium | 465 (335) | 7/9 | 4661–4750 | 0.565 | 0.565 | 0.507 | 0.24 | 0.24 | 0.03 | PASS |
| nestingDepth: flat/deep | 532 (402) | 7/9 | 4661–4750 | 0.504 | 0.504 | 0.474 | 0.00 | 0.00 | -0.11 | PASS |
| nestingDepth: shallow/medium | 545 (335) | 7/9 | 4661–4750 | 0.523 | 0.523 | 0.531 | 0.08 | 0.08 | 0.10 | PASS |
| nestingDepth: shallow/deep | 612 (402) | 7/9 | 4661–4750 | 0.459 | 0.459 | 0.498 | -0.16 | -0.16 | -0.04 | PASS |
| nestingDepth: medium/deep | 737 (402) | 7/9 | 4661–4750 | 0.440 | 0.440 | 0.467 | -0.23 | -0.23 | -0.14 | FAIL |

### Protocol reruns on FAIL tasks

Same `analyze_contrast` (seeds, split selection, LR+RF, permutation test, double criterion) on three feature sets.

| task | features | LR AUC / sig | RF AUC / sig | verdict |
|---|---|---|---|---|
| nestingDepth: medium/deep | ofRecord | 0.563 / 0.53 | 0.558 / 0.40 | FAIL |
| nestingDepth: medium/deep | targetOnly | 0.568 / 0.57 | 0.503 / 0.03 | FAIL |
| nestingDepth: medium/deep | residualSubstituted | 0.530 / 0.13 | 0.544 / 0.33 | PASS |
