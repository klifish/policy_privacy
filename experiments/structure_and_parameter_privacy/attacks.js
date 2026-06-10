/**
 * Structure & Parameter Privacy – Attack Models
 *
 * Implements three types of attacks:
 * 1. Supervised classification (logistic regression, random forest)
 * 2. Statistical hypothesis testing (KS test, MMD, permutation tests)
 * 3. Unsupervised clustering (k-means, silhouette analysis)
 */

const { LogisticRegression, RandomForest } = require('../core/classifiers');

// Feature keys for side-channel analysis
const FEATURE_KEYS = [
  'commitGasUsed',
  'commitCalldataLength',
  'accessGasUsed',
  'accessCalldataLength',
  'proofSize',
  'commitLogsCount',
  'commitLogsSize',
  'accessLogsCount',
  'accessLogsSize',
  'blockDifference'
];

/**
 * Extract numeric features from execution result
 */
function extractFeatures(execution) {
  const features = {};
  FEATURE_KEYS.forEach(key => {
    const value = execution.features?.[key];
    features[key] = typeof value === 'string' ? parseFloat(value) : (value || 0);
  });
  return features;
}

/**
 * Convert features object to array
 */
function featuresToArray(features) {
  return FEATURE_KEYS.map(key => features[key] || 0);
}

/**
 * Aggregate executions by policy family
 */
function aggregateByFamily(executionResults) {
  const families = new Map();

  executionResults.forEach(result => {
    const familyId = result.familyId;
    if (!families.has(familyId)) {
      families.set(familyId, {
        familyId,
        structureType: result.structureType || result.structure,
        predicateCombo: result.predicateCombo,
        paramType: result.paramType,
        executions: []
      });
    }
    families.get(familyId).executions.push(result);
  });

  return Array.from(families.values());
}

/**
 * Balance dataset using SMOTE-like oversampling
 * @param {Array} minorityData - Minority class samples
 * @param {number} targetCount - Target number of samples
 * @returns {Array} Balanced dataset
 */
function oversampleMinorityClass(minorityData, targetCount) {
  const syntheticSamples = [];
  const originalCount = minorityData.length;
  const needed = targetCount - originalCount;

  if (needed <= 0) {
    return minorityData;
  }

  // Simple oversampling: duplicate with small random noise
  for (let i = 0; i < needed; i++) {
    const sourceIdx = Math.floor(Math.random() * originalCount);
    const source = minorityData[sourceIdx];

    // Add small random noise to features
    const noisyFeatures = source.features.map(f => {
      const noise = (Math.random() - 0.5) * 0.02 * f; // ±1% noise
      return f + noise;
    });

    syntheticSamples.push({
      features: noisyFeatures,
      label: source.label
    });
  }

  return [...minorityData, ...syntheticSamples];
}

/**
 * Undersample majority class
 * @param {Array} majorityData - Majority class samples
 * @param {number} targetCount - Target number of samples
 * @returns {Array} Undersampled dataset
 */
function undersampleMajorityClass(majorityData, targetCount) {
  if (targetCount >= majorityData.length) {
    return majorityData;
  }

  // Random undersampling
  const shuffled = [...majorityData].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, targetCount);
}

/**
 * Balance dataset using combination of over/undersampling
 * @param {Array} class0Data - Class 0 samples
 * @param {Array} class1Data - Class 1 samples
 * @param {string} method - 'oversample', 'undersample', 'both', 'none'
 * @returns {Object} Balanced dataset {class0, class1}
 */
function balanceDataset(class0Data, class1Data, method = 'both') {
  const count0 = class0Data.length;
  const count1 = class1Data.length;

  if (method === 'none') {
    return { class0: class0Data, class1: class1Data };
  }

  const minCount = Math.min(count0, count1);
  const maxCount = Math.max(count0, count1);
  const targetCount = method === 'both' ? Math.ceil((minCount + maxCount) / 2) :
                      method === 'oversample' ? maxCount : minCount;

  let balanced0, balanced1;

  if (count0 < count1) {
    // Class 0 is minority
    balanced0 = method === 'undersample' ? class0Data : oversampleMinorityClass(class0Data, targetCount);
    balanced1 = method === 'oversample' ? class1Data : undersampleMajorityClass(class1Data, targetCount);
  } else {
    // Class 1 is minority
    balanced0 = method === 'oversample' ? class0Data : undersampleMajorityClass(class0Data, targetCount);
    balanced1 = method === 'undersample' ? class1Data : oversampleMinorityClass(class1Data, targetCount);
  }

  return { class0: balanced0, class1: balanced1 };
}

