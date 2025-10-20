/**
 * Policy Indistinguishability – Data Generation & Pair Construction
 *
 * This module reuses the Policy Content Hiding dataset generation pipeline
 * to produce executable policies and then groups them into indistinguishability
 * pairs (P0, P1) that can be used by the PI experiment.
 */

const path = require('path');
const crypto = require('crypto');

const {
  generateDataset,
  executeDataset,
  DUO_TERMS
} = require('../policy_content_hiding/data_generator');

const DEFAULT_PAIR_TARGETS = Object.freeze({
  semantic_equivalent: 5,
  structural_variant: 5,
  weak_equivalent: 5,
  controlled_difference: 5
});

const FEATURE_KEYS = Object.freeze([
  'commitGasUsed',
  'commitCalldataLength',
  'accessGasUsed',
  'accessCalldataLength',
  'proofSize',
  'proofGenerationTime',
  'commitLogsCount',
  'commitLogsSize',
  'accessLogsCount',
  'accessLogsSize',
  'blockDifference'
]);

/**
 * Helper – convert execution feature bag to numeric vector.
 */
function mapFeaturesToRecord(result) {
  const numeric = {};
  FEATURE_KEYS.forEach((key) => {
    const value = result.features[key];
    numeric[key] = typeof value === 'string' ? parseFloat(value) : value;
  });

  return {
    policyId: result.policyId,
    executionId: result.executionId,
    features: numeric,
    satisfy: result.satisfy ? 1 : 0,
    duoTerm: result.duoTerm,
    ontologyNamespace: result.ontologyNamespace,
    ontologyValue: result.ontologyValue
  };
}

/**
 * Aggregate execution results by policy instance.
 */
function aggregatePolicies(executionResults) {
  const policies = new Map();

  for (const result of executionResults) {
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
        features: [],
        rawExecutions: []
      });
    }

    const policy = policies.get(id);
    policy.features.push(mapFeaturesToRecord(result));
    policy.rawExecutions.push(result);
  }

  return Array.from(policies.values());
}

/**
 * Canonical semantics signature used for grouping.
 */
function semanticsSignature(semantics) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      primary: semantics.primaryDuoTerm,
      duoTerms: semantics.duoTerms || [],
      icd10: semantics.icd10Scope,
      obi: semantics.obiScope,
      normalizedLogic: semantics.logicNormalized
    }))
    .digest('hex');
}

/**
 * Lightweight structural fingerprint.
 */
function structuralFingerprint(structure, executionProfile) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify({
      policyHash: structure.policyHash,
      proofType: structure.proofType,
      policyDepth: structure.policyDepth,
      whitelistSize: structure.whitelistSize,
      executionProfile
    }))
    .digest('hex');
}

/**
 * Compute semantic similarity score in [0, 1].
 */
function computeSemanticSimilarity(a, b) {
  if (!a || !b) {
    return 0;
  }

  if (a.logicNormalized && b.logicNormalized && a.logicNormalized === b.logicNormalized) {
    return 1;
  }

  const duoA = new Set(a.duoTerms || []);
  const duoB = new Set(b.duoTerms || []);
  const intersection = new Set([...duoA].filter((value) => duoB.has(value)));
  const union = new Set([...duoA, ...duoB]);
  const duoScore = union.size === 0 ? 1 : intersection.size / union.size;

  const icdScore = a.icd10Scope && b.icd10Scope
    ? (a.icd10Scope.id === b.icd10Scope.id ? 1 : 0.75)
    : 1;

  const obiScore = a.obiScope && b.obiScope
    ? (a.obiScope.id === b.obiScope.id ? 1 : 0.75)
    : 1;

  const predicateScore = a.predicateCount === b.predicateCount ? 1 : 0.8;

  // Weight scores to bias towards DUO overlap.
  const weightedScore = (
    0.55 * duoScore +
    0.15 * icdScore +
    0.15 * obiScore +
    0.15 * predicateScore
  );

  return Math.max(0, Math.min(1, weightedScore));
}

/**
 * Compare two execution profiles and count differing knobs.
 */
function countExecutionDifferences(a, b) {
  if (!a || !b) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let diffs = 0;
  keys.forEach((key) => {
    if (a[key] !== b[key]) {
      diffs += 1;
    }
  });
  return diffs;
}

/**
 * Build pair metadata record.
 */
