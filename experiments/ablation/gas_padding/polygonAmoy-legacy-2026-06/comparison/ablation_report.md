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
| SPP | nestingDepth: flat/deep | lr | 0.320 | 0.503 | 0.272 [0.233, 0.315] | padding_reduces_leakage |
| SPP | nestingDepth: flat/deep | rf | 0.817 | 0.497 | 0.270 [0.232, 0.300] | padding_reduces_leakage |
| SPP | nestingDepth: flat/medium | lr | 0.394 | 0.461 | 0.319 [0.286, 0.351] | padding_reduces_leakage |
| SPP | nestingDepth: flat/medium | rf | 0.847 | 0.486 | 0.304 [0.262, 0.340] | padding_reduces_leakage |
| SPP | nestingDepth: flat/shallow | lr | 0.435 | 0.504 | 0.135 [0.106, 0.168] | padding_reduces_leakage |
| SPP | nestingDepth: flat/shallow | rf | 0.614 | 0.482 | 0.126 [0.097, 0.157] | padding_reduces_leakage |
| SPP | nestingDepth: medium/deep | lr | 0.519 | 0.487 | 0.105 [0.066, 0.148] | padding_reduces_leakage |
| SPP | nestingDepth: medium/deep | rf | 0.521 | 0.503 | 0.110 [0.072, 0.149] | padding_reduces_leakage |
| SPP | nestingDepth: shallow/deep | lr | 0.580 | 0.468 | 0.077 [0.046, 0.104] | padding_reduces_leakage |
| SPP | nestingDepth: shallow/deep | rf | 0.538 | 0.470 | 0.074 [0.044, 0.104] | padding_reduces_leakage |
| SPP | nestingDepth: shallow/medium | lr | 0.695 | 0.495 | 0.155 [0.120, 0.189] | padding_reduces_leakage |
| SPP | nestingDepth: shallow/medium | rf | 0.689 | 0.495 | 0.146 [0.105, 0.183] | padding_reduces_leakage |
| SPP | paramType: medium/large | lr | 0.557 | 0.481 | 0.053 [0.035, 0.072] | padding_reduces_leakage |
| SPP | paramType: medium/large | rf | 0.496 | 0.485 | 0.022 [0.006, 0.040] | padding_reduces_leakage |
| SPP | paramType: none/large | lr | 0.504 | 0.529 | 0.084 [0.024, 0.145] | padding_reduces_leakage |
| SPP | paramType: none/large | rf | 0.538 | 0.425 | 0.076 [0.017, 0.131] | padding_reduces_leakage |
| SPP | paramType: none/medium | lr | 0.502 | 0.489 | -0.057 [-0.111, -0.010] | padding_increases_leakage |
| SPP | paramType: none/medium | rf | 0.631 | 0.404 | 0.043 [-0.015, 0.105] | no_detectable_incremental_effect |
| SPP | paramType: none/small | lr | 0.771 | 0.484 | 0.126 [0.056, 0.197] | padding_reduces_leakage |
| SPP | paramType: none/small | rf | 0.725 | 0.401 | 0.094 [0.039, 0.150] | padding_reduces_leakage |
| SPP | paramType: small/large | lr | 0.756 | 0.478 | 0.220 [0.171, 0.266] | padding_reduces_leakage |
| SPP | paramType: small/large | rf | 0.752 | 0.497 | 0.218 [0.174, 0.257] | padding_reduces_leakage |
| SPP | paramType: small/medium | lr | 0.623 | 0.468 | 0.139 [0.104, 0.180] | padding_reduces_leakage |
| SPP | paramType: small/medium | rf | 0.609 | 0.479 | 0.119 [0.089, 0.151] | padding_reduces_leakage |
| SPP | predicateCombo: few/many | lr | 0.539 | 0.477 | 0.040 [0.013, 0.069] | padding_reduces_leakage |
| SPP | predicateCombo: few/many | rf | 0.488 | 0.494 | 0.036 [0.014, 0.057] | padding_reduces_leakage |
| SPP | predicateCombo: none/few | lr | 0.568 | 0.516 | 0.026 [-0.049, 0.104] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/few | rf | 0.706 | 0.415 | 0.089 [0.019, 0.153] | padding_reduces_leakage |
| SPP | predicateCombo: none/many | lr | 0.510 | 0.486 | 0.045 [-0.023, 0.105] | no_detectable_incremental_effect |
| SPP | predicateCombo: none/many | rf | 0.699 | 0.428 | 0.081 [0.028, 0.141] | padding_reduces_leakage |
| SPP | predicateCombo: none/single | lr | 0.781 | 0.503 | 0.129 [0.059, 0.201] | padding_reduces_leakage |
| SPP | predicateCombo: none/single | rf | 0.770 | 0.368 | 0.143 [0.078, 0.213] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | lr | 0.668 | 0.487 | 0.149 [0.113, 0.181] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | rf | 0.678 | 0.473 | 0.142 [0.109, 0.172] | padding_reduces_leakage |
| SPP | predicateCombo: single/many | lr | 0.730 | 0.473 | 0.193 [0.156, 0.232] | padding_reduces_leakage |
| SPP | predicateCombo: single/many | rf | 0.728 | 0.476 | 0.182 [0.134, 0.224] | padding_reduces_leakage |
| SPP | structureType: and_only/and_or_mixed | lr | 0.810 | 0.463 | 0.261 [0.218, 0.301] | padding_reduces_leakage |
| SPP | structureType: and_only/and_or_mixed | rf | 0.798 | 0.457 | 0.243 [0.198, 0.286] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_only | lr | 0.766 | 0.476 | 0.237 [0.193, 0.275] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_only | rf | 0.766 | 0.450 | 0.226 [0.181, 0.270] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_or_mixed | lr | 0.508 | 0.485 | 0.057 [0.030, 0.084] | padding_reduces_leakage |
| SPP | structureType: negation_heavy/and_or_mixed | rf | 0.597 | 0.466 | 0.076 [0.048, 0.103] | padding_reduces_leakage |
| SPP | structureType: or_only/and_only | lr | 0.743 | 0.449 | 0.201 [0.165, 0.248] | padding_reduces_leakage |
| SPP | structureType: or_only/and_only | rf | 0.713 | 0.433 | 0.155 [0.100, 0.205] | padding_reduces_leakage |
| SPP | structureType: or_only/and_or_mixed | lr | 0.577 | 0.471 | 0.067 [0.039, 0.095] | padding_reduces_leakage |
| SPP | structureType: or_only/and_or_mixed | rf | 0.523 | 0.482 | 0.082 [0.040, 0.121] | padding_reduces_leakage |
| SPP | structureType: or_only/negation_heavy | lr | 0.407 | 0.468 | 0.082 [0.051, 0.115] | padding_reduces_leakage |
| SPP | structureType: or_only/negation_heavy | rf | 0.423 | 0.455 | 0.057 [0.029, 0.095] | padding_reduces_leakage |
| SPP | structureType: trivial/and_only | lr | 0.550 | 0.539 | 0.106 [0.059, 0.156] | padding_reduces_leakage |
| SPP | structureType: trivial/and_only | rf | 0.603 | 0.446 | 0.126 [0.080, 0.177] | padding_reduces_leakage |
| SPP | structureType: trivial/and_or_mixed | lr | 0.344 | 0.501 | 0.285 [0.247, 0.323] | padding_reduces_leakage |
| SPP | structureType: trivial/and_or_mixed | rf | 0.846 | 0.504 | 0.291 [0.259, 0.327] | padding_reduces_leakage |
| SPP | structureType: trivial/negation_heavy | lr | 0.369 | 0.536 | 0.220 [0.166, 0.272] | padding_reduces_leakage |
| SPP | structureType: trivial/negation_heavy | rf | 0.747 | 0.495 | 0.215 [0.173, 0.250] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | lr | 0.319 | 0.482 | 0.189 [0.136, 0.236] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | rf | 0.749 | 0.470 | 0.208 [0.168, 0.244] | padding_reduces_leakage |

## Gas overhead

- commitGasUsed: B1 216562, B2 303556, increase 40.2%.
- accessGasUsed: B1 546876, B2 753310, increase 37.7%.

## Clustering

- pch_duo: NMI B1−B2 0.0408 [0.0154, 0.1565] (policy-group bootstrap).
- pch_icd10: NMI B1−B2 0.1354 [0.0857, 0.2325] (policy-group bootstrap).
- logicStructure: NMI B1−B2 0.0823 [0.0346, 0.1153] (policy-group bootstrap).
- nestingDepth: NMI B1−B2 0.0665 [0.0146, 0.1116] (policy-group bootstrap).
- predicateCount: NMI B1−B2 0.0675 [0.0167, 0.1151] (policy-group bootstrap).
- setSize: NMI B1−B2 0.0685 [0.0113, 0.1081] (policy-group bootstrap).
- PI balanced pairs: debiased NMI B1−B2 0.4815 [0.4075, 0.5475] across 133 pairs.

## Limitation

B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.
