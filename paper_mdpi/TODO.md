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
- [x] `sec_ablation.tex` — "1,119 executions" of the ablation subset: moot,
      the ablation section is removed (gas padding is no longer in the design).
- [ ] Abstract / introduction "43 of 45 supervised tasks" vs `sec_pi.tex:25`
      (three PI tasks): PCH 20 + SPP 21 + PI 3 = 44 in the new data, where
      controlled_difference gates. Make the denominator consistent everywhere
      (abstract, introduction, conclusion).

### 2. Mechanism numbers without the arithmetic

- [x] `sec_ablation.tex` 192-gas / 24-gas gaps and the padded residual
      overhead: moot, the ablation section and the padding diagnostics go.

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

## Gas padding removed from the design — rewrite for the unpadded (B1) data

Done (framing, data-independent): design table row and gas-decomposition
paragraph, pp blinded by r, abstract/introduction/conclusion design sentences,
contribution 3 and the Amoy contract footnote (B1 contract), evaluation intro,
discussion cost paragraph, ablation section/table/figure removed, threat-model
reference now points to the transcript-normalization subsection (no calldata
value check in the paper).

Still to rewrite with the new data:

- [ ] `sec_dataset.tex` — new capture (1077 policies / 1977 executions, PI
      layer, denied requests); state the label-independent seeded execution
      order and that each execution commits its own policy instance (the design
      paragraph relies on identifiers following registration order).
- [ ] State the observed execution costs that support the design paragraph
      (access 695,254 denied / 695,264 granted; commit 196,964; resource
      70,400; +17,940 on each sender's first transaction).
- [ ] `sec_pch.tex` L24–50 ch5 padding diagnostic and `eq:gas-decomp`,
      `sec_spp.tex` L24–27, `sec_clustering.tex` L11–16 (uses `eq:gas-decomp`),
      `sec_discussion.tex` L5–9: padding-target explanations of old FAILs; the
      new results have none.
- [ ] Abstract L25, introduction L39–40, conclusion L8: result sentences.
- [ ] `sec_performance.tex` L6, `tables/tab_cost_profile.tex` L18,
      `sec_discussion.tex` L20: padded gas costs → unpadded B1 costs.
- [ ] `tables/tab_privacy_summary.tex` (currently not \input).
