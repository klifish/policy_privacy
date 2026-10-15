# B1/B2 Gas Padding Ablation

Positive Δleakage means B2 padding reduced |AUC−0.5| relative to B1.
Supervised 95% intervals are repeated-split stability intervals; seeded holdouts overlap and are not independent samples.

## Supervised attacks

| Experiment | Task | Classifier | B1 AUC | B2 AUC | Δleakage (95% CI) | Interpretation |
|---|---|---:|---:|---:|---:|---|
| PCH | DUO CC | lr | 0.506 | 0.529 | -0.017 [-0.026, -0.009] | padding_increases_leakage |
| PCH | DUO CC | rf | 0.490 | 0.524 | -0.007 [-0.015, 0.001] | no_detectable_incremental_effect |
| PCH | DUO DS | lr | 0.497 | 0.473 | -0.000 [-0.011, 0.010] | no_detectable_incremental_effect |
| PCH | DUO DS | rf | 0.474 | 0.519 | 0.007 [-0.003, 0.017] | no_detectable_incremental_effect |
| PCH | DUO GR | lr | 0.504 | 0.481 | 0.001 [-0.008, 0.010] | no_detectable_incremental_effect |
| PCH | DUO GR | rf | 0.503 | 0.477 | -0.014 [-0.022, -0.006] | padding_increases_leakage |
| PCH | DUO GS | lr | 0.485 | 0.506 | 0.009 [-0.001, 0.019] | no_detectable_incremental_effect |
| PCH | DUO GS | rf | 0.508 | 0.502 | -0.007 [-0.014, 0.000] | no_detectable_incremental_effect |
| PCH | DUO GSO | lr | 0.508 | 0.449 | -0.025 [-0.038, -0.013] | padding_increases_leakage |
| PCH | DUO GSO | rf | 0.517 | 0.499 | -0.012 [-0.021, -0.003] | padding_increases_leakage |
| PCH | DUO HMB | lr | 0.495 | 0.462 | -0.014 [-0.026, -0.002] | padding_increases_leakage |
| PCH | DUO HMB | rf | 0.516 | 0.500 | -0.002 [-0.012, 0.006] | no_detectable_incremental_effect |
| PCH | DUO NCU | lr | 0.483 | 0.531 | -0.003 [-0.013, 0.006] | no_detectable_incremental_effect |
| PCH | DUO NCU | rf | 0.501 | 0.500 | -0.007 [-0.016, 0.001] | no_detectable_incremental_effect |
| PCH | DUO NMDS | lr | 0.515 | 0.438 | -0.033 [-0.046, -0.021] | padding_increases_leakage |
| PCH | DUO NMDS | rf | 0.508 | 0.526 | -0.016 [-0.027, -0.006] | padding_increases_leakage |
| PCH | DUO POA | lr | 0.492 | 0.501 | 0.004 [-0.004, 0.012] | no_detectable_incremental_effect |
| PCH | DUO POA | rf | 0.499 | 0.508 | -0.001 [-0.009, 0.007] | no_detectable_incremental_effect |
| PCH | DUO RS | lr | 0.489 | 0.516 | -0.008 [-0.016, -0.000] | padding_increases_leakage |
| PCH | DUO RS | rf | 0.497 | 0.490 | 0.001 [-0.005, 0.006] | no_detectable_incremental_effect |
| PCH | ICD ch0 | lr | 0.517 | 0.535 | 0.027 [0.000, 0.055] | padding_reduces_leakage |
| PCH | ICD ch0 | rf | 0.490 | 0.514 | -0.048 [-0.067, -0.030] | padding_increases_leakage |
| PCH | ICD ch1 | lr | 0.535 | 0.483 | 0.016 [-0.002, 0.038] | no_detectable_incremental_effect |
| PCH | ICD ch1 | rf | 0.509 | 0.515 | -0.022 [-0.040, -0.004] | padding_increases_leakage |
| PCH | ICD ch2 | lr | 0.535 | 0.596 | -0.034 [-0.066, -0.003] | padding_increases_leakage |
| PCH | ICD ch2 | rf | 0.493 | 0.586 | -0.071 [-0.095, -0.048] | padding_increases_leakage |
| PCH | ICD ch3 | lr | 0.485 | 0.439 | -0.037 [-0.061, -0.015] | padding_increases_leakage |
| PCH | ICD ch3 | rf | 0.502 | 0.484 | -0.028 [-0.044, -0.014] | padding_increases_leakage |
| PCH | ICD ch4 | lr | 0.530 | 0.480 | -0.020 [-0.042, -0.001] | padding_increases_leakage |
| PCH | ICD ch4 | rf | 0.573 | 0.484 | 0.024 [0.003, 0.049] | padding_reduces_leakage |
| PCH | ICD ch5 | lr | 0.571 | 0.480 | 0.015 [-0.010, 0.037] | no_detectable_incremental_effect |
| PCH | ICD ch5 | rf | 0.504 | 0.461 | -0.039 [-0.061, -0.015] | padding_increases_leakage |
| PCH | ICD ch6 | lr | 0.457 | 0.507 | 0.004 [-0.022, 0.032] | no_detectable_incremental_effect |
| PCH | ICD ch6 | rf | 0.492 | 0.475 | -0.020 [-0.038, -0.003] | padding_increases_leakage |
| PCH | ICD ch7 | lr | 0.517 | 0.508 | 0.005 [-0.014, 0.027] | no_detectable_incremental_effect |
| PCH | ICD ch7 | rf | 0.497 | 0.541 | -0.065 [-0.091, -0.038] | padding_increases_leakage |
| PCH | ICD ch8 | lr | 0.476 | 0.475 | -0.008 [-0.038, 0.020] | no_detectable_incremental_effect |
| PCH | ICD ch8 | rf | 0.501 | 0.615 | -0.090 [-0.118, -0.063] | padding_increases_leakage |
| PCH | ICD ch9 | lr | 0.481 | 0.524 | -0.008 [-0.031, 0.016] | no_detectable_incremental_effect |
| PCH | ICD ch9 | rf | 0.488 | 0.509 | -0.029 [-0.044, -0.013] | padding_increases_leakage |
| PI | controlled_difference | lr | 0.479 | 0.520 | -0.006 [-0.021, 0.007] | no_detectable_incremental_effect |
| PI | controlled_difference | rf | 0.442 | 0.499 | 0.027 [0.017, 0.036] | padding_reduces_leakage |
| PI | semantic_equivalent | lr | 0.527 | 0.515 | -0.000 [-0.009, 0.010] | no_detectable_incremental_effect |
| PI | semantic_equivalent | rf | 0.544 | 0.530 | 0.007 [-0.008, 0.022] | no_detectable_incremental_effect |
| PI | weak_equivalent | lr | 0.467 | 0.499 | 0.006 [-0.008, 0.019] | no_detectable_incremental_effect |
| PI | weak_equivalent | rf | 0.505 | 0.480 | -0.010 [-0.021, 0.001] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/deep | lr | 0.523 | 0.525 | -0.012 [-0.026, 0.003] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/deep | rf | 0.509 | 0.521 | 0.001 [-0.013, 0.016] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/medium | lr | 0.581 | 0.535 | 0.028 [0.011, 0.044] | padding_reduces_leakage |
| SPP | nestingDepth: flat/medium | rf | 0.523 | 0.541 | -0.006 [-0.022, 0.011] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/shallow | lr | 0.557 | 0.535 | 0.021 [0.000, 0.041] | padding_reduces_leakage |
| SPP | nestingDepth: flat/shallow | rf | 0.524 | 0.528 | 0.004 [-0.015, 0.025] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | lr | 0.509 | 0.497 | -0.001 [-0.013, 0.010] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | rf | 0.504 | 0.478 | -0.010 [-0.022, 0.000] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/deep | lr | 0.471 | 0.494 | 0.004 [-0.005, 0.015] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/deep | rf | 0.486 | 0.468 | -0.007 [-0.020, 0.007] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | lr | 0.494 | 0.519 | -0.010 [-0.022, 0.001] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | rf | 0.519 | 0.495 | 0.008 [-0.003, 0.019] | no_detectable_incremental_effect |
| SPP | paramType: large/none | lr | 0.513 | 0.498 | -0.017 [-0.030, -0.002] | padding_increases_leakage |
| SPP | paramType: large/none | rf | 0.524 | 0.486 | 0.011 [-0.001, 0.024] | no_detectable_incremental_effect |
| SPP | paramType: large/small | lr | 0.519 | 0.493 | -0.003 [-0.016, 0.009] | no_detectable_incremental_effect |
| SPP | paramType: large/small | rf | 0.517 | 0.481 | -0.004 [-0.015, 0.007] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | lr | 0.476 | 0.503 | 0.002 [-0.008, 0.011] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | rf | 0.470 | 0.516 | 0.009 [-0.003, 0.024] | no_detectable_incremental_effect |
| SPP | paramType: medium/none | lr | 0.503 | 0.534 | -0.024 [-0.043, -0.003] | padding_increases_leakage |
| SPP | paramType: medium/none | rf | 0.496 | 0.511 | 0.010 [-0.001, 0.021] | no_detectable_incremental_effect |
| SPP | paramType: medium/small | lr | 0.536 | 0.501 | 0.013 [0.001, 0.024] | padding_reduces_leakage |
| SPP | paramType: medium/small | rf | 0.531 | 0.507 | 0.001 [-0.009, 0.013] | no_detectable_incremental_effect |
| SPP | paramType: small/none | lr | 0.473 | 0.474 | -0.003 [-0.020, 0.014] | no_detectable_incremental_effect |
| SPP | paramType: small/none | rf | 0.506 | 0.471 | -0.006 [-0.021, 0.011] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | lr | 0.510 | 0.508 | 0.004 [-0.009, 0.019] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | rf | 0.520 | 0.509 | 0.001 [-0.011, 0.014] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/few | lr | 0.517 | 0.532 | -0.009 [-0.019, -0.000] | padding_increases_leakage |
| SPP | predicateCombo: single/few | rf | 0.504 | 0.520 | -0.006 [-0.017, 0.006] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/many | lr | 0.499 | 0.480 | 0.004 [-0.010, 0.017] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/many | rf | 0.466 | 0.458 | 0.003 [-0.015, 0.020] | no_detectable_incremental_effect |
| SPP | structureType: and_only/and_or_mixed | lr | 0.491 | 0.503 | -0.005 [-0.017, 0.005] | no_detectable_incremental_effect |
| SPP | structureType: and_only/and_or_mixed | rf | 0.504 | 0.509 | -0.002 [-0.014, 0.009] | no_detectable_incremental_effect |
| SPP | structureType: and_only/or_only | lr | 0.497 | 0.501 | 0.029 [0.018, 0.040] | padding_reduces_leakage |
| SPP | structureType: and_only/or_only | rf | 0.543 | 0.488 | 0.012 [-0.000, 0.025] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | lr | 0.485 | 0.491 | 0.009 [-0.004, 0.022] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | rf | 0.552 | 0.512 | 0.018 [0.007, 0.031] | padding_reduces_leakage |
| SPP | structureType: trivial/and_only | lr | 0.532 | 0.490 | -0.000 [-0.018, 0.015] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_only | rf | 0.490 | 0.516 | 0.015 [0.002, 0.027] | padding_reduces_leakage |
| SPP | structureType: trivial/and_or_mixed | lr | 0.546 | 0.540 | 0.006 [-0.015, 0.027] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_or_mixed | rf | 0.511 | 0.552 | -0.014 [-0.034, 0.006] | no_detectable_incremental_effect |
| SPP | structureType: trivial/or_only | lr | 0.572 | 0.517 | 0.026 [0.007, 0.046] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | rf | 0.550 | 0.533 | 0.011 [-0.005, 0.025] | no_detectable_incremental_effect |

## Gas overhead

- commitGasUsed: B1 219757, B2 304348, increase 38.5%.
- accessGasUsed: B1 723565, B2 1051786, increase 45.4%.

## Clustering

- pch_duo: NMI B1−B2 0.0040 [-0.0034, 0.0102] (policy-group bootstrap).
- pch_icd10: NMI B1−B2 -0.0021 [-0.0257, 0.0145] (policy-group bootstrap).
- logicStructure: NMI B1−B2 0.0009 [-0.0049, 0.0074] (policy-group bootstrap).
- nestingDepth: NMI B1−B2 0.0033 [-0.0039, 0.0103] (policy-group bootstrap).
- predicateCount: NMI B1−B2 0.0009 [-0.0045, 0.0061] (policy-group bootstrap).
- setSize: NMI B1−B2 -0.0002 [-0.0051, 0.0042] (policy-group bootstrap).
- PI balanced pairs: debiased NMI B1−B2 -0.0010 [-0.0189, 0.0187] across 30 pairs.

## Limitation

B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.
