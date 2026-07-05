# B1/B2 Gas Padding Ablation

Positive Δleakage means B2 padding reduced |AUC−0.5| relative to B1.

## Supervised attacks

| Experiment | Task | Classifier | B1 AUC | B2 AUC | Δleakage (95% CI) | Interpretation |
|---|---|---:|---:|---:|---:|---|
| PCH | DUO CC | lr | 0.447 | 0.509 | 0.056 [0.037, 0.073] | padding_reduces_leakage |
| PCH | DUO CC | rf | 0.572 | 0.504 | 0.069 [0.046, 0.090] | padding_reduces_leakage |
| PCH | DUO DS | lr | 0.509 | 0.529 | 0.054 [0.029, 0.076] | padding_reduces_leakage |
| PCH | DUO DS | rf | 0.506 | 0.501 | 0.022 [0.006, 0.039] | padding_reduces_leakage |
| PCH | DUO GR | lr | 0.328 | 0.511 | 0.150 [0.122, 0.183] | padding_reduces_leakage |
| PCH | DUO GR | rf | 0.595 | 0.487 | 0.075 [0.047, 0.102] | padding_reduces_leakage |
| PCH | DUO GS | lr | 0.624 | 0.479 | 0.100 [0.076, 0.125] | padding_reduces_leakage |
| PCH | DUO GS | rf | 0.574 | 0.507 | 0.071 [0.049, 0.095] | padding_reduces_leakage |
| PCH | DUO POA | lr | 0.518 | 0.488 | 0.070 [0.049, 0.090] | padding_reduces_leakage |
| PCH | DUO POA | rf | 0.616 | 0.491 | 0.092 [0.071, 0.114] | padding_reduces_leakage |
| PCH | DUO RS | lr | 0.594 | 0.496 | 0.085 [0.060, 0.108] | padding_reduces_leakage |
| PCH | DUO RS | rf | 0.487 | 0.521 | 0.033 [0.015, 0.051] | padding_reduces_leakage |
| PCH | ICD ch0 | lr | 0.477 | 0.499 | 0.001 [-0.019, 0.024] | no_detectable_incremental_effect |
| PCH | ICD ch0 | rf | 0.554 | 0.444 | -0.009 [-0.024, 0.010] | no_detectable_incremental_effect |
| PCH | ICD ch1 | lr | 0.732 | 0.447 | 0.163 [0.118, 0.210] | padding_reduces_leakage |
| PCH | ICD ch1 | rf | 0.539 | 0.412 | -0.058 [-0.090, -0.025] | padding_increases_leakage |
| PCH | ICD ch2 | lr | 0.586 | 0.479 | 0.137 [0.083, 0.185] | padding_reduces_leakage |
| PCH | ICD ch2 | rf | 0.546 | 0.511 | -0.015 [-0.061, 0.024] | no_detectable_incremental_effect |
| PCH | ICD ch3 | lr | 0.470 | 0.535 | 0.072 [0.037, 0.112] | padding_reduces_leakage |
| PCH | ICD ch3 | rf | 0.499 | 0.454 | -0.081 [-0.111, -0.057] | padding_increases_leakage |
| PCH | ICD ch4 | lr | 0.350 | 0.532 | 0.128 [0.068, 0.181] | padding_reduces_leakage |
| PCH | ICD ch4 | rf | 0.502 | 0.524 | -0.027 [-0.052, -0.005] | padding_increases_leakage |
| PCH | ICD ch5 | lr | 0.412 | 0.453 | 0.064 [0.001, 0.123] | padding_reduces_leakage |
| PCH | ICD ch5 | rf | 0.518 | 0.462 | -0.020 [-0.068, 0.016] | no_detectable_incremental_effect |
| PCH | ICD ch6 | lr | 0.434 | 0.528 | 0.054 [0.027, 0.082] | padding_reduces_leakage |
| PCH | ICD ch6 | rf | 0.485 | 0.526 | -0.046 [-0.060, -0.031] | padding_increases_leakage |
| PCH | ICD ch7 | lr | 0.625 | 0.421 | 0.069 [0.031, 0.111] | padding_reduces_leakage |
| PCH | ICD ch7 | rf | 0.513 | 0.425 | -0.050 [-0.070, -0.030] | padding_increases_leakage |
| PCH | ICD ch8 | lr | 0.732 | 0.506 | 0.177 [0.120, 0.233] | padding_reduces_leakage |
| PCH | ICD ch8 | rf | 0.651 | 0.392 | 0.048 [-0.014, 0.112] | no_detectable_incremental_effect |
| PCH | ICD ch9 | lr | 0.467 | 0.530 | 0.058 [0.035, 0.082] | padding_reduces_leakage |
| PCH | ICD ch9 | rf | 0.512 | 0.480 | -0.032 [-0.048, -0.018] | padding_increases_leakage |
| PI | controlled_difference | lr | 0.415 | 0.512 | 0.155 [0.119, 0.199] | padding_reduces_leakage |
| PI | controlled_difference | rf | 0.611 | 0.515 | 0.102 [0.076, 0.129] | padding_reduces_leakage |
| PI | overall | lr | 0.451 | 0.468 | 0.084 [0.057, 0.111] | padding_reduces_leakage |
| PI | overall | rf | 0.574 | 0.478 | 0.052 [0.030, 0.076] | padding_reduces_leakage |
| PI | semantic_equivalent | lr | 0.491 | 0.491 | 0.036 [-0.006, 0.080] | no_detectable_incremental_effect |
| PI | semantic_equivalent | rf | 0.360 | 0.479 | 0.097 [0.039, 0.147] | padding_reduces_leakage |
| PI | structural_variant | lr | 0.486 | 0.491 | 0.018 [-0.019, 0.054] | no_detectable_incremental_effect |
| PI | structural_variant | rf | 0.439 | 0.559 | -0.002 [-0.046, 0.042] | no_detectable_incremental_effect |
| PI | weak_equivalent | lr | 0.277 | 0.278 | -0.086 [-0.160, 0.002] | no_detectable_incremental_effect |
| PI | weak_equivalent | rf | 0.391 | 0.492 | 0.005 [-0.052, 0.079] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | lr | 0.595 | 0.461 | 0.044 [0.023, 0.065] | padding_reduces_leakage |
| SPP | paramType: medium/large | rf | 0.537 | 0.527 | -0.002 [-0.026, 0.022] | no_detectable_incremental_effect |
| SPP | paramType: none/large | lr | 0.497 | 0.557 | -0.008 [-0.084, 0.069] | no_detectable_incremental_effect |
| SPP | paramType: none/large | rf | 0.544 | 0.519 | 0.098 [0.016, 0.179] | padding_reduces_leakage |
| SPP | paramType: none/medium | lr | 0.491 | 0.493 | -0.069 [-0.116, -0.023] | padding_increases_leakage |
| SPP | paramType: none/medium | rf | 0.584 | 0.516 | 0.003 [-0.072, 0.065] | no_detectable_incremental_effect |
| SPP | paramType: none/small | lr | 0.816 | 0.482 | 0.128 [0.061, 0.197] | padding_reduces_leakage |
| SPP | paramType: none/small | rf | 0.812 | 0.414 | 0.127 [0.055, 0.201] | padding_reduces_leakage |
| SPP | paramType: small/large | lr | 0.789 | 0.542 | 0.214 [0.183, 0.249] | padding_reduces_leakage |
| SPP | paramType: small/large | rf | 0.752 | 0.531 | 0.196 [0.163, 0.227] | padding_reduces_leakage |
| SPP | paramType: small/medium | lr | 0.697 | 0.509 | 0.139 [0.106, 0.173] | padding_reduces_leakage |
| SPP | paramType: small/medium | rf | 0.659 | 0.515 | 0.101 [0.071, 0.132] | padding_reduces_leakage |
| SPP | predicateCombo: few/many | lr | 0.534 | 0.456 | -0.009 [-0.030, 0.011] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | rf | 0.482 | 0.480 | -0.004 [-0.026, 0.018] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/few | lr | 0.537 | 0.491 | -0.094 [-0.162, -0.026] | padding_increases_leakage |
| SPP | predicateCombo: none/few | rf | 0.573 | 0.513 | -0.039 [-0.098, 0.019] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/many | lr | 0.506 | 0.508 | -0.021 [-0.098, 0.056] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/many | rf | 0.599 | 0.458 | -0.010 [-0.075, 0.053] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/single | lr | 0.780 | 0.374 | 0.080 [-0.003, 0.158] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/single | rf | 0.785 | 0.388 | 0.125 [0.058, 0.192] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | lr | 0.747 | 0.493 | 0.192 [0.157, 0.229] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | rf | 0.715 | 0.489 | 0.157 [0.124, 0.192] | padding_reduces_leakage |
| SPP | predicateCombo: single/many | lr | 0.784 | 0.521 | 0.215 [0.183, 0.248] | padding_reduces_leakage |
| SPP | predicateCombo: single/many | rf | 0.740 | 0.535 | 0.174 [0.133, 0.214] | padding_reduces_leakage |
| SPP | structureType: and_only/and_or_mixed | lr | 0.710 | 0.440 | 0.128 [0.086, 0.167] | padding_reduces_leakage |
| SPP | structureType: and_only/and_or_mixed | rf | 0.655 | 0.468 | 0.074 [0.042, 0.107] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_only | lr | 0.743 | 0.451 | 0.171 [0.131, 0.203] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_only | rf | 0.704 | 0.419 | 0.112 [0.066, 0.158] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_or_mixed | lr | 0.515 | 0.455 | 0.008 [-0.012, 0.029] | no_detectable_incremental_effect |
| SPP | structureType: negation_heavy/and_or_mixed | rf | 0.488 | 0.493 | -0.002 [-0.027, 0.027] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_only | lr | 0.649 | 0.430 | 0.067 [0.025, 0.114] | padding_reduces_leakage |
| SPP | structureType: or_only/and_only | rf | 0.593 | 0.441 | 0.015 [-0.018, 0.048] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | lr | 0.544 | 0.492 | 0.010 [-0.015, 0.033] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | rf | 0.499 | 0.529 | -0.009 [-0.035, 0.016] | no_detectable_incremental_effect |
| SPP | structureType: or_only/negation_heavy | lr | 0.570 | 0.463 | 0.022 [-0.006, 0.051] | no_detectable_incremental_effect |
| SPP | structureType: or_only/negation_heavy | rf | 0.549 | 0.446 | -0.000 [-0.023, 0.024] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_only | lr | 0.519 | 0.593 | 0.038 [-0.006, 0.080] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_only | rf | 0.622 | 0.496 | 0.050 [-0.000, 0.096] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_or_mixed | lr | 0.393 | 0.556 | 0.221 [0.191, 0.254] | padding_reduces_leakage |
| SPP | structureType: trivial/and_or_mixed | rf | 0.814 | 0.545 | 0.232 [0.203, 0.262] | padding_reduces_leakage |
| SPP | structureType: trivial/negation_heavy | lr | 0.346 | 0.571 | 0.228 [0.196, 0.259] | padding_reduces_leakage |
| SPP | structureType: trivial/negation_heavy | rf | 0.831 | 0.522 | 0.264 [0.238, 0.290] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | lr | 0.317 | 0.561 | 0.143 [0.107, 0.175] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | rf | 0.762 | 0.522 | 0.185 [0.158, 0.210] | padding_reduces_leakage |

## Gas overhead

- commitGasUsed: B1 216562, B2 303556, increase 40.2%.
- accessGasUsed: B1 546876, B2 753310, increase 37.7%.

## Clustering

- pch_duo: NMI B1−B2 0.0408 [0.0145, 0.1623] (policy-group bootstrap).
- pch_icd10: NMI B1−B2 0.1354 [0.0805, 0.2261] (policy-group bootstrap).
- logicStructure: NMI B1−B2 0.0823 [0.0329, 0.1174] (policy-group bootstrap).
- nestingDepth: NMI B1−B2 0.0665 [0.0155, 0.1072] (policy-group bootstrap).
- predicateCount: NMI B1−B2 0.0675 [0.0156, 0.1116] (policy-group bootstrap).
- setSize: NMI B1−B2 0.0685 [0.0073, 0.1103] (policy-group bootstrap).
- PI balanced pairs: debiased NMI B1−B2 0.4815 [0.4065, 0.5611] across 133 pairs.

## Limitation

B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.
