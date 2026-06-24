/**
 * Feature preparation utilities for Policy Indistinguishability attacks.
 */

const { FEATURE_KEYS } = require('./feature_keys');

/**
 * Flatten pair executions into per-sample records for Level-I attacks.
 */
function buildSingleSampleDataset(pairs) {
  const samples = [];

  pairs.forEach((pair) => {
    pair.policies.forEach((policy, policyIdx) => {
      policy.features.forEach((executionRecord) => {
        samples.push({
          pairId: pair.pairId,
          pairType: pair.pairType,
          policyId: policy.policyId,
          policyIndex: policyIdx,
          label: policyIdx,
          features: { ...executionRecord.features },
          satisfy: executionRecord.satisfy,
          duoTerm: executionRecord.duoTerm,
          ontologyNamespace: executionRecord.ontologyNamespace,
          ontologyValue: executionRecord.ontologyValue
        });
      });
    });
  });

  return samples;
}

/**
 * Build pairwise dataset (absolute feature deltas) for Level-II attacks.
 */
function buildPairwiseDataset(pairs) {
  const rows = [];

  pairs.forEach((pair) => {
    const policyA = pair.policies[0];
    const policyB = pair.policies[1];
    const len = Math.min(policyA.features.length, policyB.features.length);

    for (let i = 0; i < len; i++) {
      const featA = policyA.features[i].features;
      const featB = policyB.features[i].features;
      const diffVector = {};
      FEATURE_KEYS.forEach((key) => {
        diffVector[key] = Math.abs(featA[key] - featB[key]);
      });

      rows.push({
        pairId: pair.pairId,
        pairType: pair.pairType,
        index: i,
        features: diffVector,
        label: 1, // 1 means "different policies" for Siamese-style training
        raw: {
          policyAId: policyA.policyId,
          policyBId: policyB.policyId
        }
      });
    }

    // Augment with intra-policy comparisons as negative examples
    const intraLen = Math.min(policyA.features.length, policyB.features.length);
    for (let i = 0; i < intraLen - 1; i++) {
      const featA1 = policyA.features[i].features;
      const featA2 = policyA.features[i + 1].features;
      const diffVectorSame = {};
      FEATURE_KEYS.forEach((key) => {
        diffVectorSame[key] = Math.abs(featA1[key] - featA2[key]);
      });
      rows.push({
        pairId: `${pair.pairId}::sameA::${i}`,
        pairType: pair.pairType,
        index: i,
        features: diffVectorSame,
        label: 0, // 0 => same policy
        raw: {
          policyAId: policyA.policyId,
          policyBId: policyA.policyId
        }
      });

      const featB1 = policyB.features[i].features;
      const featB2 = policyB.features[i + 1].features;
      const diffVectorSameB = {};
      FEATURE_KEYS.forEach((key) => {
        diffVectorSameB[key] = Math.abs(featB1[key] - featB2[key]);
      });
      rows.push({
        pairId: `${pair.pairId}::sameB::${i}`,
        pairType: pair.pairType,
        index: i,
        features: diffVectorSameB,
        label: 0,
        raw: {
          policyAId: policyB.policyId,
          policyBId: policyB.policyId
        }
      });
    }
  });

  return rows;
}

/**
 * Calculate simple statistics for a set of samples.
 */
function summarizeFeatureStats(samples) {
  const stats = {};
  FEATURE_KEYS.forEach((key) => {
    const values = samples.map((sample) => sample.features[key]);
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + (val - mean) ** 2, 0) / values.length;
    stats[key] = {
      min: Math.min(...values),
      max: Math.max(...values),
      mean,
      variance,
      std: Math.sqrt(variance)
    };
  });
  return stats;
}

/**
 * Normalize features (min-max) and emit matrix arrays.
 */
function normalizeSamples(samples) {
  const minima = {};
  const maxima = {};
  FEATURE_KEYS.forEach((key) => {
    minima[key] = Infinity;
    maxima[key] = -Infinity;
  });

  samples.forEach((sample) => {
    FEATURE_KEYS.forEach((key) => {
      const value = sample.features[key];
      if (value < minima[key]) minima[key] = value;
      if (value > maxima[key]) maxima[key] = value;
    });
  });

  const normalized = samples.map((sample) => {
    const vector = FEATURE_KEYS.map((key) => {
      const range = maxima[key] - minima[key];
      if (range === 0) {
        return 0;
      }
      return (sample.features[key] - minima[key]) / range;
    });

    return {
      ...sample,
      normalizedVector: vector
    };
  });

  return {
    samples: normalized,
    scaler: { minima, maxima }
  };
}

/**
 * Convert normalized samples to matrix + labels.
 */
function toMatrix(samplesWithVectors) {
  const X = samplesWithVectors.map((sample) => sample.normalizedVector);
  const y = samplesWithVectors.map((sample) => sample.label);
  return { X, y };
}

/**
 * Train/test split helper.
 *
 * When samples carry policy identifiers (raw.policyAId / raw.policyBId — present
 * for pairwise difference samples), the split is policy-disjoint: the set of
 * policies is partitioned into train/test, and a sample is kept only if BOTH of
 * its policies fall on the same side. Cross-partition pairs are dropped. This
 * prevents a policy's per-execution fingerprint from appearing in both train and
 * test, which would let the attack re-identify policies instead of judging
 * indistinguishability of unseen ones.
 *
 * Falls back to a plain row-level split when no policy identifiers are present.
 */
function trainTestSplit(samples, testRatio = 0.3) {
  if (samples.length === 0) {
    return { train: [], test: [] };
  }

  // Single-sample datasets carry one policyId per row; pairwise datasets carry
  // raw.policyAId / raw.policyBId. Map each to the pair of policies it touches.
  const hasPairIds = samples[0].raw && samples[0].raw.policyAId !== undefined;
  const hasSingleId = samples[0].policyId !== undefined;

  if (!hasPairIds && !hasSingleId) {
    const shuffled = [...samples].sort(() => Math.random() - 0.5);
    const split = Math.floor(shuffled.length * (1 - testRatio));
    return {
      train: shuffled.slice(0, split),
      test: shuffled.slice(split)
    };
  }

  const policiesOf = (s) => hasPairIds
    ? [s.raw.policyAId, s.raw.policyBId]
    : [s.policyId];

  const policyIds = [...new Set(
    samples.flatMap(policiesOf)
  )].sort(() => Math.random() - 0.5);
  const testCount = Math.floor(policyIds.length * testRatio);
  const testPolicies = new Set(policyIds.slice(0, testCount));
  const trainPolicies = new Set(policyIds.slice(testCount));

  const inSet = (s, set) => policiesOf(s).every((id) => set.has(id));

  return {
    train: samples.filter((s) => inSet(s, trainPolicies)),
    test: samples.filter((s) => inSet(s, testPolicies))
    // samples spanning both partitions are intentionally dropped
  };
}

module.exports = {
  FEATURE_KEYS,
  buildSingleSampleDataset,
  buildPairwiseDataset,
  summarizeFeatureStats,
  normalizeSamples,
  toMatrix,
  trainTestSplit
};
