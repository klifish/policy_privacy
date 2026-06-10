/**
 * Policy Indistinguishability (PI) Specialized Data Generator
 *
 * This generator is specifically designed for PI experiments, optimizing for:
 * 1. Maximum data utilization (use all generated policies)
 * 2. Balanced pair type distribution
 * 3. Statistical power (sufficient samples per category)
 * 4. Random sampling to avoid selection bias
 *
 * Unlike the PCH generator which focuses on individual policy samples,
 * this generator treats policy pairs as the primary evaluation unit.
 */

const crypto = require('crypto');
const { executePolicy } = require('../core/data_generator');

// Re-export constants from PCH generator for compatibility
const {
  DUO_TERMS,
  FEATURE_KEYS
} = require('./data_generator');

// PI-specific configuration
const PI_DEFAULT_CONFIG = Object.freeze({
  policyCount: 200,
  executionsPerPolicy: 5,
  satisfyRatio: 0.5,
  minPairsPerType: 30,        // Minimum pairs per type for statistical power
  targetPairsPerType: 50,     // Target pairs per type
  maxPairsPerType: 100,       // Maximum pairs per type (cap for performance)
  randomSeed: null,
  ensureBalancedSampling: true
});

// Pair type thresholds (kept from original for compatibility)
const PAIR_TYPE_THRESHOLDS = Object.freeze({
  semantic_equivalent: { similarity: 0.999, structureMustDiffer: true, executionMustDiffer: false },
  structural_variant: { similarity: 0.999, structureMustDiffer: true, executionMustDiffer: false },
  weak_equivalent: { similarity: 0.95, structureMustDiffer: false, executionMustDiffer: false },
  controlled_difference: { similarity: 0.0, structureMustDiffer: false, executionMustDiffer: false }
});

/**
 * Seeded random number generator for reproducibility
 */
class SeededRandom {
  constructor(seed) {
    this.seed = seed || Date.now();
    this.state = this.seed;
  }

  next() {
    // Linear congruential generator
    this.state = (this.state * 1103515245 + 12345) & 0x7fffffff;
    return this.state / 0x7fffffff;
  }

  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  sample(array, n) {
    const shuffled = this.shuffle(array);
    return shuffled.slice(0, Math.min(n, array.length));
  }
}

/**
 * Import necessary functions from original data_generator
 */
const {
  generateDataset,
  aggregatePolicies,
  computeSemanticSimilarity,
  mapFeaturesToRecord
} = require('./data_generator');

/**
 * Compute semantic signature for grouping
 */
function semanticsSignature(semantics) {
  const terms = [...semantics.duoTerms].sort().join('|');
  const predicates = semantics.predicateCount || 0;
  const hasOntology = semantics.hasOntology ? 1 : 0;
  const hasObligation = semantics.hasObligation ? 1 : 0;
  const hasCredential = semantics.hasCredential ? 1 : 0;
  return `${terms}:${predicates}:${hasOntology}:${hasObligation}:${hasCredential}`;
}

/**
 * Compute structural fingerprint
 */
function structuralFingerprint(structure) {
  const depth = structure.merkleDepth || 0;
  const policyDepth = structure.policyDepth || 0;
  const whitelistSize = structure.whitelistSize || 0;
  const proofType = structure.proofType || 'null';
  return `${depth}:${policyDepth}:${whitelistSize}:${proofType}`;
}

/**
 * Count execution profile differences
 */
function countExecutionDifferences(profileA, profileB) {
  let diffs = 0;
  if (profileA.path_unify !== profileB.path_unify) diffs++;
  if (profileA.gas_pad !== profileB.gas_pad) diffs++;
  if (profileA.event_pad !== profileB.event_pad) diffs++;
  if (profileA.proof_pad !== profileB.proof_pad) diffs++;
  if (profileA.batch_pattern !== profileB.batch_pattern) diffs++;
  return diffs;
}

/**
 * Determine pair type based on similarity and differences
 */
function determinePairType(policyA, policyB) {
  const similarity = computeSemanticSimilarity(policyA.semantics, policyB.semantics);
  const executionDiffs = countExecutionDifferences(policyA.executionProfile, policyB.executionProfile);
  const structureHashEqual = structuralFingerprint(policyA.structure) === structuralFingerprint(policyB.structure);

  // Semantic equivalent: near-identical semantics, different structure
  if (similarity >= PAIR_TYPE_THRESHOLDS.semantic_equivalent.similarity && !structureHashEqual) {
    // Structural variant: also has execution differences
    if (executionDiffs > 0) {
      return { type: 'structural_variant', similarity, executionDiffs, structureHashEqual };
    }
    return { type: 'semantic_equivalent', similarity, executionDiffs, structureHashEqual };
  }

  // Weak equivalent: high semantic similarity
  if (similarity >= PAIR_TYPE_THRESHOLDS.weak_equivalent.similarity) {
    return { type: 'weak_equivalent', similarity, executionDiffs, structureHashEqual };
  }

  // Everything else is controlled difference
  return { type: 'controlled_difference', similarity, executionDiffs, structureHashEqual };
}

