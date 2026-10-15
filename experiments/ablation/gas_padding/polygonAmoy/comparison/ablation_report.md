# B1/B2 Gas Padding Ablation

Positive Δleakage means B2 padding reduced |AUC−0.5| relative to B1.
Supervised 95% intervals are repeated-split stability intervals; seeded holdouts overlap and are not independent samples.

## Supervised attacks

| Experiment | Task | Classifier | B1 AUC | B2 AUC | Δleakage (95% CI) | Interpretation |
|---|---|---:|---:|---:|---:|---|
| PCH | DUO CC | lr | 0.507 | 0.528 | -0.016 [-0.027, -0.007] | padding_increases_leakage |
| PCH | DUO CC | rf | 0.498 | 0.526 | -0.010 [-0.018, -0.001] | padding_increases_leakage |
| PCH | DUO DS | lr | 0.498 | 0.475 | 0.004 [-0.008, 0.014] | no_detectable_incremental_effect |
| PCH | DUO DS | rf | 0.480 | 0.525 | 0.000 [-0.010, 0.011] | no_detectable_incremental_effect |
| PCH | DUO GR | lr | 0.511 | 0.482 | -0.002 [-0.012, 0.007] | no_detectable_incremental_effect |
| PCH | DUO GR | rf | 0.507 | 0.477 | -0.016 [-0.025, -0.007] | padding_increases_leakage |
| PCH | DUO GS | lr | 0.480 | 0.507 | 0.012 [0.002, 0.021] | padding_reduces_leakage |
| PCH | DUO GS | rf | 0.513 | 0.503 | 0.001 [-0.008, 0.011] | no_detectable_incremental_effect |
| PCH | DUO GSO | lr | 0.509 | 0.449 | -0.022 [-0.035, -0.008] | padding_increases_leakage |
| PCH | DUO GSO | rf | 0.519 | 0.499 | -0.014 [-0.023, -0.005] | padding_increases_leakage |
| PCH | DUO HMB | lr | 0.491 | 0.464 | -0.006 [-0.020, 0.006] | no_detectable_incremental_effect |
| PCH | DUO HMB | rf | 0.521 | 0.499 | 0.000 [-0.007, 0.007] | no_detectable_incremental_effect |
| PCH | DUO NCU | lr | 0.482 | 0.530 | -0.001 [-0.013, 0.008] | no_detectable_incremental_effect |
| PCH | DUO NCU | rf | 0.497 | 0.501 | -0.004 [-0.011, 0.004] | no_detectable_incremental_effect |
| PCH | DUO NMDS | lr | 0.515 | 0.437 | -0.031 [-0.044, -0.018] | padding_increases_leakage |
| PCH | DUO NMDS | rf | 0.508 | 0.535 | -0.023 [-0.033, -0.013] | padding_increases_leakage |
| PCH | DUO POA | lr | 0.493 | 0.501 | 0.005 [-0.004, 0.013] | no_detectable_incremental_effect |
| PCH | DUO POA | rf | 0.516 | 0.504 | 0.001 [-0.009, 0.012] | no_detectable_incremental_effect |
| PCH | DUO RS | lr | 0.487 | 0.515 | -0.005 [-0.014, 0.003] | no_detectable_incremental_effect |
| PCH | DUO RS | rf | 0.499 | 0.490 | 0.003 [-0.004, 0.008] | no_detectable_incremental_effect |
| PCH | ICD ch0 | lr | 0.515 | 0.533 | 0.028 [-0.001, 0.054] | no_detectable_incremental_effect |
| PCH | ICD ch0 | rf | 0.500 | 0.520 | -0.050 [-0.071, -0.031] | padding_increases_leakage |
| PCH | ICD ch1 | lr | 0.596 | 0.470 | 0.060 [0.032, 0.091] | padding_reduces_leakage |
| PCH | ICD ch1 | rf | 0.529 | 0.506 | 0.017 [-0.004, 0.037] | no_detectable_incremental_effect |
| PCH | ICD ch2 | lr | 0.546 | 0.608 | -0.056 [-0.091, -0.020] | padding_increases_leakage |
| PCH | ICD ch2 | rf | 0.479 | 0.610 | -0.087 [-0.112, -0.060] | padding_increases_leakage |
| PCH | ICD ch3 | lr | 0.512 | 0.433 | -0.035 [-0.055, -0.015] | padding_increases_leakage |
| PCH | ICD ch3 | rf | 0.501 | 0.476 | -0.031 [-0.050, -0.015] | padding_increases_leakage |
| PCH | ICD ch4 | lr | 0.493 | 0.497 | -0.015 [-0.039, 0.011] | no_detectable_incremental_effect |
| PCH | ICD ch4 | rf | 0.548 | 0.480 | 0.007 [-0.012, 0.027] | no_detectable_incremental_effect |
| PCH | ICD ch5 | lr | 0.566 | 0.481 | 0.028 [0.002, 0.053] | padding_reduces_leakage |
| PCH | ICD ch5 | rf | 0.504 | 0.471 | -0.032 [-0.056, -0.008] | padding_increases_leakage |
| PCH | ICD ch6 | lr | 0.456 | 0.510 | 0.004 [-0.021, 0.031] | no_detectable_incremental_effect |
| PCH | ICD ch6 | rf | 0.481 | 0.458 | -0.027 [-0.044, -0.011] | padding_increases_leakage |
| PCH | ICD ch7 | lr | 0.478 | 0.519 | -0.008 [-0.022, 0.010] | no_detectable_incremental_effect |
| PCH | ICD ch7 | rf | 0.488 | 0.546 | -0.067 [-0.089, -0.041] | padding_increases_leakage |
| PCH | ICD ch8 | lr | 0.484 | 0.474 | -0.025 [-0.054, -0.002] | padding_increases_leakage |
| PCH | ICD ch8 | rf | 0.507 | 0.602 | -0.085 [-0.115, -0.057] | padding_increases_leakage |
| PCH | ICD ch9 | lr | 0.473 | 0.520 | 0.000 [-0.026, 0.031] | no_detectable_incremental_effect |
| PCH | ICD ch9 | rf | 0.503 | 0.532 | -0.032 [-0.052, -0.014] | padding_increases_leakage |
| PI | controlled_difference | lr | 0.474 | 0.517 | -0.006 [-0.021, 0.007] | no_detectable_incremental_effect |
| PI | controlled_difference | rf | 0.435 | 0.494 | 0.035 [0.021, 0.049] | padding_reduces_leakage |
| PI | semantic_equivalent | lr | 0.528 | 0.518 | 0.006 [-0.005, 0.017] | no_detectable_incremental_effect |
| PI | semantic_equivalent | rf | 0.544 | 0.534 | 0.003 [-0.012, 0.018] | no_detectable_incremental_effect |
| PI | weak_equivalent | lr | 0.472 | 0.498 | 0.005 [-0.008, 0.021] | no_detectable_incremental_effect |
| PI | weak_equivalent | rf | 0.496 | 0.477 | -0.009 [-0.022, 0.002] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/deep | lr | 0.524 | 0.526 | -0.004 [-0.016, 0.010] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/deep | rf | 0.497 | 0.509 | -0.002 [-0.015, 0.011] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/medium | lr | 0.586 | 0.536 | 0.033 [0.014, 0.049] | padding_reduces_leakage |
| SPP | nestingDepth: flat/medium | rf | 0.523 | 0.539 | -0.019 [-0.040, -0.000] | padding_increases_leakage |
| SPP | nestingDepth: flat/shallow | lr | 0.563 | 0.537 | 0.038 [0.013, 0.060] | padding_reduces_leakage |
| SPP | nestingDepth: flat/shallow | rf | 0.520 | 0.532 | 0.008 [-0.010, 0.026] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | lr | 0.511 | 0.496 | -0.005 [-0.016, 0.005] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | rf | 0.505 | 0.477 | -0.015 [-0.026, -0.004] | padding_increases_leakage |
| SPP | nestingDepth: shallow/deep | lr | 0.474 | 0.492 | 0.006 [-0.005, 0.017] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/deep | rf | 0.500 | 0.476 | -0.003 [-0.015, 0.009] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | lr | 0.493 | 0.518 | -0.002 [-0.015, 0.008] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | rf | 0.527 | 0.498 | 0.011 [-0.001, 0.023] | no_detectable_incremental_effect |
| SPP | paramType: large/none | lr | 0.529 | 0.495 | -0.007 [-0.023, 0.008] | no_detectable_incremental_effect |
| SPP | paramType: large/none | rf | 0.519 | 0.486 | -0.002 [-0.016, 0.012] | no_detectable_incremental_effect |
| SPP | paramType: large/small | lr | 0.534 | 0.495 | 0.007 [-0.010, 0.022] | no_detectable_incremental_effect |
| SPP | paramType: large/small | rf | 0.521 | 0.478 | -0.003 [-0.012, 0.007] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | lr | 0.507 | 0.510 | -0.006 [-0.016, 0.006] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | rf | 0.461 | 0.507 | 0.012 [-0.002, 0.023] | no_detectable_incremental_effect |
| SPP | paramType: medium/none | lr | 0.505 | 0.532 | -0.012 [-0.031, 0.009] | no_detectable_incremental_effect |
| SPP | paramType: medium/none | rf | 0.491 | 0.512 | 0.007 [-0.005, 0.020] | no_detectable_incremental_effect |
| SPP | paramType: medium/small | lr | 0.536 | 0.509 | 0.017 [0.005, 0.029] | padding_reduces_leakage |
| SPP | paramType: medium/small | rf | 0.533 | 0.513 | 0.003 [-0.008, 0.016] | no_detectable_incremental_effect |
| SPP | paramType: small/none | lr | 0.473 | 0.472 | -0.001 [-0.020, 0.016] | no_detectable_incremental_effect |
| SPP | paramType: small/none | rf | 0.520 | 0.458 | -0.005 [-0.023, 0.011] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | lr | 0.512 | 0.511 | 0.012 [-0.002, 0.025] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | rf | 0.527 | 0.507 | 0.013 [0.004, 0.022] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | lr | 0.514 | 0.529 | -0.006 [-0.016, 0.002] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/few | rf | 0.501 | 0.504 | -0.001 [-0.011, 0.009] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/many | lr | 0.501 | 0.479 | 0.002 [-0.012, 0.016] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/many | rf | 0.465 | 0.474 | 0.008 [-0.009, 0.024] | no_detectable_incremental_effect |
| SPP | structureType: and_only/and_or_mixed | lr | 0.486 | 0.501 | -0.001 [-0.014, 0.012] | no_detectable_incremental_effect |
| SPP | structureType: and_only/and_or_mixed | rf | 0.502 | 0.495 | 0.005 [-0.008, 0.018] | no_detectable_incremental_effect |
| SPP | structureType: and_only/or_only | lr | 0.496 | 0.500 | 0.024 [0.012, 0.037] | padding_reduces_leakage |
| SPP | structureType: and_only/or_only | rf | 0.545 | 0.492 | 0.013 [0.001, 0.025] | padding_reduces_leakage |
| SPP | structureType: or_only/and_or_mixed | lr | 0.477 | 0.490 | 0.017 [0.003, 0.030] | padding_reduces_leakage |
| SPP | structureType: or_only/and_or_mixed | rf | 0.553 | 0.499 | 0.028 [0.015, 0.040] | padding_reduces_leakage |
| SPP | structureType: trivial/and_only | lr | 0.530 | 0.491 | -0.002 [-0.017, 0.012] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_only | rf | 0.495 | 0.502 | -0.000 [-0.013, 0.013] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_or_mixed | lr | 0.548 | 0.540 | 0.007 [-0.010, 0.024] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_or_mixed | rf | 0.515 | 0.542 | -0.011 [-0.028, 0.003] | no_detectable_incremental_effect |
| SPP | structureType: trivial/or_only | lr | 0.582 | 0.522 | 0.034 [0.014, 0.056] | padding_reduces_leakage |
| SPP | structureType: trivial/or_only | rf | 0.549 | 0.541 | 0.004 [-0.011, 0.020] | no_detectable_incremental_effect |

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
- PI balanced pairs: debiased NMI B1−B2 -0.0028 [-0.0269, 0.0207] across 60 pairs.

## Limitation

B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.
