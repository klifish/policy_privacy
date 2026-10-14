'use strict';

const os = require('os');
const { mulberry32 } = require('./random');

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
 * seeds (policy-disjoint split each time) and judge each task by a DOUBLE
 * criterion — a task is leaking (FAIL) only when its advantage is both large and
 * statistically real:
 *
 *   FAIL  iff  AUC_mean > aucMax  AND  significantSeedFraction >= sigFractionMax
 *   PASS  otherwise
 *
 * where a seed is "significant" when its permutation p-value < permAlpha. Both
 * legs are required because each is individually misleading: a non-linear
 * attacker can push AUC above the threshold by fitting noise-dominated features
 * (the permutation test then stays non-significant — not a real channel), while
 * a permutation test can call a trivially small AUC "significant" (real but of
 * no adversarial value). Raw accuracy advantage is retained only as a legacy diagnostic field, as
 * it is unreliable on imbalanced test sets. The single-split report is kept
 * separately for diagnostics; this is the authoritative verdict.
 */

const DEFAULT_CRITERION = Object.freeze({
  seeds: 30,
  // A task FAILs only if AUC_mean > aucMax AND the fraction of permutation-
  // significant seeds is >= sigFractionMax (see the double criterion in the file
  // header). aucMax is the "advantage is large" bar; sigFractionMax is the
  // "advantage is statistically real" bar — a task must clear BOTH to count as
  // leakage.
  aucMax: 0.55,
  permAlpha: 0.05,
  sigFractionMax: 0.5,
  // Tasks whose median test-set size is below this are statistically
  // underpowered (AUC std ~0.1-0.16); they are reported but do NOT gate the
  // overall verdict, so a small subclass's sampling noise cannot decide PASS/
  // FAIL. The large pooled scope ('overall') and adequately-sized subclasses
  // still gate. 0 disables the rule.
  minTestSamples: 20,
  // Diagnostic task keys: ordinary measured tasks that should be reported but
  // must not decide the privacy verdict.
  nonGatingKeys: []
});

function withSeededRandom(seed, fn) {
  const orig = Math.random;
  Math.random = mulberry32(seed >>> 0);
  try { return fn(); } finally { Math.random = orig; }
}

/**
 * The seed value for seed index `s` under `salt`. The ONLY place this formula
 * lives — both the serial loop and the parallel workers import it, so a worker
 * provably runs the same PRNG stream as the serial path for the same index.
 */
