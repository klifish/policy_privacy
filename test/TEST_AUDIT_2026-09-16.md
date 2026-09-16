# Test audit — 2026-09-16 (HEAD 277be46)

Every file under `test/` was run individually (hardhat runner for files that
need the hardhat runtime, mocha otherwise, unittest for Python) and read for
what it actually asserts. `protocol:validate` (the rc1 gate) was run on both the
Mac and the Linux server and is green on both.

## Verdict per file

Legend: **VALID** meaningful and passing · **VALID-ENV** valid but needs an
environment the default run does not provide · **VACUOUS** passes/skips without
checking anything on the current circuit · **STALE** targets code or circuits
that no longer exist · **TEMPLATE** hardhat scaffolding samples.

### Protocol gate (`protocol:validate`, runs in CI via `test:ci`) — all VALID
| file | tests | note |
|---|---|---|
| protocol_release_validation_test.js | 4 | release manifest / ptau / verifier |
| program_length_binding_test.js | 7 | R1-1 evidence; rewritten 2026-09-14 |
| sdk/prover.test.js, sdk/contracts.test.js | 37 + 26 | `--forbid-pending`; contracts skips never trigger when artifacts exist |
| compiler/{policy_generator,duo_v3_terms,icd10_set_builder}_test.js | 11 + 3 + 11 | |
| tps/tps-protocol-stages, tps/tps-http-endpoint | 4 + 7 | includes the hour-boundary regression (5076bbf) |
| duo/duo_v3_{singles,pairwise,complex}_e2e, tamper, mor_ts_obligations, duo_profile_credential, duo_v3_compiler_rejections | 384 | must run under `hardhat test` (chai-as-promised); under bare mocha 77 "fail" on `rejectedWith` |

### Contract / experiment suites outside CI — VALID
| file | tests | runner | note |
|---|---|---|---|
| context_binding_onchain_test.js | 6 | hardhat | R1-2 evidence (ACM half) |
| v2_consent_lifecycle.test.js | 3 | hardhat | R3-3 evidence |
| gas_padding_improvement_test.js | 4 | hardhat | |
| gas_padding_ablation_test.js | 4 | mocha | |
| PolicyPrivacy.js | 16 | hardhat | pruned 277be46; proof-free contract checks |
| experiments/policy_content_hiding_test.js | 22 | mocha | |
| experiments/structure_parameter_privacy_test.js | 20 | mocha | 77 s |
| auc_tie_handling, classifier_feature_subsampling, multiseed_parallel, multiseed_rng_isolation, random_shuffle, ontology_whitelist_tool, zk_snark_setup | 6+5+8+10+3+2+3 | mocha | analysis-side invariants |
| python/test_privacy_protocol.py | 11 | `cd test/python && PYTHONPATH=../.. ../../.venv/bin/python -m unittest test_privacy_protocol` | **no npm script**; `TaskAlignmentTests` hard-codes 16 PCH tasks / 28 SPP contrasts from the 2026-07 dataset and will fail after the Amoy rerun (20/4/21), same as `scripts/verify_evaluation_provenance.js` |

### VALID-ENV
| file | state | note |
|---|---|---|
| api/api.test.js | 22 pending, then hangs 15 min | needs a node on :8545; without one it hangs instead of skipping |
| commitment_gadgets.js | 9 passing, then hangs | open handle after the run; `test:circuits` has no `--exit` |
| experiments/policy_content_hiding_integration_test.js | 1 failing | needs phase-1 execution results on disk; no script wires it |

### VACUOUS (green or pending without testing the current circuit)
| file | state | why |
|---|---|---|
| sdk/compiler.test.js | 39 pending | whole suite `describe.skip` ("Legacy SDK") |
| sdk/integration.test.js | 22 pending | whole suite `describe.skip` |
| policy_privacy_main.js | 8 pending | `describe.skip`; targets the pre-V3 main circuit |
| policy_privacy_phase1_integration.js | 2 pending | `describe.skip`; `test:phase1`/`test:functional` point here (`test:functional` also names a file that does not exist) |
| ontology_linked_terms.js | 7 pending | every case `this.skip()`s when the test circuit is not compiled; the "functional fallback" checks JS only |
| external_predicates.js | 5 passing / 6 pending | same pattern; the 5 that pass are JS-only Merkle/range logic |
| comprehensive_functional.js | 9 passing | console.log walkthrough of `test_policy_privacy_main` (old test circuit); no assertions beyond two manual throws |

### STALE (cannot run against the current build)
| file | error |
|---|---|
| multimux.js | `Cannot read properties of undefined (reading 'type')` (old build layout) |
| pedersenhash.js | needs `build/circuits/commitment_js` + native circom ≥2.0 |
| policy_interpreter.js | "Circuit files not found" (legacy interpreter build) |
| postfix_policy_interpreter.js, postfix_policy_interpreter_extended.js | circom_tester wants a native `circom` ≥2.0; repo uses the circom2 npm WASM compiler |
| PolicyPrivacyIntegration.js | calls `requestAccess(policyId, uint[24])` and passes ipfs strings as BigInt; 5 failing / 3 trivial passing |
| gadgets/exec_snarkjs.js | not a test (helper picked up by `test/*.js` glob) |

