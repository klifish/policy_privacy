#!/bin/bash

# Quick Start Script for Structure & Parameter Privacy Experiment
#
# This script demonstrates how to run the experiment with different configurations

set -e

RUNNER=${RUNNER:-"npx hardhat run experiments/structure_and_parameter_privacy/run_experiment.js --network localhost --"}

echo "============================================================"
echo "Structure & Parameter Privacy Experiment - Quick Start"
echo "============================================================"
echo ""

# Function to print section headers
print_section() {
  echo ""
  echo "------------------------------------------------------------"
  echo "$1"
  echo "------------------------------------------------------------"
}

# Example 1: Small test run
print_section "Example 1: Small Test Run (Fast)"
echo "This runs a minimal experiment for testing purposes"
echo "Estimated time: 5-10 minutes"
echo ""
read -p "Run Example 1? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  $RUNNER \
    --output ./results/test \
    --policy-count 12 \
    --executions-per-policy 2 \
    --satisfy-ratio 0.5 \
    --seed test-run-1
fi

# Example 2: Medium experiment
print_section "Example 2: Medium Experiment (Default)"
echo "This runs a moderate-sized experiment with default settings"
echo "Estimated time: 30-60 minutes"
echo ""
read -p "Run Example 2? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  $RUNNER \
    --output ./results/medium \
    --policy-count 60 \
    --executions-per-policy 3 \
    --satisfy-ratio 0.5
fi

# Example 3: Large experiment with high statistical power
print_section "Example 3: Large Experiment (High Statistical Power)"
echo "This runs a comprehensive experiment with many samples"
echo "Estimated time: 2-4 hours"
echo ""
read -p "Run Example 3? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  $RUNNER \
    --output ./results/large \
    --policy-count 120 \
    --executions-per-policy 4 \
    --satisfy-ratio 0.5 \
    --permutation-iterations 1000
fi

# Example 4: Phased execution demo
print_section "Example 4: Phased Execution Demo"
echo "This demonstrates resuming from cached results"
echo ""
read -p "Run Example 4? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  # Phase 1: Generate and execute
  echo "Phase 1: Generating dataset and executing on-chain..."
  $RUNNER \
    --phase 1 \
    --output ./results/phased \
    --policy-count 24 \
    --executions-per-policy 2

  # Phase 2: Run attacks with different parameters
  echo ""
  echo "Phase 2: Running attacks with standard parameters..."
  $RUNNER \
    --phase 2 \
    --dataset ./results/phased/dataset.json \
    --execution-results ./results/phased/execution_results.json \
    --output ./results/phased \
    --test-ratio 0.3 \
    --permutation-iterations 500

  # Rerun phase 2 with different test ratio
  echo ""
  echo "Phase 2 (rerun): Running attacks with different test ratio..."
  $RUNNER \
    --phase 2 \
    --dataset ./results/phased/dataset.json \
    --execution-results ./results/phased/execution_results.json \
    --output ./results/phased_alt \
    --test-ratio 0.4 \
    --permutation-iterations 1000
fi

# Example 5: Deterministic/reproducible run
print_section "Example 5: Reproducible Experiment"
echo "This runs the experiment with a fixed seed for reproducibility"
echo ""
read -p "Run Example 5? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  SEED="reproducible-seed-12345"

  echo "Run 1 with seed: $SEED"
  $RUNNER \
    --output ./results/reproducible_1 \
    --policy-count 18 \
    --executions-per-policy 2 \
    --seed $SEED

  echo ""
  echo "Run 2 with same seed: $SEED"
  $RUNNER \
    --output ./results/reproducible_2 \
    --policy-count 18 \
    --executions-per-policy 2 \
    --seed $SEED

  echo ""
  echo "Comparing results..."
  diff -q ./results/reproducible_1/dataset.json ./results/reproducible_2/dataset.json \
    && echo "✓ Datasets are identical" \
    || echo "✗ Datasets differ"
fi

print_section "Quick Start Complete"
echo "Check the ./results directory for experiment outputs"
echo ""
echo "To view a report:"
echo "  cat ./results/<experiment>/report.md"
echo ""
echo "To rerun analysis only (skip on-chain execution):"
echo "  $RUNNER --phase 2 --dataset ./results/<experiment>/dataset.json --execution-results ./results/<experiment>/execution_results.json"
echo ""
echo "For help:"
echo "  $RUNNER --help"
echo ""
