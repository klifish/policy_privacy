/**
 * Constraint-Aware Dataset Generator
 *
 * Generates datasets that satisfy validation requirements by design.
 * Instead of generate-then-validate, this ensures constraints are met during generation.
 *
 * Strategy:
 * 1. Analyze validation requirements
 * 2. Calculate minimum policies needed per category
 * 3. Generate policies in rounds to meet each requirement
 * 4. Verify final distribution
 */

const {
  generateDataset: generatePCHDataset,
  DUO_TERMS
} = require('../core/data_generator');

const {
  annotatePolicy,
  LOGIC_STRUCTURES,
  NESTING_DEPTHS,
  PREDICATE_COUNTS,
  SET_SIZES,
  RANGE_WIDTHS
} = require('./structure_and_parameter_privacy/data_generator');

// ============================================================================
// CONSTRAINT ANALYSIS
// ============================================================================

/**
 * Analyze validation requirements and calculate targets
 */
function analyzeConstraints(validationConfig, policyCount) {
  const targets = {
    pch: {},
    spp: {
      logicStructures: {},
      nestingDepths: {},
      predicateCounts: {},
      setSizes: {},
      rangeWidths: {}
    }
  };

  // PCH: Calculate target per DUO term
  const duoTermCount = Object.keys(DUO_TERMS).length;
  const minPerDUO = validationConfig.pch.minPoliciesPerDUO;
  const targetPerDUO = Math.ceil(policyCount / duoTermCount);

  Object.keys(DUO_TERMS).forEach(key => {
    const value = DUO_TERMS[key];
    targets.pch[value] = Math.max(minPerDUO, targetPerDUO);
  });

  // SPP: Calculate targets for each dimension
  const sppDimensions = [
    { key: 'logicStructures', values: LOGIC_STRUCTURES },
    { key: 'nestingDepths', values: NESTING_DEPTHS },
    { key: 'predicateCounts', values: PREDICATE_COUNTS },
    { key: 'setSizes', values: SET_SIZES },
    { key: 'rangeWidths', values: RANGE_WIDTHS }
  ];

  sppDimensions.forEach(dim => {
    const categoryCount = Object.keys(dim.values).length;
    const minPerCategory = validationConfig.spp.minPoliciesPerCategory;
    const targetPerCategory = Math.ceil(policyCount / categoryCount);

    Object.values(dim.values).forEach(category => {
      targets.spp[dim.key][category] = Math.max(minPerCategory, targetPerCategory);
    });
  });

  return targets;
}

// ============================================================================
// SEMANTIC LAYER GENERATION
// ============================================================================

/**
 * Generate semantic layers that ensure balanced DUO distribution
 */
function generateBalancedSemanticLayers(targets, policyCount) {
  const layers = [];

  // Calculate how many policies to generate per DUO
  const duoTargets = targets.pch;
  const totalTargets = Object.values(duoTargets).reduce((a, b) => a + b, 0);

  // Normalize targets to match policyCount
  const scale = policyCount / totalTargets;
  const normalizedTargets = {};
  Object.entries(duoTargets).forEach(([duo, target]) => {
    normalizedTargets[duo] = Math.round(target * scale);
  });

  // Adjust for rounding errors
  const currentTotal = Object.values(normalizedTargets).reduce((a, b) => a + b, 0);
  if (currentTotal < policyCount) {
    // Add remaining to the first DUO
    const firstDuo = Object.keys(normalizedTargets)[0];
    normalizedTargets[firstDuo] += (policyCount - currentTotal);
  }

  // Map DUO term values to attribute codes
  // Note: Only include DUO terms that are supported by the PCH generator
  const DUO_TO_ATTR = {
    [DUO_TERMS.GENERAL_RESEARCH]: 'GR',
    [DUO_TERMS.DISEASE_SPECIFIC]: 'DS',
    [DUO_TERMS.RESEARCH_SPECIFIC]: 'RS',
    [DUO_TERMS.POPULATION_ANCESTRY]: 'POA',
    [DUO_TERMS.GEOGRAPHICAL_RESTRICTION]: 'GS',
    [DUO_TERMS.CLINICAL_CARE]: 'CC'
    // COMMERCIAL_USE not supported by PCH generator
  };

  // Generate layers for each DUO term
  Object.entries(normalizedTargets).forEach(([duoValue, count]) => {
    if (count === 0) return;

    const duoCode = DUO_TO_ATTR[parseInt(duoValue)];
    if (!duoCode) return;

    // Create varied combinations with this DUO term
    const combinations = generateVariedCombinations(duoCode, count);

    layers.push({
      name: `balanced_${duoCode.toLowerCase()}`,
      minPolicies: count,
      maxPolicies: count,
      combos: combinations
    });
  });

  return layers;
}

