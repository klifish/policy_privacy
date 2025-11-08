/**
 * Gas Pattern and Data Distribution Analysis
 *
 * Analyzes the testnet experiment results to identify potential privacy leakage sources
 */

const fs = require('fs');
const path = require('path');

function analyzeDataDistribution(features) {
  console.log('='.repeat(80));
  console.log('DATA DISTRIBUTION ANALYSIS');
  console.log('='.repeat(80));
  console.log();

  // 1. DUO Term Distribution
  console.log('1. DUO TERM DISTRIBUTION');
  console.log('-'.repeat(80));

  const duoTermCounts = {};
  const duoTermWithOntology = {};

  features.forEach(f => {
    const term = f.duoTerm;
    duoTermCounts[term] = (duoTermCounts[term] || 0) + 1;

    if (f.ontologyNamespace) {
      if (!duoTermWithOntology[term]) {
        duoTermWithOntology[term] = 0;
      }
      duoTermWithOntology[term]++;
    }
  });

  console.log('DUO Term Frequency:');
  Object.keys(duoTermCounts).sort().forEach(term => {
    const count = duoTermCounts[term];
    const percentage = (count / features.length * 100).toFixed(1);
    const withOntology = duoTermWithOntology[term] || 0;
    const ontologyRate = withOntology > 0 ? ` (${withOntology} with ontology, ${(withOntology/count*100).toFixed(1)}%)` : '';
    console.log(`  Term ${term}: ${count}/${features.length} (${percentage}%)${ontologyRate}`);
  });
  console.log();

  // 2. Ontology Distribution
  console.log('2. ONTOLOGY NAMESPACE DISTRIBUTION');
  console.log('-'.repeat(80));

  const ontologyByTerm = {};
  features.forEach(f => {
    const term = f.duoTerm;
    if (!ontologyByTerm[term]) {
      ontologyByTerm[term] = { null: 0, ICD10: 0, OBI: 0 };
    }
    const ns = f.ontologyNamespace || 'null';
    ontologyByTerm[term][ns] = (ontologyByTerm[term][ns] || 0) + 1;
  });

  Object.keys(ontologyByTerm).sort().forEach(term => {
    console.log(`  DUO Term ${term}:`);
    Object.entries(ontologyByTerm[term]).forEach(([ns, count]) => {
      const percentage = (count / duoTermCounts[term] * 100).toFixed(1);
      console.log(`    ${ns}: ${count} (${percentage}%)`);
    });
  });
  console.log();

  return { duoTermCounts, ontologyByTerm };
}

