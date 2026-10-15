# Paper to-do (paper_mdpi)

## Unexplained numbers — fix during the rewrite for the unpadded (B1) of-record data

Audit of 2026-10-15. Most numbers below come from the superseded padded
capture and will change; when rewriting each section for the new data, make
every count derivable from the text and resolve the inconsistencies.

### 1. Counts with no stated origin or inconsistent (must fix)

- [ ] `sec_dataset.tex:9` — "1077 policies / 1773 executions" appears before the
      coverage/depth layers that produce it (1053+24, 1053+720). State the
      breakdown where the totals first appear, or move the totals after it.
- [ ] `sec_dataset.tex:29` — depth layer "24 policies × 30 executions": say why
      24 and 30, and how the 24 policies are chosen.
- [ ] `sec_methodology.tex:78` — SPP clustering "subset of 1,125 executions
      (Section dataset)": the Dataset section never mentions 1,125. Define the
      subset and how it is selected, or drop the subset.
- [ ] `sec_methodology.tex:89` — "127 balanced PI pairs" from the depth-layer
      policies (24 policies allow 276 pairs): state how the 127 are selected.
- [ ] `sec_pi.tex:14` — "100 pairs per type ... yielding 71 weak_equivalent":
      give the actual counts for the other two pair types.
- [ ] `sec_ablation.tex` — "1,119 executions" of the ablation subset: state
      the deterministic selection rule and where the size comes from.
- [ ] Abstract / introduction "43 of 45 supervised tasks" vs `sec_pi.tex:25`
      (three PI tasks): PCH 20 + SPP 21 + PI 3 = 44. The ablation figure counts
      4 PI tasks, i.e. 45 includes the controlled_difference positive control,
      which the text excludes from PASS/FAIL. Make the denominator consistent
      everywhere (abstract, introduction, ablation text and figure caption).

### 2. Mechanism numbers without the arithmetic

- [ ] `sec_ablation.tex` — 192-gas and 24-gas calldata gaps: show the
      calculation (zero vs non-zero calldata byte = 4 vs 16 gas, i.e. 12 gas per
      byte; 192 = 16 bytes × 12, 24 = 2 bytes × 12) so readers can verify it.
- [ ] Residual overhead (4,661–4,750 gas in the padded data): say what it
      consists of, if it survives the rewrite.

### 3. Parameter choices without rationale (justify the likely-challenged ones)

- [ ] Leakage criterion thresholds 0.55 mean AUC and 50% significant seeds:
      currently only called "operational"; cite the criterion sensitivity
      analysis (`experiments/analysis/supervised/criterion_sensitivity.py`).
- [ ] SPP bucket boundaries (whitelist 1–4 / 5–16 / ≥17; depth ≤1 / 2 / 3 / ≥4).
- [ ] PI similarity thresholds 0.999 / 0.95.
- [x] `sec_dataset.tex` whitelist size: candidate set, per-policy shared draw,
      truncation and the max-over-whitelists record rule are now stated
      (counts 8/2,000/147 taken from `experiments/data/polygonAmoy/`; recheck
      against the final of-record data).
- [ ] `sec_pi.tex:8` — the parameter fingerprint uses "Merkle depth" and
      "proof type", neither defined in the text.
- [ ] Lower priority: 30 seeds, 512 split candidates, R=500 / R=200
      permutations, 20 K-Means seeds.