/**
 * Split data into train/test sets
 */
function trainTestSplit(data, testRatio = 0.3) {
  const shuffled = [...data].sort(() => Math.random() - 0.5);
  const testSize = Math.floor(data.length * testRatio);
  return {
    train: shuffled.slice(testSize),
    test: shuffled.slice(0, testSize)
  };
}

/**
 * Calculate accuracy and advantage metrics
 */
function evaluateClassifier(predictions, labels) {
  const correct = predictions.filter((pred, i) => pred === labels[i]).length;
  const accuracy = correct / predictions.length;
  const advantage = Math.abs(accuracy - 0.5);

  // Calculate confusion matrix
  const tp = predictions.filter((pred, i) => pred === 1 && labels[i] === 1).length;
  const tn = predictions.filter((pred, i) => pred === 0 && labels[i] === 0).length;
  const fp = predictions.filter((pred, i) => pred === 1 && labels[i] === 0).length;
  const fn = predictions.filter((pred, i) => pred === 0 && labels[i] === 1).length;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  return {
    accuracy,
    advantage,
    precision,
    recall,
    f1,
    confusion: { tp, tn, fp, fn }
  };
}

/**
 * Permutation test for classifier significance
 */
function permutationTest(features, labels, iterations = 500) {
  const n = labels.length;
  const { train, test } = trainTestSplit(
    features.map((f, i) => ({ features: f, label: labels[i] })),
    0.3
  );

  // Train on actual labels
  const classifier = new LogisticRegression();
  classifier.train(
    train.map(d => d.features),
    train.map(d => d.label)
  );

  const actualPredictions = classifier.predict(test.map(d => d.features));
  const actualAccuracy = evaluateClassifier(actualPredictions, test.map(d => d.label)).accuracy;

  // Permutation tests
  let betterCount = 0;
  for (let i = 0; i < iterations; i++) {
    const permutedLabels = [...labels].sort(() => Math.random() - 0.5);
    const permSplit = trainTestSplit(
      features.map((f, idx) => ({ features: f, label: permutedLabels[idx] })),
      0.3
    );

    const permClassifier = new LogisticRegression();
    permClassifier.train(
      permSplit.train.map(d => d.features),
      permSplit.train.map(d => d.label)
    );

    const permPredictions = permClassifier.predict(permSplit.test.map(d => d.features));
    const permAccuracy = evaluateClassifier(permPredictions, permSplit.test.map(d => d.label)).accuracy;

    if (permAccuracy >= actualAccuracy) {
      betterCount++;
    }
  }

  return {
    pValue: betterCount / iterations,
    actualAccuracy,
    iterations
  };
}

/**
 * Run supervised classification attacks
 * Goal: Classify policies by structure or parameter type based on side-channel features
 */
