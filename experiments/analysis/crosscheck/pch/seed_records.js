'use strict';

/**
 * Per-seed verdict record producer for PCH, in a STANDALONE module so the parallel
 * worker (multiseed_worker.js) can import it without dragging in the full
 * run_experiment graph (which transitively requires hardhat/ffjavascript via
 * core/dataset/data_generator — those spawn their own web-worker threads). This
 * module only requires the light ML modules. run_experiment.js re-imports these.
 */

const {
  splitTrainTest,
  prepareClassificationData
} = require('../../../core/feature_extractor');
const { LogisticRegression, RandomForest } = require('../../../core/classifiers');
const {
  calculateAUC,
  permutationTestAUC,
  evaluateBinaryClassification,
  calculateConfusionMatrix
} = require('../../../core/evaluator');
const { createRng } = require('../../../core/random');

const DUO_TO_ATTRIBUTE_CODE = {
  0: 'GR',  // GENERAL_RESEARCH
  1: 'DS',  // DISEASE_SPECIFIC
  2: 'RS',  // RESEARCH_SPECIFIC
  3: 'POA', // POPULATION_ANCESTRY
  4: 'GS',  // GEOGRAPHICAL_RESTRICTION
  5: 'CC'   // CLINICAL_CARE
};

/**
 * Run BOTH attackers (LR and RF) on one binary inference task and return ONE
 * record PER classifier (perClassifier:true), each with that classifier's own AUC,
 * permutation p-value, P/R/F1 and confusion snapshot — so the verdict gates on
 * BOTH ("neither a linear nor a non-linear attacker can infer it"). The
 * permutation p-value uses the SAME classifier's probabilities, so each record's
 * AUC and significance test describe one consistent model.
 */
function bothAttacks(
  key,
  trX,
  trY,
  teX,
  teY,
  permIterations,
  rfOpts = {},
  rngs = {}
) {
  const { trees = 50, maxDepth = 10 } = rfOpts;

  const lr = new LogisticRegression(0.1, 500);
  lr.train(trX, trY);
  const lrProba = lr.predictProba(teX);

  const rf = new RandomForest(trees, maxDepth, rngs.rfBootstrap || Math.random);
  rf.train(trX, trY);
  const rfProba = rf.predictProba(teX);

  const records = [];
  for (const [classifier, proba] of [['lr', lrProba], ['rf', rfProba]]) {
    const auc = calculateAUC(teY, proba);
    if (auc == null) continue; // degenerate AUC for this classifier
    const pred = proba.map(p => (p >= 0.5 ? 1 : 0));
    const ev = evaluateBinaryClassification(teY, pred, proba);
    const confusion = calculateConfusionMatrix(teY, pred);
    const permutationRng = classifier === 'lr'
      ? rngs.lrPermutation
      : rngs.rfPermutation;
    const { pValue } = permutationTestAUC(
      teY,
      proba,
      permIterations,
      permutationRng || Math.random
    );
    records.push({
      key,
      perClassifier: true,
      classifier,
      auc,
      advantage: Math.abs(auc - 0.5),
      permPValue: pValue,
      n: teY.length,
      precision: ev.precision,
      recall: ev.recall,
      f1: ev.f1,
      confusion
    });
  }
  return records;
}

/**
 * Produce the verdict records for ONE seed. Pure function of (seedIndex, ctx):
 * reads ctx.normalizedFeatures + ctx.observedDuoTermIds + config knobs, mutates
 * nothing external, and derives named RNG streams from baseSeed when provided.
 * Called BOTH by the serial closure and the parallel worker entry.
 *
 * @param {number} seedIndex
 * @param {{normalizedFeatures:Array, observedDuoTermIds:number[], testRatio:number,
 *          permutationIterations:number, rfOpts:{trees:number,maxDepth:number}}} ctx
 */
function buildPchRecordsForSeed(seedIndex, ctx, baseSeed) {
  const { normalizedFeatures, observedDuoTermIds, testRatio, permutationIterations: permIterations, rfOpts } = ctx;
  const isolated = Number.isInteger(baseSeed);
  const rng = (...parts) => isolated
    ? createRng(baseSeed, 'pch', ...parts)
    : Math.random;
  const { train, test } = splitTrainTest(
    normalizedFeatures,
    testRatio,
    rng('duo', 'split')
  );
  const trX = prepareClassificationData(train, 'duoTerm').X;
  const teX = prepareClassificationData(test, 'duoTerm').X;
  const records = [];
  for (const termId of observedDuoTermIds) {
    const code = DUO_TO_ATTRIBUTE_CODE[termId];
    const labelOf = f => (f.duoTerm === termId ||
      (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(code))) ? 1 : 0;
    const trY = train.map(labelOf);
    const teY = test.map(labelOf);
    if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
    const key = `DUO ${code}`;
    records.push(...bothAttacks(
      key,
      trX,
      trY,
      teX,
      teY,
      permIterations,
      rfOpts,
      {
        rfBootstrap: rng(key, 'rf-bootstrap'),
        lrPermutation: rng(key, 'lr-permutation'),
        rfPermutation: rng(key, 'rf-permutation')
      }
    ));
  }

  // ICD-10 chapter inference (one-vs-rest). Only rows carrying an ICD-10 chapter
  // participate; each chapter is judged one-vs-rest (AUC + permutation are binary).
  {
    const icdAll = normalizedFeatures.filter(
      f => f.icd10Chapter !== undefined && f.icd10Chapter !== null
    );
    if (icdAll.length > 0) {
      const icdChapters = [...new Set(icdAll.map(f => f.icd10Chapter))].sort((a, b) => a - b);
      const { train: icdTrain, test: icdTest } = splitTrainTest(
        icdAll,
        testRatio,
        rng('icd', 'split')
      );
      const icdTrX = prepareClassificationData(icdTrain, 'icd10Chapter').X;
      const icdTeX = prepareClassificationData(icdTest, 'icd10Chapter').X;
      for (const ch of icdChapters) {
        const labelOf = f => (f.icd10Chapter === ch ? 1 : 0);
        const trY = icdTrain.map(labelOf);
        const teY = icdTest.map(labelOf);
        if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
        const key = `ICD ch${ch}`;
        records.push(...bothAttacks(
          key,
          icdTrX,
          trY,
          icdTeX,
          teY,
          permIterations,
          rfOpts,
          {
            rfBootstrap: rng(key, 'rf-bootstrap'),
            lrPermutation: rng(key, 'lr-permutation'),
            rfPermutation: rng(key, 'rf-permutation')
          }
        ));
      }
    }
  }

  return records;
}

module.exports = { buildPchRecordsForSeed, bothAttacks, DUO_TO_ATTRIBUTE_CODE };
