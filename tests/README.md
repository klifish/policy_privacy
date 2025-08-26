# Test Files

This directory contains additional test files organized by category.

## Structure

- **integration/** - Integration tests for complete circuit functionality
- **data/** - Test data files and witness files

## Integration Tests

- **test_phase1.js** - Tests the complete Phase 1 implementation including policy privacy main circuit

Run from project root:
```bash
node tests/integration/test_phase1.js
```

## Test Data

- **test_input.json** - Input data for circuit testing
- **test_witness.json** - Witness data for validation
- **test_witness.wtns** - Binary witness files

Note: These files complement the main test suite in `/test/` directory which contains unit tests run by Mocha/Hardhat.