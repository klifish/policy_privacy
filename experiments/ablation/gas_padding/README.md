# Gas-padding ablation: B1 vs B2

This workflow reuses the existing Polygon Amoy padded dataset as **B2** and
executes only the matching **B1** profile:

- `b1_unpadded`: commitment, fixed circuit, TPS, no commit/access gas padding.
- `b2_padded`: the existing full mechanism; it is never rerun by this workflow.

## 1. Prepare the deterministic B2 subset

```bash
node experiments/ablation/gas_padding/prepare.js
```

The selector retains every policy with 30 executions for balanced PI clustering,
then deterministically adds policies until every PCH/SPP class meets the configured
row and independent-policy coverage.

## 2. Smoke-test B1 locally

```bash
UNIFIED_CONFIG_PATH=experiments/capture/configs/unified_dataset_config_twolayer_smoke.json \
UNIFIED_ARTIFACT_DIR=experiments/ablation/gas_padding/localhost/b1_unpadded \
PROTECTION_PROFILE=b1_unpadded \
npx hardhat run experiments/capture/run.js --network localhost
```

## 3. Execute B1 on Polygon Amoy

Use the exact command printed by `prepare.js`. Run the balance preflight before
funding or submitting the experiment. B1 artifacts are written separately and
cannot overwrite the existing B2 dataset.

## 4. Verify and analyze

```bash
node experiments/ablation/gas_padding/verify.js \
  experiments/ablation/gas_padding/polygonAmoy

node experiments/ablation/gas_padding/analyze.js \
  --root-dir=experiments/ablation/gas_padding/polygonAmoy \
  --concurrency=8
```

The final paired reports are:

- `comparison/ablation_report.json`
- `comparison/ablation_report.md`

The independent sklearn cross-check covers PCH, PI, and all 28 SPP contrasts,
replays one stratified policy-group split manifest on both profiles, and validates
alignment by `policyId + executionId`:

```bash
npm run ablation:gas:python
```

Its seed-bootstrap interval is reported as a repeated-split stability interval,
because the 30 seeded holdouts overlap and are not independent samples.

Positive `deltaLeakage = |AUC_B1-0.5| - |AUC_B2-0.5|` means padding reduced
classifier leakage. The report also includes policy-group bootstrap clustering
intervals, balanced-PI pair differences, and gas overhead.
