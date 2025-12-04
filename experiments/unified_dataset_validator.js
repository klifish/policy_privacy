/**
 * Unified Dataset Validator
 *
 * Validates that a generated dataset satisfies the requirements of all three experiments:
 * 1. PCH (Policy Content Hiding) - DUO term distribution
 * 2. SPP (Structure & Parameter Privacy) - 5-dimension balance
 * 3. PI (Policy Indistinguishability) - Semantic diversity for pairing
 *
 * Usage:
 *   node unified_dataset_validator.js [--generate] [--config=path/to/config.json]
 *
 * Process:
 *   1. Generate policy definitions (without blockchain execution)
 *   2. Check PCH requirements
 *   3. Check SPP requirements
 *   4. Check PI requirements
 *   5. Report overall validation status
 */

const fs = require('fs');
const path = require('path');

// Import generators and analyzers
const {
  generateDataset: generatePCHDataset,
  DUO_TERMS
} = require('./policy_content_hiding/data_generator');

const {
  annotatePolicy,
  summarizeDataset,
  calculateBalanceMetrics,
  LOGIC_STRUCTURES,
  NESTING_DEPTHS,
  PREDICATE_COUNTS,
  SET_SIZES,
  RANGE_WIDTHS
} = require('./structure_and_parameter_privacy/data_generator');

const {
  computeSemanticSimilarity
} = require('./policy_indistinguishability/data_generator');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Aggregate dataset by policy (without requiring execution results)
 * This is a simplified version that works with policy definitions only
 */
