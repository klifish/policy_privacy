# Structure & Parameter Privacy – Implementation Summary

## Status

- ✅ Dataset generation now reuses `experiments/policy_content_hiding/data_generator.js`
- ✅ Policies execute against the real `PolicyPrivacy` contract; no synthetic traces
- ✅ Each execution is annotated with structure/predicate/parameter buckets before deployment
- ✅ Attack suite (supervised/statistical/clustering) consumes the on-chain metadata
- ✅ Reports/thresholds line up with the PI/PCH experiments

## Key Components

| File | Purpose |
|------|---------|
| `data_generator.js` | Wraps the PCH generator, parses normalized logic, assigns buckets, and records coverage stats in `dataset.__meta.sppSummary`. |
| `run_experiment.js` | Orchestrates all three phases (generation + execution, attacks, reporting). Deploys PolicyPrivacy + verifier, enforces balance checks, and writes `dataset.json`/`execution_results.json`. |
| `attacks.js` | Shared attack helpers (logistic regression, random forest, KS/MMD, k-means) that operate on the same feature bag used in other experiments. |
| `README.md` | Updated instructions that mirror the PCH/PI CLIs and explain the new structure labels. |
| `test/experiments/structure_parameter_privacy_test.js` | Validates annotation heuristics and runs sanity checks on the attack helpers. |

## Structure Buckets

1. `simple_and` – conjunction-only policies with low depth
2. `with_or` – contains ORs but no predicates
3. `nested` – deep attribute-only expressions
4. `with_sets` – predicates present but no ORs
5. `complex` – ORs + predicates and/or deep nesting

`predicateCombo` buckets tell whether predicates are absent, single-namespace, mixed with attributes, or spanning multiple ontologies. `paramType` combines whitelist size and Merkle depth to approximate “set size” vs “range width” leakages.

## Pipeline Recap

1. **Generation** – Build ~60 base policies (configurable) with realistic DUO combinations. Annotate structure stats per execution.
2. **Execution** – Deploy verifier + PolicyPrivacy, ensure funded signer, run every commit/access pair, store metadata.
3. **Attacks** – Run logistic regression + random forest with permutation tests, KS/MMD per pair, and k-means with silhouette + ARI.
4. **Evaluation** – Compare against fixed thresholds; fail if any metric suggests distinguishability.

Outputs live in `results/<name>/` and include both JSON + Markdown reports.

## Next Steps

- Scale policy count/execution depth for statistical power.
- Slice report data to inspect which metadata fields correlate with leaks when thresholds are breached.
- Tie SPP results back into the gas/padding diagnostics in the PCH dashboard.
