#!/bin/bash
#
# Improved Policy Content Hiding Experiment
#
# Changes from baseline:
# 1. Larger dataset (500 policies instead of 200)
# 2. Multiple executions per policy (3 instead of 1)
# 3. Adjusted gas padding targets based on diagnostics
# 4. More diverse ICD-10 chapters
#

set -e

echo "======================================================================"
echo "Running Improved Policy Content Hiding Experiment"
echo "======================================================================"
echo ""

# Configuration
POLICY_COUNT=500
EXECUTIONS_PER_POLICY=3
NUM_DUO_TERMS=3
TEST_RATIO=0.3
AUC_THRESHOLD=0.55

echo "Configuration:"
echo "  Policy Count: $POLICY_COUNT"
echo "  Executions per Policy: $EXECUTIONS_PER_POLICY"
echo "  DUO Terms: $NUM_DUO_TERMS"
echo "  Test Ratio: $TEST_RATIO"
echo "  AUC Threshold: $AUC_THRESHOLD"
echo ""

# Create output directory
OUTPUT_DIR="experiments/.work/crosscheck/pch/improved_$(date +%s)"
mkdir -p "$OUTPUT_DIR"

echo "Output directory: $OUTPUT_DIR"
echo ""

# Run experiment
echo "Running experiment..."
node experiments/analysis/crosscheck/pch/run_experiment.js \
  --policy-count "$POLICY_COUNT" \
  --executions-per-policy "$EXECUTIONS_PER_POLICY" \
  --num-duo-terms "$NUM_DUO_TERMS" \
  --test-ratio "$TEST_RATIO" \
  --auc-threshold "$AUC_THRESHOLD" \
  --output "$OUTPUT_DIR" \
  --evaluate-dataset

# Run diagnostics
echo ""
echo "Running gas padding diagnostics..."
node experiments/analysis/diagnostics/diagnose_gas_padding.js "$OUTPUT_DIR/features.json" > "$OUTPUT_DIR/gas_padding_diagnostic.txt"

echo ""
echo "======================================================================"
echo "Experiment Complete"
echo "======================================================================"
echo ""
echo "Results saved to: $OUTPUT_DIR"
echo ""
echo "View results:"
echo "  - Report: cat $OUTPUT_DIR/evaluation_report.md"
echo "  - Diagnostics: cat $OUTPUT_DIR/gas_padding_diagnostic.txt"
echo ""