function analyzeGasPatterns(features) {
  console.log('='.repeat(80));
  console.log('GAS CONSUMPTION PATTERN ANALYSIS');
  console.log('='.repeat(80));
  console.log();

  // Group by DUO term
  const gasByTerm = {};
  features.forEach(f => {
    const term = f.duoTerm;
    if (!gasByTerm[term]) {
      gasByTerm[term] = {
        commitGas: [],
        accessGas: [],
        totalGas: [],
        commitCalldata: [],
        accessCalldata: []
      };
    }
    gasByTerm[term].commitGas.push(f.commitGasUsed);
    gasByTerm[term].accessGas.push(f.accessGasUsed);
    gasByTerm[term].totalGas.push(f.commitGasUsed + f.accessGasUsed);
    gasByTerm[term].commitCalldata.push(f.commitCalldataLength);
    gasByTerm[term].accessCalldata.push(f.accessCalldataLength);
  });

  console.log('1. GAS USAGE BY DUO TERM');
  console.log('-'.repeat(80));

  Object.keys(gasByTerm).sort().forEach(term => {
    const data = gasByTerm[term];
    console.log(`\nDUO Term ${term}:`);
    console.log(`  Commit Gas:`);
    printStats(data.commitGas, '    ');
    console.log(`  Access Gas:`);
    printStats(data.accessGas, '    ');
    console.log(`  Total Gas:`);
    printStats(data.totalGas, '    ');
  });
  console.log();

  // Check for distinguishing patterns
  console.log('2. DISTINGUISHING PATTERNS DETECTION');
  console.log('-'.repeat(80));

  const termIds = Object.keys(gasByTerm).sort();

  // Compare commit gas between terms
  console.log('\nCommit Gas Comparison:');
  termIds.forEach(term => {
    const stats = calculateStats(gasByTerm[term].commitGas);
    console.log(`  Term ${term}: mean=${stats.mean.toFixed(0)}, std=${stats.std.toFixed(2)}, min=${stats.min}, max=${stats.max}`);
  });

  // Detect if Term 0 has significantly different pattern
  if (gasByTerm[0] && gasByTerm[1]) {
    const term0CommitMean = calculateStats(gasByTerm[0].commitGas).mean;
    const term0CommitStd = calculateStats(gasByTerm[0].commitGas).std;
    const term1CommitMean = calculateStats(gasByTerm[1].commitGas).mean;
    const term1CommitStd = calculateStats(gasByTerm[1].commitGas).std;

    const meanDiff = Math.abs(term0CommitMean - term1CommitMean);
    const stdDiff = Math.abs(term0CommitStd - term1CommitStd);

    console.log(`\n⚠️  LEAK INDICATOR - Commit Gas Mean Difference:`);
    console.log(`  Term 0 vs Term 1: ${meanDiff.toFixed(0)} gas (${(meanDiff/term1CommitMean*100).toFixed(2)}%)`);

    if (meanDiff > 1000) {
      console.log(`  🔴 SIGNIFICANT DIFFERENCE DETECTED! This could explain privacy leakage.`);
    }

    console.log(`\n⚠️  LEAK INDICATOR - Commit Gas Std Dev Difference:`);
    console.log(`  Term 0: ${term0CommitStd.toFixed(2)}, Term 1: ${term1CommitStd.toFixed(2)}`);

    if (term0CommitStd > 1000 && term1CommitStd < 100) {
      console.log(`  🔴 Term 0 has much higher variance! This is a distinguishing feature.`);
    }
  }

  console.log('\n\nAccess Gas Comparison:');
  termIds.forEach(term => {
    const stats = calculateStats(gasByTerm[term].accessGas);
    console.log(`  Term ${term}: mean=${stats.mean.toFixed(0)}, std=${stats.std.toFixed(2)}, min=${stats.min}, max=${stats.max}`);
  });

  // Check Total Gas
  console.log('\n\nTotal Gas Comparison:');
  termIds.forEach(term => {
    const stats = calculateStats(gasByTerm[term].totalGas);
    console.log(`  Term ${term}: mean=${stats.mean.toFixed(0)}, std=${stats.std.toFixed(2)}, min=${stats.min}, max=${stats.max}`);
  });

  console.log();

  // 3. Check calldata sizes
  console.log('3. CALLDATA SIZE ANALYSIS');
  console.log('-'.repeat(80));

  console.log('\nCommit Calldata:');
  termIds.forEach(term => {
    const stats = calculateStats(gasByTerm[term].commitCalldata);
    console.log(`  Term ${term}: mean=${stats.mean.toFixed(0)}, std=${stats.std.toFixed(2)}, min=${stats.min}, max=${stats.max}`);
  });

  console.log('\nAccess Calldata:');
  termIds.forEach(term => {
    const stats = calculateStats(gasByTerm[term].accessCalldata);
    console.log(`  Term ${term}: mean=${stats.mean.toFixed(0)}, std=${stats.std.toFixed(2)}, min=${stats.min}, max=${stats.max}`);
  });

  console.log();

  return gasByTerm;
}

