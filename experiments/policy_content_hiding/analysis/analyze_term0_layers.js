/**
 * Analyze Policy Layers for DUO Term 0
 */

const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../../unified/artifacts_data/pch_dataset.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

console.log('=== Policy Layer Analysis for Term 0 ===\n');

const term0Samples = data.filter(d => d.duoTerm === 0 || (Array.isArray(d.duoTerms) && d.duoTerms.includes(0)));
const nonTerm0Samples = data.filter(d => {
  if (d.duoTerm === 0) return false;
  if (Array.isArray(d.duoTerms) && d.duoTerms.includes(0)) return false;
  return true;
});

// Analyze policy layers
const term0Layers = {};
const nonTerm0Layers = {};

term0Samples.forEach(s => {
  const layer = s.layer || 'unknown';
  term0Layers[layer] = (term0Layers[layer] || 0) + 1;
});

nonTerm0Samples.forEach(s => {
  const layer = s.layer || 'unknown';
  nonTerm0Layers[layer] = (nonTerm0Layers[layer] || 0) + 1;
});

console.log('Term 0 Policy Layers:');
Object.entries(term0Layers).sort((a,b) => b[1] - a[1]).forEach(([layer, count]) => {
  console.log(`  ${layer}: ${count} (${(count/term0Samples.length*100).toFixed(1)}%)`);
});

console.log('\nNon-Term 0 Policy Layers:');
Object.entries(nonTerm0Layers).sort((a,b) => b[1] - a[1]).forEach(([layer, count]) => {
  console.log(`  ${layer}: ${count} (${(count/nonTerm0Samples.length*100).toFixed(1)}%)`);
});

// Check the outliers
console.log('\n=== Term 0 High Commit Gas Outliers (>260k) ===\n');
const highGasSamples = term0Samples.filter(s => {
  const commitGas = parseInt(s.features?.commitGasUsed || s.commitGasUsed || 0);
  return commitGas > 260000;
}).sort((a,b) => {
  const gasA = parseInt(a.features?.commitGasUsed || a.commitGasUsed || 0);
  const gasB = parseInt(b.features?.commitGasUsed || b.commitGasUsed || 0);
  return gasB - gasA;
});

highGasSamples.forEach((s, i) => {
  const commitGas = s.features?.commitGasUsed || s.commitGasUsed;
  const accessGas = s.features?.accessGasUsed || s.accessGasUsed;
  console.log(`${i+1}. Policy: ${s.policyId}`);
  console.log(`   Layer: ${s.layer}`);
  console.log(`   Commit Gas: ${commitGas}`);
  console.log(`   Access Gas: ${accessGas}`);
  console.log(`   Execution ID: ${s.executionId}`);
  console.log(`   DUO Terms: ${(s.duoTermCodes || []).join(', ')}`);
  console.log('');
});

// Check if cold start was excluded
console.log('=== Cold Start Analysis ===\n');
const term0ByExecId = {};
term0Samples.forEach(s => {
  const key = s.policyIndex + '_' + s.executionId;
  if (!term0ByExecId[key]) {
    term0ByExecId[key] = [];
  }
  term0ByExecId[key].push(s);
});

console.log('Checking for execution ID 0 (potential cold starts):');
const execId0Samples = term0Samples.filter(s => s.executionId === 0);
console.log(`Found ${execId0Samples.length} samples with executionId=0`);

if (execId0Samples.length > 0) {
  console.log('\nExecution ID 0 samples:');
  execId0Samples.slice(0, 5).forEach(s => {
    const commitGas = s.features?.commitGasUsed || s.commitGasUsed;
    const accessGas = s.features?.accessGasUsed || s.accessGasUsed;
    console.log(`  Policy: ${s.policyId}, Commit: ${commitGas}, Access: ${accessGas}`);
  });
}

const execId1Samples = term0Samples.filter(s => s.executionId === 1);
console.log(`\nFound ${execId1Samples.length} samples with executionId=1`);

if (execId1Samples.length > 0) {
  console.log('\nExecution ID 1 samples:');
  execId1Samples.slice(0, 5).forEach(s => {
    const commitGas = s.features?.commitGasUsed || s.commitGasUsed;
    const accessGas = s.features?.accessGasUsed || s.accessGasUsed;
    console.log(`  Policy: ${s.policyId}, Commit: ${commitGas}, Access: ${accessGas}`);
  });
}

// Analyze by policy structure
console.log('\n=== Policy Structure Analysis ===\n');

console.log('Term 0 samples with merkle depth info:');
const term0WithStructure = term0Samples.filter(s => s.structure && s.structure.merkleDepth);
if (term0WithStructure.length > 0) {
  const depths = {};
  term0WithStructure.forEach(s => {
    const depth = s.structure.merkleDepth;
    depths[depth] = (depths[depth] || 0) + 1;
  });
  console.log('Merkle depths:', depths);
}

console.log('\nNon-Term 0 samples with merkle depth info:');
const nonTerm0WithStructure = nonTerm0Samples.filter(s => s.structure && s.structure.merkleDepth);
if (nonTerm0WithStructure.length > 0) {
  const depths = {};
  nonTerm0WithStructure.forEach(s => {
    const depth = s.structure.merkleDepth;
    depths[depth] = (depths[depth] || 0) + 1;
  });
  console.log('Merkle depths:', depths);
}

// Check execution configuration
console.log('\n=== Execution Configuration ===\n');
const sampleExec = term0Samples[0];
if (sampleExec.execution) {
  console.log('Execution config from sample:');
  console.log(JSON.stringify(sampleExec.execution, null, 2));
}
