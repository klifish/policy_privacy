'use strict';

/**
 * Shared multi-seed privacy verdict, unified across PCH / PI / SPP.
 *
 * The three experiments previously each rendered a PASS/FAIL from a SINGLE
 * policy-disjoint split, using inconsistent criteria (PCH: AUC+advantage; PI/SPP:
 * AUC+advantage+permutation+MMD+KS(+silhouette)). With ~3 executions/policy a
 * single split's AUC has std ~0.05-0.09, and raw "advantage" is unstable on
 * imbalanced test sets (a degenerate majority-class predictor scores a large
 * advantage with f1=0 while the permutation test shows no signal). Both caused
 * spurious "FAIL" verdicts that were sampling/metric artifacts, not leakage.
 *
 * This module gives all three experiments ONE verdict: repeat the attack over N
 * seeds (policy-disjoint split each time) and judge each task by
 *
 *   PASS  iff  AUC_mean <= aucMax  AND  significantSeedFraction < sigFractionMax
 *
 * where a seed is "significant" when its permutation p-value < permAlpha.
 * Advantage is reported (mean±std) but does NOT gate, because it is unreliable
 * on imbalanced test sets. The single-split report is kept separately for
 * diagnostics; this is the authoritative verdict.
 */

const DEFAULT_CRITERION = Object.freeze({
  seeds: 30,
  aucMax: 0.55,
  permAlpha: 0.05,
  sigFractionMax: 0.5,
  // Tasks whose median test-set size is below this are statistically
  // underpowered (AUC std ~0.1-0.16); they are reported but do NOT gate the
  // overall verdict, so a small subclass's sampling noise cannot decide PASS/
  // FAIL. The large pooled scope ('overall') and adequately-sized subclasses
  // still gate. 0 disables the rule.
  minTestSamples: 20
});

// Deterministic PRNG so each seed is reproducible. Patches Math.random for the
// duration of one attack run (splits and permutation tests draw from it).
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
  Math.random = mulberry32(seed >>> 0);
  try { return fn(); } finally { Math.random = orig; }
}

function meanStd(xs) {
  if (!xs || xs.length === 0) return { mean: NaN, std: NaN, n: 0 };
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return { mean: m, std: Math.sqrt(v), n: xs.length };
}

/**
 * Run a per-split attack callback over N seeds and produce a unified verdict.
 *
 * @param {(seedIndex:number)=>Array<{key:string, auc?:number, advantage?:number,
 *          permPValue?:number}>} runOnce
 *        Runs the experiment's own attack for one seeded split and returns one
 *        record per task/contrast. Called inside a seeded Math.random scope.
 * @param {object} [opts] criterion overrides (seeds, aucMax, permAlpha,
 *        sigFractionMax) and an optional `seedSalt` to decorrelate experiments.
 * @returns {{overallPassed:boolean, criterion:object, tasks:Array}}
 */
function evaluateMultiseed(runOnce, opts = {}) {
  const criterion = { ...DEFAULT_CRITERION, ...opts };
  const salt = (opts.seedSalt || 0) >>> 0;

  // key -> { auc:[], adv:[], p:[] }, preserving first-seen order.
  const acc = new Map();
  const bucket = (key) => {
    if (!acc.has(key)) acc.set(key, { auc: [], adv: [], p: [], n: [] });
    return acc.get(key);
  };

  for (let s = 0; s < criterion.seeds; s++) {
    const seed = (s * 2654435761 + salt) >>> 0;
    const records = withSeededRandom(seed, () => runOnce(s)) || [];
    for (const r of records) {
      if (!r || r.key == null) continue;
      const b = bucket(r.key);
      if (typeof r.auc === 'number' && !Number.isNaN(r.auc)) b.auc.push(r.auc);
      if (typeof r.advantage === 'number' && !Number.isNaN(r.advantage)) b.adv.push(r.advantage);
      if (typeof r.permPValue === 'number' && !Number.isNaN(r.permPValue)) b.p.push(r.permPValue);
      if (typeof r.n === 'number' && !Number.isNaN(r.n)) b.n.push(r.n);
    }
  }

  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  const tasks = [];
  for (const [key, b] of acc) {
    const auc = meanStd(b.auc);
    const adv = meanStd(b.adv);
    const permP = meanStd(b.p);
    const sigFraction = b.p.length
      ? b.p.filter(p => p < criterion.permAlpha).length / b.p.length
      : null;

    // A task with no AUC samples and no permutation samples cannot be judged.
    const judgeable = auc.n > 0 || sigFraction != null;
    // Underpowered tasks (too few test samples) are reported but do not gate —
    // their AUC std is too large for a single threshold crossing to be real.
    const medianN = median(b.n);
    const underpowered = criterion.minTestSamples > 0 && medianN != null
      && medianN < criterion.minTestSamples;

    const aucOk = auc.n > 0 ? auc.mean <= criterion.aucMax : true;
    const sigOk = sigFraction != null ? sigFraction < criterion.sigFractionMax : true;
    const passed = (!judgeable || underpowered) ? null : (aucOk && sigOk);

    tasks.push({
      key,
      passed,
      skipped: !judgeable,
      underpowered,
      medianTestN: medianN,
      auc,
      advantage: adv,
      permPValue: permP,
      sigFraction,
      seeds: { auc: auc.n, perm: b.p.length }
    });
  }

  const judged = tasks.filter(t => t.passed !== null);
  const overallPassed = judged.length > 0 && judged.every(t => t.passed);

  return { overallPassed, criterion, tasks };
}

/** Pretty one-line-per-task console block for a verdict. */
function printVerdict(title, verdict) {
  const c = verdict.criterion;
  console.log(`\n${title} — multi-seed verdict (${c.seeds} seeds, policy-disjoint)`);
  console.log(`Criterion: AUC_mean ≤ ${c.aucMax} AND significant-seed fraction < ${c.sigFractionMax} (perm α=${c.permAlpha}); advantage reported, not gating.`);
  console.log(`Underpowered tasks (median test n < ${c.minTestSamples}) are reported but do not gate.`);
  console.log('Task                                  | AUC mean±std    | adv mean±std    | perm p mean | %sig | medN | verdict');
  console.log('--------------------------------------+-----------------+-----------------+-------------+------+------+--------');
  for (const t of verdict.tasks) {
    const f = (ms) => Number.isNaN(ms.mean) ? '   n/a       ' : `${ms.mean.toFixed(3)} ± ${ms.std.toFixed(3)}`;
    const pct = t.sigFraction == null ? 'n/a' : `${(t.sigFraction * 100).toFixed(0)}%`;
    const v = t.skipped ? 'SKIP' : (t.underpowered ? '— (underpowered)' : (t.passed ? '✓ PASS' : '✗ FAIL'));
    const permMean = Number.isNaN(t.permPValue.mean) ? '  n/a  ' : t.permPValue.mean.toFixed(3);
    const medN = t.medianTestN == null ? ' n/a' : String(t.medianTestN);
    console.log(`${t.key.padEnd(37)} | ${f(t.auc).padEnd(15)} | ${f(t.advantage).padEnd(15)} | ${permMean.padEnd(11)} | ${pct.padEnd(4)} | ${medN.padEnd(4)} | ${v}`);
  }
  console.log('--------------------------------------+-----------------+-----------------+-------------+------+--------');
  console.log(`Overall: ${verdict.overallPassed ? '✓ PASS' : '✗ FAIL'}`);
}

module.exports = {
  DEFAULT_CRITERION,
  evaluateMultiseed,
  withSeededRandom,
  meanStd,
  printVerdict
};