/**
 * Generate varied combinations for a DUO term to increase SPP diversity
 */
function generateVariedCombinations(primaryDuo, count) {
  const combos = [];
  const otherDuos = ['GR', 'DS', 'RS'].filter(d => d !== primaryDuo);  // Only use well-supported DUOs

  // Strategy: Mix singleton and pairs (avoid too complex combinations)
  const singletonCount = Math.floor(count * 0.5);
  const pairCount = count - singletonCount;

  // Singletons (for simple structures)
  for (let i = 0; i < singletonCount; i++) {
    combos.push([primaryDuo]);
  }

  // Pairs (for moderate complexity)
  for (let i = 0; i < pairCount; i++) {
    const other = otherDuos[i % otherDuos.length];
    combos.push([primaryDuo, other]);
  }

  return combos;
}

/**
 * Generate logic options to ensure SPP structure diversity
 */
function generateStructureAwareLogicOptions(targets) {
  const options = {
    // Increase negation probability to generate more negation_heavy
    negationProbability: 0.3,  // Default is usually lower

    // Encourage nested structures
    nestedProbability: 0.4,

    // Mix of AND and OR
    orProbability: 0.4,
    andProbability: 0.6
  };

  return options;
}

/**
 * Generate whitelist bucket options to ensure SET_SIZE diversity
 */
function generateSetSizeOptions(targets) {
  const setSizeTargets = targets.spp.setSizes;

  const buckets = [];

  // NONE (0)
  if (setSizeTargets[SET_SIZES.NONE] > 0) {
    // This is achieved by GR-only policies
  }

  // SMALL (1-4)
  if (setSizeTargets[SET_SIZES.SMALL] > 0) {
    buckets.push(2, 4);
  }

  // MEDIUM (5-16)
  if (setSizeTargets[SET_SIZES.MEDIUM] > 0) {
    buckets.push(8, 12, 16);
  }

  // LARGE (17+)
  if (setSizeTargets[SET_SIZES.LARGE] > 0) {
    buckets.push(20, 24, 32);
  }

  return buckets.length > 0 ? buckets : [0, 4, 8, 16, 24];
}

/**
 * Generate Merkle depth options to ensure RANGE_WIDTH diversity
 */
