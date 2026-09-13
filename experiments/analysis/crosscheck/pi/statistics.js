/**
 * Statistical utilities supporting PI experiment analysis.
 */

const {
  permutationTestAUC
} = require('../../../core/evaluator');

/**
 * Binary entropy of predicted probabilities (average -p log2 p - (1-p) log2 (1-p)).
 */
function computeBinaryEntropy(probabilities) {
  const clamp = (value) => Math.min(Math.max(value, 1e-9), 1 - 1e-9);
  const entropies = probabilities.map((p) => {
    const q = clamp(p);
    return -(q * Math.log2(q) + (1 - q) * Math.log2(1 - q));
  });
  return entropies.reduce((acc, val) => acc + val, 0) / entropies.length;
}

/**
 * Kolmogorov–Smirnov two-sample test (returns D statistic and p-value).
 */
function ksTest(sampleA, sampleB) {
  if (!Array.isArray(sampleA) || !Array.isArray(sampleB) || sampleA.length === 0 || sampleB.length === 0) {
    return { statistic: 0, pValue: 1 };
  }

  const sortedA = [...sampleA].sort((a, b) => a - b);
  const sortedB = [...sampleB].sort((a, b) => a - b);
  let i = 0;
  let j = 0;
  let cdfA = 0;
  let cdfB = 0;
  let d = 0;

  while (i < sortedA.length && j < sortedB.length) {
    if (sortedA[i] < sortedB[j]) {
      cdfA = (i + 1) / sortedA.length;
      i += 1;
    } else if (sortedA[i] > sortedB[j]) {
      cdfB = (j + 1) / sortedB.length;
      j += 1;
    } else {
      cdfA = (i + 1) / sortedA.length;
      cdfB = (j + 1) / sortedB.length;
      i += 1;
      j += 1;
    }
    d = Math.max(d, Math.abs(cdfA - cdfB));
  }

  const n = sampleA.length;
  const m = sampleB.length;
  const en = Math.sqrt((n * m) / (n + m));
  const pValue = ksComplement(en * d);

  return { statistic: d, pValue };
}

/**
 * Complementary CDF approximation for KS test.
 */
function ksComplement(lambda) {
  if (lambda < 1e-16) return 1;
  const sum = [];
  for (let i = 1; i <= 100; i++) {
    const term = Math.exp(-2 * i * i * lambda * lambda);
    sum.push(term);
    if (term < 1e-10) break;
  }
  const value = 2 * sum.reduce((acc, val, idx) => (
    acc + (idx % 2 === 0 ? val : -val)
  ), 0);
  return Math.max(0, Math.min(1, value));
}

/**
 * Maximum Mean Discrepancy (RBF kernel, unbiased).
 */
function computeMMD(matrixA, matrixB, bandwidth = null) {
  if (!Array.isArray(matrixA) || !Array.isArray(matrixB) || matrixA.length === 0 || matrixB.length === 0) {
    return 0;
  }

  const allSamples = [...matrixA, ...matrixB];
  if (!bandwidth) {
    // Median heuristic
    const distances = [];
    for (let i = 0; i < allSamples.length; i++) {
      for (let j = i + 1; j < allSamples.length; j++) {
        distances.push(euclideanDistance(allSamples[i], allSamples[j]));
      }
    }
    const median = distances.sort((a, b) => a - b)[Math.floor(distances.length / 2)] || 1;
    bandwidth = median || 1;
  }

  const kernel = (x, y) => Math.exp(-euclideanDistanceSquared(x, y) / (2 * bandwidth * bandwidth));

  let xx = 0;
  for (let i = 0; i < matrixA.length; i++) {
    for (let j = i + 1; j < matrixA.length; j++) {
      xx += kernel(matrixA[i], matrixA[j]);
    }
  }
  xx = xx * 2 / (matrixA.length * (matrixA.length - 1));

  let yy = 0;
  for (let i = 0; i < matrixB.length; i++) {
    for (let j = i + 1; j < matrixB.length; j++) {
      yy += kernel(matrixB[i], matrixB[j]);
    }
  }
  yy = yy * 2 / (matrixB.length * (matrixB.length - 1));

  let xy = 0;
  for (let i = 0; i < matrixA.length; i++) {
    for (let j = 0; j < matrixB.length; j++) {
      xy += kernel(matrixA[i], matrixB[j]);
    }
  }
  xy = xy / (matrixA.length * matrixB.length);

  return xx + yy - 2 * xy;
}

function euclideanDistanceSquared(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    sum += diff * diff;
  }
  return sum;
}

function euclideanDistance(a, b) {
  return Math.sqrt(euclideanDistanceSquared(a, b));
}

module.exports = {
  computeBinaryEntropy,
  permutationTestAUC,
  ksTest,
  computeMMD
};