function createPairRecord(policyA, policyB, pairType, similarityScore) {
  return {
    pairId: `${policyA.policyId}::${policyB.policyId}`,
    pairType,
    policies: [
      {
        policyId: policyA.policyId,
        semantics: policyA.semantics,
        structure: policyA.structure,
        executionProfile: policyA.executionProfile,
        features: policyA.features
      },
      {
        policyId: policyB.policyId,
        semantics: policyB.semantics,
        structure: policyB.structure,
        executionProfile: policyB.executionProfile,
        features: policyB.features
      }
    ],
    semanticSimilarity: similarityScore,
    structuralDistance: structuralFingerprint(policyA.structure, policyA.executionProfile) === structuralFingerprint(policyB.structure, policyB.executionProfile) ? 0 : 1,
    executionDifferences: countExecutionDifferences(policyA.executionProfile, policyB.executionProfile)
  };
}

/**
 * Attempt to classify pair type by heuristics.
 */
function determinePairType(policyA, policyB) {
  const similarity = computeSemanticSimilarity(policyA.semantics, policyB.semantics);
  const executionDiffs = countExecutionDifferences(policyA.executionProfile, policyB.executionProfile);
  const structureHashEqual = structuralFingerprint(policyA.structure, {}) === structuralFingerprint(policyB.structure, {});

  if (similarity >= 0.999 && !structureHashEqual) {
    if (executionDiffs > 0) {
      return { type: 'structural_variant', similarity };
    }
    return { type: 'semantic_equivalent', similarity };
  }

  if (similarity >= 0.95) {
    return { type: 'weak_equivalent', similarity };
  }

  return { type: 'controlled_difference', similarity };
}

/**
 * Construct pair set with target counts per type.
 */
function buildPairs(policies, targets = DEFAULT_PAIR_TARGETS) {
  const remaining = { ...targets };
  const pairs = [];

  // Index policies by semantic signature for efficient matching.
  const bySemantic = new Map();
  policies.forEach((policy) => {
    const sig = semanticsSignature(policy.semantics);
    if (!bySemantic.has(sig)) bySemantic.set(sig, []);
    bySemantic.get(sig).push(policy);
  });

  // Phase 1 – generate semantic equivalent & structural variants.
  for (const group of bySemantic.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const policyA = group[i];
        const policyB = group[j];
        const { type, similarity } = determinePairType(policyA, policyB);
        if (!remaining[type] || remaining[type] <= 0) continue;
        pairs.push(createPairRecord(policyA, policyB, type, similarity));
        remaining[type] -= 1;
      }
    }
  }

  // Phase 2 – fallback matching using semantic similarity.
  const pool = policies.slice();
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      const policyA = pool[i];
      const policyB = pool[j];
      const { type, similarity } = determinePairType(policyA, policyB);
      if (!remaining[type] || remaining[type] <= 0) continue;
      pairs.push(createPairRecord(policyA, policyB, type, similarity));
      remaining[type] -= 1;
    }
  }

  return pairs;
}

function buildPairsFromExecutionResults(executionResults, targets = DEFAULT_PAIR_TARGETS) {
  if (!Array.isArray(executionResults)) {
    throw new Error('Execution results must be an array.');
  }
  const policies = aggregatePolicies(executionResults);
  const pairs = buildPairs(policies, targets);
  return { policies, pairs };
}

/**
 * Generate policies, execute them, and create pair dataset.
 */
async function generatePolicyPairsDataset({
  policyCount = 60,
  executionsPerPolicy = 8,
  satisfyRatio = 0.5,
  pairTargets = DEFAULT_PAIR_TARGETS,
  seed = Date.now(),
  outputDir = path.join(__dirname, 'results')
} = {}) {
  const dataset = await generateDataset({
    policyCount,
    executionsPerPolicy,
    satisfyRatio,
    seed
  });

  const { ethers } = require('hardhat');
  const fs = require('fs');
  const resolvedOutput = path.resolve(outputDir);
  if (!fs.existsSync(resolvedOutput)) {
    fs.mkdirSync(resolvedOutput, { recursive: true });
  }

  const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
  const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');

  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();

  const policyPrivacy = await PolicyPrivacy.deploy(await verifier.getAddress());
  await policyPrivacy.waitForDeployment();

  const executionResultsPath = path.join(resolvedOutput, `pi_execution_results_${seed}.json`);
  const executionResults = await executeDataset(dataset, policyPrivacy, executionResultsPath);

  const policies = aggregatePolicies(executionResults);
  const pairs = buildPairs(policies, pairTargets);

  return {
    datasetMeta: dataset.__meta,
    executionResults,
    policies,
    pairs,
    executionResultsPath
  };
}

module.exports = {
  DUO_TERMS,
  FEATURE_KEYS,
  DEFAULT_PAIR_TARGETS,
  generateDataset,
  executeDataset,
  aggregatePolicies,
  computeSemanticSimilarity,
  buildPairs,
  buildPairsFromExecutionResults,
  mapFeaturesToRecord,
  generatePolicyPairsDataset
};