function generateRangeWidthOptions(targets) {
  const rangeTargets = targets.spp.rangeWidths;

  const depths = [];

  // NARROW (depth ≤ 3)
  if (rangeTargets[RANGE_WIDTHS.NARROW] > 0) {
    depths.push(2, 3);
  }

  // MEDIUM (depth 4-6)
  if (rangeTargets[RANGE_WIDTHS.MEDIUM] > 0) {
    depths.push(4, 5, 6);
  }

  // WIDE (depth ≥ 7)
  if (rangeTargets[RANGE_WIDTHS.WIDE] > 0) {
    depths.push(7, 8);
  }

  return depths.length > 0 ? depths : [3, 5, 7];
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

/**
 * Generate dataset with constraint-aware strategy
 */
async function generateConstraintAwareDataset(config) {
  const {
    policyCount = 200,
    executionsPerPolicy = 5,
    satisfyRatio = 0.5,
    seed = 'constraint-aware',
    validation = {
      pch: { minPoliciesPerDUO: 20, minMaxRatio: 0.4 },
      spp: { minPoliciesPerCategory: 15, minMaxRatio: 0.3, maxCV: 0.6 },
      pi: { minPairsPerType: 30, minSemanticDiversity: 0.6 }
    }
  } = config;

  console.log('🎯 Generating Constraint-Aware Dataset');
  console.log('   Strategy: Ensure requirements are met by design\n');

  // Step 1: Analyze constraints
  console.log('📋 Step 1: Analyzing constraints...');
  const targets = analyzeConstraints(validation, policyCount);

  console.log('   PCH targets (policies per DUO):');
  Object.entries(targets.pch).forEach(([duo, count]) => {
    console.log(`     DUO ${duo}: ${count}`);
  });

  console.log('   SPP targets (policies per category):');
  console.log(`     Logic structures: ${Object.values(targets.spp.logicStructures)[0]}-${Object.values(targets.spp.logicStructures).slice(-1)[0]}`);
  console.log(`     Nesting depths: ${Object.values(targets.spp.nestingDepths)[0]}-${Object.values(targets.spp.nestingDepths).slice(-1)[0]}`);

  // Step 2: Generate balanced semantic layers
  console.log('\n📊 Step 2: Generating balanced semantic layers...');
  const semanticLayers = generateBalancedSemanticLayers(targets, policyCount);
  console.log(`   Generated ${semanticLayers.length} layers`);
  semanticLayers.forEach(layer => {
    console.log(`     ${layer.name}: ${layer.minPolicies} policies, ${layer.combos.length} combinations`);
  });

  // Step 3: Generate structure-aware options
  console.log('\n🏗️  Step 3: Configuring structure-aware options...');
  const logicOptions = generateStructureAwareLogicOptions(targets);
  const whitelistBuckets = generateSetSizeOptions(targets);
  const merkleDepthOptions = generateRangeWidthOptions(targets);

  console.log('   Logic options:', JSON.stringify(logicOptions));
  console.log('   Whitelist buckets:', whitelistBuckets);
  console.log('   Merkle depths:', merkleDepthOptions);

  // Step 4: Generate dataset with custom configuration
  console.log('\n⚙️  Step 4: Generating dataset...');
  const dataset = await generatePCHDataset({
    policyCount,
    executionsPerPolicy,
    satisfyRatio,
    seed,
    semanticLayers,
    logicOptions,
    whitelistBuckets,
    merkleDepthOptions
  });

  console.log(`   ✓ Generated ${dataset.length} policy instances`);

  // Step 5: Verify distribution
  console.log('\n✅ Step 5: Verifying distribution...');
  const verification = verifyDistribution(dataset, targets);

  if (verification.allSatisfied) {
    console.log('   ✓ All constraints satisfied!');
  } else {
    console.log('   ⚠️  Some constraints not fully satisfied:');
    verification.issues.forEach(issue => {
      console.log(`     - ${issue}`);
    });
  }

  return {
    dataset,
    targets,
    verification
  };
}

/**
 * Verify that generated dataset meets targets
 */
function verifyDistribution(dataset, targets) {
  const issues = [];

  // Group by policy
  const policies = new Map();
  dataset.forEach(item => {
    if (!policies.has(item.policyId)) {
      policies.set(item.policyId, item);
    }
  });

  // Verify PCH distribution
  const duoCounts = {};
  policies.forEach(policy => {
    (policy.duoTerms || []).forEach(duo => {
      duoCounts[duo] = (duoCounts[duo] || 0) + 1;
    });
  });

  Object.entries(targets.pch).forEach(([duo, target]) => {
    const actual = duoCounts[duo] || 0;
    if (actual < target) {
      issues.push(`DUO ${duo}: ${actual} < ${target}`);
    }
  });

  // Verify SPP distribution (sample check)
  const annotatedPolicies = Array.from(policies.values());
  annotatedPolicies.forEach(p => annotatePolicy(p));

  const sppCounts = {
    logicStructures: {},
    nestingDepths: {},
    predicateCounts: {},
    setSizes: {},
    rangeWidths: {}
  };

  annotatedPolicies.forEach(policy => {
    sppCounts.logicStructures[policy.logicStructure] = (sppCounts.logicStructures[policy.logicStructure] || 0) + 1;
    sppCounts.nestingDepths[policy.nestingDepth] = (sppCounts.nestingDepths[policy.nestingDepth] || 0) + 1;
    sppCounts.predicateCounts[policy.predicateCount] = (sppCounts.predicateCounts[policy.predicateCount] || 0) + 1;
    sppCounts.setSizes[policy.setSize] = (sppCounts.setSizes[policy.setSize] || 0) + 1;
    sppCounts.rangeWidths[policy.rangeWidth] = (sppCounts.rangeWidths[policy.rangeWidth] || 0) + 1;
  });

  // Check each dimension
  Object.entries(targets.spp).forEach(([dimension, dimTargets]) => {
    Object.entries(dimTargets).forEach(([category, target]) => {
      const actual = sppCounts[dimension][category] || 0;
      if (actual < target * 0.8) {  // Allow 20% tolerance
        issues.push(`${dimension}.${category}: ${actual} < ${target} (target)`);
      }
    });
  });

  return {
    allSatisfied: issues.length === 0,
    issues,
    actualDistribution: {
      pch: duoCounts,
      spp: sppCounts
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateConstraintAwareDataset,
  analyzeConstraints,
  generateBalancedSemanticLayers,
  verifyDistribution
};

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const config = {
    policyCount: 200,
    executionsPerPolicy: 5,
    seed: 'constraint-aware-test'
  };

  generateConstraintAwareDataset(config)
    .then(({ dataset, verification }) => {
      console.log('\n' + '='.repeat(80));
      console.log('GENERATION COMPLETE');
      console.log('='.repeat(80));
      console.log(`\nGenerated: ${dataset.length} instances`);
      console.log(`Status: ${verification.allSatisfied ? '✅ ALL SATISFIED' : '⚠️  SOME ISSUES'}`);

      if (!verification.allSatisfied) {
        console.log('\nIssues:');
        verification.issues.forEach(issue => console.log(`  - ${issue}`));
      }

      process.exit(verification.allSatisfied ? 0 : 1);
    })
    .catch(err => {
      console.error('Error:', err);
      process.exit(2);
    });
}
