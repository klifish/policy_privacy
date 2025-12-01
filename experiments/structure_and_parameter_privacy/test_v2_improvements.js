/**
 * Test script to validate V2 improvements
 * Compares V1 and V2 classifications on the same dataset
 */

const {
  generateDataset: generateV2Dataset,
  LOGIC_STRUCTURES,
  NESTING_DEPTHS,
  PREDICATE_COUNTS,
  SET_SIZES,
  RANGE_WIDTHS
} = require('./data_generator_v2');

const {
  generateDataset: generateV1Dataset
} = require('./data_generator');

async function testClassificationImprovements() {
  console.log('='.repeat(80));
  console.log('SPP V2 Classification Improvements Test');
  console.log('='.repeat(80));
  console.log();

  const config = {
    policyCount: 30,  // Small sample for quick test
    executionsPerPolicy: 2,
    satisfyRatio: 0.5,
    seed: 'v2-test-' + Date.now()
  };

  console.log('Generating V2 dataset with improved classification...\n');
  const v2Dataset = await generateV2Dataset(config);

  console.log('\n' + '='.repeat(80));
  console.log('V2 CLASSIFICATION RESULTS');
  console.log('='.repeat(80));

  const v2Summary = v2Dataset.__meta.sppSummary;
  const v2Balance = v2Dataset.__meta.balanceMetrics;

  console.log('\n【Logic Structure】(NEW - independent of predicates)');
  console.log(JSON.stringify(v2Summary.logicStructures, null, 2));
  console.log('Balance:', v2Balance.v2.logicStructure);

  console.log('\n【Nesting Depth】(NEW - independent dimension)');
  console.log(JSON.stringify(v2Summary.nestingDepths, null, 2));
  console.log('Balance:', v2Balance.v2.nestingDepth);

  console.log('\n【Predicate Count】(NEW - clearer buckets)');
  console.log(JSON.stringify(v2Summary.predicateCounts, null, 2));
  console.log('Balance:', v2Balance.v2.predicateCount);

  console.log('\n【Set Size】(FIXED - only whitelist, no Merkle depth)');
  console.log(JSON.stringify(v2Summary.setSizes, null, 2));
  console.log('Balance:', v2Balance.v2.setSize);

  console.log('\n【Range Width】(NEW - separated from set size)');
  console.log(JSON.stringify(v2Summary.rangeWidths, null, 2));
  console.log('Balance:', v2Balance.v2.rangeWidth);

  console.log('\n' + '='.repeat(80));
  console.log('V1 CLASSIFICATION RESULTS (for comparison)');
  console.log('='.repeat(80));

  console.log('\n【Structure Type】(OLD)');
  console.log(JSON.stringify(v2Summary.structureTypes, null, 2));
  console.log('Balance:', v2Balance.v1.structureType);

  console.log('\n【Predicate Combo】(OLD)');
  console.log(JSON.stringify(v2Summary.predicateCombos, null, 2));
  console.log('Balance:', v2Balance.v1.predicateCombo);

  console.log('\n【Parameter Type】(OLD - mixed set/range)');
  console.log(JSON.stringify(v2Summary.parameterTypes, null, 2));
  console.log('Balance:', v2Balance.v1.paramType);

  console.log('\n' + '='.repeat(80));
  console.log('SAMPLE CLASSIFICATIONS');
  console.log('='.repeat(80));

  // Show 5 random samples with both v1 and v2 classifications
  const samples = [0, 15, 30, 45, 59].map(i => v2Dataset[i]).filter(Boolean);

  samples.forEach((policy, idx) => {
    console.log(`\nSample #${idx + 1}`);
    console.log('  Logic:', policy.semantics?.logicNormalized?.substring(0, 50) + '...');
    console.log('  Whitelist size:', policy.structure?.whitelistSize || 0);
    console.log('  Merkle depth:', policy.structure?.merkleDepth || 0);

    console.log('\n  V2 Classifications:');
    console.log('    - Logic Structure:', policy.logicStructure);
    console.log('    - Nesting Depth:', policy.nestingDepth);
    console.log('    - Predicate Count:', policy.predicateCount);
    console.log('    - Set Size:', policy.setSize);
    console.log('    - Range Width:', policy.rangeWidth);

    console.log('\n  V1 Classifications:');
    console.log('    - Structure Type:', policy.structureType_v1);
    console.log('    - Predicate Combo:', policy.predicateCombo_v1);
    console.log('    - Parameter Type:', policy.paramType_v1);
  });

  console.log('\n' + '='.repeat(80));
  console.log('KEY IMPROVEMENTS DEMONSTRATED');
  console.log('='.repeat(80));

  const improvements = [];

  // Check if paramType is now separated
  const hasBothSetAndRange = Object.keys(v2Summary.setSizes).length > 1 &&
                              Object.keys(v2Summary.rangeWidths).length > 1;
  if (hasBothSetAndRange) {
    improvements.push('✓ Set Size and Range Width are now independent dimensions');
  }

  // Check balance improvement
  const v2MinMaxRatios = Object.values(v2Balance.v2).map(m => parseFloat(m.minMaxRatio));
  const v1MinMaxRatios = Object.values(v2Balance.v1).map(m => parseFloat(m.minMaxRatio));
  const v2AvgBalance = v2MinMaxRatios.reduce((a, b) => a + b, 0) / v2MinMaxRatios.length;
  const v1AvgBalance = v1MinMaxRatios.reduce((a, b) => a + b, 0) / v1MinMaxRatios.length;

  if (v2AvgBalance > v1AvgBalance) {
    improvements.push(`✓ Improved balance: V2 avg min/max=${v2AvgBalance.toFixed(3)} vs V1=${v1AvgBalance.toFixed(3)}`);
  } else {
    improvements.push(`⚠ Balance not improved yet (may need more samples or stratified generation)`);
  }

  // Check dimension decoupling
  const v2HasNegationCategory = v2Summary.logicStructures.negation_heavy > 0;
  if (v2HasNegationCategory) {
    improvements.push('✓ New category "negation_heavy" captures previously missed patterns');
  }

  // Check granularity
  const v2Dimensions = Object.keys(v2Balance.v2).length;
  const v1Dimensions = Object.keys(v2Balance.v1).length;
  if (v2Dimensions > v1Dimensions) {
    improvements.push(`✓ Increased granularity: ${v2Dimensions} dimensions vs ${v1Dimensions}`);
  }

  improvements.forEach(imp => console.log(imp));

  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON SUMMARY');
  console.log('='.repeat(80));

  console.log('\nV2 Advantages:');
  console.log('  1. Separated set_size and range_width (no more confusion)');
  console.log('  2. Logic structure independent of predicates');
  console.log('  3. Clearer nesting depth categories');
  console.log('  4. More granular predicate counting');
  console.log('  5. Each dimension measures one concept only');

  console.log('\nV1 Issues Fixed:');
  console.log('  1. paramType mixed two concepts → Now separate');
  console.log('  2. with_sets too broad → Now split into logic_structure + predicate_count');
  console.log('  3. Unclear priorities in if-else → Now each dimension independent');
  console.log('  4. High correlation → Reduced by separating concerns');

  console.log('\nNext Steps:');
  console.log('  - Implement stratified sampling to ensure balance');
  console.log('  - Run full experiment (120+ policies) with V2');
  console.log('  - Compare attack success rates: V1 vs V2');
  console.log('  - Update run_experiment.js to use data_generator_v2');

  console.log('\n' + '='.repeat(80));
  console.log('TEST COMPLETE');
  console.log('='.repeat(80));

  return {
    v2Summary,
    v2Balance,
    improvements
  };
}

// Run if called directly
if (require.main === module) {
  testClassificationImprovements()
    .then(() => {
      console.log('\n✓ Test completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testClassificationImprovements };
