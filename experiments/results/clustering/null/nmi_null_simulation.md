# Finite-sample NMI/ARI under a null with no class signal

Null: every class i.i.d. N(0, I_2); labels by construction order. Clustering: standardized features, K-Means (K = classes, n_init=10). 1000 trials per row.

| Structure | n per class | C | N | mean NMI | NMI p95 | mean ARI |
|---|---:|---:|---:|---:|---:|---:|
| PI-like | 3 | 2 | 6 | 0.2074 | 0.4787 | +0.0127 |
| PI-like | 10 | 2 | 20 | 0.0420 | 0.1561 | +0.0008 |
| PI-like | 50 | 2 | 100 | 0.0072 | 0.0269 | -0.0003 |
| PI-like | 100 | 2 | 200 | 0.0034 | 0.0124 | -0.0004 |
| 5-class | 3 | 5 | 15 | 0.4152 | 0.5406 | -0.0034 |
| 5-class | 10 | 5 | 50 | 0.1226 | 0.1906 | +0.0003 |
| 5-class | 100 | 5 | 500 | 0.0102 | 0.0172 | -0.0000 |
| 10-class | 3 | 10 | 30 | 0.5346 | 0.5941 | -0.0009 |
| 10-class | 10 | 10 | 100 | 0.2087 | 0.2482 | +0.0003 |
| 10-class | 42 | 10 | 420 | 0.0459 | 0.0577 | -0.0001 |
| ICD-10 sizes | 33-55 | 10 | 422 | 0.0466 | 0.0599 | +0.0001 |
| PI-like | 16 | 2 | 32 | 0.0250 | 0.0980 | +0.0008 |

Matched ICD-10 configuration (observed chapter sizes, mean over 20 K-Means seeds per trial, as in the evaluation): null NMI mean 0.0463, 95th percentile 0.0570. Observed ICD-10 NMI 0.0437: 637 of 1000 null trials at or above it, empirical p = 0.637. Label permutation on the observed clusters (of record): baseline NMI 0.0456, debiased -0.0019, p = 0.622.
