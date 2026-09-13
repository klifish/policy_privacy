/**
 * SPP & PI Optimized Configuration
 *
 * This configuration is specifically designed to generate datasets that satisfy
 * SPP's 5-dimension balance requirements and PI's diversity requirements,
 * while still maintaining PCH's DUO distribution balance.
 *
 * Key optimizations:
 * 1. Custom semantic layers with varied complexity
 * 2. Logic options to generate AND, OR, and nested structures
 * 3. Varied whitelist sizes at the circuit's fixed Merkle depth
 * 4. Explicit handling of difficult SPP dimensions
 */

// Import necessary constants
const {
  generateDataset: generatePCHDataset
} = require('../../core/data_generator');

/**
 * Custom semantic layers optimized for SPP/PI
 */
const SPP_PI_SEMANTIC_LAYERS = [
  // Layer 1: Simple singletons (for flat structure, and_only logic)
  {
    name: 'simple_singleton',
    combos: [
      ['GR'],
      ['DS'],
      ['RS']
    ],
    minPolicies: 30,
    maxPolicies: 40
  },

  // Layer 2: Basic pairs with AND (for shallow depth, and_only logic)
  {
    name: 'basic_pair',
    combos: [
      ['GR', 'DS'],
      ['GR', 'RS'],
      ['DS', 'RS']
    ],
    minPolicies: 30,
    maxPolicies: 40
  },

  // Layer 3: Mixed OR/AND combinations (for and_or_mixed logic)
  // Note: These will be passed to buildLogicFromCombination with orProbability=0.8
  {
    name: 'mixed_logic',
    combos: [
      ['GR', 'DS'],      // Will become: GR | DS
      ['GR', 'RS'],      // Will become: GR | RS
      ['DS', 'RS'],      // Will become: DS | RS
      ['GR', 'DS', 'RS'] // Will become: (GR | DS) & RS or GR | (DS & RS)
    ],
    minPolicies: 30,
    maxPolicies: 40,
    logicOptions: {
      operators: ['AND', 'OR'],
      notProbability: 0,
      groupNotProbability: 0
    }
  },

  // Layer 4: Pure OR combinations (for or_only logic)
  {
    name: 'pure_or',
    combos: [
      ['GR', 'DS'],
      ['GR', 'RS'],
      ['DS', 'RS']
    ],
    minPolicies: 20,
    maxPolicies: 30,
    logicOptions: {
      operators: ['OR'],
      notProbability: 0,
      groupNotProbability: 0
    }
  },

  // Layer 5: Additional DUO V3-valid mixed structures (NOT is unsupported)
  {
    name: 'mixed_without_negation',
    combos: [
      ['GR', 'DS', 'RS'],
      ['GR', 'POA', 'GS'],
      ['DS', 'RS', 'CC']
    ],
    minPolicies: 20,
    maxPolicies: 30,
    logicOptions: {
      operators: ['AND', 'OR'],
      ensureMixedOperators: true,
      notProbability: 0,
      groupNotProbability: 0
    }
  },

  // Layer 6: Complex nested structures (for medium/deep nesting depth)
  {
    name: 'nested_complex',
    combos: [
      ['GR', 'DS', 'RS'],    // Will become: ((GR & DS) | RS)
      ['GR', 'DS', 'RS'],    // Will become: (GR | (DS & RS))
      ['GR', 'DS'],          // Will become: (GR & DS)
    ],
    minPolicies: 20,
    maxPolicies: 30,
    logicOptions: {
      operators: ['AND', 'OR'],
      ensureMixedOperators: true,
      notProbability: 0,
      groupNotProbability: 0
    }
  },

  // Layer 7: Varied predicate counts
  {
    name: 'multi_predicate',
    combos: [
      ['DS'],           // single predicate
      ['DS', 'RS'],     // few (2 predicates)
      // Larger combinations are supported by the production DEPTH=64 circuit.
    ],
    minPolicies: 10,
    maxPolicies: 20
  }
];

/**
 * Whitelist buckets optimized for SET_SIZE diversity
 */
const SPP_WHITELIST_BUCKETS = [
  2, 4,   // small (1-4)
  8, 12, 16,  // medium (5-16)
  20, 24, 32  // large (17+)
];

/**
 * The production circuit fixes ontology Merkle paths at eight levels.
 */
const SPP_MERKLE_DEPTHS = [8];

/**
 * Logic generation options
 * Can be overridden per layer
 */
const SPP_LOGIC_OPTIONS = {
  operators: ['AND', 'OR'],
  notProbability: 0,
  groupNotProbability: 0
};

/**
 * Generate dataset with SPP/PI optimizations
 */
async function generateSPPPIOptimizedDataset(config = {}) {
  const {
    policyCount = 200,
    executionsPerPolicy = 5,
    satisfyRatio = 0.5,
    seed = 'spp-pi-optimized',
    ...otherConfig
  } = config;

  console.log('🎯 Generating SPP/PI Optimized Dataset');
  console.log(`   Policy count: ${policyCount}`);
  console.log(`   Executions per policy: ${executionsPerPolicy}`);
  console.log(`   Using specialized semantic layers for SPP/PI diversity\n`);

  // Generate with custom configuration
  const dataset = await generatePCHDataset({
    policyCount,
    executionsPerPolicy,
    satisfyRatio,
    seed,
    semanticLayers: SPP_PI_SEMANTIC_LAYERS,
    whitelistBuckets: SPP_WHITELIST_BUCKETS,
    merkleDepthOptions: SPP_MERKLE_DEPTHS,
    logicOptions: SPP_LOGIC_OPTIONS,
    ...otherConfig
  });

  console.log(`✅ Generated ${dataset.length} policy instances`);
  return dataset;
}

module.exports = {
  SPP_PI_SEMANTIC_LAYERS,
  SPP_WHITELIST_BUCKETS,
  SPP_MERKLE_DEPTHS,
  SPP_LOGIC_OPTIONS,
  generateSPPPIOptimizedDataset
};

// CLI interface
if (require.main === module) {
  generateSPPPIOptimizedDataset({
    policyCount: 200,
    executionsPerPolicy: 5
  })
    .then(dataset => {
      console.log('\n✅ Dataset generation complete');
      console.log(`   Total instances: ${dataset.length}`);
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Error:', err.message);
      process.exit(1);
    });
}