function analyzeGasWithOntology(features) {
  console.log('='.repeat(80));
  console.log('GAS PATTERNS: WITH vs WITHOUT ONTOLOGY');
  console.log('='.repeat(80));
  console.log();

  const term0WithOntology = features.filter(f => f.duoTerm === 0 && f.ontologyNamespace);
  const term0WithoutOntology = features.filter(f => f.duoTerm === 0 && !f.ontologyNamespace);
  const term1WithOntology = features.filter(f => f.duoTerm === 1 && f.ontologyNamespace);
  const term1WithoutOntology = features.filter(f => f.duoTerm === 1 && !f.ontologyNamespace);

  console.log('DUO Term 0:');
  console.log(`  With Ontology: ${term0WithOntology.length} samples`);
  if (term0WithOntology.length > 0) {
    const commitGas = term0WithOntology.map(f => f.commitGasUsed);
    console.log(`    Commit Gas: mean=${calculateStats(commitGas).mean.toFixed(0)}, std=${calculateStats(commitGas).std.toFixed(2)}`);
  }
  console.log(`  Without Ontology: ${term0WithoutOntology.length} samples`);
  if (term0WithoutOntology.length > 0) {
    const commitGas = term0WithoutOntology.map(f => f.commitGasUsed);
    console.log(`    Commit Gas: mean=${calculateStats(commitGas).mean.toFixed(0)}, std=${calculateStats(commitGas).std.toFixed(2)}`);
  }

  console.log('\nDUO Term 1:');
  console.log(`  With Ontology: ${term1WithOntology.length} samples`);
  if (term1WithOntology.length > 0) {
    const commitGas = term1WithOntology.map(f => f.commitGasUsed);
    console.log(`    Commit Gas: mean=${calculateStats(commitGas).mean.toFixed(0)}, std=${calculateStats(commitGas).std.toFixed(2)}`);
  }
  console.log(`  Without Ontology: ${term1WithoutOntology.length} samples`);
  if (term1WithoutOntology.length > 0) {
    const commitGas = term1WithoutOntology.map(f => f.commitGasUsed);
    console.log(`    Commit Gas: mean=${calculateStats(commitGas).mean.toFixed(0)}, std=${calculateStats(commitGas).std.toFixed(2)}`);
  }

  // Key insight: Term 0 is the only one that can have NO ontology
  if (term0WithoutOntology.length > 0 && term1WithoutOntology.length === 0) {
    console.log('\n🔴 CRITICAL LEAK IDENTIFIED:');
    console.log('  Term 0 is the ONLY term without ontology namespace!');
    console.log('  This creates a unique signature that can be detected.');
    console.log('  Samples without ontology can be reliably classified as Term 0.');
  }

  console.log();
}

function analyzeCorrelations(features) {
  console.log('='.repeat(80));
  console.log('FEATURE CORRELATION ANALYSIS');
  console.log('='.repeat(80));
  console.log();

  // Check if certain gas patterns correlate with Term 0
  const term0Samples = features.filter(f => f.duoTerm === 0);
  const nonTerm0Samples = features.filter(f => f.duoTerm !== 0);

  console.log('Unique Commit Gas Values:');
  const term0UniqueCommitGas = new Set(term0Samples.map(f => f.commitGasUsed));
  const nonTerm0UniqueCommitGas = new Set(nonTerm0Samples.map(f => f.commitGasUsed));

  console.log(`  Term 0 unique values: ${[...term0UniqueCommitGas].sort((a,b) => a-b).join(', ')}`);
  console.log(`  Non-Term 0 unique values: ${[...nonTerm0UniqueCommitGas].sort((a,b) => a-b).join(', ')}`);

  // Find values that only appear in Term 0
  const term0OnlyGas = [...term0UniqueCommitGas].filter(g => !nonTerm0UniqueCommitGas.has(g));
  if (term0OnlyGas.length > 0) {
    console.log(`\n🔴 LEAK: Gas values ONLY seen in Term 0: ${term0OnlyGas.sort((a,b) => a-b).join(', ')}`);
    const leakyCount = term0Samples.filter(f => term0OnlyGas.includes(f.commitGasUsed)).length;
    console.log(`  This affects ${leakyCount}/${term0Samples.length} Term 0 samples (${(leakyCount/term0Samples.length*100).toFixed(1)}%)`);
  }

  console.log();
}

function calculateStats(arr) {
  if (arr.length === 0) return { mean: 0, std: 0, min: 0, max: 0 };

  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...arr);
  const max = Math.max(...arr);

  return { mean, std, min, max };
}

