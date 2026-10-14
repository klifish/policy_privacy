/**
 * Evaluation Module for Policy Content Hiding
 * 
 * Calculates metrics to assess if adversaries can infer policy content
 * from observable features.
 */

/**
 * Calculate accuracy
 */
function calculateAccuracy(yTrue, yPred) {
  const correct = yTrue.filter((val, i) => val === yPred[i]).length;
  return correct / yTrue.length;
}

/**
 * Calculate confusion matrix for binary classification
 */
function calculateConfusionMatrix(yTrue, yPred) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  
  for (let i = 0; i < yTrue.length; i++) {
    if (yTrue[i] === 1 && yPred[i] === 1) tp++;
    else if (yTrue[i] === 0 && yPred[i] === 1) fp++;
    else if (yTrue[i] === 0 && yPred[i] === 0) tn++;
    else if (yTrue[i] === 1 && yPred[i] === 0) fn++;
  }
  
  return { tp, fp, tn, fn };
}

/**
 * Calculate precision and recall
 */
function calculatePrecisionRecall(yTrue, yPred) {
  const { tp, fp, fn } = calculateConfusionMatrix(yTrue, yPred);
  
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  
  return { precision, recall };
}

/**
 * Calculate AUC (Area Under ROC Curve) via the rank-based Mann–Whitney U
 * statistic with AVERAGE-RANK tie handling.
 *
 * The previous step-function/trapezoid implementation broke on ties: when
 * several samples share the same predicted score it gave no half-credit and the
 * result depended on Array.sort's ordering of equal-score rows. RandomForest
 * scores are discrete vote fractions (k/trees), so ties are pervasive, and
 * permutationTestAUC recomputes AUC over the same tied scores every iteration —
 * biasing the null distribution and pushing p-values toward "non-significant".
 *
 * Average-rank Mann–Whitney makes a tied positive/negative pair contribute
 * exactly 0.5 (the correct AUC) and is order-independent. With NO ties it is
 * numerically identical to the old trapezoid value. Signature and return type
 * (a single number) are unchanged.
 */
function calculateAUC(yTrue, yProba) {
  const positives = yTrue.filter(y => y === 1).length;
  const negatives = yTrue.length - positives;

  if (positives === 0 || negatives === 0) {
    return 0.5; // undefined case
  }

  // Ascending sort by score; ties get the mean of the ranks they span.
  const order = yProba.map((p, i) => i).sort((a, b) => yProba[a] - yProba[b]);

  let sumRanksPos = 0;
  let i = 0;
  while (i < order.length) {
    // Group consecutive equal scores (exact equality — vote fractions are exact).
    let j = i;
    while (j + 1 < order.length && yProba[order[j + 1]] === yProba[order[i]]) {
      j += 1;
    }
    // Ranks are 1-based; this tie group spans ranks (i+1)..(j+1), mean = (i+j)/2 + 1.
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) {
      if (yTrue[order[k]] === 1) sumRanksPos += avgRank;
    }
    i = j + 1;
  }

  return (sumRanksPos - positives * (positives + 1) / 2) / (positives * negatives);
}

/**
 * Permutation test for AUC significance. Shuffles the labels `iterations` times
 * and counts how often a permuted AUC matches or beats the observed AUC; the
 * resulting p-value answers "could this AUC arise by chance?". Used as the
 * unified significance criterion across experiments.
 */
function permutationTestAUC(yTrue, probabilities, iterations = 500, rng = Math.random) {
  if (!probabilities || probabilities.length === 0) {
    return { auc: 0.5, pValue: 1 };
  }
  const actualAuc = calculateAUC(yTrue, probabilities);
  const labels = yTrue.slice();
  let count = 0;
  for (let i = 0; i < iterations; i++) {
    for (let j = labels.length - 1; j > 0; j--) {
      const k = Math.floor(rng() * (j + 1));
      [labels[j], labels[k]] = [labels[k], labels[j]];
    }
    if (calculateAUC(labels, probabilities) >= actualAuc) count += 1;
  }
  return { auc: actualAuc, pValue: (count + 1) / (iterations + 1) };
}

/**
 * AUC within each stratum of o (the public access decision), averaged over the
 * strata holding both classes, and its permutation p-value with labels shuffled
 * within strata. o is given to the classifier as an input; averaging
 * within-stratum AUCs keeps it from scoring as label information when its share
 * differs by chance between the classes, and the within-stratum permutation
 * keeps that difference in the null. A single stratum reduces to calculateAUC
 * and permutationTestAUC. Mirrors stratified_auc_pvalue in
 * experiments/analysis/supervised/common.py.
 */
