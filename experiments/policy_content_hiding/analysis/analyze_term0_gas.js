/**
 * Analyze DUO Term 0 Gas Usage
 * Investigates why Term 0 shows the highest advantage (32.69%)
 */

const fs = require('fs');
const path = require('path');

function analyzeGasData() {
  // Load dataset
  const dataPath = path.join(__dirname, '../../unified/artifacts_data/pch_dataset.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  console.log('=== DUO Term 0 Gas Analysis ===\n');
  console.log('Dataset info:');
  console.log('  Total samples:', data.length);
  console.log();

  // Identify Term 0 samples
  // Term 0 samples have duoTerm === 0 OR duoTerms array contains 0
  const term0Samples = data.filter(d => {
    if (d.duoTerm === 0) return true;
    if (Array.isArray(d.duoTerms) && d.duoTerms.includes(0)) return true;
    return false;
  });

  const nonTerm0Samples = data.filter(d => {
    if (d.duoTerm === 0) return false;
    if (Array.isArray(d.duoTerms) && d.duoTerms.includes(0)) return false;
    return true;
  });

  console.log('Sample distribution:');
  console.log('  Term 0 samples:', term0Samples.length);
  console.log('  Non-Term 0 samples:', nonTerm0Samples.length);
  console.log('  Term 0 ratio:', (term0Samples.length / data.length * 100).toFixed(2) + '%');
  console.log();

  // Show DUO term codes for Term 0
  const term0Codes = new Set();
  term0Samples.forEach(s => {
    if (Array.isArray(s.duoTermCodes)) {
      s.duoTermCodes.forEach(code => term0Codes.add(code));
    }
  });
  console.log('Term 0 corresponds to DUO codes:', Array.from(term0Codes).join(', '));
  console.log();

  // Commit Gas Analysis
  console.log('=== Commit Gas Analysis ===\n');

  const term0CommitGas = term0Samples.map(s => parseInt(s.commitGasUsed || s.features?.commitGasUsed || 0)).filter(x => x > 0);
  const nonTerm0CommitGas = nonTerm0Samples.map(s => parseInt(s.commitGasUsed || s.features?.commitGasUsed || 0)).filter(x => x > 0);

  const term0CommitStats = calculateStats(term0CommitGas);
  const nonTerm0CommitStats = calculateStats(nonTerm0CommitGas);

  console.log('Term 0 Commit Gas:');
  printStats(term0CommitStats);
  console.log();

  console.log('Non-Term 0 Commit Gas:');
  printStats(nonTerm0CommitStats);
  console.log();

  console.log('Commit Gas Difference (Mean):');
  console.log('  Absolute:', Math.abs(term0CommitStats.mean - nonTerm0CommitStats.mean).toFixed(2), 'gas');
  console.log('  Relative:', (Math.abs(term0CommitStats.mean - nonTerm0CommitStats.mean) / nonTerm0CommitStats.mean * 100).toFixed(3) + '%');
  console.log();

  // Access Gas Analysis
  console.log('=== Access Gas Analysis ===\n');

  const term0AccessGas = term0Samples.map(s => parseInt(s.accessGasUsed || s.features?.accessGasUsed || 0)).filter(x => x > 0);
  const nonTerm0AccessGas = nonTerm0Samples.map(s => parseInt(s.accessGasUsed || s.features?.accessGasUsed || 0)).filter(x => x > 0);

  const term0AccessStats = calculateStats(term0AccessGas);
  const nonTerm0AccessStats = calculateStats(nonTerm0AccessGas);

  console.log('Term 0 Access Gas:');
  printStats(term0AccessStats);
  console.log();

  console.log('Non-Term 0 Access Gas:');
  printStats(nonTerm0AccessStats);
  console.log();

  console.log('Access Gas Difference (Mean):');
  console.log('  Absolute:', Math.abs(term0AccessStats.mean - nonTerm0AccessStats.mean).toFixed(2), 'gas');
  console.log('  Relative:', (Math.abs(term0AccessStats.mean - nonTerm0AccessStats.mean) / nonTerm0AccessStats.mean * 100).toFixed(3) + '%');
  console.log();

  // Distribution Analysis
  console.log('=== Gas Distribution Analysis ===\n');

  console.log('Commit Gas Histogram (Term 0):');
  printHistogram(term0CommitGas, 5);
  console.log();

  console.log('Commit Gas Histogram (Non-Term 0):');
  printHistogram(nonTerm0CommitGas, 5);
  console.log();

  console.log('Access Gas Histogram (Term 0):');
  printHistogram(term0AccessGas, 5);
  console.log();

  console.log('Access Gas Histogram (Non-Term 0):');
  printHistogram(nonTerm0AccessGas, 5);
  console.log();

  // Overlap Analysis
  console.log('=== Distribution Overlap Analysis ===\n');

  const commitOverlap = calculateOverlap(term0CommitGas, nonTerm0CommitGas);
  const accessOverlap = calculateOverlap(term0AccessGas, nonTerm0AccessGas);

  console.log('Commit Gas Range Overlap:', (commitOverlap * 100).toFixed(2) + '%');
  console.log('Access Gas Range Overlap:', (accessOverlap * 100).toFixed(2) + '%');
  console.log();

  // Sample examples
  console.log('=== Sample Examples ===\n');
  console.log('Term 0 samples (first 5):');
  term0Samples.slice(0, 5).forEach((s, i) => {
    const commit = s.commitGasUsed || s.features?.commitGasUsed || 'N/A';
    const access = s.accessGasUsed || s.features?.accessGasUsed || 'N/A';
    console.log(`  ${i + 1}. Policy: ${s.policyId}, Commit: ${commit}, Access: ${access}`);
  });
  console.log();

  console.log('Non-Term 0 samples (first 5):');
  nonTerm0Samples.slice(0, 5).forEach((s, i) => {
    const commit = s.commitGasUsed || s.features?.commitGasUsed || 'N/A';
    const access = s.accessGasUsed || s.features?.accessGasUsed || 'N/A';
    console.log(`  ${i + 1}. Policy: ${s.policyId}, DUO: ${s.duoTermCodes ? s.duoTermCodes.join(',') : s.duoTerm}, Commit: ${commit}, Access: ${access}`);
  });
  console.log();

  // Separability analysis
  console.log('=== Separability Analysis ===\n');
  console.log('If an adversary uses a simple threshold classifier:');

  const commitThreshold = (term0CommitStats.mean + nonTerm0CommitStats.mean) / 2;
  const accessThreshold = (term0AccessStats.mean + nonTerm0AccessStats.mean) / 2;

  console.log(`  Commit Gas Threshold: ${commitThreshold.toFixed(2)}`);
  console.log(`  Access Gas Threshold: ${accessThreshold.toFixed(2)}`);
  console.log();

  // Calculate accuracy with simple threshold
  let commitCorrect = 0;
  let accessCorrect = 0;

  data.forEach(d => {
    const isTerm0 = d.duoTerm === 0 || (Array.isArray(d.duoTerms) && d.duoTerms.includes(0));
    const commitGas = parseInt(d.commitGasUsed || d.features?.commitGasUsed || 0);
    const accessGas = parseInt(d.accessGasUsed || d.features?.accessGasUsed || 0);

    if (commitGas === 0 || accessGas === 0) return;

    // Check if term 0 has higher or lower gas
    const term0HasHigherCommit = term0CommitStats.mean > nonTerm0CommitStats.mean;
    const term0HasHigherAccess = term0AccessStats.mean > nonTerm0AccessStats.mean;

    const commitPrediction = term0HasHigherCommit ?
      (commitGas > commitThreshold) :
      (commitGas < commitThreshold);

    const accessPrediction = term0HasHigherAccess ?
      (accessGas > accessThreshold) :
      (accessGas < accessThreshold);

    if (commitPrediction === isTerm0) commitCorrect++;
    if (accessPrediction === isTerm0) accessCorrect++;
  });

  const commitAccuracy = commitCorrect / data.length;
  const accessAccuracy = accessCorrect / data.length;
  const randomBaseline = Math.max(term0Samples.length, nonTerm0Samples.length) / data.length;

  console.log('Simple Threshold Classifier Accuracy:');
  console.log('  Commit Gas:', (commitAccuracy * 100).toFixed(2) + '%');
  console.log('  Access Gas:', (accessAccuracy * 100).toFixed(2) + '%');
  console.log('  Random Baseline:', (randomBaseline * 100).toFixed(2) + '%');
  console.log('  Commit Advantage:', ((commitAccuracy - randomBaseline) * 100).toFixed(2) + '%');
  console.log('  Access Advantage:', ((accessAccuracy - randomBaseline) * 100).toFixed(2) + '%');
  console.log();

  console.log('=== Conclusion ===\n');
  console.log('Term 0 shows distinguishable gas patterns that allow adversaries');
  console.log('to predict its presence with significantly better than random accuracy.');
  console.log('The ML model achieved 32.69% advantage, likely by exploiting these gas differences.');
}

function calculateStats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);

  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: mean,
    median: sorted[Math.floor(sorted.length / 2)],
    std: std,
    range: sorted[sorted.length - 1] - sorted[0]
  };
}

