'use strict';

/**
 * Multi-seed SPP supervised attack evaluation.
 *
 * Repeats the policy-disjoint split + (train-only) balancing + LR/RF training
 * N times with different shuffles, per pairwise class contrast, and reports
 * accuracy / advantage / f1 / permutation p-value as mean ± std plus the
 * fraction of seeds that are permutation-significant.
 *
 * Why: the single-run SPP "FAIL" was driven by the raw-advantage metric on
 * imbalanced test sets — degenerate majority-class LR predictors (precision=
 * recall=f1=0) score a large "advantage" while the permutation test shows no
 * signal (p≫0.05). The permutation p-value and RF advantage are the honest
 * headline; LR advantage is reported but should be read alongside f1.
 *
 * Reuses the experiment's own attack code (no new ML):
 *   - runSupervisedAttacks (split policy-disjoint, balance train only, LR+RF,
 *     permutation test) per targetAttribute.
 *
 * Usage:
 *   node experiments/structure_and_parameter_privacy/multiseed_eval.js \
 *     --dataset experiments/unified/artifacts_data/polygonAmoy/spp_dataset.json \
 *     --seeds 30 [--balance-method undersample] [--permutation-iterations 200]
 */

const fs = require('fs');
const path = require('path');
const { runSupervisedAttacks } = require('./attacks');

const PERMUTATION_MIN = 0.05;
const TARGET_ATTRIBUTES = ['structureType', 'predicateCombo', 'paramType'];

function parseArgs(argv) {
  const cfg = {
    seeds: 30,
    testRatio: 0.3,
    permutationIterations: 200,
    balanceMethod: 'undersample',
    datasetPath: null
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dataset') cfg.datasetPath = path.resolve(argv[++i]);
    else if (a === '--seeds') cfg.seeds = parseInt(argv[++i], 10);
    else if (a === '--test-ratio') cfg.testRatio = parseFloat(argv[++i]);
    else if (a === '--permutation-iterations') cfg.permutationIterations = parseInt(argv[++i], 10);
    else if (a === '--balance-method') cfg.balanceMethod = argv[++i];
  }
  if (!cfg.datasetPath) throw new Error('Provide --dataset <path to spp_dataset.json>');
  return cfg;
}

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
  if (xs.length === 0) return { mean: NaN, std: NaN };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return { mean: m, std: Math.sqrt(v) };
}

function fmt(ms) {
  return Number.isNaN(ms.mean) ? '   n/a       ' : `${ms.mean.toFixed(3)} ± ${ms.std.toFixed(3)}`;
}

function main() {
  const cfg = parseArgs(process.argv);
  const executionResults = JSON.parse(fs.readFileSync(cfg.datasetPath, 'utf8'));

  // contrastKey -> { acc:[], lrAdv:[], f1:[], p:[], rfAdv:[] }
  const contrasts = {};
  function bucket(key) {
    if (!contrasts[key]) contrasts[key] = { acc: [], lrAdv: [], f1: [], p: [], rfAdv: [] };
    return contrasts[key];
  }

  const origLog = console.log;
  for (let s = 0; s < cfg.seeds; s++) {
    for (const attr of TARGET_ATTRIBUTES) {
      console.log = () => {};
      const out = withSeededRandom(s * 2654435761 + attr.length, () =>
        runSupervisedAttacks(executionResults, {
          targetAttribute: attr,
          testRatio: cfg.testRatio,
          permutationIterations: cfg.permutationIterations,
          balanceMethod: cfg.balanceMethod
        }));
      console.log = origLog;

      for (const r of out.results) {
        if (r.skipped) continue;
        const key = `${attr}: ${r.class0}/${r.class1}`;
        const b = bucket(key);
        const lrEval = r.logisticRegression && r.logisticRegression.evaluation;
        const perm = r.logisticRegression && r.logisticRegression.permutationTest;
        const rfEval = r.randomForest && r.randomForest.evaluation;
        if (lrEval) {
          if (typeof lrEval.accuracy === 'number') b.acc.push(lrEval.accuracy);
          if (typeof lrEval.advantage === 'number') b.lrAdv.push(lrEval.advantage);
          if (typeof lrEval.f1 === 'number') b.f1.push(lrEval.f1);
        }
        if (perm && typeof perm.pValue === 'number') b.p.push(perm.pValue);
        if (rfEval && typeof rfEval.advantage === 'number') b.rfAdv.push(rfEval.advantage);
      }
    }
  }

  console.log(`\nMulti-seed SPP supervised evaluation (${cfg.seeds} seeds, policy-disjoint split, balance=${cfg.balanceMethod}, permIter=${cfg.permutationIterations})`);
  console.log('Honest headline = permutation p-value + RF advantage. LR advantage is unstable on imbalanced test sets (read with f1).');
  console.log('');
  console.log('Contrast                              | LR acc          | LR adv          | LR f1           | perm p mean±std | %sig | RF adv          | n');
  console.log('--------------------------------------+-----------------+-----------------+-----------------+-----------------+------+-----------------+----');
  const keys = Object.keys(contrasts).sort();
  for (const key of keys) {
    const b = contrasts[key];
    const sigFrac = b.p.length ? b.p.filter(p => p < PERMUTATION_MIN).length / b.p.length : NaN;
    console.log(
      `${key.padEnd(37)} | ${fmt(meanStd(b.acc)).padEnd(15)} | ${fmt(meanStd(b.lrAdv)).padEnd(15)} | ` +
      `${fmt(meanStd(b.f1)).padEnd(15)} | ${fmt(meanStd(b.p)).padEnd(15)} | ` +
      `${(Number.isNaN(sigFrac) ? 'n/a' : (sigFrac * 100).toFixed(0) + '%').padEnd(4)} | ${fmt(meanStd(b.rfAdv)).padEnd(15)} | ${b.acc.length}`
    );
  }
  console.log('--------------------------------------+-----------------+-----------------+-----------------+-----------------+------+-----------------+----');
  console.log('Reading: privacy holds for a contrast when perm p ≫ 0.05 (low %sig) and RF adv ≈ 0, regardless of the noisy LR advantage.');
}

main();
