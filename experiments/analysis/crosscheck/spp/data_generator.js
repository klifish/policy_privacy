/**
 * Structure & Parameter Privacy – Dataset Generator
 *
 * This module generates policy datasets with improved classification dimensions:
 * 1. Logic Structure: Boolean connectives independent of predicates
 * 2. Nesting Depth: Structural complexity levels
 * 3. Predicate Count: Number of predicates in policy
 * 4. Set Size: Whitelist size (separated from range width)
 * 5. Range Width: Numeric range predicates (separated from set size)
 *
 * IMPROVEMENTS from original version:
 * - Fixed paramType: Separated SET_SIZE and RANGE_WIDTH into independent dimensions
 * - Redesigned structure classification: More granular and balanced categories
 * - Decoupled dimensions: Reduced correlation between classification axes
 * - Added balance metrics for data quality assessment
 */

const {
  generateDataset: generatePolicyDataset
} = require('../../../core/data_generator');

const DEFAULT_DATASET_CONFIG = Object.freeze({
  policyCount: 120,
  executionsPerPolicy: 3,
  satisfyRatio: 0.5,
  seed: 'spp-dataset'
});

// ============================================================================
// CLASSIFICATION DIMENSIONS
// ============================================================================

/**
 * Dimension 1: Logic Structure
 * Focus: Boolean connectives, independent of predicates
 */
const LOGIC_STRUCTURES = Object.freeze({
  TRIVIAL: 'trivial',             // No boolean connectives (single atom/predicate)
  AND_ONLY: 'and_only',          // Only AND connectives
  OR_ONLY: 'or_only',            // Only OR connectives
  AND_OR_MIXED: 'and_or_mixed',  // Both AND and OR
  NEGATION_HEAVY: 'negation_heavy' // Has NOT operators (≥2)
});

/**
 * Dimension 2: Nesting Depth
 * Focus: Structural complexity independent of logic type
 */
const NESTING_DEPTHS = Object.freeze({
  FLAT: 'flat',          // maxDepth ≤ 1
  SHALLOW: 'shallow',    // maxDepth == 2
  MEDIUM: 'medium',      // maxDepth == 3
  DEEP: 'deep'           // maxDepth ≥ 4
});

/**
 * Dimension 3: Predicate Count
 * Focus: Number of predicates, independent of attributes
 */
const PREDICATE_COUNTS = Object.freeze({
  NONE: 'none',       // 0 predicates
  SINGLE: 'single',   // 1 predicate
  FEW: 'few',         // 2-3 predicates
  MANY: 'many'        // 4+ predicates
});

/**
 * Dimension 4: Set Size
 * Focus: Whitelist/set size only (separated from range width)
 */
const SET_SIZES = Object.freeze({
  NONE: 'none',       // whitelistSize == 0
  SMALL: 'small',     // 1-4 elements
  MEDIUM: 'medium',   // 5-16 elements
  LARGE: 'large'      // 17+ elements
});

/**
 * Dimension 5: Range Width
 * Focus: Numeric range predicates (separated from set size)
 */
const RANGE_WIDTHS = Object.freeze({
  NONE: 'none',       // No range predicates
  NARROW: 'narrow',   // Range < 10 (approximated by Merkle depth ≤ 3)
  MEDIUM: 'medium',   // 10-50 (depth 4-6)
  WIDE: 'wide'        // 50+ (depth ≥ 7)
});

// Backward compatibility aliases
const STRUCTURE_TYPES = LOGIC_STRUCTURES;
const PREDICATE_COMBOS = PREDICATE_COUNTS;
const PARAMETER_TYPES = SET_SIZES;

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Compute basic structural statistics from a normalized logic string
 */
function analyzeLogicShape(logic = '') {
  const predicateNamespaces = new Set();
  const attributeTokens = new Set();

  const stats = {
    source: logic,
    hasOr: false,
    hasAnd: false,
    hasNot: false,
    andCount: 0,
    orCount: 0,
    notCount: 0,
    maxDepth: 0,
    predicateCount: 0,
    predicateNamespaces: [],
    attributeTokens: []
  };

  if (!logic || typeof logic !== 'string') {
    return stats;
  }

  let depth = 0;
  for (let i = 0; i < logic.length; i++) {

    const ch = logic[i];
    if (ch === '(') {
      depth += 1;
      if (depth > stats.maxDepth) {
        stats.maxDepth = depth;
      }
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1);
    } else if (ch === '|') {
      stats.hasOr = true;
      stats.orCount += 1;
    } else if (ch === '&') {
      stats.hasAnd = true;
      stats.andCount += 1;
    } else if (ch === '!') {
      stats.hasNot = true;
      stats.notCount += 1;
    }
  }

  const predicateRegex = /P\[([A-Z0-9_:-]+)\]/g;
  let match;
  while ((match = predicateRegex.exec(logic)) !== null) {
    predicateNamespaces.add(match[1]);
    stats.predicateCount += 1;
  }

  const logicWithoutPredicates = logic.replace(/P\[[^\]]+\]/g, ' ');
  const attributeRegex = /\b([A-Z]{2,})\b/g;
  while ((match = attributeRegex.exec(logicWithoutPredicates)) !== null) {
    const token = match[1];
    attributeTokens.add(token);
  }

  stats.predicateNamespaces = Array.from(predicateNamespaces);
  stats.attributeTokens = Array.from(attributeTokens);
  stats.hasPredicates = stats.predicateNamespaces.length > 0;

  return stats;
}