function runSupervisedAttacks(executionResults, config = {}) {
  const {
    targetAttribute = 'structureType',  // 'structureType', 'predicateCombo', 'paramType'
    testRatio = 0.3,
    permutationIterations = 500,
    balanceMethod = 'both'  // 'oversample', 'undersample', 'both', 'none'
  } = config;

  console.log(`\nRunning supervised classification attack on: ${targetAttribute}`);
  console.log(`Balance method: ${balanceMethod}`);

  // Group by target attribute
  const groups = new Map();
  executionResults.forEach(result => {
    const key = result[targetAttribute];
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(result);
  });

  console.log(`Found ${groups.size} classes: ${Array.from(groups.keys()).join(', ')}`);

  // Binary classification for each pair of classes
  const results = [];
  const classes = Array.from(groups.keys());

  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const class0 = classes[i];
      const class1 = classes[j];

      const data0Raw = groups.get(class0);
      const data1Raw = groups.get(class1);

      const originalCount0 = data0Raw.length;
      const originalCount1 = data1Raw.length;
      const imbalanceRatio = Math.max(originalCount0, originalCount1) / Math.min(originalCount0, originalCount1);

      console.log(`\nClassifying ${class0} vs ${class1} (${originalCount0} vs ${originalCount1} samples, ratio ${imbalanceRatio.toFixed(2)}:1)`);

      // Prepare data for balancing
      const class0Data = data0Raw.map(r => ({
        features: featuresToArray(extractFeatures(r)),
        label: 0
      }));

      const class1Data = data1Raw.map(r => ({
        features: featuresToArray(extractFeatures(r)),
        label: 1
      }));

      // Skip if insufficient data
      if (class0Data.length + class1Data.length < 20) {
        console.log(`  Skipping: insufficient data (${class0Data.length + class1Data.length} samples)`);
        results.push({
          targetAttribute,
          class0,
          class1,
          skipped: true,
          reason: 'insufficient_data',
          sampleCount: class0Data.length + class1Data.length,
          originalCount0,
          originalCount1
        });
        continue;
      }

      // Apply balancing
      const balanced = balanceDataset(class0Data, class1Data, balanceMethod);
      const balancedData = [...balanced.class0, ...balanced.class1];

      const balancedCount0 = balanced.class0.length;
      const balancedCount1 = balanced.class1.length;

      if (balanceMethod !== 'none') {
        console.log(`  Balanced: ${balancedCount0} vs ${balancedCount1} samples (from ${originalCount0} vs ${originalCount1})`);
      }

      // Extract features and labels from balanced data
      const features = balancedData.map(d => d.features);
      const labels = balancedData.map(d => d.label);

      // Train/test split
      const { train, test } = trainTestSplit(
        features.map((f, i) => ({ features: f, label: labels[i] })),
        testRatio
      );

      // Logistic Regression
      const lr = new LogisticRegression();
      lr.train(
        train.map(d => d.features),
        train.map(d => d.label)
      );

      const lrPredictions = lr.predict(test.map(d => d.features));
      const lrEval = evaluateClassifier(lrPredictions, test.map(d => d.label));

      console.log(`  Logistic Regression: accuracy=${lrEval.accuracy.toFixed(3)}, advantage=${lrEval.advantage.toFixed(3)}`);

      // Permutation test
      const permTest = permutationTest(features, labels, permutationIterations);
      console.log(`  Permutation p-value: ${permTest.pValue.toFixed(4)}`);

      // Random Forest
      const rf = new RandomForest(50, 10);
      rf.train(
        train.map(d => d.features),
        train.map(d => d.label)
      );

      const rfPredictions = rf.predict(test.map(d => d.features));
      const rfEval = evaluateClassifier(rfPredictions, test.map(d => d.label));

      console.log(`  Random Forest: accuracy=${rfEval.accuracy.toFixed(3)}, advantage=${rfEval.advantage.toFixed(3)}`);

      results.push({
        targetAttribute,
        class0,
        class1,
        sampleCount: features.length,
        originalCount0,
        originalCount1,
        balancedCount0,
        balancedCount1,
        imbalanceRatio,
        balanceMethod,
        trainSize: train.length,
        testSize: test.length,
        logisticRegression: {
          evaluation: lrEval,
          weights: lr.weights || [],
          permutationTest: permTest
        },
        randomForest: {
          evaluation: rfEval,
          nTrees: rf.nTrees
        }
      });
    }
  }

  return {
    targetAttribute,
    classCount: groups.size,
    classes,
    results
  };
}

/**
 * Two-sample Kolmogorov-Smirnov test
 */
function ksTest(sample1, sample2) {
  const n1 = sample1.length;
  const n2 = sample2.length;

  const sorted1 = [...sample1].sort((a, b) => a - b);
  const sorted2 = [...sample2].sort((a, b) => a - b);

  const allValues = [...sorted1, ...sorted2].sort((a, b) => a - b);
  const uniqueValues = [...new Set(allValues)];

  let maxD = 0;
  uniqueValues.forEach(value => {
    const cdf1 = sorted1.filter(v => v <= value).length / n1;
    const cdf2 = sorted2.filter(v => v <= value).length / n2;
    const d = Math.abs(cdf1 - cdf2);
    maxD = Math.max(maxD, d);
  });

  // Approximate p-value using asymptotic distribution
  const effectiveN = (n1 * n2) / (n1 + n2);
  const lambda = maxD * Math.sqrt(effectiveN);
  const pValue = 2 * Math.exp(-2 * lambda * lambda);

  return {
    statistic: maxD,
    pValue: Math.min(1, pValue),
    n1,
    n2
  };
}

/**
 * Maximum Mean Discrepancy (MMD) with RBF kernel
 */
