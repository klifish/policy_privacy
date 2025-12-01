/**
 * Structure & Parameter Privacy – Dataset Generator
 *
 * This module reuses the Policy Content Hiding dataset generator to produce
 * real postfix interpreter policies, then annotates each policy with
 * structure/parameter labels that can be used by the SPP attacks.
 */

const {
  generateDataset: generatePolicyDataset
} = require('../policy_content_hiding/data_generator');

const DEFAULT_DATASET_CONFIG = Object.freeze({
  policyCount: 120,
  executionsPerPolicy: 3,
  satisfyRatio: 0.5,
  seed: 'spp-dataset'
});

const STRUCTURE_TYPES = Object.freeze({
  SIMPLE_AND: 'simple_and',
  WITH_OR: 'with_or',
  NESTED: 'nested',
  WITH_SETS: 'with_sets',
  COMPLEX: 'complex'
});

const PREDICATE_COMBOS = Object.freeze({
  ATTRIBUTE_ONLY: 'attribute_only',
  SINGLE_PREDICATE: 'single_predicate',
  SINGLE_PREDICATE_MIXED: 'single_predicate_mixed',
  MULTI_PREDICATE: 'multi_predicate'
});

const PARAMETER_TYPES = Object.freeze({
  NO_SETS: 'no_sets',
  NARROW_RANGE: 'narrow_range',
  SMALL_SET: 'small_set',
  MEDIUM_SET: 'medium_set',
  LARGE_SET: 'large_set',
  WIDE_RANGE: 'wide_range'
});

/**
 * Increment helper for summary tables.
 */
function increment(map, key) {
  map[key] = (map[key] || 0) + 1;
}

/**
 * Compute basic structural statistics from a normalized logic string.
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

/**
 * Classify structure type using boolean heuristics.
 */
function classifyStructureType(stats) {
  const hasPredicates = stats.hasPredicates;
  const hasOr = stats.hasOr;
  const depth = stats.maxDepth;

  if (!hasPredicates && !hasOr && depth <= 1) {
    return STRUCTURE_TYPES.SIMPLE_AND;
  }

  if (!hasPredicates && hasOr && depth <= 2) {
    return STRUCTURE_TYPES.WITH_OR;
  }

  if (!hasPredicates && depth > 2) {
    return STRUCTURE_TYPES.NESTED;
  }

  if (hasPredicates && !hasOr && depth <= 2) {
    return STRUCTURE_TYPES.WITH_SETS;
  }

  return STRUCTURE_TYPES.COMPLEX;
}

/**
 * Classify predicate combination type.
 */
function classifyPredicateCombo(stats) {
  const predicateCount = stats.predicateNamespaces.length;
  const attributeCount = stats.attributeTokens.length;

  if (predicateCount === 0) {
    return PREDICATE_COMBOS.ATTRIBUTE_ONLY;
  }

  if (predicateCount === 1 && attributeCount === 0) {
    return PREDICATE_COMBOS.SINGLE_PREDICATE;
  }

  if (predicateCount === 1 && attributeCount > 0) {
    return PREDICATE_COMBOS.SINGLE_PREDICATE_MIXED;
  }

  return PREDICATE_COMBOS.MULTI_PREDICATE;
}

/**
 * Classify parameter bucket using whitelist size + Merkle depth hints.
 * Merkle depth is used as a proxy for "range width" padding.
 */
function classifyParameterType(policy) {
  const whitelistSize = policy?.structure?.whitelistSize || 0;
  const merkleDepth = policy?.structure?.merkleDepth || 0;

  if (!whitelistSize) {
    return PARAMETER_TYPES.NO_SETS;
  }

  if (merkleDepth <= 3) {
    return PARAMETER_TYPES.NARROW_RANGE;
  }

  if (whitelistSize <= 4) {
    return PARAMETER_TYPES.SMALL_SET;
  }

  if (whitelistSize <= 8) {
    return PARAMETER_TYPES.MEDIUM_SET;
  }

  if (merkleDepth >= 7) {
    return PARAMETER_TYPES.WIDE_RANGE;
  }

  return PARAMETER_TYPES.LARGE_SET;
}

/**
 * Annotate a dataset entry with structure+parameter labels.
 */
function annotatePolicy(policy) {
  const logic = policy?.semantics?.logicNormalized || policy?.semantics?.logicOriginal || '';
  const stats = analyzeLogicShape(logic);

  policy.structureType = classifyStructureType(stats);
  policy.predicateCombo = classifyPredicateCombo(stats);
  policy.paramType = classifyParameterType(policy);
  policy.structureStats = stats;

  return policy;
}

/**
 * Summarize dataset coverage by category.
 */
function summarizeDataset(dataset) {
  const summary = {
    structureTypes: {},
    predicateCombos: {},
    parameterTypes: {}
  };

  dataset.forEach((policy) => {
    increment(summary.structureTypes, policy.structureType);
    increment(summary.predicateCombos, policy.predicateCombo);
    increment(summary.parameterTypes, policy.paramType);
  });

  return summary;
}

/**
 * Generate dataset + annotations reusing the base policy generator.
 */
async function generateDataset(config = {}) {
  const mergedConfig = {
    ...DEFAULT_DATASET_CONFIG,
    ...config
  };

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

  dataset.__meta = {
    ...dataset.__meta,
    sppConfig: {
      policyCount: mergedConfig.policyCount,
      executionsPerPolicy: mergedConfig.executionsPerPolicy,
      satisfyRatio: mergedConfig.satisfyRatio,
      seed: mergedConfig.seed
    },
    sppSummary: summarizeDataset(dataset)
  };

  return dataset;
}

module.exports = {
  STRUCTURE_TYPES,
  PREDICATE_COMBOS,
  PARAMETER_TYPES,
  analyzeLogicShape,
  classifyStructureType,
  classifyPredicateCombo,
  classifyParameterType,
  summarizeDataset,
  annotatePolicy,
  generateDataset
};
