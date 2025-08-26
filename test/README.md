# Test Directory

This directory contains all tests for the zero-knowledge privacy-preserving consent management system.

## Structure

- **Root test files (*.js)** - Main unit tests using Mocha framework
- **circuits/** - Circuit-specific test files
- **compiler/** - Policy compiler test files  
- **data/** - Test data files and inputs

## Running Tests

### All Tests
```bash
npm run test:all
```

### Specific Test Categories
```bash
npm run test                # Basic policy interpreter tests
npm run test:phase1         # Phase 1 integration tests
npm run test:legacy         # Legacy policy interpreter  
npm run test:extended       # Extended policy interpreter
```

### Individual Test Files
```bash
npx mocha test/[filename].js --timeout 100000
```

## Test Files

- `policy_privacy_phase1_integration.js` - Phase 1 main circuit integration test
- `postfix_policy_interpreter.js` - Basic policy interpreter tests
- `postfix_policy_interpreter_extended.js` - Extended policy interpreter tests  
- `policy_privacy_main_test.js` - Main circuit unit tests
- `compiler/` - Policy compilation and ICD-10 set builder tests
- `circuits/` - Circuit test fixtures
- `data/` - Test input and witness data

## Framework

All tests use the **Mocha** framework with:
- 100-second timeout for circuit compilation
- Automatic circuit file detection and graceful skipping
- Comprehensive assertions and error handling