function printStats(arr, prefix = '') {
  const stats = calculateStats(arr);
  console.log(`${prefix}Mean: ${stats.mean.toFixed(2)}`);
  console.log(`${prefix}Std:  ${stats.std.toFixed(2)}`);
  console.log(`${prefix}Min:  ${stats.min}`);
  console.log(`${prefix}Max:  ${stats.max}`);
  console.log(`${prefix}Range: ${stats.max - stats.min}`);
}

function generateRecommendations(features, gasByTerm) {
  console.log('='.repeat(80));
  console.log('RECOMMENDATIONS FOR IMPROVING PRIVACY');
  console.log('='.repeat(80));
  console.log();

  const term0Stats = calculateStats(gasByTerm[0].commitGas);
  const term1Stats = calculateStats(gasByTerm[1]?.commitGas || []);

  console.log('1. GAS PADDING IMPROVEMENTS');
  console.log('-'.repeat(80));

  if (term0Stats.std > 1000) {
    console.log('⚠️  Issue: Term 0 has high gas variance (std = ' + term0Stats.std.toFixed(0) + ')');
    console.log('   Recommendation: Implement more aggressive gas padding for all terms');
    console.log('   - Add random gas consumption to normalize variance');
    console.log('   - Target std < 100 gas for all terms');
  }

  const meanDiff = Math.abs(term0Stats.mean - term1Stats.mean);
  if (meanDiff > 1000) {
    console.log('\n⚠️  Issue: Mean gas differs by ' + meanDiff.toFixed(0) + ' between terms');
    console.log('   Recommendation: Add gas padding to equalize mean consumption');
    console.log('   - Pad lower-gas operations to match highest gas operation');
    console.log('   - Target: all means within ±50 gas');
  }

  console.log('\n2. ONTOLOGY HANDLING');
  console.log('-'.repeat(80));

  const term0NoOntology = features.filter(f => f.duoTerm === 0 && !f.ontologyNamespace).length;
  const term0Total = features.filter(f => f.duoTerm === 0).length;

  if (term0NoOntology === term0Total) {
    console.log('🔴 CRITICAL: Term 0 NEVER has ontology, making it easily identifiable');
    console.log('   Recommendation: Add dummy ontology to some Term 0 samples');
    console.log('   - OR ensure all terms can have null ontology');
    console.log('   - OR pad proof/calldata to hide ontology presence');
  }

  console.log('\n3. PROOF/CALLDATA STANDARDIZATION');
  console.log('-'.repeat(80));

  const proofSizes = new Set(features.map(f => f.proofSize));
  const calldataSizes = new Set(features.map(f => f.accessCalldataLength));

  if (proofSizes.size === 1 && calldataSizes.size === 1) {
    console.log('✓ Good: Proof and calldata sizes are already uniform');
  } else {
    console.log('⚠️  Issue: Variable proof/calldata sizes detected');
    console.log('   Recommendation: Ensure all proofs are padded to same size');
  }

  console.log('\n4. SUGGESTED FIXES (PRIORITY ORDER)');
  console.log('-'.repeat(80));
  console.log('  Priority 1: Fix ontology namespace leak');
  console.log('    - Ensure Term 0 can have ontology OR all terms can be null');
  console.log('  Priority 2: Normalize commit gas consumption');
  console.log('    - Add padding to make mean ± std overlap for all terms');
  console.log('  Priority 3: Increase sample size');
  console.log('    - Current: 200 samples, recommend 500-1000 for robust evaluation');

  console.log();
}

// Main execution
function main() {
  const featuresPath = path.join(__dirname, 'results', 'features.json');

  if (!fs.existsSync(featuresPath)) {
    console.error('Error: features.json not found at', featuresPath);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
  const features = data.features || data;

  console.log('Loaded', features.length, 'feature vectors\n');

  // Run all analyses
  const { duoTermCounts, ontologyByTerm } = analyzeDataDistribution(features);
  const gasByTerm = analyzeGasPatterns(features);
  analyzeGasWithOntology(features);
  analyzeCorrelations(features);
  generateRecommendations(features, gasByTerm);

  console.log('='.repeat(80));
  console.log('ANALYSIS COMPLETE');
  console.log('='.repeat(80));
}

if (require.main === module) {
  main();
}

module.exports = { analyzeDataDistribution, analyzeGasPatterns };