/**
 * Create pair record with full metadata
 */
function createPairRecord(policyA, policyB, type, metadata) {
  return {
    pairId: `${policyA.policyId}::${policyB.policyId}`,
    pairType: type,
    policies: [policyA, policyB],
    semanticSimilarity: metadata.similarity,
    structuralDistance: metadata.structureHashEqual ? 0 : 1,
    executionDifferences: metadata.executionDiffs || 0,
    metadata: {
      generatedAt: new Date().toISOString(),
      structureHashEqual: metadata.structureHashEqual,
      ...metadata
    }
  };
}

/**
 * Build all possible pairs with stratified random sampling
 * This is the key improvement over the original greedy algorithm
 */
function buildPairsOptimal(policies, config = PI_DEFAULT_CONFIG) {
  const random = new SeededRandom(config.randomSeed);

  console.log(`\nBuilding optimal policy pairs:`);
  console.log(`  - Total policies: ${policies.length}`);
  console.log(`  - Max possible pairs: ${policies.length * (policies.length - 1) / 2}`);

  // Step 1: Generate all possible pairs and classify them
  console.log(`  - Generating and classifying all pairs...`);
  const allPairs = [];
  const pairsByType = {
    semantic_equivalent: [],
    structural_variant: [],
    weak_equivalent: [],
    controlled_difference: []
  };

  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const policyA = policies[i];
      const policyB = policies[j];
      const metadata = determinePairType(policyA, policyB);
      const pair = createPairRecord(policyA, policyB, metadata.type, metadata);

      allPairs.push(pair);
      pairsByType[metadata.type].push(pair);
    }
  }

  console.log(`\n  Pair type distribution (all possible):`);
  for (const [type, pairs] of Object.entries(pairsByType)) {
    console.log(`    - ${type}: ${pairs.length} pairs`);
  }

  // Step 2: Stratified sampling to get balanced dataset
  console.log(`\n  Applying stratified sampling...`);
  const selectedPairs = [];
  const targetCounts = {};

  for (const [type, candidates] of Object.entries(pairsByType)) {
    const available = candidates.length;

    // Determine how many pairs to sample from this type
    let target;
    if (available === 0) {
      target = 0;
      console.log(`    ⚠️  ${type}: No pairs available (need to adjust policy generation)`);
    } else if (available < config.minPairsPerType) {
      target = available;
      console.log(`    ⚠️  ${type}: Only ${available} pairs available (below minimum ${config.minPairsPerType})`);
    } else if (available < config.targetPairsPerType) {
      target = available;
      console.log(`    ✓  ${type}: Using all ${available} pairs (below target ${config.targetPairsPerType})`);
    } else if (available <= config.maxPairsPerType) {
      target = config.targetPairsPerType;
      console.log(`    ✓  ${type}: Sampling ${target} from ${available} pairs`);
    } else {
      target = config.maxPairsPerType;
      console.log(`    ✓  ${type}: Sampling ${target} from ${available} pairs (capped at max)`);
    }

    targetCounts[type] = target;

    // Random sampling without replacement
    if (target > 0) {
      const sampled = random.sample(candidates, target);
      selectedPairs.push(...sampled);
    }
  }

  console.log(`\n  Final pair selection:`);
  console.log(`    - Total pairs: ${selectedPairs.length}`);
  console.log(`    - Total unique policies: ${countUniquePolicies(selectedPairs)}`);
  console.log(`    - Data utilization: ${(countUniquePolicies(selectedPairs) / policies.length * 100).toFixed(1)}%`);

  // Step 3: Compute statistics
  const stats = {
    totalPolicies: policies.length,
    totalPossiblePairs: allPairs.length,
    selectedPairs: selectedPairs.length,
    utilizationRate: countUniquePolicies(selectedPairs) / policies.length,
    pairCounts: targetCounts,
    distribution: {}
  };

  for (const type of Object.keys(pairsByType)) {
    stats.distribution[type] = {
      available: pairsByType[type].length,
      selected: targetCounts[type],
      samplingRate: pairsByType[type].length > 0 ? targetCounts[type] / pairsByType[type].length : 0
    };
  }

  return {
    pairs: selectedPairs,
    stats,
    allPairsByType: pairsByType  // Keep for analysis
  };
}

/**
 * Count unique policies used in pairs
 */
function countUniquePolicies(pairs) {
  const uniqueIds = new Set();
  pairs.forEach(pair => {
    pair.policies.forEach(policy => {
      uniqueIds.add(policy.policyId);
    });
  });
  return uniqueIds.size;
}

/**
 * Build pairs from execution results with optimal sampling
 */
