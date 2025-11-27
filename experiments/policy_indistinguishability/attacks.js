/**
 * Attack orchestration across the three PI adversary levels.
 */

const { LogisticRegression, RandomForest } = require('../policy_content_hiding/classifiers');
const { evaluateBinaryClassification } = require('../policy_content_hiding/evaluator');
const {
  FEATURE_KEYS,
  buildSingleSampleDataset,
  buildPairwiseDataset,
  summarizeFeatureStats,
  normalizeSamples,
  toMatrix,
  trainTestSplit
} = require('./feature_extractor');
const {
  computeBinaryEntropy,
  permutationTestAUC,
  ksTest,
  computeMMD
} = require('./statistics');

function groupPairsByType(pairs) {
  const groups = new Map();
  pairs.forEach((pair) => {
    if (!groups.has(pair.pairType)) {
      groups.set(pair.pairType, []);
    }
    groups.get(pair.pairType).push(pair);
  });
  return groups;
}

function ensureDatasetReady(samples) {
  return Array.isArray(samples) && samples.length >= 10;
}

function runLogistic(name, trainMatrix, testMatrix, permutationIterations) {
  const model = new LogisticRegression(0.1, 400);
  model.train(trainMatrix.X, trainMatrix.y);

  const probabilities = model.predictProba(testMatrix.X);
  const predictions = probabilities.map((p) => (p >= 0.5 ? 1 : 0));

  const evaluation = evaluateBinaryClassification(
    testMatrix.y,
    predictions,
    probabilities,
    name
  );

  const entropy = computeBinaryEntropy(probabilities);
  const { pValue } = permutationTestAUC(
    testMatrix.y,
    probabilities,
    typeof permutationIterations === 'number' ? permutationIterations : undefined
  );

  return {
    evaluation,
    probabilities,
    predictions,
    entropy,
    permutationPValue: pValue,
    weights: model.weights ? model.weights.slice() : [],
    bias: model.bias
  };
}

function runRandomForest(name, trainMatrix, testMatrix) {
  const forest = new RandomForest(25, 6);
  forest.train(trainMatrix.X, trainMatrix.y);
  const predictions = forest.predict(testMatrix.X).map((label) => Number(label));

  const evaluation = evaluateBinaryClassification(
    testMatrix.y,
    predictions,
    null,
    name
  );

  return {
    evaluation,
    predictions
  };
}

/**
 * Single-sample classifiers (Level I).
 */
function runSingleSampleAttacks(pairs, options = {}) {
  const groups = groupPairsByType(pairs);
  const results = [];
  const testRatio = options.testRatio || 0.3;
  const permutationIterations = options.permutationIterations;

  const overallPairs = pairs.length > 0 ? [{ pairType: 'overall', subset: pairs }] : [];
  const scopedGroups = overallPairs.concat(
    Array.from(groups.entries()).map(([pairType, subset]) => ({ pairType, subset }))
  );

  scopedGroups.forEach(({ pairType, subset }) => {
    console.log(`Running single-sample PI attack for pair type: ${pairType} (${subset.length} pairs)`);
    const dataset = buildSingleSampleDataset(subset);
    if (!ensureDatasetReady(dataset)) {
      results.push({
        scope: pairType,
        classifier: 'LogisticRegression',
        skipped: true,
        reason: 'Insufficient samples (<10)'
      });
      return;
    }

    const summary = summarizeFeatureStats(dataset);
    const { samples } = normalizeSamples(dataset);
    const { train, test } = trainTestSplit(samples, testRatio);

    if (train.length < 8 || test.length < 4) {
      results.push({
        scope: pairType,
        classifier: 'LogisticRegression',
        skipped: true,
        reason: 'Insufficient train/test partition'
      });
      return;
    }

    const trainMatrix = toMatrix(train);
    const testMatrix = toMatrix(test);

    const logisticOutcome = runLogistic(
      `Single-sample PI (${pairType})`,
      trainMatrix,
      testMatrix,
      permutationIterations
    );

    const forestOutcome = runRandomForest(
      `Single-sample PI (RF ${pairType})`,
      trainMatrix,
      testMatrix
    );

    results.push({
      scope: pairType,
      classifier: 'LogisticRegression',
      outcome: logisticOutcome,
      dataset: {
        trainSize: trainMatrix.y.length,
        testSize: testMatrix.y.length,
        featureSummary: summary
      }
    });

    results.push({
      scope: pairType,
      classifier: 'RandomForest',
      outcome: forestOutcome,
      dataset: {
        trainSize: trainMatrix.y.length,
        testSize: testMatrix.y.length,
        featureSummary: summary
      }
    });
  });

  return results;
}

