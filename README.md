# policy_privacy

This repository contains Circom circuits and Solidity contracts for privacy-preserving policy verification systems.

## Documentation

### ICD-10 Set Builder
For comprehensive documentation on the ICD-10 Allowed-Set Builder tool, see [docs/ICD10_SET_BUILDER.md](docs/ICD10_SET_BUILDER.md).

The ICD-10 Set Builder creates Poseidon Merkle trees for medical codes to enable zero-knowledge proofs for medical verification without revealing specific conditions.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build circuits:
   ```bash
   npm run build:circuit
   ```

3. Run tests:
   ```bash
   npx hardhat test
   ```

## Testing

### ICD-10 Set Builder Tests
```bash
npx mocha test/compiler/icd10_set_builder_test.js --timeout 100000
```

### All Tests
```bash
npm run test:all
```