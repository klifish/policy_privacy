'use strict';

/**
 * Multi-seed PI (single-sample, Level-I) attack evaluation.
 *
 * Repeats the policy-disjoint train/test split + classifier training N times
 * with different shuffles, and reports per-pair-type AUC / advantage /
 * permutation p-value as mean ± std plus the fraction of seeds that clear the
 * privacy thresholds. This separates a real residual signal from single-split
 * sampling noise — the single run's per-pair "FAIL"s were noisy splits, not
 * leakage (see overall AUC ~0.40, permutation p ~0.99).
 *
 * Reuses the experiment's own attack code (no new ML):
 *   - runSingleSampleAttacks (which builds the dataset, splits policy-disjoint,
 *     trains LR + RF, and runs the AUC permutation test internally)
 *
 * The honest headline is the PERMUTATION P-VALUE (does the attack beat chance?)
 * and the AUC distribution — not raw advantage, which is unstable on the small
 * per-type test sets.
 *
 * Usage:
 *   node experiments/policy_indistinguishability/multiseed_eval.js \
 *     --pairs experiments/policy_indistinguishability/results/polygonAmoy/pi_pairs.json \
 *     --seeds 30 [--test-ratio 0.3] [--permutation-iterations 200]
 */

const fs = require('fs');
const path = require('path');
const { runSingleSampleAttacks } = require('./attacks');

const AUC_MAX = 0.55;
const ADVANTAGE_MAX = 0.05;
const PERMUTATION_MIN = 0.05;

function parseArgs(argv) {
  const cfg = { seeds: 30, testRatio: 0.3, permutationIterations: 200, pairsPath: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pairs') cfg.pairsPath = path.resolve(argv[++i]);
    else if (a === '--seeds') cfg.seeds = parseInt(argv[++i], 10);
    else if (a === '--test-ratio') cfg.testRatio = parseFloat(argv[++i]);
    else if (a === '--permutation-iterations') cfg.permutationIterations = parseInt(argv[++i], 10);
  }
  if (!cfg.pairsPath) throw new Error('Provide --pairs <path to pi_pairs.json>');
  return cfg;
}

// Deterministic PRNG; patch Math.random for one attack run (trainTestSplit and
// the permutation test both draw from Math.random).
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
  return Number.isNaN(ms.mean) ? '   n/a        ' : `${ms.mean.toFixed(3)} ± ${ms.std.toFixed(3)}`;
}

function main() {
  const cfg = parseArgs(process.argv);
  const payload = JSON.parse(fs.readFileSync(cfg.pairsPath, 'utf8'));
  const pairs = Array.isArray(payload) ? payload : payload.pairs;
  if (!pairs || pairs.length === 0) throw new Error('No pairs found in payload');

  // Per-scope (pair type, incl. 'overall'), collect LR auc/adv/pPValue per seed.
  const lr = {}; // scope -> { auc:[], adv:[], p:[], rfAdv:[] }
  function bucket(scope) {
    if (!lr[scope]) lr[scope] = { auc: [], adv: [], p: [], rfAdv: [] };
    return lr[scope];
  }

  // Silence the per-run console noise from the attack module.
  const origLog = console.log;
  for (let s = 0; s < cfg.seeds; s++) {
    console.log = () => {};
    const results = withSeededRandom(s * 2654435761, () =>
      runSingleSampleAttacks(pairs, {
        testRatio: cfg.testRatio,
        permutationIterations: cfg.permutationIterations
      }));
    console.log = origLog;

    // Pair LR + RF entries by scope.
    const byScope = {};
    for (const r of results) {
      if (r.skipped) continue;
      byScope[r.scope] = byScope[r.scope] || {};
      byScope[r.scope][r.classifier] = r.outcome;
    }
    for (const [scope, byClf] of Object.entries(byScope)) {
      const lrOut = byClf.LogisticRegression;
      const rfOut = byClf.RandomForest;
      const b = bucket(scope);
      if (lrOut && lrOut.evaluation) {
        if (typeof lrOut.evaluation.auc === 'number') b.auc.push(lrOut.evaluation.auc);
        if (typeof lrOut.evaluation.advantage === 'number') b.adv.push(lrOut.evaluation.advantage);
        if (typeof lrOut.permutationPValue === 'number') b.p.push(lrOut.permutationPValue);
      }
      if (rfOut && rfOut.evaluation && typeof rfOut.evaluation.advantage === 'number') {
        b.rfAdv.push(rfOut.evaluation.advantage);
      }
    }
  }

  console.log(`\nMulti-seed PI single-sample evaluation (${cfg.seeds} seeds, policy-disjoint split, testRatio=${cfg.testRatio}, permIter=${cfg.permutationIterations})`);
  console.log('Thresholds: AUC ≤ 0.55, |advantage| ≤ 0.05, permutation p ≥ 0.05');
  console.log('');
  console.log('Scope               | LR AUC mean±std  | LR adv mean±std  | perm p mean±std  | %seeds sig | RF adv mean±std  | n');
  console.log('--------------------+------------------+------------------+------------------+------------+------------------+----');

  // Order: overall first, then the rest alphabetically.
  const scopes = Object.keys(lr).sort((a, b) => (a === 'overall' ? -1 : b === 'overall' ? 1 : a.localeCompare(b)));
  for (const scope of scopes) {
    const b = lr[scope];
    const sigFrac = b.p.length ? b.p.filter(p => p < PERMUTATION_MIN).length / b.p.length : NaN;
    console.log(
      `${scope.padEnd(19)} | ${fmt(meanStd(b.auc)).padEnd(16)} | ${fmt(meanStd(b.adv)).padEnd(16)} | ` +
      `${fmt(meanStd(b.p)).padEnd(16)} | ${(Number.isNaN(sigFrac) ? 'n/a' : (sigFrac * 100).toFixed(0) + '%').padEnd(10)} | ` +
      `${fmt(meanStd(b.rfAdv)).padEnd(16)} | ${b.auc.length}`
    );
  }
  console.log('--------------------+------------------+------------------+------------------+------------+------------------+----');
  console.log('Reading: a privacy-preserving interface has AUC≈0.5, advantage≈0, perm p well above 0.05, and a LOW %seeds-significant.');
}

main();