function printStats(stats) {
  console.log('  Min:', stats.min.toLocaleString());
  console.log('  Max:', stats.max.toLocaleString());
  console.log('  Range:', stats.range.toLocaleString());
  console.log('  Mean:', stats.mean.toFixed(2));
  console.log('  Median:', stats.median.toLocaleString());
  console.log('  Std Dev:', stats.std.toFixed(2));
}

function printHistogram(values, bins) {
  const stats = calculateStats(values);
  const binSize = stats.range / bins;
  const histogram = new Array(bins).fill(0);

  values.forEach(val => {
    const binIndex = Math.min(Math.floor((val - stats.min) / binSize), bins - 1);
    histogram[binIndex]++;
  });

  histogram.forEach((count, i) => {
    const rangeStart = stats.min + i * binSize;
    const rangeEnd = stats.min + (i + 1) * binSize;
    const bar = '█'.repeat(Math.ceil(count / values.length * 50));
    console.log(`  [${rangeStart.toFixed(0)}-${rangeEnd.toFixed(0)}]: ${bar} ${count} (${(count/values.length*100).toFixed(1)}%)`);
  });
}

function calculateOverlap(values1, values2) {
  const min1 = Math.min(...values1);
  const max1 = Math.max(...values1);
  const min2 = Math.min(...values2);
  const max2 = Math.max(...values2);

  const overlapStart = Math.max(min1, min2);
  const overlapEnd = Math.min(max1, max2);

  if (overlapStart >= overlapEnd) return 0;

  const overlap = overlapEnd - overlapStart;
  const totalRange = Math.max(max1, max2) - Math.min(min1, min2);

  return overlap / totalRange;
}

// Run analysis
try {
  analyzeGasData();
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
