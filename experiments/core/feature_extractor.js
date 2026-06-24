/**
 * Feature Extractor for Policy Content Hiding Evaluation
 * 
 * Extracts and normalizes observable features from executed policies
 * for machine learning analysis.
 */

/**
 * Extract features from execution results
 *
 * @param {Array} executionResults - Raw execution results
 * @param {Object} options - Extraction options
 * @param {boolean} options.excludeColdStart - If true, exclude the first sample (cold start)
 * @returns {Array} Extracted features
 */
function extractFeatures(executionResults, options = {}) {
  const { excludeColdStart = true } = options;

  // Filter out cold start sample if requested
  let results = executionResults;
  if (excludeColdStart && executionResults.length > 0) {
    // Check if first sample has significantly higher gas (cold start indicator)
    const firstCommitGas = parseInt(executionResults[0].features.commitGasUsed);
    const secondCommitGas = executionResults.length > 1
      ? parseInt(executionResults[1].features.commitGasUsed)
      : firstCommitGas;

    const gasDifference = Math.abs(firstCommitGas - secondCommitGas);

    if (gasDifference > 10000) {
      console.log('Cold start detected and excluded:');
      console.log(`  Sample 0 commit gas: ${firstCommitGas}`);
      console.log(`  Sample 1 commit gas: ${secondCommitGas}`);
      console.log(`  Difference: ${gasDifference} gas (likely SSTORE cold start)`);
      console.log();

      // Exclude first sample
      results = executionResults.slice(1);
    } else {
      console.log('No significant cold start detected, keeping all samples');
      console.log();
    }
  }

  return results.map(result => {
    const features = result.features;

    return {
      // Observable blockchain features
      commitGasUsed: parseInt(features.commitGasUsed),
      commitCalldataLength: features.commitCalldataLength,
      accessGasUsed: parseInt(features.accessGasUsed),
      accessCalldataLength: features.accessCalldataLength,

      // Proof features (exclude internal-only timings)
      proofSize: features.proofSize,

      // Event features
      commitLogsCount: features.commitLogsCount,
      commitLogsSize: features.commitLogsSize,
      accessLogsCount: features.accessLogsCount,
      accessLogsSize: features.accessLogsSize,

      // Labels / metadata (NOT used as attack features)
      // blockDifference (accessBlock - commitBlock) is EXCLUDED from modeling:
      // it reflects network congestion at execution time, not policy content.
      // Because the harness executes policies in layer order (simple policies
      // first, complex later) while network state drifts, term count and
      // blockDifference become spuriously correlated via execution time. No such
      // channel exists in a real deployment where policies are not batched by
      // complexity. Kept here only for diagnostics.
      blockDifference: features.blockDifference,

      // Group key for policy-disjoint train/test split
      policyIndex: result.policyIndex,
      duoTerm: result.duoTerm,
      duoTermCodes: result.duoTermCodes || [], // Array of all DUO terms in the policy
      ontologyNamespace: result.ontologyNamespace,
      ontologyValue: result.ontologyValue,

      // ICD-10 chapter for multi-class classification
      // Only set when namespace is ICD10, otherwise undefined
      icd10Chapter: result.ontologyNamespace === 'ICD10' ? result.ontologyValue : undefined,

      satisfy: result.satisfy ? 1 : 0
    };
  });
}

/**
 * Normalize features for ML (min-max scaling)
 */
function normalizeFeatures(features) {
  // Include all observable features for adversary modeling
  // Note: Gas features may show ~360 gas difference due to padding limitations
  const featureNames = Object.keys(features[0]).filter(
    key => !['policyIndex', 'duoTerm', 'duoTermCodes', 'ontologyNamespace', 'ontologyValue', 'icd10Chapter', 'satisfy', 'proofGenerationTime', 'blockDifference'].includes(key)
  );
  console.log('Normalizing features:', featureNames.join(', '));
  // const featureNames = ["commitGasUsed", "accessGasUsed"];

  const normalized = features.map(f => ({ ...f }));
  const zeroVarianceFeatures = [];

  for (const name of featureNames) {
    const values = features.map(f => f[name]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    if (range > 0) {
      for (let i = 0; i < normalized.length; i++) {
        normalized[i][name] = (normalized[i][name] - min) / range;
      }
    } else {
      zeroVarianceFeatures.push(name);
    }
  }

  if (zeroVarianceFeatures.length > 0) {
    console.warn('Dropping zero-variance features:', zeroVarianceFeatures.join(', '));
    for (const row of normalized) {
      for (const name of zeroVarianceFeatures) {
        delete row[name];
      }
    }
  }

  return normalized;
}

/**
 * Split data into train and test sets.
 *
 * When rows carry a policyIndex, the split is policy-disjoint (group split):
 * all executions of one policy land on the same side. Otherwise, repeated
 * executions of the same policy leak per-policy fingerprints (e.g. the
 * commitment's calldata byte pattern) from train to test, and the attack
 * measures policy re-identification instead of content inference.
 */
function splitTrainTest(data, testRatio = 0.3, rng = Math.random) {
  const hasGroups = data.length > 0 && data[0].policyIndex !== undefined;

  if (!hasGroups) {
    const shuffled = [...data].sort(() => rng() - 0.5);
    const splitIndex = Math.floor(shuffled.length * (1 - testRatio));
    return {
      train: shuffled.slice(0, splitIndex),
      test: shuffled.slice(splitIndex)
    };
  }

  const groups = [...new Set(data.map(d => d.policyIndex))];
  const shuffledGroups = groups.sort(() => rng() - 0.5);
  const splitIndex = Math.floor(shuffledGroups.length * (1 - testRatio));
  const trainGroups = new Set(shuffledGroups.slice(0, splitIndex));

  return {
    train: data.filter(d => trainGroups.has(d.policyIndex)),
    test: data.filter(d => !trainGroups.has(d.policyIndex))
  };
}

/**
 * Extract feature matrix and labels for classification
 */
function prepareClassificationData(features, labelKey) {
  const X = features.map(f => {
    const x = { ...f };
    delete x.policyIndex;
    delete x.duoTerm;
    delete x.duoTermCodes;
    delete x.ontologyNamespace;
    delete x.ontologyValue;
    delete x.icd10Chapter;
    delete x.satisfy;
    delete x.blockDifference; // confounded harness artifact, see extractFeatures
    return Object.values(x);
  });

  const y = features.map(f => f[labelKey]);

  return { X, y };
}

/**
 * Calculate feature statistics
 */
function calculateFeatureStats(features) {
  const featureNames = Object.keys(features[0]).filter(
    key => !['policyIndex', 'duoTerm', 'duoTermCodes', 'ontologyNamespace', 'ontologyValue', 'icd10Chapter', 'satisfy'].includes(key)
  );

  const stats = {};

  for (const name of featureNames) {
    const values = features.map(f => f[name]);
    const sorted = [...values].sort((a, b) => a - b);

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    let variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    if (!Number.isFinite(variance)) {
      variance = 0;
    }

    stats[name] = {
      min: Math.min(...values),
      max: Math.max(...values),
      mean,
      median: sorted[Math.floor(sorted.length / 2)],
      std: Math.sqrt(variance)
    };
  }

  return stats;
}

module.exports = {
  extractFeatures,
  normalizeFeatures,
  splitTrainTest,
  prepareClassificationData,
  calculateFeatureStats
};
