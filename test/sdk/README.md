# SDK Unit Tests

This directory contains comprehensive unit tests for the Policy Privacy SDK (`lib/` module).

## Test Structure

The SDK tests are organized into the following files:

### 1. `prover.test.js` - Prover Module Tests

Tests for zero-knowledge proof generation functionality ([lib/prover.js](../../lib/prover.js)):

- **Poseidon Hash Initialization**
  - Hash function initialization
  - Instance caching

- **Policy Commitment Calculation**
  - Small policies (≤16 elements)
  - Large policies (>16 elements, tree-based hashing)
  - Commitment uniqueness
  - Edge cases (empty, boundary conditions)

- **Parameters Commitment Calculation**
  - Merkle roots commitment
  - Multi-parameter commitments
  - Type handling (BigInt, hex strings, numbers)
  - Zero values handling

- **Circuit Input Creation**
  - Default value handling
  - Policy padding/truncation
  - Predicate type normalization
  - Field validation

- **Proof Generation**
  - Error handling (missing files)
  - Path validation
  - Auto-calculation of commitments

- **Integration Tests**
  - Full workflow from commitment to proof
  - Realistic healthcare scenarios
  - Type conversions

**Test Count:** 40+ tests

### 2. `compiler.test.js` - Compiler Module Tests

Tests for policy compilation functionality ([lib/compiler.js](../../lib/compiler.js)):

- **Policy Compilation**
  - Single attribute policies
  - AND/OR logic operators
  - Complex nested logic
  - NOT operator (negation)
  - All DUO attributes support

- **Commitment Properties**
  - Deterministic compilation
  - Hiding property (different randomizers)
  - Binding property (different policies)

- **DUO Standard Integration**
  - Healthcare consent policies
  - Disease-specific research (ICD-10)
  - Geographical restrictions
  - Research-specific restrictions

- **Token Generation**
  - Valid RPN tokens
  - Operator tokens
  - Operand tokens

- **Error Handling**
  - Missing fields
  - Empty policies
  - Invalid inputs

**Test Count:** 30+ tests

### 3. `contracts.test.js` - Contracts Module Tests

Tests for smart contract artifacts loading ([lib/contracts.js](../../lib/contracts.js)):

- **Artifact Loading**
  - PolicyPrivacy contract loading
  - Verifier contract loading
  - Graceful handling of missing artifacts

- **ABI Validation**
  - Structure validation
  - Function signatures
  - Event definitions
  - Input/output types

- **Bytecode Validation**
  - Non-empty bytecode
  - Hex format validation
  - Deployment readiness

- **Ethers.js Compatibility**
  - ContractFactory compatibility
  - Contract interaction compatibility
  - JSON serialization

- **Verifier Contract**
  - verifyProof function presence
  - Groth16 signature validation

**Test Count:** 25+ tests

### 4. `integration.test.js` - SDK Integration Tests

End-to-end integration tests for the complete SDK workflow:

- **Module Exports**
  - All functions exported correctly
  - Proper API surface

- **End-to-End Workflows**
  - Compile → Calculate Commitments → Create Input
  - Consistency across multiple runs

- **Realistic Healthcare Scenarios**
  - Diabetes research consent
  - Multi-attribute policies
  - Complex nested logic
  - Multiple predicates

- **Privacy Properties**
  - Commitment hiding (same policy, different randomizer)
  - Commitment binding (different policies)
  - Parameter commitment determinism

- **Error Handling**
  - Minimal policies
  - No predicates
  - Zero values
  - Auto-normalization

- **Data Type Conversions**
  - Various numeric types
  - BigInt handling
  - Mixed type parameters

- **Contract Integration Readiness**
  - On-chain compatible data formats
  - Solidity uint256 compatibility

- **Performance**
  - Maximum policy depth
  - Multiple predicates efficiency

**Test Count:** 35+ tests

## Running Tests

### Run All SDK Tests

```bash
npm run test:sdk
```

### Run Individual Test Suites

```bash
# Prover module tests
npm run test:sdk:prover

# Compiler module tests
npm run test:sdk:compiler

# Contracts module tests
npm run test:sdk:contracts

# Integration tests
npm run test:sdk:integration
```

### Run with Verbose Output

```bash
npx mocha test/sdk/*.test.js --timeout 100000 --reporter spec
```

## Test Coverage

The SDK tests provide comprehensive coverage of:

- ✅ **130+ test cases** across all modules
- ✅ **Unit tests** for individual functions
- ✅ **Integration tests** for end-to-end workflows
- ✅ **Error handling** and edge cases
- ✅ **Type conversion** validation
- ✅ **Privacy properties** verification
- ✅ **Real-world scenarios** (healthcare consent policies)
- ✅ **Performance** validation

## Prerequisites

Some tests require built circuit artifacts. If tests are skipped due to missing files:

```bash
# Build circuit artifacts
npm run build:circuit
```

## Test Philosophy

1. **Isolation**: Each test suite tests a specific module in isolation
2. **Integration**: Integration tests verify the complete workflow
3. **Real-world**: Tests include realistic healthcare consent scenarios
4. **Robustness**: Extensive error handling and edge case testing
5. **Performance**: Tests validate reasonable execution times
6. **Compatibility**: Tests ensure compatibility with ethers.js and on-chain contracts

## Key Test Scenarios

### Healthcare Consent Policies

The tests validate real-world healthcare scenarios:

- **Disease-Specific Research**: ICD-10 code validation for diabetes research
- **General Research**: Open research access policies
- **Complex Logic**: Nested AND/OR conditions
- **Multi-Predicate**: Multiple ontology predicate validations

### Privacy Properties

Tests validate cryptographic properties:

- **Hiding**: Same policy with different randomizers produces different commitments
- **Binding**: Different policies always produce different commitments
- **Determinism**: Same inputs always produce same outputs

### Type Safety

Tests validate handling of various input types:

- String decimals: `"123"`
- Hex strings: `"0x123abc"`
- Numbers: `123`
- BigInt: `BigInt("123")`
- Mixed types in arrays

## Continuous Integration

These tests are designed to run in CI/CD pipelines. All tests should pass before merging to main branch.

## Adding New Tests

When adding new SDK functionality:

1. Add unit tests to the appropriate module test file
2. Add integration tests to `integration.test.js`
3. Update this README with the new test cases
4. Ensure tests follow the existing patterns and naming conventions

## Troubleshooting

### Tests Skipped

Some tests are skipped if circuit artifacts or contract artifacts are not available. Build them first:

```bash
npm run build:circuit      # Build circuit artifacts
npx hardhat compile        # Build contract artifacts
```

### Timeout Errors

If tests timeout, increase the timeout in package.json or run with:

```bash
npx mocha test/sdk/*.test.js --timeout 200000
```

### Memory Issues

For large test suites:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npm run test:sdk
```

## Future Improvements

Potential areas for test expansion:

- [ ] Fuzz testing for policy compilation
- [ ] Property-based testing for commitment functions
- [ ] Performance benchmarking tests
- [ ] Contract deployment integration tests
- [ ] Full proof generation tests (requires trusted setup)
- [ ] TypeScript type definition tests
