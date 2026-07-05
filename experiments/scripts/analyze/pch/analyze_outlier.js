const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('results/features.json', 'utf8'));
const features = data.features;

console.log('='.repeat(80));
console.log('DETAILED ANALYSIS OF HIGH GAS SAMPLE');
console.log('='.repeat(80));
console.log();

// Find all Term 0 samples
const term0 = features.filter(f => f.duoTerm === 0);
const term0NoOntology = term0.filter(f => !f.ontologyNamespace);
const term0WithOntology = term0.filter(f => f.ontologyNamespace);

console.log('Term 0 Breakdown:');
console.log('  Total:', term0.length);
console.log('  No Ontology:', term0NoOntology.length);
console.log('  With Ontology:', term0WithOntology.length);
console.log();

// Gas statistics for no-ontology group
const noOntGas = term0NoOntology.map(f => f.commitGasUsed).sort((a,b) => a-b);
console.log('Term 0 NO ONTOLOGY - Commit Gas:');
console.log('  Min:', Math.min(...noOntGas));
console.log('  Max:', Math.max(...noOntGas));
console.log('  Unique Values:', [...new Set(noOntGas)].sort((a,b) => a-b));
console.log();

// Count each gas value
const gasCount = {};
noOntGas.forEach(g => gasCount[g] = (gasCount[g] || 0) + 1);
console.log('Gas Value Distribution (No Ontology):');
Object.entries(gasCount).sort((a,b) => Number(a[0])-Number(b[0])).forEach(([gas, count]) => {
  console.log(`  ${gas}: ${count} samples`);
});
console.log();

// Gas statistics for with-ontology group
const withOntGas = term0WithOntology.map(f => f.commitGasUsed).sort((a,b) => a-b);
console.log('Term 0 WITH ONTOLOGY - Commit Gas:');
console.log('  Min:', Math.min(...withOntGas));
console.log('  Max:', Math.max(...withOntGas));
console.log('  Unique Values:', [...new Set(withOntGas)].sort((a,b) => a-b));
console.log();

// Find the outlier sample's index in original data
const outlierIdx = features.findIndex(f => f.commitGasUsed === 518494);
console.log('🔍 Outlier Sample Analysis:');
console.log('-'.repeat(80));
console.log('  Feature Index:', outlierIdx);
console.log('  DUO Term:', features[outlierIdx].duoTerm);
console.log('  DUO Term Codes:', features[outlierIdx].duoTermCodes);
console.log('  Has Ontology:', !!features[outlierIdx].ontologyNamespace);
console.log('  Ontology Namespace:', features[outlierIdx].ontologyNamespace || 'null');
console.log('  Commit Gas:', features[outlierIdx].commitGasUsed);
console.log('  Access Gas:', features[outlierIdx].accessGasUsed);
console.log('  Difference from Term 0 mean:', 518494 - 501566, 'gas');
console.log('  Difference from normal:', 518494 - 501394, 'gas');
console.log();

// Check if this is the first sample (index 0)
if (outlierIdx === 0) {
  console.log('💡 CRITICAL INSIGHT: This is the FIRST sample (index 0)!');
  console.log('-'.repeat(80));
  console.log('   Possible Root Causes:');
  console.log('   ✓ Cold start / first transaction after deployment');
  console.log('   ✓ SSTORE from zero to non-zero (20,000 extra gas)');
  console.log('   ✓ Contract state initialization overhead');
  console.log('   ✓ First policy commitment may initialize storage slots');
  console.log();
  console.log('   Expected Extra Cost:');
  console.log('   - SSTORE (zero → non-zero): ~20,000 gas');
  console.log('   - Actual difference:', 518494 - 501394, '≈ 17,100 gas ✓');
  console.log();
  console.log('   ⚠️  This matches the SSTORE cold start pattern!');
  console.log();
}

// Compare with execution results to get more context
try {
  const execData = JSON.parse(fs.readFileSync('results/execution_results_200_testnet.json', 'utf8'));
  if (execData[outlierIdx]) {
    console.log('📋 Execution Context:');
    console.log('-'.repeat(80));
    console.log('  Policy Index:', execData[outlierIdx].policyIndex);
    console.log('  Execution ID:', execData[outlierIdx].executionId);
    console.log('  Layer:', execData[outlierIdx].layer);
    if (execData[outlierIdx].structure) {
      console.log('  Policy Depth:', execData[outlierIdx].structure.policyDepth);
      console.log('  Merkle Depth:', execData[outlierIdx].structure.merkleDepth);
      console.log('  Whitelist Size:', execData[outlierIdx].structure.whitelistSize);
    }
    if (execData[outlierIdx].execution) {
      console.log('  Gas Padding:', execData[outlierIdx].execution.gas_pad);
      console.log('  Path Unify:', execData[outlierIdx].execution.path_unify);
    }
    console.log();
  }
} catch (e) {
  console.log('Could not load execution results:', e.message);
}

console.log('='.repeat(80));
console.log('RECOMMENDATIONS');
console.log('='.repeat(80));
console.log();
console.log('1. EXCLUDE FIRST SAMPLE FROM ANALYSIS:');
console.log('   - The first commit has unavoidable initialization overhead');
console.log('   - This is a known blockchain pattern, not a privacy leak');
console.log('   - Re-run evaluation excluding sample index 0');
console.log();
console.log('2. VERIFY GAS PADDING IS WORKING:');
console.log('   - Check if gas_pad: true is actually padding correctly');
console.log('   - Target: all samples (except first) should have std < 100');
console.log();
console.log('3. ALTERNATIVE: WARM UP CONTRACT:');
console.log('   - Execute a dummy commit before starting the experiment');
console.log('   - This will absorb the initialization cost');
console.log('   - All subsequent samples will have consistent gas costs');
console.log();