function stratifiedPermutationTestAUC(yTrue, probabilities, strata, iterations = 500, rng = Math.random) {
  const levels = [...new Set(strata)].sort();
  if (levels.length <= 1) return permutationTestAUC(yTrue, probabilities, iterations, rng);
  const cells = levels.map((level) => {
    const idx = strata.map((s, i) => i).filter((i) => strata[i] === level);
    return { labels: idx.map((i) => yTrue[i]), scores: idx.map((i) => probabilities[i]) };
  }).filter((cell) => cell.labels.some((y) => y === 1) && cell.labels.some((y) => y === 0));
  if (cells.length === 0) return { auc: 0.5, pValue: 1 };
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const auc = mean(cells.map((cell) => calculateAUC(cell.labels, cell.scores)));
  let count = 0;
  for (let it = 0; it < iterations; it++) {
    const permuted = cells.map((cell) => {
      const labels = cell.labels.slice();
      for (let j = labels.length - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        [labels[j], labels[k]] = [labels[k], labels[j]];
      }
      return calculateAUC(labels, cell.scores);
    });
    if (mean(permuted) >= auc) count += 1;
  }
  return { auc, pValue: (count + 1) / (iterations + 1) };
}

/**
 * Calculate advantage over random baseline
 */
function calculateAdvantage(accuracy, numClasses) {
  const randomAccuracy = 1 / numClasses;
  return accuracy - randomAccuracy;
}

/**
 * Calculate per-class metrics for multi-class classification
 */
function calculatePerClassMetrics(yTrue, yPred) {
  const classes = [...new Set([...yTrue, ...yPred])];
  const metrics = {};
  
  for (const cls of classes) {
    const clsTrue = yTrue.map(y => y === cls ? 1 : 0);
    const clsPred = yPred.map(y => y === cls ? 1 : 0);
    
    const { precision, recall } = calculatePrecisionRecall(clsTrue, clsPred);
    const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
    
    metrics[cls] = { precision, recall, f1 };
  }
  
  return metrics;
}

/**
 * Evaluate binary classification task
 */
function evaluateBinaryClassification(yTrue, yPred, yProba, taskName, classDistribution = null) {
  const accuracy = calculateAccuracy(yTrue, yPred);
  const { precision, recall } = calculatePrecisionRecall(yTrue, yPred);
  const f1 = precision + recall > 0 ? 2 * precision * recall / (precision + recall) : 0;
  const auc = yProba ? calculateAUC(yTrue, yProba) : null;
  const advantage = calculateAdvantage(accuracy, 2); // Binary classification

  const result = {
    task: taskName,
    type: 'binary',
    accuracy,
    precision,
    recall,
    f1,
    auc,
    advantage,
    randomBaseline: 0.5
  };

  // Include class distribution if provided
  if (classDistribution) {
    result.classDistribution = classDistribution;
  }

  return result;
}

/**
 * Evaluate multi-class classification task
 */
function evaluateMultiClassification(yTrue, yPred, taskName) {
  const numClasses = [...new Set(yTrue)].length;
  const accuracy = calculateAccuracy(yTrue, yPred);
  const perClassMetrics = calculatePerClassMetrics(yTrue, yPred);
  const advantage = calculateAdvantage(accuracy, numClasses);
  
  // Calculate macro-averaged F1
  const f1Scores = Object.values(perClassMetrics).map(m => m.f1);
  const macroF1 = f1Scores.length > 0 ? f1Scores.reduce((a, b) => a + b, 0) / f1Scores.length : 0;
  
  return {
    task: taskName,
    type: 'multi-class',
    accuracy,
    macroF1: isNaN(macroF1) ? 0 : macroF1,
    perClassMetrics,
    advantage,
    randomBaseline: 1 / numClasses,
    numClasses
  };
}

/**
 * Evaluate all classification tasks
 */
function evaluateClassificationTasks(results) {
  const evaluation = {
    timestamp: new Date().toISOString(),
    results: []
  };

  for (const result of results) {
    if (result.type === 'binary') {
      evaluation.results.push(
        evaluateBinaryClassification(
          result.yTrue,
          result.yPred,
          result.yProba,
          result.taskName,
          result.classDistribution  // Pass class distribution
        )
      );
    } else {
      evaluation.results.push(
        evaluateMultiClassification(
          result.yTrue,
          result.yPred,
          result.taskName
        )
      );
    }
  }

  return evaluation;
}

/**
 * Check if metrics meet privacy thresholds
 */
function checkPrivacyThresholds(evaluation, thresholds = { aucMax: 0.55 }) {
  const results = evaluation.results.map(result => {
    const checks = {
      task: result.task,
      passed: true,
      checks: []
    };
    
    // Check AUC threshold for binary tasks
    if (result.type === 'binary' && result.auc !== null) {
      const aucPass = result.auc <= thresholds.aucMax;
      checks.checks.push({
        metric: 'AUC',
        value: result.auc,
        threshold: thresholds.aucMax,
        passed: aucPass
      });
      checks.passed = checks.passed && aucPass;
    }
    
    
    return checks;
  });
  
  const overallPassed = results.every(r => r.passed);
  
  return {
    overallPassed,
    results,
    thresholds
  };
}

module.exports = {
  stratifiedPermutationTestAUC,
  calculateAccuracy,
  calculateConfusionMatrix,
  calculatePrecisionRecall,
  calculateAUC,
  permutationTestAUC,
  calculateAdvantage,
  calculatePerClassMetrics,
  evaluateBinaryClassification,
  evaluateMultiClassification,
  evaluateClassificationTasks,
  checkPrivacyThresholds
};
