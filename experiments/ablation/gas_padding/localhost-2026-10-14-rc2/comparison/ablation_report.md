# B1/B2 Gas Padding Ablation

Positive Δleakage means B2 padding reduced |AUC−0.5| relative to B1.
Supervised 95% intervals are repeated-split stability intervals; seeded holdouts overlap and are not independent samples.

## Supervised attacks

| Experiment | Task | Classifier | B1 AUC | B2 AUC | Δleakage (95% CI) | Interpretation |
|---|---|---:|---:|---:|---:|---|
| PCH | DUO CC | lr | 0.505 | 0.548 | -0.009 [-0.020, 0.003] | no_detectable_incremental_effect |
| PCH | DUO CC | rf | 0.554 | 0.504 | 0.035 [0.020, 0.048] | padding_reduces_leakage |
| PCH | DUO DS | lr | 0.472 | 0.515 | 0.001 [-0.020, 0.022] | no_detectable_incremental_effect |
| PCH | DUO DS | rf | 0.512 | 0.489 | -0.009 [-0.027, 0.009] | no_detectable_incremental_effect |
| PCH | DUO GR | lr | 0.500 | 0.455 | -0.025 [-0.046, -0.005] | padding_increases_leakage |
| PCH | DUO GR | rf | 0.533 | 0.478 | -0.005 [-0.026, 0.015] | no_detectable_incremental_effect |
| PCH | DUO GS | lr | 0.494 | 0.509 | 0.001 [-0.013, 0.014] | no_detectable_incremental_effect |
| PCH | DUO GS | rf | 0.524 | 0.504 | 0.007 [-0.008, 0.025] | no_detectable_incremental_effect |
| PCH | DUO GSO | lr | 0.483 | 0.523 | 0.000 [-0.023, 0.026] | no_detectable_incremental_effect |
| PCH | DUO GSO | rf | 0.491 | 0.447 | -0.040 [-0.064, -0.019] | padding_increases_leakage |
| PCH | DUO HMB | lr | 0.486 | 0.535 | -0.015 [-0.034, 0.000] | no_detectable_incremental_effect |
| PCH | DUO HMB | rf | 0.501 | 0.493 | -0.000 [-0.015, 0.016] | no_detectable_incremental_effect |
| PCH | DUO NCU | lr | 0.491 | 0.470 | -0.015 [-0.036, 0.005] | no_detectable_incremental_effect |
| PCH | DUO NCU | rf | 0.479 | 0.458 | -0.037 [-0.057, -0.014] | padding_increases_leakage |
| PCH | DUO NMDS | lr | 0.513 | 0.542 | -0.004 [-0.024, 0.016] | no_detectable_incremental_effect |
| PCH | DUO NMDS | rf | 0.504 | 0.450 | -0.032 [-0.049, -0.016] | padding_increases_leakage |
| PCH | DUO POA | lr | 0.504 | 0.496 | -0.008 [-0.022, 0.003] | no_detectable_incremental_effect |
| PCH | DUO POA | rf | 0.544 | 0.530 | 0.016 [-0.002, 0.032] | no_detectable_incremental_effect |
| PCH | DUO RS | lr | 0.468 | 0.559 | -0.017 [-0.032, -0.003] | padding_increases_leakage |
| PCH | DUO RS | rf | 0.491 | 0.536 | -0.009 [-0.022, 0.005] | no_detectable_incremental_effect |
| PCH | ICD ch0 | lr | 0.504 | 0.467 | 0.005 [-0.052, 0.054] | no_detectable_incremental_effect |
| PCH | ICD ch0 | rf | 0.491 | 0.455 | -0.120 [-0.156, -0.084] | padding_increases_leakage |
| PCH | ICD ch1 | lr | 0.596 | 0.502 | 0.013 [-0.032, 0.054] | no_detectable_incremental_effect |
| PCH | ICD ch1 | rf | 0.521 | 0.550 | -0.042 [-0.067, -0.014] | padding_increases_leakage |
| PCH | ICD ch2 | lr | 0.415 | 0.533 | 0.007 [-0.025, 0.042] | no_detectable_incremental_effect |
| PCH | ICD ch2 | rf | 0.517 | 0.443 | -0.050 [-0.078, -0.019] | padding_increases_leakage |
| PCH | ICD ch3 | lr | 0.435 | 0.532 | 0.007 [-0.027, 0.038] | no_detectable_incremental_effect |
| PCH | ICD ch3 | rf | 0.484 | 0.489 | -0.050 [-0.067, -0.034] | padding_increases_leakage |
| PCH | ICD ch4 | lr | 0.472 | 0.485 | -0.009 [-0.037, 0.022] | no_detectable_incremental_effect |
| PCH | ICD ch4 | rf | 0.481 | 0.480 | -0.035 [-0.058, -0.014] | padding_increases_leakage |
| PCH | ICD ch5 | lr | 0.521 | 0.531 | 0.004 [-0.025, 0.032] | no_detectable_incremental_effect |
| PCH | ICD ch5 | rf | 0.511 | 0.520 | -0.041 [-0.059, -0.020] | padding_increases_leakage |
| PCH | ICD ch6 | lr | 0.506 | 0.478 | -0.017 [-0.040, 0.006] | no_detectable_incremental_effect |
| PCH | ICD ch6 | rf | 0.540 | 0.456 | -0.027 [-0.048, -0.007] | padding_increases_leakage |
| PCH | ICD ch7 | lr | 0.503 | 0.431 | -0.004 [-0.031, 0.021] | no_detectable_incremental_effect |
| PCH | ICD ch7 | rf | 0.492 | 0.508 | -0.004 [-0.024, 0.025] | no_detectable_incremental_effect |
| PCH | ICD ch8 | lr | 0.497 | 0.559 | -0.011 [-0.035, 0.012] | no_detectable_incremental_effect |
| PCH | ICD ch8 | rf | 0.463 | 0.540 | -0.047 [-0.081, -0.018] | padding_increases_leakage |
| PCH | ICD ch9 | lr | 0.529 | 0.526 | 0.010 [-0.012, 0.030] | no_detectable_incremental_effect |
| PCH | ICD ch9 | rf | 0.458 | 0.553 | -0.041 [-0.067, -0.018] | padding_increases_leakage |
| PI | controlled_difference | lr | 0.505 | 0.473 | -0.001 [-0.014, 0.011] | no_detectable_incremental_effect |
| PI | controlled_difference | rf | 0.529 | 0.536 | -0.003 [-0.016, 0.011] | no_detectable_incremental_effect |
| PI | semantic_equivalent | lr | 0.476 | 0.580 | -0.041 [-0.056, -0.028] | padding_increases_leakage |
| PI | semantic_equivalent | rf | 0.470 | 0.541 | -0.009 [-0.020, 0.002] | no_detectable_incremental_effect |
| PI | weak_equivalent | lr | 0.539 | 0.488 | 0.008 [-0.008, 0.024] | no_detectable_incremental_effect |
| PI | weak_equivalent | rf | 0.536 | 0.492 | 0.016 [0.003, 0.028] | padding_reduces_leakage |
| SPP | nestingDepth: flat/deep | lr | 0.456 | 0.506 | -0.017 [-0.051, 0.014] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/deep | rf | 0.520 | 0.477 | -0.004 [-0.043, 0.039] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/medium | lr | 0.482 | 0.532 | -0.019 [-0.052, 0.010] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/medium | rf | 0.489 | 0.524 | 0.003 [-0.026, 0.028] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/shallow | lr | 0.474 | 0.449 | -0.023 [-0.056, 0.012] | no_detectable_incremental_effect |
| SPP | nestingDepth: flat/shallow | rf | 0.525 | 0.461 | 0.007 [-0.020, 0.036] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | lr | 0.490 | 0.561 | -0.014 [-0.038, 0.011] | no_detectable_incremental_effect |
| SPP | nestingDepth: medium/deep | rf | 0.490 | 0.520 | -0.001 [-0.020, 0.016] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/deep | lr | 0.516 | 0.509 | 0.005 [-0.023, 0.032] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/deep | rf | 0.558 | 0.524 | 0.021 [-0.004, 0.045] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | lr | 0.451 | 0.588 | -0.028 [-0.066, 0.012] | no_detectable_incremental_effect |
| SPP | nestingDepth: shallow/medium | rf | 0.528 | 0.569 | -0.003 [-0.031, 0.023] | no_detectable_incremental_effect |
| SPP | paramType: large/none | lr | 0.580 | 0.490 | 0.069 [0.023, 0.118] | padding_reduces_leakage |
| SPP | paramType: large/none | rf | 0.552 | 0.480 | 0.061 [0.012, 0.109] | padding_reduces_leakage |
| SPP | paramType: large/small | lr | 0.460 | 0.509 | 0.018 [-0.007, 0.040] | no_detectable_incremental_effect |
| SPP | paramType: large/small | rf | 0.449 | 0.477 | 0.031 [0.011, 0.053] | padding_reduces_leakage |
| SPP | paramType: medium/large | lr | 0.478 | 0.515 | -0.014 [-0.038, 0.011] | no_detectable_incremental_effect |
| SPP | paramType: medium/large | rf | 0.495 | 0.484 | -0.009 [-0.026, 0.007] | no_detectable_incremental_effect |
| SPP | paramType: medium/none | lr | 0.503 | 0.503 | 0.036 [-0.005, 0.073] | no_detectable_incremental_effect |
| SPP | paramType: medium/none | rf | 0.500 | 0.525 | 0.058 [0.011, 0.106] | padding_reduces_leakage |
| SPP | paramType: medium/small | lr | 0.468 | 0.533 | 0.008 [-0.010, 0.026] | no_detectable_incremental_effect |
| SPP | paramType: medium/small | rf | 0.529 | 0.519 | -0.009 [-0.029, 0.012] | no_detectable_incremental_effect |
| SPP | paramType: small/none | lr | 0.548 | 0.511 | 0.012 [-0.033, 0.067] | no_detectable_incremental_effect |
| SPP | paramType: small/none | rf | 0.512 | 0.523 | 0.002 [-0.057, 0.060] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | lr | 0.502 | 0.501 | -0.007 [-0.022, 0.008] | no_detectable_incremental_effect |
| SPP | predicateCombo: few/many | rf | 0.483 | 0.501 | -0.006 [-0.025, 0.012] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/few | lr | 0.461 | 0.501 | 0.032 [0.007, 0.055] | padding_reduces_leakage |
| SPP | predicateCombo: single/few | rf | 0.506 | 0.455 | 0.004 [-0.023, 0.034] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/many | lr | 0.492 | 0.470 | -0.007 [-0.031, 0.016] | no_detectable_incremental_effect |
| SPP | predicateCombo: single/many | rf | 0.538 | 0.499 | -0.000 [-0.028, 0.028] | no_detectable_incremental_effect |
| SPP | structureType: and_only/and_or_mixed | lr | 0.521 | 0.541 | -0.014 [-0.031, 0.009] | no_detectable_incremental_effect |
| SPP | structureType: and_only/and_or_mixed | rf | 0.519 | 0.581 | -0.045 [-0.064, -0.025] | padding_increases_leakage |
| SPP | structureType: and_only/or_only | lr | 0.494 | 0.488 | -0.013 [-0.037, 0.010] | no_detectable_incremental_effect |
| SPP | structureType: and_only/or_only | rf | 0.494 | 0.499 | 0.004 [-0.016, 0.024] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | lr | 0.576 | 0.577 | 0.001 [-0.033, 0.029] | no_detectable_incremental_effect |
| SPP | structureType: or_only/and_or_mixed | rf | 0.567 | 0.512 | 0.032 [0.011, 0.053] | padding_reduces_leakage |
| SPP | structureType: trivial/and_only | lr | 0.445 | 0.486 | -0.012 [-0.046, 0.023] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_only | rf | 0.525 | 0.460 | -0.005 [-0.034, 0.025] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_or_mixed | lr | 0.490 | 0.585 | -0.021 [-0.050, 0.010] | no_detectable_incremental_effect |
| SPP | structureType: trivial/and_or_mixed | rf | 0.476 | 0.576 | -0.017 [-0.042, 0.005] | no_detectable_incremental_effect |
| SPP | structureType: trivial/or_only | lr | 0.471 | 0.443 | 0.003 [-0.036, 0.041] | no_detectable_incremental_effect |
| SPP | structureType: trivial/or_only | rf | 0.481 | 0.475 | 0.043 [0.008, 0.080] | padding_reduces_leakage |

## Gas overhead

- commitGasUsed: B1 197054, B2 301659, increase 53.1%.
- accessGasUsed: B1 553571, B2 1051342, increase 89.9%.

## Clustering

- pch_duo: NMI B1−B2 0.0001 [-0.0088, 0.0168] (policy-group bootstrap).
- pch_icd10: NMI B1−B2 -0.0039 [-0.0235, 0.0186] (policy-group bootstrap).
- logicStructure: NMI B1−B2 0.0045 [-0.0098, 0.0136] (policy-group bootstrap).
- nestingDepth: NMI B1−B2 0.0017 [-0.0097, 0.0117] (policy-group bootstrap).
- predicateCount: NMI B1−B2 0.0022 [-0.0056, 0.0115] (policy-group bootstrap).
- setSize: NMI B1−B2 -0.0024 [-0.0143, 0.0104] (policy-group bootstrap).
- PI balanced pairs: debiased NMI B1−B2 -0.0000 [-0.0253, 0.0246] across 60 pairs.

## Limitation

B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.
