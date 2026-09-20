# Criterion sensitivity

Of-record criterion: FAIL iff AUC_mean > 0.55 and significant-seed fraction >= 0.5 (alpha = 0.05, 30 seeds). Cells give the number of gating tasks that would FAIL under each alternative pair of thresholds, recomputed from the per-seed AUCs and p-values of the of-record run.

| AUC_max \ sig_min | 0.3 | 0.4 | 0.5 | 0.6 | 0.7 |
|---|---|---|---|---|---|
| 0.52 | 1/3/0 | 1/2/0 | 1/1/0 | 0/0/0 | 0/0/0 |
| 0.55 | 1/3/0 | 1/2/0 | 1/1/0 | 0/0/0 | 0/0/0 |
| 0.58 | 1/0/0 | 1/0/0 | 1/0/0 | 0/0/0 | 0/0/0 |
| 0.6 | 1/0/0 | 1/0/0 | 1/0/0 | 0/0/0 | 0/0/0 |

Cell format: PCH/SPP/PI failures (gating tasks: pch 20, spp 21, pi 3).

## Single-leg criteria

- PCH: AUC leg alone -> 0.52: 8, 0.55: 4, 0.58: 1, 0.6: 1; significance leg alone -> 0.3: 1, 0.4: 1, 0.5: 1, 0.6: 0, 0.7: 0
- SPP: AUC leg alone -> 0.52: 12, 0.55: 4, 0.58: 0, 0.6: 0; significance leg alone -> 0.3: 3, 0.4: 2, 0.5: 1, 0.6: 0, 0.7: 0
- PI: AUC leg alone -> 0.52: 2, 0.55: 0, 0.58: 0, 0.6: 0; significance leg alone -> 0.3: 0, 0.4: 0, 0.5: 0, 0.6: 0, 0.7: 0

## Tasks that fail at the of-record thresholds

- PCH: ICD ch5
- SPP: nestingDepth: medium/deep
- PI: none

## Null simulation

10 replicates with the two gas features replaced by policy-independent uniform draws from the padding bands; the full protocol is rerun on PCH and SPP.
Replicates with at least one FAIL: 4/10.

- PCH: mean per-task false-positive rate 0.030; tasks hit: DUO GSO (0.1), DUO POA (0.1), ICD ch1 (0.1), ICD ch2 (0.1), ICD ch3 (0.1), ICD ch8 (0.1)
- SPP: mean per-task false-positive rate 0.000; tasks hit: none
