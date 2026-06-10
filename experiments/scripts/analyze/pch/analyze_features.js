const data = require('./results/execution_results.json');

// Extract all features
const features = data.map(d => d.features);

// Get all feature names
const featureNames = Object.keys(features[0]);

console.log('=== Feature Variance Analysis ===\n');
console.log('Total executions:', data.length);
console.log('Total features:', featureNames.length);
console.log();

const constantFeatures = [];
const variableFeatures = [];

featureNames.forEach(name => {
  const values = features.map(f => f[name]);
  const uniqueValues = [...new Set(values)];

  if (uniqueValues.length === 1) {
    constantFeatures.push({
      name,
      value: uniqueValues[0]
    });
  } else {
    const nums = values.map(v => parseFloat(v)).filter(v => !isNaN(v));
    if (nums.length > 0) {
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
      variableFeatures.push({
        name,
        unique: uniqueValues.length,
        min,
        max,
        avg: Math.round(avg),
        range: max - min
      });
    } else {
      variableFeatures.push({
        name,
        unique: uniqueValues.length,
        values: uniqueValues.slice(0, 5)
      });
    }
  }
});

console.log('✅ Constant Features (Zero Variance):');
console.log('='.repeat(60));
if (constantFeatures.length === 0) {
  console.log('None - all features have variance');
} else {
  constantFeatures.forEach(f => {
    console.log(`  ${f.name}: ${f.value}`);
  });
}

console.log(`\nTotal constant features: ${constantFeatures.length}`);
console.log();

console.log('📊 Variable Features:');
console.log('='.repeat(60));
variableFeatures
  .sort((a, b) => (b.range || 0) - (a.range || 0))
  .forEach(f => {
    if (typeof f.min === 'number') {
      console.log(`  ${f.name}:`);
      console.log(`    Unique values: ${f.unique}`);
      console.log(`    Range: ${f.min.toLocaleString()} - ${f.max.toLocaleString()}`);
      console.log(`    Avg: ${f.avg.toLocaleString()}`);
      console.log(`    Difference: ${f.range.toLocaleString()}`);
    } else {
      console.log(`  ${f.name}: ${f.unique} unique values`);
    }
  });

console.log(`\nTotal variable features: ${variableFeatures.length}`);
