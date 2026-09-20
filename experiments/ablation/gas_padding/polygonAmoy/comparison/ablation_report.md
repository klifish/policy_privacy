# B1/B2 Gas Padding Ablation

Positive Δleakage means B2 padding reduced |AUC−0.5| relative to B1.
Supervised 95% intervals are repeated-split stability intervals; seeded holdouts overlap and are not independent samples.

## Supervised attacks

| Experiment | Task | Classifier | B1 AUC | B2 AUC | Δleakage (95% CI) | Interpretation |
|---|---|---:|---:|---:|---:|---|
| PCH | DUO CC | lr | 0.567 | 0.519 | 0.029 [0.010, 0.050] | padding_reduces_leakage |
| PCH | DUO CC | rf | 0.657 | 0.473 | 0.118 [0.096, 0.140] | padding_reduces_leakage |
| PCH | DUO DS | lr | 0.689 | 0.474 | 0.144 [0.119, 0.166] | padding_reduces_leakage |
| PCH | DUO DS | rf | 0.683 | 0.468 | 0.135 [0.108, 0.163] | padding_reduces_leakage |
| PCH | DUO GR | lr | 0.882 | 0.550 | 0.324 [0.308, 0.340] | padding_reduces_leakage |
| PCH | DUO GR | rf | 0.879 | 0.439 | 0.312 [0.293, 0.329] | padding_reduces_leakage |
| PCH | DUO GS | lr | 0.561 | 0.511 | 0.028 [0.017, 0.038] | padding_reduces_leakage |
| PCH | DUO GS | rf | 0.660 | 0.497 | 0.128 [0.112, 0.143] | padding_reduces_leakage |
| PCH | DUO GSO | lr | 0.793 | 0.519 | 0.216 [0.181, 0.247] | padding_reduces_leakage |
| PCH | DUO GSO | rf | 0.585 | 0.432 | -0.005 [-0.051, 0.043] | no_detectable_incremental_effect |
| PCH | DUO HMB | lr | 0.872 | 0.524 | 0.323 [0.310, 0.335] | padding_reduces_leakage |
| PCH | DUO HMB | rf | 0.884 | 0.465 | 0.326 [0.312, 0.341] | padding_reduces_leakage |
| PCH | DUO NCU | lr | 0.834 | 0.463 | 0.265 [0.249, 0.281] | padding_reduces_leakage |
| PCH | DUO NCU | rf | 0.648 | 0.498 | 0.088 [0.057, 0.120] | padding_reduces_leakage |
| PCH | DUO NMDS | lr | 0.839 | 0.508 | 0.287 [0.270, 0.303] | padding_reduces_leakage |
| PCH | DUO NMDS | rf | 0.686 | 0.550 | 0.111 [0.074, 0.147] | padding_reduces_leakage |
| PCH | DUO POA | lr | 0.619 | 0.469 | 0.082 [0.068, 0.095] | padding_reduces_leakage |
| PCH | DUO POA | rf | 0.685 | 0.414 | 0.099 [0.080, 0.119] | padding_reduces_leakage |
| PCH | DUO RS | lr | 0.516 | 0.492 | -0.004 [-0.017, 0.010] | no_detectable_incremental_effect |
| PCH | DUO RS | rf | 0.557 | 0.463 | 0.015 [-0.000, 0.031] | no_detectable_incremental_effect |
| PCH | ICD ch0 | lr | 0.771 | 0.538 | 0.172 [0.099, 0.240] | padding_reduces_leakage |
| PCH | ICD ch0 | rf | 0.503 | 0.502 | -0.094 [-0.146, -0.045] | padding_increases_leakage |
| PCH | ICD ch1 | lr | 0.474 | 0.573 | -0.029 [-0.053, -0.005] | padding_increases_leakage |
| PCH | ICD ch1 | rf | 0.462 | 0.571 | -0.032 [-0.054, -0.010] | padding_increases_leakage |
| PCH | ICD ch2 | lr | 0.530 | 0.485 | 0.007 [-0.013, 0.029] | no_detectable_incremental_effect |
| PCH | ICD ch2 | rf | 0.534 | 0.507 | -0.006 [-0.032, 0.022] | no_detectable_incremental_effect |
| PCH | ICD ch3 | lr | 0.562 | 0.541 | 0.027 [0.004, 0.050] | padding_reduces_leakage |
| PCH | ICD ch3 | rf | 0.511 | 0.572 | -0.045 [-0.062, -0.028] | padding_increases_leakage |
| PCH | ICD ch4 | lr | 0.514 | 0.423 | -0.036 [-0.058, -0.015] | padding_increases_leakage |
| PCH | ICD ch4 | rf | 0.483 | 0.538 | -0.035 [-0.055, -0.011] | padding_increases_leakage |
| PCH | ICD ch5 | lr | 0.510 | 0.422 | -0.021 [-0.048, 0.007] | no_detectable_incremental_effect |
| PCH | ICD ch5 | rf | 0.466 | 0.606 | -0.065 [-0.088, -0.041] | padding_increases_leakage |
| PCH | ICD ch6 | lr | 0.759 | 0.528 | 0.160 [0.097, 0.220] | padding_reduces_leakage |
| PCH | ICD ch6 | rf | 0.597 | 0.520 | 0.011 [-0.028, 0.049] | no_detectable_incremental_effect |
| PCH | ICD ch7 | lr | 0.472 | 0.517 | 0.011 [-0.010, 0.032] | no_detectable_incremental_effect |
| PCH | ICD ch7 | rf | 0.511 | 0.588 | -0.064 [-0.082, -0.047] | padding_increases_leakage |
| PCH | ICD ch8 | lr | 0.451 | 0.459 | 0.001 [-0.024, 0.025] | no_detectable_incremental_effect |
| PCH | ICD ch8 | rf | 0.472 | 0.447 | -0.037 [-0.057, -0.017] | padding_increases_leakage |
| PCH | ICD ch9 | lr | 0.448 | 0.532 | 0.005 [-0.023, 0.032] | no_detectable_incremental_effect |
| PCH | ICD ch9 | rf | 0.478 | 0.479 | -0.019 [-0.039, -0.001] | padding_increases_leakage |
| PI | controlled_difference | lr | 0.708 | 0.483 | 0.137 [0.099, 0.175] | padding_reduces_leakage |
| PI | controlled_difference | rf | 0.714 | 0.439 | 0.135 [0.103, 0.166] | padding_reduces_leakage |
| PI | overall | lr | 0.450 | 0.433 | 0.017 [-0.012, 0.049] | no_detectable_incremental_effect |
| PI | overall | rf | 0.583 | 0.413 | -0.003 [-0.038, 0.033] | no_detectable_incremental_effect |
| PI | semantic_equivalent | lr | 0.436 | 0.515 | 0.024 [-0.004, 0.054] | no_detectable_incremental_effect |
| PI | semantic_equivalent | rf | 0.456 | 0.462 | -0.008 [-0.037, 0.022] | no_detectable_incremental_effect |
| PI | weak_equivalent | lr | 0.355 | 0.526 | -0.004 [-0.084, 0.073] | no_detectable_incremental_effect |
| PI | weak_equivalent | rf | 0.635 | 0.512 | 0.033 [-0.043, 0.109] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/deep | lr | 0.327 | 0.484 | 0.283 [0.268, 0.298] | padding_reduces_leakage |
| SPP | nestingDepth: flat/deep | rf | 0.840 | 0.510 | 0.300 [0.279, 0.322] | padding_reduces_leakage |
| SPP | nestingDepth: flat/medium | lr | 0.531 | 0.515 | 0.235 [0.206, 0.266] | padding_reduces_leakage |
| SPP | nestingDepth: flat/medium | rf | 0.820 | 0.503 | 0.273 [0.251, 0.294] | padding_reduces_leakage |
| SPP | nestingDepth: flat/shallow | lr | 0.512 | 0.436 | 0.132 [0.100, 0.163] | padding_reduces_leakage |
| SPP | nestingDepth: flat/shallow | rf | 0.770 | 0.491 | 0.193 [0.162, 0.221] | padding_reduces_leakage |
| SPP | nestingDepth: medium/deep | lr | 0.554 | 0.559 | -0.015 [-0.038, 0.007] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | rf | 0.529 | 0.585 | -0.054 [-0.076, -0.031] | padding_increases_leakage |
| SPP | nestingDepth: shallow/deep | lr | 0.640 | 0.457 | 0.059 [0.018, 0.095] | padding_reduces_leakage |
| SPP | nestingDepth: shallow/deep | rf | 0.626 | 0.537 | 0.045 [0.015, 0.072] | padding_reduces_leakage |
| SPP | nestingDepth: shallow/medium | lr | 0.549 | 0.531 | 0.013 [-0.019, 0.047] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | rf | 0.534 | 0.522 | 0.006 [-0.020, 0.033] | no_detectable_incremental_effect |
| SPP | paramType: large/none | lr | 0.754 | 0.524 | 0.130 [0.083, 0.174] | padding_reduces_leakage |
| SPP | paramType: large/none | rf | 0.853 | 0.403 | 0.223 [0.176, 0.266] | padding_reduces_leakage |
| SPP | paramType: large/small | lr | 0.503 | 0.473 | 0.001 [-0.018, 0.022] | no_detectable_incremental_effect |
| SPP | paramType: large/small | rf | 0.518 | 0.501 | 0.013 [-0.008, 0.036] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | lr | 0.552 | 0.467 | 0.020 [-0.003, 0.042] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | rf | 0.493 | 0.508 | 0.003 [-0.010, 0.015] | no_detectable_incremental_effect |
| SPP | paramType: medium/none | lr | 0.639 | 0.539 | 0.073 [0.036, 0.110] | padding_reduces_leakage |
| SPP | paramType: medium/none | rf | 0.850 | 0.446 | 0.259 [0.229, 0.293] | padding_reduces_leakage |
| SPP | paramType: medium/small | lr | 0.518 | 0.470 | 0.010 [-0.009, 0.031] | no_detectable_incremental_effect |
| SPP | paramType: medium/small | rf | 0.551 | 0.524 | -0.004 [-0.025, 0.016] | no_detectable_incremental_effect |
| SPP | paramType: small/none | lr | 0.737 | 0.504 | 0.137 [0.102, 0.174] | padding_reduces_leakage |
| SPP | paramType: small/none | rf | 0.834 | 0.472 | 0.216 [0.181, 0.251] | padding_reduces_leakage |
| SPP | predicateCombo: few/many | lr | 0.601 | 0.493 | 0.068 [0.049, 0.086] | padding_reduces_leakage |
| SPP | predicateCombo: few/many | rf | 0.631 | 0.520 | 0.077 [0.058, 0.096] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | lr | 0.427 | 0.490 | 0.247 [0.229, 0.267] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | rf | 0.805 | 0.490 | 0.264 [0.246, 0.283] | padding_reduces_leakage |
| SPP | predicateCombo: single/many | lr | 0.390 | 0.441 | 0.170 [0.143, 0.194] | padding_reduces_leakage |
| SPP | predicateCombo: single/many | rf | 0.777 | 0.482 | 0.228 [0.204, 0.251] | padding_reduces_leakage |
| SPP | structureType: and_only/and_or_mixed | lr | 0.469 | 0.441 | -0.023 [-0.044, -0.002] | padding_increases_leakage |
| SPP | structureType: and_only/and_or_mixed | rf | 0.653 | 0.441 | 0.083 [0.060, 0.108] | padding_reduces_leakage |
| SPP | structureType: and_only/or_only | lr | 0.461 | 0.475 | 0.006 [-0.016, 0.029] | no_detectable_incremental_effect |
| SPP | structureType: and_only/or_only | rf | 0.582 | 0.475 | 0.030 [0.008, 0.055] | padding_reduces_leakage |
| SPP | structureType: or_only/and_or_mixed | lr | 0.477 | 0.448 | -0.002 [-0.025, 0.021] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | rf | 0.542 | 0.516 | -0.010 [-0.035, 0.015] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_only | lr | 0.468 | 0.466 | 0.194 [0.171, 0.219] | padding_reduces_leakage |
| SPP | structureType: trivial/and_only | rf | 0.759 | 0.444 | 0.180 [0.153, 0.207] | padding_reduces_leakage |
| SPP | structureType: trivial/and_or_mixed | lr | 0.371 | 0.453 | 0.271 [0.250, 0.292] | padding_reduces_leakage |
| SPP | structureType: trivial/and_or_mixed | rf | 0.856 | 0.456 | 0.290 [0.266, 0.312] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | lr | 0.366 | 0.471 | 0.240 [0.215, 0.262] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | rf | 0.858 | 0.490 | 0.288 [0.266, 0.308] | padding_reduces_leakage |

## Gas overhead

- commitGasUsed: B1 219737, B2 304098, increase 38.4%.
- accessGasUsed: B1 723462, B2 1056674, increase 46.1%.

## Clustering

- pch_duo: NMI B1−B2 0.3488 [0.3156, 0.4070] (policy-group bootstrap).
- pch_icd10: NMI B1−B2 0.0833 [0.0478, 0.2327] (policy-group bootstrap).
- logicStructure: NMI B1−B2 0.1023 [0.0179, 0.1384] (policy-group bootstrap).
- nestingDepth: NMI B1−B2 0.0768 [0.0151, 0.1173] (policy-group bootstrap).
- predicateCount: NMI B1−B2 0.0512 [0.0100, 0.0900] (policy-group bootstrap).
- setSize: NMI B1−B2 0.0349 [0.0113, 0.0660] (policy-group bootstrap).
- PI balanced pairs: debiased NMI B1−B2 0.6697 [0.5913, 0.7433] across 127 pairs.

## Limitation

B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.
