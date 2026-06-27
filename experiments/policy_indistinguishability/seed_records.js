'use strict';

/**
 * Per-seed verdict record producer for PI, in a STANDALONE module so the parallel
 * worker (multiseed_worker.js) imports the per-seed logic from one place.
 * run_experiment.js re-imports buildPiRecordsForSeed from here.
 */

const {
  runSingleSampleAttacks
} = require('./attacks');

// Map an attack-module classifier name to the short per-classifier leg tag used
// by the shared multiseed aggregator (matches PCH/SPP's 'lr'/'rf').
const CLASSIFIER_TAG = {
  LogisticRegression: 'lr',
  RandomForest: 'rf'
};

/**
 * Produce the verdict records for ONE seed. Pure function of (seedIndex, ctx):
 * runs the single-sample attacks on ctx.pairs and emits ONE per-classifier
 * record per (scope, classifier) leg — both LR and RF — so the shared aggregator
 * gates on BOTH (a task FAILs if EITHER classifier clears the double criterion),
 * identical to PCH/SPP. Each leg carries its own AUC + AUC-permutation p-value;
 * advantage is AUC-based so the gated AUC and advantage describe the same model.
 * When baseSeed is provided, each scope derives independent split/permutation/
 * bootstrap streams.
 *
 * @param {number} seedIndex
 * @param {{pairs:Array, testRatio:number, permutationIterations:number}} ctx
 */
function buildPiRecordsForSeed(seedIndex, ctx, baseSeed) {
  const { pairs, testRatio, permutationIterations } = ctx;
  const origLog = console.log;
  let results;
  try {
    console.log = () => {}; // silence per-run attack chatter
    results = runSingleSampleAttacks(pairs, {
      testRatio,
      permutationIterations,
      rngMode: Number.isInteger(baseSeed) ? 'isolated' : 'legacy',
      baseSeed
    });
  } finally {
    console.log = origLog;
  }
  const records = [];
  for (const r of results) {
    const classifier = CLASSIFIER_TAG[r.classifier];
    if (r.skipped || !classifier || !r.outcome) continue;
    const ev = r.outcome.evaluation || {};
    if (typeof ev.auc !== 'number') continue;
    const record = {
      key: r.scope,
      perClassifier: true,
      classifier,
      auc: ev.auc,
      // AUC-based advantage (matches PCH/SPP); the raw threshold advantage is
      // unstable on the small per-scope test sets.
      advantage: Math.abs(ev.auc - 0.5),
      permPValue: r.outcome.permutationPValue,
      n: r.dataset ? r.dataset.testSize : undefined
    };
    records.push(record);
  }
  return records;
}

module.exports = { buildPiRecordsForSeed };