### TEMPLATE
| file | state |
|---|---|
| HelloHardhat.js | fails (no `HelloWorld` contract) |
| Lock.js | 9 passing hardhat sample; unrelated to the project |

## Coverage of claims made to reviewers
| claim | cited file | status |
|---|---|---|
| r1-1 §4 program-length binding regression | (unnamed) `program_length_binding_test.js` | VALID, in CI |
| r1-2 §4 in-circuit half of context binding | `test/context_binding_test.js` | **file deleted (was stale/vacuous)**; the property is covered by `duo/duo_v3_tamper.test.js` T14 (contextHash for another nonce is rejected) and the DUO V3 E2E suites, which prove real statements carrying `Poseidon(id_req‖id_res‖nonce)` |
| r1-2 §4 ACM half | `test/context_binding_onchain_test.js` | VALID |
| r3-3 §4 typed institutional approval | `test/v2_typed_approval.test.js` | **file deleted (was failing: legacy 5-slot inputs)**; **no valid test currently covers the typed-approval digest binding** — needs a new test on the DUO V3 circuit or the sentence must be reworded |
| r3-3 §4 consent lifecycle | `test/v2_consent_lifecycle.test.js` | VALID |

## Structural findings
1. CI runs only `test:ci` (protocol gate). `test:legacy:all` (`mocha test/*.js`) is the only script covering the 30 top-level files and nobody runs it; that is how STALE/VACUOUS files survived.
2. `hardhat`-dependent suites break under bare mocha (`rejectedWith`); the runner choice must be encoded in scripts, not left to the caller.
3. Circuit-gadget tests (multimux, pedersen, interpreter, ontology, external predicates) are either STALE or skip themselves; gadget-level coverage today comes only indirectly from the DUO V3 E2E/tamper matrix on the full main circuit.
4. Dataset-shape constants (16/5/28) are hard-coded in `test/python` and `scripts/verify_evaluation_provenance.js`; both must change with the Amoy rerun.

## Applied after the audit (same day)
- Deleted the TEMPLATE files, `PolicyPrivacyIntegration.js`, `comprehensive_functional.js`, the four `describe.skip` legacy suites and `pedersenhash.js` (Pedersen is unused; its circuit no longer compiles).
- The gadget/interpreter tests were not STALE after all: they only lacked a native `circom`. `scripts/circom-shim/circom` forwards `circom_tester` to the circom2 npm package; with it `policy_interpreter`, both `postfix_*` and the circuit cases of `external_predicates` pass unchanged. `ontology_linked_terms.js` was ported to the gadget's domain-separated leaf `Poseidon(2000, code)`, `multimux.js` to `circom_tester`, and the two pre-V3 credential-circuit cases (single opaque `message` input) were dropped from `external_predicates.js` in favour of `duo_v3_tamper` T1/T2.
- `api/api.test.js` probes `:8545` for 2 s and skips instead of letting `JsonRpcProvider` retry forever.
- Scripts: `test:local` = `test:gadgets` + `test:gadgets:commitment` + `test:contracts` + `test:analysis` + `test:python`; `test:contracts:ci` for the CI-profile build; `test:all` = gate + local. Removed `test:functional`, `test:comprehensive`, `test:phase1`, `test:legacy`, `test:extended`, `test:unit`, `test:circuits`, `test:legacy:all`, `test:sdk:{compiler,integration,legacy}`, `test:experiments:spp`, `test:ablation`.
- CI: new `local-suites` job runs the four CI-safe suites on every push (commitment gadget excluded: 300 MB ptau download).
- Typed approval (r3-3): no new test is needed — the frozen rc1 instance does not admit predicate type 1 at all (`policy_privacy_main.circom` slot masks); its DUO V3 successor, the type-9 profile credential, is covered field by field by `duo_v3_tamper` T1–T4d. The response text must be rewritten for DUO V3 (see below).

## Remaining recommendations (not applied)
- Reviewer responses: repoint r1-2 §4 to `duo_v3_tamper` T14 + E2E. Rewrite r3-3 §1/§4 for DUO V3: the frozen circuit has no `INSTITUTIONAL_APPROVAL_V1` predicate and `purposeCode` is a dead input; the profile credential binds policy commitment, requester, resource, seven claim bits, validity window and credential id (not purpose), and purpose limitation is expressed through the DUO use-terms themselves.
- `circuits/postfix_policy_interpreter_legacy.circom` and `utils/validation/validate_legacy.js` are dead code kept only by `postfix_policy_interpreter.js`; drop all three together or keep all three.
- Dataset-shape constants: update `test/python` (16/28) and `scripts/verify_evaluation_provenance.js` (16/5/28) with the Amoy rerun.
- `experiments/policy_content_hiding_integration_test.js` has no script; either wire phase 1 into it or delete it.
