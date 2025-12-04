/**
 * Simple test script for PI data generator
 * Run: node test_pi_generator.js
 */

const fs = require('fs');
const path = require('path');

// Import the new PI generator
const {
  buildPairsFromExecutionResults,
  PI_DEFAULT_CONFIG,
  countUniquePolicies
} = require('./pi_data_generator');

console.log('='.repeat(70));
console.log('PI Data Generator Test');
console.log('='.repeat(70));
console.log('');

// Check if execution results exist
const resultsPath = path.join(__dirname, 'results', 'pi_execution_results.json');

if (!fs.existsSync(resultsPath)) {
  console.error('❌ No execution results found at:', resultsPath);
  console.log('');
  console.log('Please run Phase 1 first:');
  console.log('  node run_experiment.js --phase 1 --output ./results');
  process.exit(1);
}

console.log('✓ Found execution results at:', resultsPath);
console.log('');

// Load execution results
const executionResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
console.log(`Loaded ${executionResults.length} execution results`);
console.log('');

// Test with different configurations
const testConfigs = [
  {
    name: 'Minimal (for testing)',
    config: {
      ...PI_DEFAULT_CONFIG,
      minPairsPerType: 5,
      targetPairsPerType: 10,
      maxPairsPerType: 20
    }
  },
  {
    name: 'Recommended (default)',
    config: PI_DEFAULT_CONFIG
  },
  {
    name: 'Maximal (high power)',
    config: {
      ...PI_DEFAULT_CONFIG,
      minPairsPerType: 50,
      targetPairsPerType: 100,
      maxPairsPerType: 150
    }
  }
];

console.log('Testing different configurations:');
console.log('='.repeat(70));

for (const { name, config } of testConfigs) {
  console.log(`\n${name}:`);
  console.log(`  Min: ${config.minPairsPerType}, Target: ${config.targetPairsPerType}, Max: ${config.maxPairsPerType}`);

  try {
    const startTime = Date.now();
    const result = buildPairsFromExecutionResults(executionResults, config);
    const elapsed = Date.now() - startTime;

    console.log(`  ✓ Generated ${result.pairs.length} pairs in ${elapsed}ms`);
    console.log(`  ✓ Using ${countUniquePolicies(result.pairs)}/${result.policies.length} policies (${(result.stats.utilizationRate * 100).toFixed(1)}%)`);
    console.log(`  ✓ Distribution:`);

    for (const [type, info] of Object.entries(result.stats.distribution)) {
      const pct = info.available > 0 ? (info.selected / info.available * 100).toFixed(0) : 0;
      console.log(`      ${type}: ${info.selected} selected from ${info.available} available (${pct}%)`);
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

console.log('');
console.log('='.repeat(70));
console.log('Test Results Summary');
console.log('='.repeat(70));

// Run with default config for detailed analysis
console.log('\nDetailed analysis with default config:');
const result = buildPairsFromExecutionResults(executionResults, PI_DEFAULT_CONFIG);

console.log(`\n📊 Overall Statistics:`);
console.log(`  - Total policies generated: ${result.policies.length}`);
console.log(`  - Total possible pairs: ${result.stats.totalPossiblePairs}`);
console.log(`  - Pairs selected: ${result.pairs.length}`);
console.log(`  - Unique policies used: ${countUniquePolicies(result.pairs)}`);
console.log(`  - Data utilization: ${(result.stats.utilizationRate * 100).toFixed(1)}%`);

console.log(`\n📈 Statistical Power Estimate:`);
const pairsPerType = Object.values(result.stats.distribution).map(d => d.selected);
const minPairs = Math.min(...pairsPerType);
const testSamplesPerType = Math.floor(minPairs * 0.3); // Assuming 30% test split

console.log(`  - Min pairs per type: ${minPairs}`);
console.log(`  - Est. test samples per type: ~${testSamplesPerType}`);

if (testSamplesPerType < 10) {
  console.log(`  ⚠️  WARNING: Test samples < 10 (insufficient statistical power)`);
} else if (testSamplesPerType < 30) {
  console.log(`  ⚠️  Low power: Consider increasing --target-pairs-per-type`);
} else {
  console.log(`  ✓ Good power: Sufficient for reliable inference`);
}

console.log(`\n🎯 95% Confidence Interval Width:`);
// Approximate CI width for binomial proportion with n samples
const n = testSamplesPerType;
const ciWidth = 2 * 1.96 * Math.sqrt(0.25 / n); // Worst case p=0.5
console.log(`  - For n=${n}: ±${(ciWidth / 2).toFixed(3)} (${(ciWidth * 100).toFixed(1)}% total width)`);

if (ciWidth > 0.4) {
  console.log(`  ⚠️  Very wide CI: Results may be unreliable`);
} else if (ciWidth > 0.2) {
  console.log(`  ⚠️  Moderately wide CI: Consider more samples`);
} else {
  console.log(`  ✓ Acceptable CI width: Results should be reliable`);
}

console.log(`\n📋 Pair Type Balance:`);
const selectedCounts = Object.values(result.stats.distribution).map(d => d.selected);
const maxSelected = Math.max(...selectedCounts);
const minSelected = Math.min(...selectedCounts);
const imbalance = maxSelected > 0 ? (maxSelected - minSelected) / maxSelected : 0;

console.log(`  - Max pairs in any type: ${maxSelected}`);
console.log(`  - Min pairs in any type: ${minSelected}`);
console.log(`  - Imbalance ratio: ${(imbalance * 100).toFixed(1)}%`);

if (imbalance > 0.5) {
  console.log(`  ⚠️  High imbalance: Some types may have insufficient samples`);
} else if (imbalance > 0.3) {
  console.log(`  ⚠️  Moderate imbalance: Consider adjusting targets`);
} else {
  console.log(`  ✓ Well balanced: Good distribution across types`);
}

console.log('');
console.log('='.repeat(70));
console.log('✓ Test Complete');
console.log('='.repeat(70));
console.log('');
console.log('Next steps:');
console.log('  1. Review the statistics above');
console.log('  2. If satisfactory, run full experiment:');
console.log('     node run_experiment.js --output ./results/pi_optimized');
console.log('  3. Compare with old results (if available)');
console.log('');
