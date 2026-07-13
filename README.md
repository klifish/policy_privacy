# Zero-Knowledge Privacy-Preserving Consent Management

This repository implements a zero-knowledge approach for privacy-preserving consent management in blockchain healthcare systems, based on the referenced academic paper.

## Repository Structure

```
├── circuits/                   # Circom zero-knowledge circuits
│   ├── gadgets/               # Reusable circuit components
│   ├── interpreter/           # Policy interpretation circuits
│   └── *.circom              # Main circuits
├── contracts/                 # Solidity smart contracts
├── compiler/                  # Policy compilation utilities
├── scripts/                   # Build and setup scripts
├── test/                      # All tests (Mocha/Hardhat)
│   ├── data/                  # Test data files
│   ├── circuits/              # Circuit test files
│   ├── compiler/              # Compiler test files
│   └── *.js                   # Unit and integration tests
├── lib/                       # SDK Library (Compiler, Prover, Contracts)
├── api/                       # REST API Server
├── experiments/               # Research experiments (PCH, SPP, PI)
├── utils/                     # Utility scripts
│   └── validation/            # Validation and debugging tools
├── paper_mdpi/                # LaTeX manuscript (MDPI Blockchains)
├── python/                    # Analysis pipeline and of-record results
└── examples/                  # Usage examples
    ├── diabetes_case/         # Healthcare consent example
    └── icd10_case/           # Medical code verification example
```

## Core Implementation

### PolicyPrivacyMain Circuit

The main zero-knowledge circuit that proves:

- `C(P,(a,p)) = 1` - Policy P is satisfied by requester attributes a and external predicates p
- `Com(P;r) = h` - Policy commitment is consistent with the on-chain commitment
- External predicate validity through zero-knowledge sub-proofs

**Technical Specifications (Production Instance):**

- Supports N=6 requester attributes (matching DUO V2), M=5 external predicates, DEPTH=20 policy tokens
- Optimized for Groth16 proof system
- Complete witness structure w = (P, a, p, r)
- Public inputs: Commitment + Public Parameters (Merkle Roots, Public Keys, Ranges, Ontology IDs)

## Environment Setup

1. Install Node.js dependencies:

   ```bash
   npm install
   ```

2. Build the circuits before running tests:
   ```bash
   npm run build:circuit
   ```
   This generates the `build/` folder with circuit artifacts required for the test suite.

## Running Tests

Execute the Hardhat test suite with:

```bash
npx hardhat test
```

## Testing Phase 1 Implementation

Run the integrated circuit test:

```bash
npx mocha test/policy_privacy_phase1_integration.js --timeout 100000
```

## Validation Utilities

- `utils/validation/calc_commitment.js` - Calculate policy commitments
- `utils/validation/validate_extended.js` - Test extended policy interpreter
- `utils/validation/validate_legacy.js` - Test legacy policy interpreter

### Policy Generator

- `compiler/policy_generator.js` turns author-facing JSON policies into RPN tokens, policy commitments, and metadata aligned with `PolicyPrivacyMain`.
- Usage:
  ```bash
  node compiler/policy_generator.js \
    --in examples/policies/sample_policy.json \
    --out artifacts/policies/sample_policy.compiled.json \
    --depth 10 \
    --randomizer 0x12345 \
    --pretty
  ```
- Input JSON structure:
  ```json
  {
    "attributes": {
      "DS": true,
      "RS": true,
      "POA": false,
      "GS": false,
      "CC": false
    },
    "predicates": [
      { "slot": 0, "duo": "DS", "namespace": "ICD10", "root": "0x…" },
      { "slot": 1, "duo": "RS", "namespace": "OBI", "root": "0x…" }
    ],
    "logic": "DS | RS"
  }
  ```
  Attributes are auto-bound to their ontology predicates (e.g., `DS` ⟶ `ICD10`) and compiled into postfix tokens with operator codes matching the interpreter circuit.
- `utils/policy/random_human_policy.js` can synthesize author-style DUO policies; use it to bootstrap datasets or fuzz the compiler.

## ICD-10 Set Builder

The ICD-10 Set Builder creates Poseidon Merkle trees for medical codes to enable zero-knowledge proofs for medical verification without revealing specific conditions.

## Testing

### ICD-10 Set Builder Tests

```bash
npx mocha test/compiler/icd10_set_builder_test.js --timeout 100000
```

### All Tests

```bash
npm run test:all
```

## Building the Paper

The `paper_mdpi/` directory contains the LaTeX manuscript. Build it with [Tectonic](https://tectonic-typesetting.github.io/), which resolves packages and runs the bibliography/rerun passes in one command:

```bash
cd paper_mdpi && tectonic main.tex
```

This produces `main.pdf` in the same directory. `pdflatex`/`latexmk`/`bibtex` are not required.

## Code Style

- Use **2 spaces** for indentation in JavaScript and Solidity files.
- Prefer **single quotes** for strings in JavaScript.
- Ensure files end with a newline.

## Implementation Status

✅ **Universal Policy Interpreter** - Complete  
✅ **Policy Compilation & Commitment** - Complete  
✅ **Integrated Main Circuit** - Complete (Production Ready)  
✅ **External Predicate ZK Verification** - Complete  
✅ **Enhanced Commitment Verification** - Complete  
✅ **Gas Padding Strategy** - Implemented (Randomized Execution & Calldata Padding)

The core zero-knowledge proving system is now functional, enabling privacy-preserving consent management with full cryptographic guarantees for healthcare applications.

## Library Usage (SDK)

This repository can be used as a submodule or npm dependency in other projects. A unified interface is provided via the `lib/` directory.

### Installation

If installed as a dependency:

```javascript
const PolicyPrivacy = require("policy-privacy");
```

### 1. Compiler

Compile human-readable policies into circuit-friendly artifacts.

```javascript
const { generatePolicyArtifacts } = require("policy-privacy");

const policy = {
  attributeOrder: ["GR", "DS"],
  logic: "(GR AND DS)",
  attributes: {
    DS: {
      comparison: "IN",
      value: "icd10:A00", // Disease Specific (ICD-10)
    },
  },
};

// Generate artifacts (tokens, commitment, metadata)
const artifacts = await generatePolicyArtifacts(policy, { depth: 20 });
console.log("Commitment:", artifacts.policyCommitment);
console.log("Tokens:", artifacts.tokens);
```

### 2. Prover

Generate ZK proofs for policy compliance. You must provide the paths to the compiled circuit files (`.wasm` and `.zkey`).

```javascript
const { createCircuitInput, generateProof } = require("policy-privacy");
const path = require("path");

// Prepare private/public inputs
const input = createCircuitInput(artifacts.policyCommitment, {
  policy: artifacts.tokens,
  requesterAttrs: [1, 1, 0, 0, 0, 0], // e.g. requester has GR and DS attributes
  // ... other protocol parameters
});

// Generate proof
const proof = await generateProof(input, {
  wasmPath: path.resolve("./circuits/policy_privacy_main.wasm"),
  zkeyPath: path.resolve("./circuits/policy_privacy_main.zkey"),
});
```

### 3. Contracts

Access compiled contract ABIs for blockchain interaction.

```javascript
const { Contracts } = require("policy-privacy");
const { ethers } = require("ethers");

// Deploy or connect to existing contract
const factory = new ethers.ContractFactory(
  Contracts.PolicyPrivacy.abi,
  Contracts.PolicyPrivacy.bytecode,
  signer
);
```
