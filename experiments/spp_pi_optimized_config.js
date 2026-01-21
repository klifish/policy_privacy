/**
 * SPP & PI Optimized Configuration
 *
 * This configuration is specifically designed to generate datasets that satisfy
 * SPP's 5-dimension balance requirements and PI's diversity requirements,
 * while still maintaining PCH's DUO distribution balance.
 *
 * Key optimizations:
 * 1. Custom semantic layers with varied complexity
 * 2. Logic options to generate OR, NOT, and nested structures
 * 3. Varied whitelist sizes and Merkle depths
 * 4. Explicit handling of difficult SPP dimensions
 */

// Import necessary constants
const {
  generateDataset: generatePCHDataset
} = require('./policy_content_hiding/data_generator');

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
      orProbability: 0.8,    // High probability of OR
      andProbability: 0.2,
      negationProbability: 0.1
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
      orProbability: 1.0,    // Force OR only
      andProbability: 0.0,
      negationProbability: 0.0
    }
  },

  // Layer 5: Negation-heavy policies (for negation_heavy logic)
  {
    name: 'negation',
    combos: [
      ['GR', 'DS'],      // Will become: !GR & !DS
      ['GR', 'RS'],      // Will become: !GR & !RS
      ['DS', 'RS']       // Will become: !DS & !RS
    ],
    minPolicies: 20,
    maxPolicies: 30,
    logicOptions: {
      negationProbability: 0.9,  // High negation probability
      andProbability: 0.9,
      orProbability: 0.1
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
      nestedProbability: 0.9,   // Force nesting
      orProbability: 0.5,
      andProbability: 0.5,
      negationProbability: 0.2
    }
  },

  // Layer 7: Varied predicate counts
  {
    name: 'multi_predicate',
    combos: [
      ['DS'],           // single predicate
      ['DS', 'RS'],     // few (2 predicates)
      // Note: 'many' (4+) is hard to achieve within DEPTH=10 constraint
    ],
    minPolicies: 10,
    maxPolicies: 20
  }
];

/**
 * Whitelist buckets optimized for SET_SIZE diversity
 */
const SPP_WHITELIST_BUCKETS = [
  0,    // none
  2, 4,   // small (1-4)
  8, 12, 16,  // medium (5-16)
  20, 24, 32  // large (17+)
];

/**
 * Merkle depth options optimized for RANGE_WIDTH diversity
 */
const SPP_MERKLE_DEPTHS = [
  2, 3,       // narrow (≤3)
  4, 5, 6,    // medium (4-6)
  7, 8        // wide (≥7)
];

/**
 * Logic generation options
 * Can be overridden per layer
 */
const SPP_LOGIC_OPTIONS = {
  orProbability: 0.3,        // Default 30% OR
  andProbability: 0.6,       // Default 60% AND
  negationProbability: 0.2,  // Default 20% negation
  nestedProbability: 0.3     // Default 30% nesting
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
