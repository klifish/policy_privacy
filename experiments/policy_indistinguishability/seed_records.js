'use strict';

/**
 * Per-seed verdict record producer for PI, in a STANDALONE module so the parallel
 * worker (multiseed_worker.js) imports the per-seed logic from one place.
 * run_experiment.js re-imports buildPiRecordsForSeed from here.
 */

const { runSingleSampleAttacks } = require('./attacks');

/**
 * Produce the verdict records for ONE seed. Pure function of (seedIndex, ctx):
 * runs the single-sample attacks on ctx.pairs and maps the LogisticRegression
 * scope outcomes to records. Randomness flows through the seeded global
 * Math.random the caller installed.
 *
 * @param {number} seedIndex
 * @param {{pairs:Array, testRatio:number, permutationIterations:number}} ctx
 */
function buildPiRecordsForSeed(seedIndex, ctx) {
  const { pairs, testRatio, permutationIterations } = ctx;
  const origLog = console.log;
  let results;
  try {
    console.log = () => {}; // silence per-run attack chatter
    results = runSingleSampleAttacks(pairs, { testRatio, permutationIterations });
  } finally {
    console.log = origLog;
  }
  const records = [];
  for (const r of results) {
    if (r.skipped || r.classifier !== 'LogisticRegression' || !r.outcome) continue;
    const ev = r.outcome.evaluation || {};
    records.push({
      key: r.scope,
      auc: typeof ev.auc === 'number' ? ev.auc : undefined,
      advantage: typeof ev.advantage === 'number' ? ev.advantage : undefined,
      permPValue: r.outcome.permutationPValue,
      n: r.dataset ? r.dataset.testSize : undefined
    });
  }
  return records;
}

module.exports = { buildPiRecordsForSeed };
