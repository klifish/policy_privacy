const data = require('./results/execution_results.json');

console.log('=== Detailed accessGasUsed Analysis ===\n');

// Group by DUO term codes
const gasByDuoCodes = {};

data.forEach(d => {
  const codes = d.duoTermCodes.join(',') || 'unknown';
  const gas = parseInt(d.features.accessGasUsed);

  if (!gasByDuoCodes[codes]) {
    gasByDuoCodes[codes] = [];
  }
  gasByDuoCodes[codes].push(gas);
});

console.log('Gas consumption by DUO term combination:\n');

Object.entries(gasByDuoCodes)
  .sort((a, b) => a[0].localeCompare(b[0]))
  .forEach(([codes, gases]) => {
    const min = Math.min(...gases);
    const max = Math.max(...gases);
    const avg = Math.round(gases.reduce((a, b) => a + b, 0) / gases.length);
    const unique = new Set(gases).size;

    console.log(`DUO terms: ${codes}`);
    console.log(`  Count: ${gases.length}`);
    console.log(`  Unique gas values: ${unique}`);
    console.log(`  Min: ${min.toLocaleString()}`);
    console.log(`  Max: ${max.toLocaleString()}`);
    console.log(`  Avg: ${avg.toLocaleString()}`);
    console.log(`  Range: ${(max - min).toLocaleString()}`);
    console.log();
  });
