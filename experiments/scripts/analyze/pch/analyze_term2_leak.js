const fs = require('fs');
const features = JSON.parse(fs.readFileSync('results/features.json', 'utf8')).features;

console.log('='.repeat(80));
console.log('TERM 2 LEAK ANALYSIS');
console.log('='.repeat(80));
console.log();

const term0 = features.filter(f => f.duoTerm === 0);
const term1 = features.filter(f => f.duoTerm === 1);
const term2 = features.filter(f => f.duoTerm === 2);
const nonTerm2 = features.filter(f => f.duoTerm !== 2);

console.log('Sample Distribution:');
console.log(`  Term 0: ${term0.length} (${(term0.length/features.length*100).toFixed(1)}%)`);
console.log(`  Term 1: ${term1.length} (${(term1.length/features.length*100).toFixed(1)}%)`);
console.log(`  Term 2: ${term2.length} (${(term2.length/features.length*100).toFixed(1)}%)`);
console.log(`  Total: ${features.length}`);
console.log();

// Check gas patterns
console.log('GAS PATTERN ANALYSIS:');
console.log('-'.repeat(80));

function analyzeFeature(featureName) {
  console.log(`\n${featureName}:`);

  [term0, term1, term2].forEach((samples, idx) => {
    const values = samples.map(f => f[featureName]);
    const mean = values.reduce((a,b) => a+b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    const unique = [...new Set(values)].sort((a,b) => a-b);

    console.log(`  Term ${idx}:`);
    console.log(`    Mean: ${mean.toFixed(2)}, Std: ${std.toFixed(2)}`);
    console.log(`    Min: ${Math.min(...values)}, Max: ${Math.max(...values)}`);
    console.log(`    Unique values: ${unique.length} different values`);
    if (unique.length <= 5) {
      console.log(`    Values: ${unique.join(', ')}`);
    }
  });
}

analyzeFeature('commitGasUsed');
analyzeFeature('accessGasUsed');
console.log();

// Check ontology
console.log('ONTOLOGY DISTRIBUTION:');
console.log('-'.repeat(80));

[term0, term1, term2].forEach((samples, idx) => {
  const ontCounts = {};
  samples.forEach(f => {
    const ont = f.ontologyNamespace || 'null';
    ontCounts[ont] = (ontCounts[ont] || 0) + 1;
  });

  console.log(`Term ${idx}:`);
  Object.entries(ontCounts).forEach(([ont, count]) => {
    console.log(`  ${ont}: ${count} (${(count/samples.length*100).toFixed(1)}%)`);
  });
});
console.log();

// Check if Term 2 has unique patterns
console.log('UNIQUE PATTERN DETECTION:');
console.log('-'.repeat(80));

// Commit gas
const term2CommitGas = new Set(term2.map(f => f.commitGasUsed));
const nonTerm2CommitGas = new Set(nonTerm2.map(f => f.commitGasUsed));

const term2OnlyGas = [...term2CommitGas].filter(g => !nonTerm2CommitGas.has(g));
const nonTerm2OnlyGas = [...nonTerm2CommitGas].filter(g => !term2CommitGas.has(g));

console.log('Commit Gas:');
console.log(`  Values ONLY in Term 2: ${term2OnlyGas.length ? term2OnlyGas.join(', ') : 'None'}`);
console.log(`  Values ONLY in Non-Term 2: ${nonTerm2OnlyGas.length ? nonTerm2OnlyGas.join(', ') : 'None'}`);
console.log();

// Access gas
const term2AccessGas = new Set(term2.map(f => f.accessGasUsed));
const nonTerm2AccessGas = new Set(nonTerm2.map(f => f.accessGasUsed));

const term2OnlyAccessGas = [...term2AccessGas].filter(g => !nonTerm2AccessGas.has(g));

console.log('Access Gas:');
console.log(`  Values ONLY in Term 2: ${term2OnlyAccessGas.length ? term2OnlyAccessGas.join(', ') : 'None'}`);
console.log();

// Check sample size effect
console.log('SAMPLE SIZE ANALYSIS:');
console.log('-'.repeat(80));
console.log(`Term 2 is the smallest class: ${term2.length} samples`);
console.log(`This represents only ${(term2.length/features.length*100).toFixed(1)}% of the dataset`);
console.log();
console.log('With such a small sample:');
console.log('  - Statistical noise can cause overfitting');
console.log('  - Advantage metric may be unstable');
console.log('  - Random chance plays a larger role');
console.log();

console.log('RECOMMENDATION:');
console.log('-'.repeat(80));
console.log('1. Increase sample size to 500-1000');
console.log('2. Ensure more balanced distribution (e.g., 33% each term)');
console.log('3. Re-run experiment with larger dataset');
console.log('4. Current 36 samples for Term 2 is too small for reliable evaluation');
console.log();
