# Test Directory

Tests are grouped by the npm script that runs them. The protocol gate
(`npm run test:ci`) is what CI enforces on every push; `npm run test:local`
runs everything else. `test/TEST_AUDIT_2026-09-16.md` records why each file
is here.

## Suites

### Protocol gate — `npm run test:ci` / `npm run protocol:validate`
Release-artifact validation, soundness (`program_length_binding_test.js`),
SDK and compiler freeze suites (`sdk/`, `compiler/`), the TPS suites
(`tps/`) and the DUO V3 proof matrix (`duo/`). Run with `--forbid-pending`
where applicable, so a skipped case fails the gate.

### Gadget and interpreter circuits — `npm run test:gadgets`
`multimux.js`, `ontology_linked_terms.js`, `external_predicates.js`,
`policy_interpreter.js`, `postfix_policy_interpreter_extended.js` (current
interpreter) and `postfix_policy_interpreter.js` (the legacy interpreter in
`circuits/postfix_policy_interpreter_legacy.circom`). They compile the
wrappers in `test/circuits/` through `circom_tester`; `scripts/circom-shim`
forwards its `circom` calls to the circom2 npm package, so no native
compiler is needed. `npm run test:gadgets:commitment` runs
`commitment_gadgets.js`, which performs a Groth16 setup and downloads a
300 MB ptau on first use.

### On-chain contract suites — `npm run test:contracts`
`PolicyPrivacy.js` (proof-free contract state), `context_binding_onchain_test.js`,
`v2_consent_lifecycle.test.js`, `gas_padding_improvement_test.js`. Need
`PROTOCOL_CIRCUITS_DIR` pointing at a circuit build whose verifier matches
`contracts/`; `npm run test:contracts:ci` targets the CI-profile build.

### Analysis invariants — `npm run test:analysis`
Statistical and experiment-pipeline checks: `auc_tie_handling_test.js`,
`classifier_feature_subsampling_test.js`, `multiseed_*`, `random_shuffle_test.js`,
`ontology_whitelist_tool_test.js`, `zk_snark_setup_test.js`,
`gas_padding_ablation_test.js`, `experiments/policy_content_hiding_test.js`,
`experiments/structure_parameter_privacy_test.js`.

### Python — `npm run test:python`
`python/test_privacy_protocol.py` against the analysis package in
`experiments/analysis` (needs `.venv` with `experiments/requirements.txt`).

### Needs a running service
`api/api.test.js` (`npm run api:test`) skips itself unless a node listens on
`:8545`; `experiments/policy_content_hiding_integration_test.js` needs
phase-1 execution results on disk.

## Running Tests

```bash
npm run test:ci        # protocol gate (what CI enforces)
npm run test:local     # gadgets, commitment gadget, contracts, analysis, python
npm run test:all       # both
```

## Test Requirements

- JavaScript tests use Mocha; suites that need the hardhat runtime
  (`duo/`, `tps/`, contract suites) must run through `npx hardhat test`, not
  bare mocha (chai-as-promised is only registered there).
- Suites run with `--forbid-pending`, so a case that skips because a circuit
  is missing fails the run instead of passing silently.