function seedFor(s, salt = 0) {
  return (s * 2654435761 + (salt >>> 0)) >>> 0;
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
// Bucket the records produced by ONE seed into the running `acc` Map. Factored
// out of evaluateMultiseed so the serial and parallel paths share exactly one
// copy of the bucketing logic; both call it in strict seed order s=0..N-1.
function bucketRecords(acc, records, criterion) {
  const emptySub = () => ({ auc: [], adv: [], p: [], precision: [], recall: [], f1: [], confusion: [] });
  const bucket = (key) => {
    if (!acc.has(key)) acc.set(key, { auc: [], adv: [], p: [], n: [], precision: [], recall: [], f1: [], clf: [], perClf: null });
    return acc.get(key);
  };
  for (const r of records || []) {
    if (!r || r.key == null) continue;
    const b = bucket(r.key);

    // Per-classifier records (one record per LR and per RF, carrying
    // perClassifier:true). Route them into a separate per-classifier sub-bucket so
    // LR and RF aggregate independently and the task can gate on BOTH.
    if (r.perClassifier === true && (r.classifier === 'lr' || r.classifier === 'rf')) {
      if (!b.perClf) b.perClf = { lr: emptySub(), rf: emptySub() };
      const sub = b.perClf[r.classifier];
      if (typeof r.auc === 'number' && !Number.isNaN(r.auc)) sub.auc.push(r.auc);
      if (typeof r.advantage === 'number' && !Number.isNaN(r.advantage)) sub.adv.push(r.advantage);
      if (typeof r.permPValue === 'number' && !Number.isNaN(r.permPValue)) sub.p.push(r.permPValue);
      if (typeof r.precision === 'number' && !Number.isNaN(r.precision)) sub.precision.push(r.precision);
      if (typeof r.recall === 'number' && !Number.isNaN(r.recall)) sub.recall.push(r.recall);
      if (typeof r.f1 === 'number' && !Number.isNaN(r.f1)) sub.f1.push(r.f1);
      if (r.confusion) sub.confusion.push(r.confusion);
      // Test-set size is identical for both legs of a seed; record it once (from
      // the LR leg) into the flat bucket so medianTestN stays a clean per-seed median.
      if (r.classifier === 'lr' && typeof r.n === 'number' && !Number.isNaN(r.n)) b.n.push(r.n);
      continue;
    }

    if (typeof r.auc === 'number' && !Number.isNaN(r.auc)) b.auc.push(r.auc);
    if (typeof r.advantage === 'number' && !Number.isNaN(r.advantage)) b.adv.push(r.advantage);
    if (typeof r.permPValue === 'number' && !Number.isNaN(r.permPValue)) b.p.push(r.permPValue);
    if (typeof r.n === 'number' && !Number.isNaN(r.n)) b.n.push(r.n);
    // Optional P/R/F1: only carried by tasks that report them (e.g. positive
    // controls). Aggregated below only when present, so other tasks are
    // unaffected.
    if (typeof r.precision === 'number' && !Number.isNaN(r.precision)) b.precision.push(r.precision);
    if (typeof r.recall === 'number' && !Number.isNaN(r.recall)) b.recall.push(r.recall);
    if (typeof r.f1 === 'number' && !Number.isNaN(r.f1)) b.f1.push(r.f1);
    // Optional: which classifier won this seed (PCH runs LR+RF and keeps the
    // stronger). Only present when records carry `classifier`; ignored otherwise.
    if (typeof r.classifier === 'string') b.clf.push(r.classifier);
  }
}

// Turn the bucketed `acc` Map into the final {overallPassed, criterion, tasks}
// verdict. Unchanged from the original inline body; pure function of acc + criterion.
function aggregateBuckets(acc, criterion) {
  const median = (xs) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  // Aggregate one classifier's sub-bucket (PCH per-classifier path) into the same
  // shape as the flat aggregates, plus its own gating legs and the full (non-
  // aggregated) per-seed confusion-matrix snapshot.
  const aggLeg = (sub) => {
    const auc = meanStd(sub.auc);
    const sigFraction = sub.p.length
      ? sub.p.filter(p => p < criterion.permAlpha).length / sub.p.length
      : null;
    const aucHigh = auc.n > 0 && auc.mean > criterion.aucMax;
    const sigHigh = sigFraction != null && sigFraction >= criterion.sigFractionMax;
    return {
      auc,
      advantage: meanStd(sub.adv),
      permPValue: meanStd(sub.p),
      sigFraction,
      prf: {
        precision: meanStd(sub.precision),
        recall: meanStd(sub.recall),
        f1: meanStd(sub.f1)
      },
      confusion: sub.confusion, // full array: one {tp,tn,fp,fn} per non-degenerate seed
      aucHigh,
      sigHigh,
      legFails: aucHigh && sigHigh,
      seeds: { auc: auc.n, perm: sub.p.length }
    };
  };

  const tasks = [];
  for (const [key, b] of acc) {
    // Per-classifier task: LR and RF aggregated independently, the
    // task gates on BOTH (FAIL if either classifier's double criterion fires).
    if (b.perClf) {
      const lr = aggLeg(b.perClf.lr);
      const rf = aggLeg(b.perClf.rf);
      const medianN = median(b.n);
      const underpowered = criterion.minTestSamples > 0 && medianN != null
        && medianN < criterion.minTestSamples;
      const diagnostic = Array.isArray(criterion.nonGatingKeys)
        && criterion.nonGatingKeys.includes(key);
      const judgeable = lr.auc.n > 0 || rf.auc.n > 0
        || lr.sigFraction != null || rf.sigFraction != null;
      const anyLegFails = lr.legFails || rf.legFails;
      const passed = (!judgeable || underpowered) ? null : !anyLegFails;
      const nonGating = underpowered || diagnostic;

      // Top-level fields are populated from the higher-AUC leg ("stronger
      // attacker") so the console printVerdict and any legacy reader keep working
      // unchanged; the per-classifier detail lives under `classifiers`.
      const lead = (Number.isNaN(lr.auc.mean) || rf.auc.mean >= lr.auc.mean) ? rf : lr;
      tasks.push({
        key,
        passed,
        skipped: !judgeable,
        underpowered,
        diagnostic,
        nonGating,
        medianTestN: medianN,
        auc: lead.auc,
        advantage: lead.advantage,
        permPValue: lead.permPValue,
        sigFraction: lead.sigFraction,
        seeds: lead.seeds,
        classifiers: { lr, rf }
      });
      continue;
    }

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
    const diagnostic = Array.isArray(criterion.nonGatingKeys)
      && criterion.nonGatingKeys.includes(key);

    // Double criterion: a task FAILs only when BOTH legs cross the line — the
    // AUC is meaningfully above chance AND that advantage is statistically
    // significant (a majority of seeds reject the permutation null). Either leg
    // alone is insufficient:
    //   - AUC alone over-flags a non-linear attacker that extracts a weak signal
    //     from noise-dominated features (e.g. PCH's gas, ICC<0.4): the AUC sits
    //     ~0.6 but label-shuffling reproduces it, so the permutation test is
    //     non-significant. That is not a real channel.
    //   - permutation alone over-flags a tiny-but-consistent effect of no
    //     adversarial value (AUC ≈ 0.52 can be "significant" yet useless).
    // So PASS unless the advantage is both large (AUC) and real (permutation).
    const aucHigh = auc.n > 0 && auc.mean > criterion.aucMax;
    const sigHigh = sigFraction != null && sigFraction >= criterion.sigFractionMax;
    // `passed` stays the honest per-task verdict (a control reads as passed:false
    // = "distinguishable" on BOTH legs, the desired sanity signal). Gating
    // exclusion is carried separately by `nonGating` so the JSON shows both facts.
    const passed = (!judgeable || underpowered) ? null : !(aucHigh && sigHigh);
    const nonGating = underpowered || diagnostic;

    const task = {
      key,
      passed,
      skipped: !judgeable,
      underpowered,
      diagnostic,
      nonGating,
      medianTestN: medianN,
      auc,
      advantage: adv,
      permPValue: permP,
      sigFraction,
      seeds: { auc: auc.n, perm: b.p.length }
    };
    // Fraction of seeds where the non-linear attacker (RF) was the stronger of
    // the two — only for tasks that ran both (PCH). Lets the report state which
    // model the AUC came from. Absent for single-attacker tasks (PI/SPP).
    if (b.clf.length) {
      task.rfWinFraction = b.clf.filter(c => c === 'rf').length / b.clf.length;
    }
    // Attach P/R/F1 (mean±std) only for tasks that reported them — keeps the
    // shape unchanged for tasks that don't (PCH DUO, SPP attrs, PI scopes).
    if (b.precision.length || b.recall.length || b.f1.length) {
      task.prf = {
        precision: meanStd(b.precision),
        recall: meanStd(b.recall),
        f1: meanStd(b.f1)
      };
    }
    tasks.push(task);
  }

  const judged = tasks.filter(t => t.passed !== null && !t.nonGating);
  const basePassed = judged.length > 0 && judged.every(t => t.passed);

  // The verdict is the honest aggregate of the gating tasks. Attack-pipeline
  // validity is established by the paired ablation design itself (the B1
  // unpadded profile yields well-above-chance AUC on the same pipeline), so no
  // synthetic sanity task gates the result. controlsPresent/controlsValid/
  // missingPositiveControlKeys are retained (constant) for downstream JSON shape.
  const overallPassed = basePassed;

  return {
    overallPassed,
    controlsPresent: false,
    controlsValid: null,
    missingPositiveControlKeys: [],
    criterion,
    tasks
  };
}

/**
 * Run each seed's record production in a worker_threads pool, returning
 * recordsBySeed[0..seeds-1]. Each Worker is its own V8 isolate with its own
 * global Math.random, so withSeededRandom's monkey-patch is worker-local and
 * concurrent seeds cannot clobber one another's PRNG. A dynamic work queue hands
 * out seed indices; results are placed by seedIndex so the caller can replay
 * aggregation in strict seed order regardless of completion order. Rejects on any
 * worker error/abnormal exit, or if any seed is missing when all workers finish.
 */
function runSeedsInWorkers({ workerEntry, workerData, salt, seeds, poolSize }) {
  const { Worker } = require('worker_threads');
  return new Promise((resolve, reject) => {
    const recordsBySeed = new Array(seeds).fill(undefined);
    let done = 0;
    let nextSeed = 0;
    let settled = false;
    const workers = [];
    const workerStates = new Map();

    const fail = (err) => {
      if (settled) return;
      settled = true;
      for (const w of workers) w.terminate();
      reject(err);
    };

    const assign = (w) => {
      const state = workerStates.get(w);
      if (nextSeed >= seeds) {
        state.doneSent = true;
        state.seedIndex = null;
        w.postMessage({ type: 'done' });
        return;
      }
      state.seedIndex = nextSeed++;
      w.postMessage({ type: 'seed', seedIndex: state.seedIndex });
    };

    const n = Math.max(1, Math.min(poolSize, seeds));
    for (let i = 0; i < n; i++) {
      const w = new Worker(workerEntry, { workerData: { ...workerData, salt, seeds } });
      workers.push(w);
      workerStates.set(w, { seedIndex: null, doneSent: false });
      w.on('message', (msg) => {
        if (settled) return;
        const state = workerStates.get(w);
        if (!msg || msg.type !== 'result') {
          fail(new Error('Worker sent an invalid message'));
          return;
        }
        if (!Number.isInteger(msg.seedIndex) || msg.seedIndex !== state.seedIndex) {
          fail(new Error(`Worker returned unexpected seed ${msg.seedIndex}; expected ${state.seedIndex}`));
          return;
        }
        if (recordsBySeed[msg.seedIndex] !== undefined) {
          fail(new Error(`Worker returned duplicate result for seed ${msg.seedIndex}`));
          return;
        }
        if (!Array.isArray(msg.records)) {
          fail(new Error(`Worker returned non-array records for seed ${msg.seedIndex}`));
          return;
        }
        recordsBySeed[msg.seedIndex] = msg.records;
        state.seedIndex = null;
        done += 1;
        if (done === seeds) {
          // Completeness assertion: never aggregate a partial verdict.
          const missing = recordsBySeed.findIndex(r => r === undefined);
          if (missing !== -1) {
            fail(new Error(`Seed ${missing} produced no records`));
            return;
          }
          settled = true;
          for (const ww of workers) ww.terminate();
          resolve(recordsBySeed);
          return;
        }
        assign(w);
      });
      w.on('error', fail);
      w.on('exit', (code) => {
        if (settled) return;
        const state = workerStates.get(w);
        if (code !== 0) {
          fail(new Error(`Worker exited with code ${code}`));
        } else if (!state.doneSent || state.seedIndex !== null) {
          fail(new Error(
            `Worker exited before completing seed ${state.seedIndex == null ? 'assignment' : state.seedIndex}`
          ));
        }
      });
      assign(w);
    }
  });
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${name} must be a positive integer; received ${value}`);
  }
  return value;
}

/**
 * Run a per-split attack callback over N seeds and produce a unified verdict.
 *
 * Serial by default (`concurrency: 1`): runs the in-process `runOnce` closure
 * inside withSeededRandom, identical to the original loop. With `concurrency > 1`
 * it shards seeds across a worker_threads pool (`workerEntry` + `workerData`
 * required) and replays aggregation in seed order so the output is byte-identical
 * to serial. Returns a Promise either way.
 *
 * @param {(seedIndex:number,baseSeed:number)=>Array} runOnce per-seed record
 *        producer (serial path). Existing callbacks may ignore baseSeed.
 * @param {object} [opts] criterion overrides + { concurrency, workerEntry,
 *        workerData, seedSalt }.
 * @returns {Promise<{overallPassed:boolean, criterion:object, tasks:Array}>}
 */
async function evaluateMultiseed(runOnce, opts = {}) {
  // Strip the NEW execution-only options from `criterion` so a serial run and a
  // parallel run of the SAME config serialize an identical verdict (concurrency/
  // workerEntry/workerData describe HOW it ran, not the gating). seedSalt and any
  // other pre-existing keys are left as before to keep prior of-record JSON stable.
  const {
    concurrency: _c,
    workerEntry: _we,
    workerData: _wd,
    includeSeedRecords,
    ...criterionOpts
  } = opts;
  const criterion = { ...DEFAULT_CRITERION, ...criterionOpts };
  const salt = (opts.seedSalt || 0) >>> 0;
  const concurrency = requirePositiveInteger(opts.concurrency ?? 1, 'concurrency');
  requirePositiveInteger(criterion.seeds, 'seeds');

  const acc = new Map(); // key -> bucket, preserving first-seen (seed-order) order.
  const seedRecords = includeSeedRecords ? [] : null;

  if (concurrency === 1) {
    // Serial path — unchanged behavior, bucket in seed order.
    for (let s = 0; s < criterion.seeds; s++) {
      const baseSeed = seedFor(s, salt);
      const records = withSeededRandom(baseSeed, () => runOnce(s, baseSeed)) || [];
      bucketRecords(acc, records, criterion);
      if (seedRecords) seedRecords.push({ seedIndex: s, baseSeed, records });
    }
    const verdict = aggregateBuckets(acc, criterion);
    if (seedRecords) verdict.seedRecords = seedRecords;
    return verdict;
  }

  // Parallel path. workerEntry is mandatory — never silently fall back to serial
  // for an of-record run.
  if (!opts.workerEntry) {
    throw new Error('evaluateMultiseed: concurrency > 1 requires opts.workerEntry (abs path to the experiment worker module)');
  }
  const poolSize = Math.min(concurrency, Math.max(1, os.cpus().length - 1));
  const recordsBySeed = await runSeedsInWorkers({
    workerEntry: opts.workerEntry,
    workerData: opts.workerData || {},
    salt,
    seeds: criterion.seeds,
    poolSize
  });
  // Strict seed-order replay: makes parallel aggregation a literal replay of the
  // serial loop (identical FP accumulation, first-seen key order, confusion arrays).
  for (let s = 0; s < criterion.seeds; s++) {
    bucketRecords(acc, recordsBySeed[s], criterion);
    if (seedRecords) {
      seedRecords.push({
        seedIndex: s,
        baseSeed: seedFor(s, salt),
        records: recordsBySeed[s]
      });
    }
  }
  const verdict = aggregateBuckets(acc, criterion);
  if (seedRecords) verdict.seedRecords = seedRecords;
  return verdict;
}

/**
 * Tri-state PASS/FAIL/INCONCLUSIVE selector for the three possible
 * overallPassed values (true / false / null). Centralizes the mapping so every
 * console line, report field and markdown renderer treats null === "control not
 * separable → inconclusive" the same way instead of falling into the FAIL branch.
 */
function pickVerdictText(overallPassed, { pass, fail, inconclusive }) {
  if (overallPassed === null) return inconclusive;
  return overallPassed ? pass : fail;
}

/** Pretty one-line-per-task console block for a verdict. */
function printVerdict(title, verdict, splitLabel = 'policy-disjoint') {
  const c = verdict.criterion;
  console.log(`\n${title} — multi-seed verdict (${c.seeds} seeds, ${splitLabel})`);
  console.log(`Criterion: FAIL iff AUC_mean > ${c.aucMax} AND significant-seed fraction ≥ ${c.sigFractionMax} (perm α=${c.permAlpha}); both required, else PASS. Raw accuracy advantage is retained in JSON for legacy diagnostics only.`);
  console.log(`Underpowered tasks (median test n < ${c.minTestSamples}) are reported but do not gate.`);
  console.log(`Diagnostic tasks are reported but do not gate.`);
  console.log('Task                                  | AUC mean±std    | perm p mean | %sig | medN | verdict');
  console.log('--------------------------------------+-----------------+-------------+------+------+--------');
  for (const t of verdict.tasks) {
    const f = (ms) => Number.isNaN(ms.mean) ? '   n/a       ' : `${ms.mean.toFixed(3)} ± ${ms.std.toFixed(3)}`;
    const pct = t.sigFraction == null ? 'n/a' : `${(t.sigFraction * 100).toFixed(0)}%`;
    const v = t.skipped ? 'SKIP'
      : t.diagnostic ? '— (diagnostic)'
      : t.underpowered ? '— (underpowered)'
      : (t.passed ? '✓ PASS' : '✗ FAIL');
    const permMean = Number.isNaN(t.permPValue.mean) ? '  n/a  ' : t.permPValue.mean.toFixed(3);
    const medN = t.medianTestN == null ? ' n/a' : String(t.medianTestN);
    console.log(`${t.key.padEnd(37)} | ${f(t.auc).padEnd(15)} | ${permMean.padEnd(11)} | ${pct.padEnd(4)} | ${medN.padEnd(4)} | ${v}`);
    if (t.prf) {
      console.log(`${' '.repeat(37)} |   P/R/F1: ${t.prf.precision.mean.toFixed(2)} / ${t.prf.recall.mean.toFixed(2)} / ${t.prf.f1.mean.toFixed(2)}`);
    }
  }
  console.log('--------------------------------------+-----------------+-------------+------+--------');
  const overall = pickVerdictText(verdict.overallPassed, {
    pass: '✓ PASS',
    fail: '✗ FAIL',
    inconclusive: '? INCONCLUSIVE (no gating task was judgeable)'
  });
  console.log(`Overall: ${overall}`);
}

module.exports = {
  DEFAULT_CRITERION,
  evaluateMultiseed,
  withSeededRandom,
  seedFor,
  mulberry32,
  meanStd,
  printVerdict,
  pickVerdictText
};