// ============================================================================
// CLASSIFICATION FUNCTIONS
// ============================================================================

/**
 * Classify logic structure (independent of predicates).
 * Callers must pass stats computed from the author-level expression
 * (logicOriginal): predicate normalization injects '&' for each
 * (ATTR & P[namespace]) binding, which would misclassify pure-OR policies
 * as and_or_mixed.
 */
function classifyLogicStructure(stats) {
  const { hasAnd, hasOr, hasNot, notCount } = stats;

  // Priority: negation-heavy first
  if (notCount >= 2) {
    return LOGIC_STRUCTURES.NEGATION_HEAVY;
  }

  // Pure forms
  if (hasAnd && !hasOr) {
    return LOGIC_STRUCTURES.AND_ONLY;
  }

  if (hasOr && !hasAnd) {
    return LOGIC_STRUCTURES.OR_ONLY;
  }

  // Mixed (both AND and OR)
  if (hasAnd && hasOr) {
    return LOGIC_STRUCTURES.AND_OR_MIXED;
  }

  // No AND/OR connective at all: single atom, optionally negated (e.g. "GR" or "!GR").
  // Distinct from AND_ONLY, whose name implies a (possibly trivial) conjunction of
  // multiple terms; a bare atom carries no structural information to classify.
  return LOGIC_STRUCTURES.TRIVIAL;
}

/**
 * Classify nesting depth
 */
function classifyNestingDepth(stats) {
  const { maxDepth } = stats;

  if (maxDepth <= 1) {
    return NESTING_DEPTHS.FLAT;
  } else if (maxDepth === 2) {
    return NESTING_DEPTHS.SHALLOW;
  } else if (maxDepth === 3) {
    return NESTING_DEPTHS.MEDIUM;
  } else {
    return NESTING_DEPTHS.DEEP;
  }
}

/**
 * Classify predicate count
 */
function classifyPredicateCount(stats) {
  const count = stats.predicateNamespaces.length;

  if (count === 0) {
    return PREDICATE_COUNTS.NONE;
  } else if (count === 1) {
    return PREDICATE_COUNTS.SINGLE;
  } else if (count >= 2 && count <= 3) {
    return PREDICATE_COUNTS.FEW;
  } else {
    return PREDICATE_COUNTS.MANY;
  }
}

/**
 * Classify set size (only based on whitelist, no Merkle depth)
 */
function classifySetSize(policy) {
  const whitelistSize = policy?.structure?.whitelistSize || 0;

  if (whitelistSize === 0) {
    return SET_SIZES.NONE;
  } else if (whitelistSize <= 4) {
    return SET_SIZES.SMALL;
  } else if (whitelistSize <= 16) {
    return SET_SIZES.MEDIUM;
  } else {
    return SET_SIZES.LARGE;
  }
}

/**
 * Classify range width (separate dimension from set size)
 * NOTE: Currently approximated by Merkle depth as proxy
 * TODO: Replace with actual range analysis from predicates
 */
function classifyRangeWidth(policy) {
  const merkleDepth = policy?.structure?.merkleDepth || 0;

  // Check if policy has range predicates
  const logic = policy?.semantics?.logicNormalized || '';
  const hasRangePredicates = /RANGE|AGE|VALUE/i.test(logic);

  if (!hasRangePredicates) {
    return RANGE_WIDTHS.NONE;
  }

  // Approximate range width by Merkle depth
  // This is a placeholder - ideally parse actual range values
  if (merkleDepth <= 3) {
    return RANGE_WIDTHS.NARROW;
  } else if (merkleDepth <= 6) {
    return RANGE_WIDTHS.MEDIUM;
  } else {
    return RANGE_WIDTHS.WIDE;
  }
}

// Backward compatibility aliases
const classifyStructureType = classifyLogicStructure;
const classifyPredicateCombo = classifyPredicateCount;
const classifyParameterType = classifySetSize;

// ============================================================================
// ANNOTATION AND DATASET GENERATION
// ============================================================================

/**
 * Annotate a policy with all classification dimensions
 */