/**
 * Pairwise (Siamese-style) classifier using absolute feature deltas (Level II).
 */
function runPairwiseAttacks(pairs, options = {}) {
  const dataset = buildPairwiseDataset(pairs);
  if (!ensureDatasetReady(dataset)) {
    return [{
      classifier: 'LogisticRegression',
      skipped: true,
      reason: 'Insufficient pairwise samples'
    }];
  }

  const summary = summarizeFeatureStats(dataset);
  const { samples } = normalizeSamples(dataset);
  const { train, test } = trainTestSplit(samples, options.testRatio || 0.3);

  if (train.length < 8 || test.length < 4) {
    return [{
      classifier: 'LogisticRegression',
      skipped: true,
      reason: 'Insufficient train/test partition'
    }];
  }

  const trainMatrix = toMatrix(train);
  const testMatrix = toMatrix(test);

  const logisticOutcome = runLogistic(
    'Pairwise PI (difference vectors)',
    trainMatrix,
    testMatrix,
    options.permutationIterations
  );
  const forestOutcome = runRandomForest('Pairwise PI RF', trainMatrix, testMatrix);

  return [
    {
      classifier: 'LogisticRegression',
      outcome: logisticOutcome,
      dataset: {
        trainSize: trainMatrix.y.length,
        testSize: testMatrix.y.length,
        featureSummary: summary
      }
    },
    {
      classifier: 'RandomForest',
      outcome: forestOutcome,
      dataset: {
        trainSize: trainMatrix.y.length,
        testSize: testMatrix.y.length,
        featureSummary: summary
      }
    }
  ];
}

/**
 * Two-sample statistical tests (Level III).
 */
function runTwoSampleTests(pairs) {
  const perPair = pairs.map((pair) => {
    const policyA = pair.policies[0];
    const policyB = pair.policies[1];
    const vectorsA = policyA.features.map((sample) => FEATURE_KEYS.map((key) => sample.features[key]));
    const vectorsB = policyB.features.map((sample) => FEATURE_KEYS.map((key) => sample.features[key]));

    const ksPerFeature = {};
    FEATURE_KEYS.forEach((key, idx) => {
      const sampleA = vectorsA.map((vector) => vector[idx]);
      const sampleB = vectorsB.map((vector) => vector[idx]);
      ksPerFeature[key] = ksTest(sampleA, sampleB);
    });

    const mmd = computeMMD(vectorsA, vectorsB);

    return {
      pairId: pair.pairId,
      pairType: pair.pairType,
      mmd,
      ks: ksPerFeature
    };
  });

  const byType = new Map();
  perPair.forEach((entry) => {
    if (!byType.has(entry.pairType)) {
      byType.set(entry.pairType, []);
    }
    byType.get(entry.pairType).push(entry);
  });

  const aggregated = Array.from(byType.entries()).map(([pairType, entries]) => {
    const meanMmd = entries.reduce((acc, item) => acc + item.mmd, 0) / entries.length;
    const ksSummary = {};
    FEATURE_KEYS.forEach((key) => {
      const stats = entries.map((entry) => entry.ks[key].statistic);
      const pVals = entries.map((entry) => entry.ks[key].pValue);
      ksSummary[key] = {
        statisticMean: stats.reduce((acc, val) => acc + val, 0) / stats.length,
        pValueMean: pVals.reduce((acc, val) => acc + val, 0) / pVals.length
      };
    });
    return {
      pairType,
      meanMmd,
      ksSummary
    };
  });

  return { perPair, aggregated };
}

module.exports = {
  runSingleSampleAttacks,
  runPairwiseAttacks,
  runTwoSampleTests
};
