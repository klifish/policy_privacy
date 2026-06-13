'use strict';

/**
 * Multi-seed PCH attack evaluation.
 *
 * Repeats the policy-disjoint train/test split + classifier training N times
 * with different shuffles, and reports per-task AUC / advantage as mean ± std.
 * This separates a real residual signal from single-split sampling noise (with
 * ~3 executions/policy a single split's AUC has std ~0.05).
 *
 * Reuses the same primitives as run_experiment.js (no new ML code):
 *   - splitTrainTest (policy-disjoint when policyIndex present)
 *   - prepareClassificationData, LogisticRegression, calculateAUC
 *
 * Usage:
 *   node experiments/policy_content_hiding/multiseed_eval.js \
 *     --features experiments/policy_content_hiding/results/polygonAmoy/features.json \
 *     --seeds 20 [--test-ratio 0.3]
 */

const fs = require('fs');
const path = require('path');
const {
  normalizeFeatures,
  splitTrainTest,
  prepareClassificationData
} = require('../core/feature_extractor');
const { LogisticRegression } = require('../core/classifiers');
const { calculateAUC } = require('../core/evaluator');

const DUO_TO_ATTRIBUTE_CODE = { 0: 'GR', 1: 'DS', 2: 'RS', 3: 'POA', 4: 'GS', 5: 'CC' };

function parseArgs(argv) {
  const cfg = { seeds: 20, testRatio: 0.3, featuresPath: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--features' || a === '--results') cfg.featuresPath = path.resolve(argv[++i]);
    else if (a === '--seeds') cfg.seeds = parseInt(argv[++i], 10);
    else if (a === '--test-ratio') cfg.testRatio = parseFloat(argv[++i]);
  }
  if (!cfg.featuresPath) throw new Error('Provide --features <path to features.json>');
  return cfg;
}

// Deterministic PRNG so each seed is reproducible. Patches Math.random for the
// duration of one split (splitTrainTest uses Math.random internally).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed);
  try { return fn(); } finally { Math.random = orig; }
}

function meanStd(xs) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return { mean: m, std: Math.sqrt(v) };
}

function main() {
  const cfg = parseArgs(process.argv);
  const stored = JSON.parse(fs.readFileSync(cfg.featuresPath, 'utf8'));
  const features = stored.features || stored;
  const normalized = normalizeFeatures(features);

  const termIds = [...new Set(features.map(f => f.duoTerm))].sort((a, b) => a - b);
  const perTermAUC = Object.fromEntries(termIds.map(t => [t, []]));
  const perTermAdv = Object.fromEntries(termIds.map(t => [t, []]));

  for (let s = 0; s < cfg.seeds; s++) {
    const { train, test } = withSeededRandom(s * 2654435761, () =>
      splitTrainTest(normalized, cfg.testRatio));

    const trainX = prepareClassificationData(train, 'duoTerm').X;
    const testX = prepareClassificationData(test, 'duoTerm').X;

    for (const termId of termIds) {
      const code = DUO_TO_ATTRIBUTE_CODE[termId];
      const labelOf = f => (f.duoTerm === termId ||
        (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(code))) ? 1 : 0;
      const trainY = train.map(labelOf);
      const testY = test.map(labelOf);
      if (new Set(testY).size < 2 || new Set(trainY).size < 2) continue; // degenerate split

      const lr = new LogisticRegression(0.1, 500);
      lr.train(trainX, trainY);
      const proba = lr.predictProba(testX);
      const auc = calculateAUC(testY, proba);
      if (auc == null) continue;
      perTermAUC[termId].push(auc);
      perTermAdv[termId].push(Math.abs(auc - 0.5));
    }
  }

  console.log(`\nMulti-seed PCH evaluation (${cfg.seeds} seeds, policy-disjoint split, testRatio=${cfg.testRatio})`);
  console.log('Term  | AUC mean ± std        | |AUC-0.5| mean | n');
  console.log('------+-----------------------+---------------+----');
  for (const termId of termIds) {
    const code = DUO_TO_ATTRIBUTE_CODE[termId];
    const aucs = perTermAUC[termId];
    if (aucs.length === 0) { console.log(`${code.padEnd(5)} | (no valid splits)`); continue; }
    const a = meanStd(aucs);
    const adv = meanStd(perTermAdv[termId]);
    console.log(`${code.padEnd(5)} | ${a.mean.toFixed(3)} ± ${a.std.toFixed(3)}` +
      `         | ${adv.mean.toFixed(3)}         | ${aucs.length}`);
  }
  const allAuc = termIds.flatMap(t => perTermAUC[t]);
  const overall = meanStd(allAuc);
  console.log('------+-----------------------+---------------+----');
  console.log(`ALL   | ${overall.mean.toFixed(3)} ± ${overall.std.toFixed(3)}`);
}

main();