function aggregatePoliciesByDefinition(dataset) {
  const policies = new Map();

  for (const result of dataset) {
    const id = result.policyId;

    if (!policies.has(id)) {
      policies.set(id, {
        policyId: id,
        policyIndex: result.policyIndex,
        layer: result.layer,
        duoTerm: result.duoTerm,
        duoTerms: Array.isArray(result.duoTerms) ? result.duoTerms.slice() : [],
        semantics: { ...result.semantics },
        structure: { ...result.structure },
        executionProfile: { ...(result.execution || {}) },
        predicateSlots: Array.isArray(result.predicateSlots) ? result.predicateSlots.slice() : [],
        ontologyNamespace: result.ontologyNamespace,
        ontologyValue: result.ontologyValue,
        executionCount: 0
      });
    }

    const policy = policies.get(id);
    policy.executionCount++;
  }

  return Array.from(policies.values());
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const UNIFIED_CONFIG = {
  policyCount: 200,
  executionsPerPolicy: 5,
  satisfyRatio: 0.5,
  seed: 'unified-validation-2024',

  // Validation thresholds
  validation: {
    pch: {
      minPoliciesPerDUO: 20,        // Minimum policies per DUO term
      minMaxRatio: 0.4,             // Minimum samples / maximum samples
    },
    spp: {
      minPoliciesPerCategory: 15,   // Minimum policies per category in each dimension
      minMaxRatio: 0.3,             // Balance ratio threshold
      maxCV: 0.6,                   // Maximum coefficient of variation
    },
    pi: {
      minPairsPerType: 30,          // Minimum pairs per type
      minSemanticDiversity: 0.6,    // Minimum average semantic distance
    }
  }
};

// ============================================================================
// PCH VALIDATION
// ============================================================================

/**
 * Check if dataset satisfies PCH requirements
 */
function validatePCHRequirements(dataset, config) {
  console.log('\n' + '='.repeat(80));
  console.log('PCH (Policy Content Hiding) Validation');
  console.log('='.repeat(80));

  // Aggregate by policy (not execution)
  const policies = aggregatePoliciesByDefinition(dataset);

  // Count DUO term distribution
  const duoDistribution = {};
  const duoNames = {
    [DUO_TERMS.GENERAL_RESEARCH]: 'GR',
    [DUO_TERMS.DISEASE_SPECIFIC]: 'DS',
    [DUO_TERMS.RESEARCH_SPECIFIC]: 'RS',
    [DUO_TERMS.POPULATION_ANCESTRY]: 'POA',
    [DUO_TERMS.GEOGRAPHICAL_RESTRICTION]: 'GS',
    [DUO_TERMS.CLINICAL_CARE]: 'CC',
    [DUO_TERMS.COMMERCIAL_USE]: 'CU'
  };

  policies.forEach(policy => {
    const duoTerms = policy.semantics?.duoTerms || [];
    duoTerms.forEach(term => {
      const name = duoNames[term] || `DUO_${term}`;
      duoDistribution[name] = (duoDistribution[name] || 0) + 1;
    });
  });

  // Calculate balance metrics
  const counts = Object.values(duoDistribution);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const minMaxRatio = min / max;

  console.log('\n📊 DUO Term Distribution:');
  Object.entries(duoDistribution).forEach(([duo, count]) => {
    const pct = ((count / policies.length) * 100).toFixed(1);
    console.log(`  ${duo.padEnd(5)}: ${count.toString().padStart(4)} (${pct}%)`);
  });

  console.log('\n📈 Balance Metrics:');
  console.log(`  Min:         ${min}`);
  console.log(`  Max:         ${max}`);
  console.log(`  Mean:        ${mean.toFixed(1)}`);
  console.log(`  Min/Max:     ${minMaxRatio.toFixed(3)}`);

  // Validation
  const issues = [];
  const threshold = config.validation.pch.minPoliciesPerDUO;
  const ratioThreshold = config.validation.pch.minMaxRatio;

  Object.entries(duoDistribution).forEach(([duo, count]) => {
    if (count < threshold) {
      issues.push(`${duo} has only ${count} policies (< ${threshold})`);
    }
  });

  if (minMaxRatio < ratioThreshold) {
    issues.push(`Min/Max ratio ${minMaxRatio.toFixed(3)} is below threshold ${ratioThreshold}`);
  }

  if (issues.length === 0) {
    console.log('\n✅ PCH Requirements: PASSED');
    return { passed: true, issues: [] };
  } else {
    console.log('\n❌ PCH Requirements: FAILED');
    issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    return { passed: false, issues };
  }
}

// ============================================================================
// SPP VALIDATION
// ============================================================================

/**
 * Check if dataset satisfies SPP requirements
 */
function validateSPPRequirements(dataset, config) {
  console.log('\n' + '='.repeat(80));
  console.log('SPP (Structure & Parameter Privacy) Validation');
  console.log('='.repeat(80));

  // Aggregate by policy and annotate with SPP dimensions
  const policies = aggregatePoliciesByDefinition(dataset);
  policies.forEach(policy => annotatePolicy(policy));

  // Summarize distributions
  const summary = summarizeDataset(policies);

  console.log('\n📊 5-Dimension Distributions:');

  const dimensions = [
    { name: 'Logic Structure', key: 'logicStructures', values: LOGIC_STRUCTURES },
    { name: 'Nesting Depth', key: 'nestingDepths', values: NESTING_DEPTHS },
    { name: 'Predicate Count', key: 'predicateCounts', values: PREDICATE_COUNTS },
    { name: 'Set Size', key: 'setSizes', values: SET_SIZES },
    { name: 'Range Width', key: 'rangeWidths', values: RANGE_WIDTHS }
  ];

  const allBalanceMetrics = {};
  const issues = [];

  dimensions.forEach(dim => {
    console.log(`\n  ${dim.name}:`);
    const distribution = summary[dim.key] || {};

    Object.entries(distribution).forEach(([category, count]) => {
      const pct = ((count / policies.length) * 100).toFixed(1);
      console.log(`    ${category.padEnd(20)}: ${count.toString().padStart(4)} (${pct}%)`);
    });

    // Calculate balance metrics
    const metrics = calculateBalanceMetrics(distribution);
    allBalanceMetrics[dim.key] = metrics;

    console.log(`    Balance: min/max=${metrics.minMaxRatio}, CV=${metrics.coefficientOfVariation}`);

    // Validation
    const minThreshold = config.validation.spp.minPoliciesPerCategory;
    const ratioThreshold = config.validation.spp.minMaxRatio;
    const cvThreshold = config.validation.spp.maxCV;

    if (metrics.min < minThreshold) {
      issues.push(`${dim.name}: min count ${metrics.min} < ${minThreshold}`);
    }
    if (parseFloat(metrics.minMaxRatio) < ratioThreshold) {
      issues.push(`${dim.name}: min/max ratio ${metrics.minMaxRatio} < ${ratioThreshold}`);
    }
    if (parseFloat(metrics.coefficientOfVariation) > cvThreshold) {
      issues.push(`${dim.name}: CV ${metrics.coefficientOfVariation} > ${cvThreshold}`);
    }
  });

  if (issues.length === 0) {
    console.log('\n✅ SPP Requirements: PASSED');
    return { passed: true, issues: [], metrics: allBalanceMetrics };
  } else {
    console.log('\n❌ SPP Requirements: FAILED');
    issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    return { passed: false, issues, metrics: allBalanceMetrics };
  }
}

// ============================================================================
// PI VALIDATION
// ============================================================================

/**
 * Check if dataset satisfies PI requirements
 */
function validatePIRequirements(dataset, config) {
  console.log('\n' + '='.repeat(80));
  console.log('PI (Policy Indistinguishability) Validation');
  console.log('='.repeat(80));

  // Aggregate by policy
  const policies = aggregatePoliciesByDefinition(dataset);

  // Sample pairs to estimate diversity (full pairing would be too expensive)
  const sampleSize = Math.min(100, policies.length);
  const sampledIndices = [];
  for (let i = 0; i < sampleSize; i++) {
    sampledIndices.push(Math.floor(Math.random() * policies.length));
  }

  const similarities = [];
  for (let i = 0; i < sampledIndices.length; i++) {
    for (let j = i + 1; j < sampledIndices.length; j++) {
      const policyA = policies[sampledIndices[i]];
      const policyB = policies[sampledIndices[j]];

      if (policyA && policyB && policyA.semantics && policyB.semantics) {
        const similarity = computeSemanticSimilarity(policyA.semantics, policyB.semantics);
        similarities.push(similarity);
      }
    }
  }

  // Calculate diversity metrics
  const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const avgDiversity = 1 - avgSimilarity;

  // Estimate pair type distribution
  const pairTypes = {
    semantic_equivalent: 0,
    structural_variant: 0,
    weak_equivalent: 0,
    controlled_difference: 0
  };

  similarities.forEach(sim => {
    if (sim >= 0.999) pairTypes.semantic_equivalent++;
    else if (sim >= 0.95) pairTypes.weak_equivalent++;
    else pairTypes.controlled_difference++;
  });

  console.log('\n📊 Semantic Diversity (sampled):');
  console.log(`  Average similarity:  ${avgSimilarity.toFixed(3)}`);
  console.log(`  Average diversity:   ${avgDiversity.toFixed(3)}`);
  console.log(`  Sample size:         ${similarities.length} pairs`);

  console.log('\n📊 Estimated Pair Type Distribution:');
  Object.entries(pairTypes).forEach(([type, count]) => {
    const pct = ((count / similarities.length) * 100).toFixed(1);
    console.log(`  ${type.padEnd(25)}: ${count.toString().padStart(4)} (${pct}%)`);
  });

  // Validation
  const issues = [];
  const diversityThreshold = config.validation.pi.minSemanticDiversity;

  if (avgDiversity < diversityThreshold) {
    issues.push(`Average diversity ${avgDiversity.toFixed(3)} < ${diversityThreshold}`);
  }

  // Estimate total pairs per type (assuming sampled distribution is representative)
  const totalPossiblePairs = (policies.length * (policies.length - 1)) / 2;
  console.log(`\n📈 Estimated Total Pairs: ${totalPossiblePairs.toLocaleString()}`);

  Object.entries(pairTypes).forEach(([type, sampledCount]) => {
    const estimatedTotal = Math.floor((sampledCount / similarities.length) * totalPossiblePairs);
    console.log(`  ${type}: ~${estimatedTotal.toLocaleString()}`);

    const minRequired = config.validation.pi.minPairsPerType;
    if (estimatedTotal < minRequired) {
      issues.push(`Estimated ${type} pairs (${estimatedTotal}) < ${minRequired}`);
    }
  });

  if (issues.length === 0) {
    console.log('\n✅ PI Requirements: PASSED');
    return { passed: true, issues: [] };
  } else {
    console.log('\n❌ PI Requirements: FAILED');
    issues.forEach(issue => console.log(`  ⚠️  ${issue}`));
    return { passed: false, issues };
  }
}

// ============================================================================
// MAIN VALIDATION WORKFLOW
// ============================================================================

async function validateUnifiedDataset(config = UNIFIED_CONFIG) {
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + 'UNIFIED DATASET VALIDATOR' + ' '.repeat(33) + '║');
  console.log('╚' + '═'.repeat(78) + '╝');

  console.log('\n📋 Configuration:');
  console.log(`  Policy count:              ${config.policyCount}`);
  console.log(`  Executions per policy:     ${config.executionsPerPolicy}`);
  console.log(`  Seed:                      ${config.seed}`);

  // Step 1: Generate dataset (without blockchain execution)
  console.log('\n' + '='.repeat(80));
  console.log('Step 1: Generating Policy Definitions (no blockchain execution)');
  console.log('='.repeat(80));

  const startTime = Date.now();

  // Generate dataset - this creates policy definitions WITHOUT blockchain execution
  // The PCH generateDataset only creates policy artifacts and metadata
  // Actual blockchain execution is done separately via executePolicy()
  const dataset = await generatePCHDataset({
    policyCount: config.policyCount,
    executionsPerPolicy: config.executionsPerPolicy,
    satisfyRatio: config.satisfyRatio,
    seed: config.seed
  });

  const generationTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✓ Generated ${dataset.length} policy instances in ${generationTime}s`);

  // Step 2-4: Validate against all three experiments
  const results = {
    pch: validatePCHRequirements(dataset, config),
    spp: validateSPPRequirements(dataset, config),
    pi: validatePIRequirements(dataset, config)
  };

  // Step 5: Overall summary
  console.log('\n' + '═'.repeat(80));
  console.log('VALIDATION SUMMARY');
  console.log('═'.repeat(80));

  const allPassed = results.pch.passed && results.spp.passed && results.pi.passed;

  console.log('\n📊 Results:');
  console.log(`  PCH: ${results.pch.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  SPP: ${results.spp.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`  PI:  ${results.pi.passed ? '✅ PASSED' : '❌ FAILED'}`);

  if (allPassed) {
    console.log('\n' + '🎉'.repeat(40));
    console.log('✅ ALL VALIDATIONS PASSED');
    console.log('✅ Dataset is ready for blockchain execution!');
    console.log('🎉'.repeat(40));
  } else {
    console.log('\n' + '⚠️ '.repeat(40));
    console.log('❌ VALIDATION FAILED');
    console.log('');
    console.log('Recommendations:');
    console.log('  1. Review the issues listed above');
    console.log('  2. Adjust dataset generation parameters');
    console.log('  3. Consider increasing policy count or adjusting semantic layers');
    console.log('  4. Re-run validation until all checks pass');
    console.log('⚠️ '.repeat(40));
  }

  // Save results to file
  const resultPath = path.join(__dirname, 'validation_results.json');
  fs.writeFileSync(resultPath, JSON.stringify({
    config,
    results,
    timestamp: new Date().toISOString(),
    allPassed
  }, null, 2));

  console.log(`\n💾 Results saved to: ${resultPath}`);

  return {
    allPassed,
    results,
    dataset
  };
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);

  // Parse command line arguments
  let customConfig = { ...UNIFIED_CONFIG };

  args.forEach(arg => {
    if (arg.startsWith('--config=')) {
      const configPath = arg.split('=')[1];
      const loadedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      customConfig = { ...customConfig, ...loadedConfig };
    }
  });

  // Run validation
  validateUnifiedDataset(customConfig)
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch(err => {
      console.error('\n❌ Validation failed with error:');
      console.error(err);
      process.exit(2);
    });
}

module.exports = {
  validateUnifiedDataset,
  validatePCHRequirements,
  validateSPPRequirements,
  validatePIRequirements,
  UNIFIED_CONFIG
};
