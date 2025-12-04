/**
 * Quick test to verify gas padding fix
 */

const { ethers } = require('hardhat');
const { generateDataset, executeDataset } = require('./data_generator');

async function testGasPaddingFix() {
  console.log('=== Testing Gas Padding Fix ===\n');

  // Get contract
  const deployment = require('../../deployment.json');
  const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
  const contract = await PolicyPrivacy.attach(deployment.contracts.PolicyPrivacy);

  console.log('Contract address:', deployment.contracts.PolicyPrivacy);
  console.log('Generating small test dataset...\n');

  // Generate minimal dataset: 3 policies (GR, DS, RS), 1 execution each
  const dataset = await generateDataset({
    seed: 'gas-padding-test',
    policyCount: 3,
    executionsPerPolicy: 1,
    semanticLayers: [
      {
        name: 'test',
        combos: [['GR'], ['DS'], ['RS']],
        minPolicies: 3
      }
    ]
  });

  console.log('Generated', dataset.length, 'policies\n');
  console.log('Executing on blockchain...\n');

  // Execute and collect results
  const results = [];
  for (let i = 0; i < dataset.length; i++) {
    console.log(`Executing policy ${i + 1}/${dataset.length}...`);
    try {
      const { executePolicy } = require('./data_generator');
      const result = await executePolicy(dataset[i], contract);
      results.push(result);
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  console.log('\n=== Gas Padding Analysis ===\n');

  // Analyze gas usage
  const gasByType = {
    GR: [],
    DS: [],
    RS: []
  };

  results.forEach(r => {
    const codes = r.duoTermCodes;
    const accessGas = parseInt(r.features.accessGasUsed);

    if (codes.length === 1) {
      gasByType[codes[0]].push(accessGas);
    }
  });

  console.log('accessGasUsed by policy type:\n');
  Object.entries(gasByType).forEach(([type, gases]) => {
    if (gases.length > 0) {
      const avg = gases.reduce((a, b) => a + b, 0) / gases.length;
      console.log(`${type}:`, gases[0].toLocaleString(), 'gas');
    }
  });

  // Check if all are the same
  const allGases = Object.values(gasByType).flat();
  const uniqueGases = new Set(allGases);

  console.log('\n=== Result ===');
  console.log('Unique gas values:', uniqueGases.size);

  if (uniqueGases.size === 1) {
    console.log('✅ SUCCESS: All policies consume exactly the same gas!');
    console.log('   Final gas:', Array.from(uniqueGases)[0].toLocaleString());
  } else {
    console.log('⚠️  STILL DIFFERENT: Gas padding not fully effective');
    console.log('   Values:', Array.from(uniqueGases).map(g => g.toLocaleString()).join(', '));
    const maxDiff = Math.max(...allGases) - Math.min(...allGases);
    console.log('   Max difference:', maxDiff, 'gas');
  }

  process.exit(0);
}

testGasPaddingFix().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
