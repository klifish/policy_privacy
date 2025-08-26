# Validation Utilities

This directory contains utility scripts for validating and testing circuit implementations.

## Scripts

- **calc_commitment.js** - Calculate Poseidon commitments for policies
- **validate_extended.js** - Validate the extended policy interpreter with external predicates
- **validate_legacy.js** - Validate the legacy policy interpreter implementation

## Usage

Run validation utilities from the project root:

```bash
# Calculate policy commitments
node utils/validation/calc_commitment.js

# Test extended policy interpreter
node utils/validation/validate_extended.js

# Test legacy policy interpreter  
node utils/validation/validate_legacy.js
```

## Note

These utilities require the circuits to be compiled first:
```bash
npm run build:circuit
```