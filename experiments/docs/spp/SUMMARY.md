# Structure & Parameter Privacy – Implementation Summary

## Status

- ✅ Dataset generation now reuses `experiments/policy_content_hiding/data_generator.js`
- ✅ Policies execute against the real `PolicyPrivacy` contract; no synthetic traces
- ✅ Each execution is annotated with structure/predicate/parameter buckets before deployment
- ✅ Attack suite (supervised/statistical/clustering) consumes the on-chain metadata
- ✅ Verdict engine (`experiments/core/multiseed_criterion.js`) is shared with PI/PCH: 30-seed
  policy-disjoint double criterion, not a single-split fixed-threshold check

## Key Components

| File | Purpose |
|------|---------|
| `data_generator.js` | Wraps the PCH generator, parses normalized logic, assigns buckets, and records coverage stats in `dataset.__meta.sppSummary`. |
| `run_experiment.js` | Orchestrates all three phases (generation + execution, attacks, reporting). Deploys PolicyPrivacy + verifier, enforces balance checks, and writes `dataset.json`/`execution_results.json`. |
| `attacks.js` | Shared attack helpers (logistic regression, random forest, KS/MMD, k-means) that operate on the same feature bag used in other experiments. |
| `README.md` | Updated instructions that mirror the PCH/PI CLIs and explain the new structure labels. |
| `test/experiments/structure_parameter_privacy_test.js` | Validates annotation heuristics and runs sanity checks on the attack helpers. |

## Structure Buckets

`structureType` (from `classifyLogicStructure`):

1. `trivial` – single atom/predicate, no boolean connective (e.g. author-level logic `"GR"`)
2. `and_only` – conjunction-only policies
3. `or_only` – disjunction-only policies
4. `and_or_mixed` – both AND and OR connectives
5. `negation_heavy` – has 2+ NOT operators

`predicateCombo` buckets (from `classifyPredicateCount`) tell whether predicates are absent, single-namespace, mixed with attributes, or spanning multiple ontologies.

`paramType` (from `classifySetSize`) buckets **only the whitelist-size (set-size) dimension** —
it no longer conflates set size with Merkle depth / range width. Range width is now a
separate, independently-tracked axis (`rangeWidth`, from `classifyRangeWidth`) used for
dataset-balance diagnostics; it is not currently one of the three axes fed to the attack
suite (`structureType`, `predicateCombo`, `paramType` — see `run_experiment.js`'s
`targetAttributes`). Same for `nestingDepth`.

## Pipeline Recap

1. **Generation** – Build ~60 base policies (configurable) with realistic DUO combinations. Annotate structure stats per execution.
2. **Execution** – Deploy verifier + PolicyPrivacy, ensure funded signer, run every commit/access pair, store metadata.
3. **Attacks** – Run logistic regression + random forest with permutation tests, KS/MMD per pair, and k-means with silhouette + ARI.
4. **Evaluation** – The authoritative PASS/FAIL verdict is the 30-seed policy-disjoint double
   criterion (`FAIL iff AUC_mean > 0.55 AND significant-seed fraction >= 0.5`) in
   `experiments/core/multiseed_criterion.js`, gating on LR and RF independently. Single-split
   MMD/KS/silhouette metrics are reported as diagnostics but do not gate.

Outputs live in `results/<name>/` and include both JSON + Markdown reports.

## Next Steps

- Scale policy count/execution depth for statistical power.
- Slice report data to inspect which metadata fields correlate with leaks when thresholds are breached.
- Tie SPP results back into the gas/padding diagnostics in the PCH dashboard.
