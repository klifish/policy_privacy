'use strict';

/**
 * Per-seed verdict record producer for SPP, in a STANDALONE module so the
 * parallel worker (multiseed_worker.js) can import it without dragging in the
 * full run_experiment graph (which transitively requires hardhat/ffjavascript via
 * core/dataset — those spawn their own web-worker threads and printed noisy
 * ERR_INVALID_ARG_TYPE traces when loaded inside our Worker). This module only
 * requires ./attacks (pure ML, no chain deps). run_experiment.js re-exports these.
 */

const { runSupervisedAttacks } = require('./attacks');

/**
 * Build per-classifier verdict records (one LR, one RF) from a single
 * runSupervisedAttacks pairwise result. Each record carries that classifier's own
 * AUC, AUC-based permutation p-value, advantage and P/R/F1, tagged
 * perClassifier:true so the shared aggregator gates on BOTH (task FAILs if EITHER
 * classifier clears the double criterion). Requires runSupervisedAttacks to have
 * been called with perClassifierPermutation:true so `aucPermPValue` is present.
 */
function buildPerClassifierRecords(key, r) {
  const legs = [
    ['lr', (r.logisticRegression && r.logisticRegression.evaluation) || {}],
    ['rf', (r.randomForest && r.randomForest.evaluation) || {}]
  ];
  const records = [];
  for (const [classifier, ev] of legs) {
    if (typeof ev.auc !== 'number') continue;
    records.push({
      key,
      perClassifier: true,
      classifier,
      auc: ev.auc,
      // AUC-based advantage, matching PCH/PI (the gated AUC and this advantage then
      // describe the same model; the raw threshold advantage is unstable).
      advantage: Math.abs(ev.auc - 0.5),
      permPValue: typeof ev.aucPermPValue === 'number' ? ev.aucPermPValue : undefined,
      n: typeof r.testSize === 'number' ? r.testSize : undefined,
      precision: typeof ev.precision === 'number' ? ev.precision : undefined,
      recall: typeof ev.recall === 'number' ? ev.recall : undefined,
      f1: typeof ev.f1 === 'number' ? ev.f1 : undefined,
      confusion: ev.confusion
    });
  }
  return records;
}

/**
 * Produce the verdict records for ONE seed. Pure function of (seedIndex, ctx):
 * reads ctx.executionResults + config knobs and derives independent named RNG
 * streams from baseSeed. Without baseSeed it preserves the legacy Math.random
 * behavior used by single-run diagnostics and compatibility tests.
 *
 * @param {number} seedIndex
 * @param {{executionResults:Array, targetAttributes:string[], testRatio:number,
 *          permutationIterations:number, balanceMethod:string}} ctx
 */
function buildSppRecordsForSeed(seedIndex, ctx, baseSeed) {
  const { executionResults, targetAttributes, testRatio, permutationIterations, balanceMethod } = ctx;
  const isolated = Number.isInteger(baseSeed);
  const skipLegacyPermutation = isolated && ctx.skipLegacyPermutation !== false;
  const records = [];
  const origLog = console.log;
  for (const attr of targetAttributes) {
    let out;
    try {
      console.log = () => {};
      out = runSupervisedAttacks(executionResults, {
        targetAttribute: attr,
        testRatio,
        permutationIterations,
        balanceMethod,
        perClassifierPermutation: true,
        rngMode: isolated ? 'isolated' : 'legacy',
        baseSeed,
        skipLegacyPermutation
      });
    } finally {
      console.log = origLog;
    }
    for (const r of out.results) {
      if (r.skipped || !r.logisticRegression) continue;
      // Keep 'none' contrasts visible. The shared criterion decides from their
      // actual median test size whether they are underpowered/non-gating.
      records.push(...buildPerClassifierRecords(`${attr}: ${r.class0}/${r.class1}`, r));
    }
  }

  return records;
}

module.exports = { buildSppRecordsForSeed, buildPerClassifierRecords };
