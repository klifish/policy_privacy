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
├── utils/                     # Utility scripts
│   └── validation/            # Validation and debugging tools
├── docs/                      # Documentation
│   └── analysis/              # Research and analysis documents
├── examples/                  # Usage examples
│   ├── diabetes_case/         # Healthcare consent example
│   └── icd10_case/           # Medical code verification example
└── types/                     # TypeScript definitions
```

## Core Implementation

### PolicyPrivacyMain Circuit
The main zero-knowledge circuit that proves:
- `C(P,(a,p)) = 1` - Policy P is satisfied by requester attributes a and external predicates p  
- `Com(P;r) = h` - Policy commitment is consistent with the on-chain commitment
- External predicate validity through zero-knowledge sub-proofs

**Technical Specifications:**
- 7,346 non-linear constraints, 174 template instances
- Supports N=3 requester attributes, M=2 external predicates, DEPTH=10 policy tokens
- 56 private inputs (complete witness structure w = (P, a, p, r))
- 10 public inputs (commitment, public parameters)

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

## Documentation

### Circuit Visualization
Interactive Mermaid-based visualizations for all Circom circuits:
```bash
npm run visualize-circuit
```
This generates comprehensive diagrams showing circuit architecture, data flow, and component relationships. See [docs/CIRCUIT_VISUALIZATION.md](docs/CIRCUIT_VISUALIZATION.md) for details.

### ICD-10 Set Builder
For comprehensive documentation on the ICD-10 Allowed-Set Builder tool, see [docs/ICD10_SET_BUILDER.md](docs/ICD10_SET_BUILDER.md).

The ICD-10 Set Builder creates Poseidon Merkle trees for medical codes to enable zero-knowledge proofs for medical verification without revealing specific conditions.

### Analysis Documents
- `/docs/analysis/` - Contains detailed analysis documents:
  - `PAPER_IMPLEMENTATION_GAP_ANALYSIS.md` - Gap analysis with the academic paper
  - `IMPLEMENTATION_ROADMAP.md` - Development roadmap
  - `MISSING_FUNCTIONALITY_ANALYSIS.md` - Additional functionality analysis
  - `REPOSITORY_ANALYSIS_REPORT.md` - Technical analysis report

## Testing

### ICD-10 Set Builder Tests
```bash
npx mocha test/compiler/icd10_set_builder_test.js --timeout 100000
```

### All Tests
```bash
npm run test:all
```

## Code Style

- Use **2 spaces** for indentation in JavaScript and Solidity files.
- Prefer **single quotes** for strings in JavaScript.
- Ensure files end with a newline.

## Implementation Status

✅ **Universal Policy Interpreter** - Complete  
✅ **Policy Compilation & Commitment** - Complete  
✅ **Integrated Main Circuit** - Complete (Phase 1)  
✅ **External Predicate ZK Verification** - Complete (Phase 1)  
✅ **Enhanced Commitment Verification** - Complete (Phase 1)  

The core zero-knowledge proving system is now functional, enabling privacy-preserving consent management with full cryptographic guarantees for healthcare applications.