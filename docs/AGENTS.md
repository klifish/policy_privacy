# Codex Contribution Guide

This repository is a Hardhat project containing Circom circuits and Solidity contracts.

## Environment Setup

1. Install Node.js dependencies:
   ```bash
   npm install
   ```

2. Build the circuits before running tests:
   ```bash
   npm run build:circuit
   ```
   This generates the `build/` folder with circuit artifacts required for the
   test suite.

## Running Tests

Execute the Hardhat test suite with:
```bash
npx hardhat test
```

## Code Style

- Use **2 spaces** for indentation in JavaScript and Solidity files.
- Prefer **single quotes** for strings in JavaScript.
- Ensure files end with a newline.

## Pull Requests

- Summarise changes clearly in the PR description and cite any relevant files.
- Report the result of running `npx hardhat test` in the PR message.
