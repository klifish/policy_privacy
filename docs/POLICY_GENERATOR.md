# Policy Generator

`compiler/policy_generator.js` converts human-authored DUO policy descriptions into artifacts accepted by the `PolicyPrivacyMain` circuit. It normalizes attribute selections, binds ontology predicates, emits postfix (RPN) tokens, and produces Poseidon commitments that match the circuit’s commitment gadget.

## JSON Input Schema

```json
{
  "policy_id": "policy-identifier",
  "dataset_id": "optional-dataset-id",
  "attributes": {
    "DS": true,
    "RS": false,
    "POA": false,
    "GS": false,
    "CC": false
  },
  "predicates": [
    { "slot": 0, "duo": "DS", "namespace": "ICD10", "root": "0x0", "description": "Optional text" },
    { "slot": 1, "duo": "RS", "namespace": "OBI", "root": "0x0" }
  ],
  "logic": "(DS & P[ICD10]) | RS"
}
```

- **attributes**: Boolean switches for DUO terms. Attribute names accept common aliases (e.g. `Disease_Specific` → `DS`).
- **predicates**: Bind ontology namespaces to predicate slots. Slots must be contiguous starting at 0. Ontology-linked attributes (DS, RS, POA, GS, CC) must have matching predicate entries.
- **logic**: Infix expression over attributes and optional explicit predicates. If `P[...]` terms are omitted, the generator automatically expands ontology-linked attributes into conjunctions (e.g. `DS` → `DS & P[ICD10]`).

## CLI Usage

```bash
node compiler/policy_generator.js \
  --in examples/policies/sample_policy.json \
  --out artifacts/policies/sample_policy.compiled.json \
  --depth 10 \
  --randomizer 0x12345 \
  --pretty
```

Options:
- `--in`: path to author JSON.
- `--out`: output path.
- `--depth`: policy token array length (default 10).
- `--randomizer`: optional Poseidon commitment randomizer. Omit to auto-generate.
- `--pretty`: pretty-print JSON output.

## Programmatic API

```js
const { generatePolicyArtifacts } = require('../compiler/policy_generator');

const artifacts = await generatePolicyArtifacts(config, {
  depth: 10,
  randomizer: '0x12345',
  attributeOrder: ['GR', 'DS', 'RS']  // Optional override
});
```

The returned object contains:
- `policy` – zero-padded postfix token array (length = `depth`)
- `tokens` – raw RPN tokens before padding
- `numOperations` – actual token count
- `policyHash`, `policyCommitment`, `randomizer` – Poseidon hashes (hex)
- `attributes` – normalization metadata (order, bitmap, predicate requirements)
- `predicates` – slot definitions and namespace map
- `logic` – original / normalized / RPN string forms

## Integration Notes

- Operator encoding matches `PostfixPolicyInterpreter`: operands `0..N+M-1`, AND = `N+M`, OR = `N+M+1`, NOT = `N+M+2`.
- The generator enforces boolean attributes and unique predicate slots; errors surface early with descriptive messages.
- Use the emitted `policyCommitment` directly as the public input to `PolicyCommitmentVerifier`.

## Random Policy Authoring

Use `utils/policy/random_human_policy.js` to synthesize author-style DUO policies:

```js
const {
  generateRandomHumanPolicy,
  generateRandomPolicyArtifacts
} = require('../utils/policy/random_human_policy');

// Author JSON only
const authorPolicy = generateRandomHumanPolicy({ seed: 42 });

// Author JSON + compiled artifacts
const { authorPolicy, artifacts } = await generateRandomPolicyArtifacts({
  seed: 42,
  depth: 10
});
```

Options:

- `seed` or custom `rng` for deterministic output
- `attributeOrder`, `minAttributes`, `maxAttributes` to shape policy size
- `logicOperators`, `notProbability` to control logic complexity

Generated policies match the schema above and can be directly fed into `generatePolicyArtifacts` or the CLI.