function mmdTest(sample1, sample2, sigma = 1.0) {
  const n = sample1.length;
  const m = sample2.length;

  // RBF kernel
  const kernel = (x, y) => {
    const diff = x.map((xi, i) => xi - y[i]);
    const norm = diff.reduce((sum, d) => sum + d * d, 0);
    return Math.exp(-norm / (2 * sigma * sigma));
  };

  // K(X, X)
  let kxx = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        kxx += kernel(sample1[i], sample1[j]);
      }
    }
  }
  kxx /= (n * (n - 1));

  // K(Y, Y)
  let kyy = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) {
      if (i !== j) {
        kyy += kernel(sample2[i], sample2[j]);
      }
    }
  }
  kyy /= (m * (m - 1));

  // K(X, Y)
  let kxy = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      kxy += kernel(sample1[i], sample2[j]);
    }
  }
  kxy /= (n * m);

  const mmd = kxx + kyy - 2 * kxy;

  return {
    mmd: Math.max(0, mmd),
    n,
    m
  };
}

/**
 * Run statistical hypothesis tests
 */
function runStatisticalTests(executionResults, config = {}) {
  const {
    targetAttribute = 'structureType'
  } = config;

  console.log(`\nRunning statistical tests on: ${targetAttribute}`);

  // Group by target attribute
  const groups = new Map();
  executionResults.forEach(result => {
    const key = result[targetAttribute];
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(result);
  });

  const classes = Array.from(groups.keys());
  console.log(`Found ${groups.size} classes: ${classes.join(', ')}`);

  const results = [];

  // Pairwise comparisons
  for (let i = 0; i < classes.length; i++) {
    for (let j = i + 1; j < classes.length; j++) {
      const class0 = classes[i];
      const class1 = classes[j];

      const data0 = groups.get(class0);
      const data1 = groups.get(class1);

      console.log(`\nComparing ${class0} vs ${class1}`);

      // Extract feature vectors
      const features0 = data0.map(r => featuresToArray(extractFeatures(r)));
      const features1 = data1.map(r => featuresToArray(extractFeatures(r)));

      // KS test for each feature dimension
      const ksResults = {};
      FEATURE_KEYS.forEach((key, idx) => {
        const values0 = features0.map(f => f[idx]);
        const values1 = features1.map(f => f[idx]);
        ksResults[key] = ksTest(values0, values1);
      });

      // MMD test on full feature vectors
      const mmd = mmdTest(features0, features1);

      console.log(`  MMD: ${mmd.mmd.toFixed(6)}`);
      console.log(`  KS p-values: ${Object.entries(ksResults).map(([k, v]) => `${k}=${v.pValue.toFixed(3)}`).join(', ')}`);

      results.push({
        targetAttribute,
        class0,
        class1,
        n0: data0.length,
        n1: data1.length,
        mmd,
        ksTests: ksResults,
        avgKsPValue: Object.values(ksResults).reduce((sum, r) => sum + r.pValue, 0) / FEATURE_KEYS.length
      });
    }
  }

  return {
    targetAttribute,
    classCount: groups.size,
    classes,
    results
  };
}

/**
 * K-means clustering
 */
function kmeans(data, k, maxIterations = 100) {
  const n = data.length;
  const dim = data[0].length;

  // Initialize centroids randomly
  const centroids = [];
  const indices = new Set();
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * n);
    if (!indices.has(idx)) {
      indices.add(idx);
      centroids.push([...data[idx]]);
    }
  }

  let labels = Array(n).fill(0);
  let iterations = 0;

  while (iterations < maxIterations) {
    // Assign points to nearest centroid
    const newLabels = data.map(point => {
      let minDist = Infinity;
      let minIdx = 0;
      centroids.forEach((centroid, idx) => {
        const dist = point.reduce((sum, val, i) => sum + (val - centroid[i]) ** 2, 0);
        if (dist < minDist) {
          minDist = dist;
          minIdx = idx;
        }
      });
      return minIdx;
    });

    // Check convergence
    if (newLabels.every((label, i) => label === labels[i])) {
      break;
    }

    labels = newLabels;

    // Update centroids
    for (let i = 0; i < k; i++) {
      const clusterPoints = data.filter((_, idx) => labels[idx] === i);
      if (clusterPoints.length > 0) {
        centroids[i] = Array(dim).fill(0).map((_, d) =>
          clusterPoints.reduce((sum, p) => sum + p[d], 0) / clusterPoints.length
        );
      }
    }

    iterations++;
  }

  return { labels, centroids, iterations };
}

