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
} = require('../core/feature_extractor');
const { LogisticRegression, RandomForest } = require('../core/classifiers');
const {
  calculateAUC,
  permutationTestAUC,
  evaluateBinaryClassification,
  calculateConfusionMatrix
} = require('../core/evaluator');

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
function bothAttacks(key, trX, trY, teX, teY, permIterations, rfOpts = {}) {
  const { trees = 50, maxDepth = 10 } = rfOpts;

  const lr = new LogisticRegression(0.1, 500);
  lr.train(trX, trY);
  const lrProba = lr.predictProba(teX);

  const rf = new RandomForest(trees, maxDepth);
  rf.train(trX, trY);
  const rfProba = rf.predictProba(teX);

  const records = [];
  for (const [classifier, proba] of [['lr', lrProba], ['rf', rfProba]]) {
    const auc = calculateAUC(teY, proba);
    if (auc == null) continue; // degenerate AUC for this classifier
    const pred = proba.map(p => (p >= 0.5 ? 1 : 0));
    const ev = evaluateBinaryClassification(teY, pred, proba);
    const confusion = calculateConfusionMatrix(teY, pred);
    const { pValue } = permutationTestAUC(teY, proba, permIterations);
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
 * nothing external (randomness flows through the seeded global Math.random the
 * caller installed). Called BOTH by the serial closure in run_experiment AND the
 * parallel worker entry — one copy of the per-seed logic.
 *
 * @param {number} seedIndex
 * @param {{normalizedFeatures:Array, observedDuoTermIds:number[], testRatio:number,
 *          permutationIterations:number, rfOpts:{trees:number,maxDepth:number}}} ctx
 */
function buildPchRecordsForSeed(seedIndex, ctx) {
  const { normalizedFeatures, observedDuoTermIds, testRatio, permutationIterations: permIterations, rfOpts } = ctx;
  const { train, test } = splitTrainTest(normalizedFeatures, testRatio);
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
    records.push(...bothAttacks(`DUO ${code}`, trX, trY, teX, teY, permIterations, rfOpts));
  }

  // ICD-10 chapter inference (one-vs-rest). Only rows carrying an ICD-10 chapter
  // participate; each chapter is judged one-vs-rest (AUC + permutation are binary).
  {
    const icdAll = normalizedFeatures.filter(
      f => f.icd10Chapter !== undefined && f.icd10Chapter !== null
    );
    if (icdAll.length > 0) {
      const icdChapters = [...new Set(icdAll.map(f => f.icd10Chapter))].sort((a, b) => a - b);
      const { train: icdTrain, test: icdTest } = splitTrainTest(icdAll, testRatio);
      const icdTrX = prepareClassificationData(icdTrain, 'icd10Chapter').X;
      const icdTeX = prepareClassificationData(icdTest, 'icd10Chapter').X;
      for (const ch of icdChapters) {
        const labelOf = f => (f.icd10Chapter === ch ? 1 : 0);
        const trY = icdTrain.map(labelOf);
        const teY = icdTest.map(labelOf);
        if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
        records.push(...bothAttacks(`ICD ch${ch}`, icdTrX, trY, icdTeX, teY, permIterations, rfOpts));
      }
    }
  }

  // Positive control (attack-validity): a synthetic, known-separable label from
  // commitGasUsed (a real observable). The SAME pipeline should recover it with
  // high AUC/F1, proving ≈0.5 AUC on real DUO labels is "no signal". Non-gating.
  {
    const gasVals = train.map(f => f.commitGasUsed).filter(v => typeof v === 'number');
    const gasMedian = gasVals.length
      ? [...gasVals].sort((a, b) => a - b)[Math.floor(gasVals.length / 2)]
      : null;
    const ctrlLabel = f => (f.commitGasUsed > gasMedian ? 1 : 0);
    const ctrlTrY = train.map(ctrlLabel);
    const ctrlTeY = test.map(ctrlLabel);
    if (gasMedian != null && new Set(ctrlTrY).size === 2 && new Set(ctrlTeY).size === 2) {
      const lr = new LogisticRegression(0.1, 500);
      lr.train(trX, ctrlTrY);
      const proba = lr.predictProba(teX);
      const auc = calculateAUC(ctrlTeY, proba);
      if (auc != null) {
        const pred = proba.map(p => (p >= 0.5 ? 1 : 0));
        const ev = evaluateBinaryClassification(ctrlTeY, pred, proba);
        const { pValue } = permutationTestAUC(ctrlTeY, proba, permIterations);
        records.push({
          key: 'CONTROL: gas>median',
          auc,
          advantage: Math.abs(auc - 0.5),
          permPValue: pValue,
          n: ctrlTeY.length,
          precision: ev.precision,
          recall: ev.recall,
          f1: ev.f1
        });
      }
    }
  }
  return records;
}

module.exports = { buildPchRecordsForSeed, bothAttacks, DUO_TO_ATTRIBUTE_CODE };