function annotatePolicy(policy) {
  // Two-level classification scheme:
  // - logicStructure: author-level (logicOriginal) — predicate bindings such as
  //   (DS & P[ICD10]) are atomic units, so the injected '&' must not affect it
  // - nestingDepth / predicateCount: execution-level (logicNormalized)
  const normalized = policy?.semantics?.logicNormalized || policy?.semantics?.logicOriginal || '';
  const original = policy?.semantics?.logicOriginal || normalized;
  const stats = analyzeLogicShape(normalized);
  const statsOriginal = analyzeLogicShape(original);

  // Apply all classifications
  policy.logicStructure = classifyLogicStructure(statsOriginal);
  policy.nestingDepth = classifyNestingDepth(stats);
  policy.predicateCount = classifyPredicateCount(stats);
  policy.setSize = classifySetSize(policy);
  policy.rangeWidth = classifyRangeWidth(policy);

  // Backward compatibility aliases
  policy.structureType = policy.logicStructure;
  policy.predicateCombo = policy.predicateCount;
  policy.paramType = policy.setSize;

  policy.structureStats = stats;

  return policy;
}

/**
 * Summarize dataset coverage by category
 */
function summarizeDataset(dataset) {
  const summary = {
    logicStructures: {},
    nestingDepths: {},
    predicateCounts: {},
    setSizes: {},
    rangeWidths: {},

    // Backward compatibility
    structureTypes: {},
    predicateCombos: {},
    parameterTypes: {}
  };

  dataset.forEach((policy) => {
    increment(summary.logicStructures, policy.logicStructure);
    increment(summary.nestingDepths, policy.nestingDepth);
    increment(summary.predicateCounts, policy.predicateCount);
    increment(summary.setSizes, policy.setSize);
    increment(summary.rangeWidths, policy.rangeWidth);

    // Backward compatibility
    increment(summary.structureTypes, policy.structureType);
    increment(summary.predicateCombos, policy.predicateCombo);
    increment(summary.parameterTypes, policy.paramType);
  });

  return summary;
}

/**
 * Calculate balance metrics for a classification dimension
 */
function calculateBalanceMetrics(distribution) {
  const counts = Object.values(distribution);
  if (counts.length === 0) return { minMaxRatio: '0.000', coefficientOfVariation: '0.000' };

  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const variance = counts.reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / counts.length;
  const stdDev = Math.sqrt(variance);

  return {
    min,
    max,
    mean: mean.toFixed(1),
    minMaxRatio: (min / max).toFixed(3),
    coefficientOfVariation: (stdDev / mean).toFixed(3)
  };
}

/**
 * Generate dataset with annotations
 */
async function generateDataset(config = {}) {
  const mergedConfig = {
    ...DEFAULT_DATASET_CONFIG,
    ...config
  };

  console.log('Generating SPP dataset with improved classification...');
  console.log(`Target: ${mergedConfig.policyCount} policies`);

  const dataset = await generatePolicyDataset({
    policyCount: mergedConfig.policyCount,
    executionsPerPolicy: mergedConfig.executionsPerPolicy,
    satisfyRatio: mergedConfig.satisfyRatio,
    seed: mergedConfig.seed,
    duoTerms: mergedConfig.duoTerms,
    semanticLayers: mergedConfig.semanticLayers,
    logicOptions: mergedConfig.logicOptions,
    attributeOrder: mergedConfig.attributeOrder
  });

  dataset.forEach(annotatePolicy);

  const summary = summarizeDataset(dataset);

  // Calculate balance metrics
  const balanceMetrics = {
    logicStructure: calculateBalanceMetrics(summary.logicStructures),
    nestingDepth: calculateBalanceMetrics(summary.nestingDepths),
    predicateCount: calculateBalanceMetrics(summary.predicateCounts),
    setSize: calculateBalanceMetrics(summary.setSizes),
    rangeWidth: calculateBalanceMetrics(summary.rangeWidths)
  };

  dataset.__meta = {
    ...dataset.__meta,
    sppConfig: {
      policyCount: mergedConfig.policyCount,
      executionsPerPolicy: mergedConfig.executionsPerPolicy,
      satisfyRatio: mergedConfig.satisfyRatio,
      seed: mergedConfig.seed
    },
    sppSummary: summary,
    balanceMetrics
  };

  // Print balance metrics
  console.log('\n=== Balance Metrics ===');
  Object.entries(balanceMetrics).forEach(([dim, metrics]) => {
    console.log(`  ${dim}: min/max=${metrics.minMaxRatio}, CV=${metrics.coefficientOfVariation}`);
  });

  return dataset;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Constants
  LOGIC_STRUCTURES,
  NESTING_DEPTHS,
  PREDICATE_COUNTS,
  SET_SIZES,
  RANGE_WIDTHS,

  // Backward compatibility aliases
  STRUCTURE_TYPES,
  PREDICATE_COMBOS,
  PARAMETER_TYPES,

  // Analysis functions
  analyzeLogicShape,

  // Classification functions
  classifyLogicStructure,
  classifyNestingDepth,
  classifyPredicateCount,
  classifySetSize,
  classifyRangeWidth,

  // Backward compatibility aliases
  classifyStructureType,
  classifyPredicateCombo,
  classifyParameterType,

  // Dataset functions
  summarizeDataset,
  annotatePolicy,
  generateDataset,
  calculateBalanceMetrics
};