function buildPairsFromExecutionResults(executionResults, config = PI_DEFAULT_CONFIG) {
  if (!Array.isArray(executionResults)) {
    throw new Error('Execution results must be an array.');
  }

  console.log(`\nAggregating policies from ${executionResults.length} execution results...`);
  const policies = aggregatePolicies(executionResults);
  console.log(`Aggregated ${policies.length} unique policies`);

  const result = buildPairsOptimal(policies, config);

  return {
    policies,
    pairs: result.pairs,
    stats: result.stats,
    config
  };
}

/**
 * Main entry point: Generate complete PI dataset
 */
async function generatePIDataset(config = {}) {
  const fullConfig = { ...PI_DEFAULT_CONFIG, ...config };

  console.log('\n' + '='.repeat(70));
  console.log('Policy Indistinguishability Dataset Generation');
  console.log('='.repeat(70));
  console.log('\nConfiguration:');
  console.log(`  - Policy count: ${fullConfig.policyCount}`);
  console.log(`  - Executions per policy: ${fullConfig.executionsPerPolicy}`);
  console.log(`  - Satisfy ratio: ${fullConfig.satisfyRatio}`);
  console.log(`  - Min pairs per type: ${fullConfig.minPairsPerType}`);
  console.log(`  - Target pairs per type: ${fullConfig.targetPairsPerType}`);
  console.log(`  - Max pairs per type: ${fullConfig.maxPairsPerType}`);
  console.log(`  - Random seed: ${fullConfig.randomSeed || 'auto'}`);

  // Step 1: Generate policies
  console.log('\n' + '-'.repeat(70));
  console.log('Phase 1: Generating policies');
  console.log('-'.repeat(70));

  const dataset = await generateDataset({
    policyCount: fullConfig.policyCount,
    executionsPerPolicy: fullConfig.executionsPerPolicy,
    satisfyRatio: fullConfig.satisfyRatio,
    seed: fullConfig.randomSeed
  });

  console.log(`\nGenerated ${dataset.length} policy execution instances`);

  return {
    dataset,
    datasetMeta: dataset.__meta,
    config: fullConfig
  };
}

/**
 * Execute dataset and build pairs (for use with contracts)
 */
async function executePIDataset(dataset, contract, config = {}) {
  const fullConfig = { ...PI_DEFAULT_CONFIG, ...config };

  console.log('\n' + '-'.repeat(70));
  console.log('Phase 2: Executing policies on-chain');
  console.log('-'.repeat(70));

  // Execute all policies
  const executionResults = [];
  for (let i = 0; i < dataset.length; i++) {
    const policyData = dataset[i];
    try {
      const result = await executePolicy(policyData, contract);
      executionResults.push(result);

      if ((i + 1) % 50 === 0 || i === dataset.length - 1) {
        console.log(`  Executed ${i + 1}/${dataset.length} policies...`);
      }
    } catch (error) {
      console.error(`  Error executing policy ${i}:`, error.message);
    }
  }

  console.log(`\nCompleted ${executionResults.length}/${dataset.length} executions`);

  // Build pairs with optimal sampling
  console.log('\n' + '-'.repeat(70));
  console.log('Phase 3: Building policy pairs');
  console.log('-'.repeat(70));

  const pairResult = buildPairsFromExecutionResults(executionResults, fullConfig);

  console.log('\n' + '='.repeat(70));
  console.log('Dataset Generation Complete');
  console.log('='.repeat(70));
  console.log('\nFinal Statistics:');
  console.log(`  - Total executions: ${executionResults.length}`);
  console.log(`  - Total policies: ${pairResult.policies.length}`);
  console.log(`  - Total pairs: ${pairResult.pairs.length}`);
  console.log(`  - Unique policies in pairs: ${countUniquePolicies(pairResult.pairs)}`);
  console.log(`  - Data utilization: ${(pairResult.stats.utilizationRate * 100).toFixed(1)}%`);
  console.log('\nPair distribution:');
  for (const [type, info] of Object.entries(pairResult.stats.distribution)) {
    console.log(`  - ${type}: ${info.selected} pairs (${(info.samplingRate * 100).toFixed(1)}% of available)`);
  }

  return {
    executionResults,
    policies: pairResult.policies,
    pairs: pairResult.pairs,
    stats: pairResult.stats,
    config: fullConfig
  };
}

module.exports = {
  // Main functions
  generatePIDataset,
  executePIDataset,
  buildPairsFromExecutionResults,
  buildPairsOptimal,

  // Helper functions
  determinePairType,
  createPairRecord,
  countUniquePolicies,

  // Configuration
  PI_DEFAULT_CONFIG,
  PAIR_TYPE_THRESHOLDS,

  // Re-exported for compatibility
  DUO_TERMS,
  FEATURE_KEYS,
  SeededRandom
};
