# Test Directory

This directory contains all tests for the Policy Privacy zero-knowledge system, organized using the Mocha framework.

## Test Structure

### Circuit Tests (`/test/circuits/`)
Contains all test circuits for individual components:
- `policy_privacy_test.circom` - Main integrated circuit test
- `test_commitment.circom` - Policy commitment verification
- `test_commitment_simple.circom` - Simple commitment component
- `test_merkle.circom` - Merkle proof verification
- `test_credential_signature.circom` - Credential signature verification  
- `test_range_proof.circom` - Range proof verification
- `test_policy_interpreter.circom` - Policy interpreter testing
- `test_multimux.circom` - Multiplexer component test
- `test_postfix_policy_interpreter_*.circom` - Legacy interpreter tests

### Functional Tests
- `commitment_gadgets.js` - Tests for commitment components
- `external_predicates.js` - Tests for external predicate verification
- `policy_interpreter.js` - Tests for policy interpreter functionality
- `policy_privacy_main_test.js` - Main circuit integration tests
- `policy_privacy_phase1_integration.js` - Phase 1 integration tests

### Legacy Tests  
- `postfix_policy_interpreter.js` - Legacy interpreter tests
- `postfix_policy_interpreter_extended.js` - Extended interpreter tests
- `multimux.js` - Multiplexer gadget tests
- `pedersenhash.js` - Pedersen hash tests

### Compiler Tests (`/test/compiler/`)
- `policy_generator_test.js` - policy artifact generation and compiler rejections
- `icd10_set_builder_test.js` - ICD-10 set builder tests

### Test Data (`/test/data/`)
Contains test data files and sample inputs for various test scenarios.

## Running Tests

### All Tests
```bash
npm run test:all
```

### Circuit Component Tests
```bash
npm run test:circuits
```

### Functional Integration Tests
```bash
npm run test:functional
```

### Compiler Tests
```bash
npm run test:compiler  
```

### Phase 1 Tests
```bash
npm run test:phase1
```

### Individual Test Suites
```bash
npm run test:legacy    # Legacy interpreter tests
npm run test:extended  # Extended interpreter tests
```

## Test Requirements

- All tests use the Mocha framework with `describe`/`it` structure
- Circuit files must be compiled before running tests (see build instructions)
- Tests gracefully skip when circuit build files are not found
- Timeout set to 100 seconds for circuit compilation and constraint checking