/**
 * Calculate silhouette score
 */
function silhouetteScore(data, labels) {
  const n = data.length;
  const k = Math.max(...labels) + 1;

  const scores = data.map((point, i) => {
    const cluster = labels[i];
    const clusterPoints = data.filter((_, j) => labels[j] === cluster);

    // Mean intra-cluster distance (a)
    const a = clusterPoints.reduce((sum, other) => {
      const dist = point.reduce((d, val, idx) => d + (val - other[idx]) ** 2, 0);
      return sum + Math.sqrt(dist);
    }, 0) / clusterPoints.length;

    // Mean nearest-cluster distance (b)
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === cluster) continue;
      const otherClusterPoints = data.filter((_, j) => labels[j] === c);
      if (otherClusterPoints.length === 0) continue;

      const meanDist = otherClusterPoints.reduce((sum, other) => {
        const dist = point.reduce((d, val, idx) => d + (val - other[idx]) ** 2, 0);
        return sum + Math.sqrt(dist);
      }, 0) / otherClusterPoints.length;

      b = Math.min(b, meanDist);
    }

    return (b - a) / Math.max(a, b);
  });

  return scores.reduce((sum, s) => sum + s, 0) / n;
}

/**
 * Run unsupervised clustering attack
 */
function runClusteringAttack(executionResults, config = {}) {
  const {
    targetAttribute = 'structureType',
    kValues = [2, 3, 4, 5]
  } = config;

  console.log(`\nRunning clustering attack on: ${targetAttribute}`);

  // Extract features
  const features = executionResults.map(r => featuresToArray(extractFeatures(r)));
  const trueLabels = executionResults.map(r => r[targetAttribute]);
  const uniqueLabels = [...new Set(trueLabels)];
  const trueLabelIndices = trueLabels.map(label => uniqueLabels.indexOf(label));

  console.log(`True classes: ${uniqueLabels.join(', ')}`);

  const results = [];

  kValues.forEach(k => {
    console.log(`\nClustering with k=${k}...`);

    const { labels, centroids, iterations } = kmeans(features, k);
    const silhouette = silhouetteScore(features, labels);

    // Calculate adjusted rand index (ARI) if k matches true class count
    let ari = null;
    if (k === uniqueLabels.length) {
      ari = adjustedRandIndex(trueLabelIndices, labels);
      console.log(`  ARI: ${ari.toFixed(4)}`);
    }

    console.log(`  Silhouette: ${silhouette.toFixed(4)}`);
    console.log(`  Iterations: ${iterations}`);

    results.push({
      k,
      silhouette,
      ari,
      iterations,
      clusterSizes: Array(k).fill(0).map((_, i) => labels.filter(l => l === i).length)
    });
  });

  return {
    targetAttribute,
    trueClassCount: uniqueLabels.length,
    results
  };
}

/**
 * Adjusted Rand Index
 */
function adjustedRandIndex(labels1, labels2) {
  const n = labels1.length;
  const contingency = new Map();

  // Build contingency table
  for (let i = 0; i < n; i++) {
    const key = `${labels1[i]},${labels2[i]}`;
    contingency.set(key, (contingency.get(key) || 0) + 1);
  }

  // Calculate ARI
  const a = Array.from(contingency.values()).reduce((sum, nij) => sum + nij * (nij - 1) / 2, 0);

  const n1 = new Map();
  const n2 = new Map();
  labels1.forEach(l => n1.set(l, (n1.get(l) || 0) + 1));
  labels2.forEach(l => n2.set(l, (n2.get(l) || 0) + 1));

  const b1 = Array.from(n1.values()).reduce((sum, ni) => sum + ni * (ni - 1) / 2, 0);
  const b2 = Array.from(n2.values()).reduce((sum, ni) => sum + ni * (ni - 1) / 2, 0);

  const expectedIndex = b1 * b2 / (n * (n - 1) / 2);
  const maxIndex = (b1 + b2) / 2;

  return (a - expectedIndex) / (maxIndex - expectedIndex);
}

module.exports = {
  runSupervisedAttacks,
  runStatisticalTests,
  runClusteringAttack,
  extractFeatures,
  featuresToArray,
  FEATURE_KEYS
};
