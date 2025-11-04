/**
 * Feature Extractor for Policy Content Hiding Evaluation
 * 
 * Extracts and normalizes observable features from executed policies
 * for machine learning analysis.
 */

/**
 * Extract features from execution results
 */
function extractFeatures(executionResults) {
  return executionResults.map(result => {
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

      // Timing features
      blockDifference: features.blockDifference,

      // Labels for classification
      duoTerm: result.duoTerm,
      ontologyNamespace: result.ontologyNamespace,
      ontologyValue: result.ontologyValue,
      satisfy: result.satisfy ? 1 : 0
    };
  });
}

/**
 * Normalize features for ML (min-max scaling)
 */
function normalizeFeatures(features) {
  const featureNames = Object.keys(features[0]).filter(
    key => !['duoTerm', 'ontologyNamespace', 'ontologyValue', 'satisfy', 'proofGenerationTime'].includes(key)
  );
  console.log('Normalizing features:', featureNames.join(', '));

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
 * Split data into train and test sets
 */
function splitTrainTest(data, testRatio = 0.3) {
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const splitIndex = Math.floor(shuffled.length * (1 - testRatio));

  return {
    train: shuffled.slice(0, splitIndex),
    test: shuffled.slice(splitIndex)
  };
}

/**
 * Extract feature matrix and labels for classification
 */
function prepareClassificationData(features, labelKey) {
  const X = features.map(f => {
    const x = { ...f };
    delete x.duoTerm;
    delete x.ontologyNamespace;
    delete x.ontologyValue;
    delete x.satisfy;
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
    key => !['duoTerm', 'ontologyNamespace', 'ontologyValue', 'satisfy'].includes(key)
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
