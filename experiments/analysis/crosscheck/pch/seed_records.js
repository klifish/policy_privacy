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
  stratifiedPermutationTestAUC,
  evaluateBinaryClassification,
  calculateConfusionMatrix
} = require('../../../core/evaluator');
const { createRng } = require('../../../core/random');
const { oneExecutionPerPolicy, outcomeStrata, stratumKey } = require('../../../core/subsample');

// Task labels per DUO term id (keys must match the Python pipeline's
// DUO_TERM_ORDER so compare_with_js_verdict can pair the tasks). Datasets emit
// the V3 code 'GRU' for term 0; the task keeps the manuscript label 'GR'.
const DUO_TO_ATTRIBUTE_CODE = {
  0: 'GR',   // GENERAL_RESEARCH
  1: 'DS',   // DISEASE_SPECIFIC
  2: 'RS',   // RESEARCH_SPECIFIC
  3: 'POA',  // POPULATION_ANCESTRY
  4: 'GS',   // GEOGRAPHICAL_RESTRICTION
  5: 'CC',   // CLINICAL_CARE
  6: 'NCU',  // NON_COMMERCIAL_USE
  7: 'HMB',  // HEALTH_MEDICAL_BIOMEDICAL
  8: 'NMDS', // NO_METHODS_DEVELOPMENT
  9: 'GSO'   // GENETIC_STUDIES_ONLY
};
const DUO_CODE_ALIASES = { GRU: 'GR' };
const CODE_TO_DUO_TERM_ID = Object.fromEntries(
  Object.entries(DUO_TO_ATTRIBUTE_CODE).map(([id, code]) => [code, Number(id)])
);

function normalizeDuoCode(code) {
  return DUO_CODE_ALIASES[code] || code;
}

/** Multi-label membership: the term is the primary term or appears anywhere in duoTermCodes. */
function hasDuoTerm(feature, termId) {
  if (feature.duoTerm === termId) return true;
  const code = DUO_TO_ATTRIBUTE_CODE[termId];
  return Array.isArray(feature.duoTermCodes) &&
    feature.duoTermCodes.some((c) => normalizeDuoCode(c) === code);
}

/** Every DUO term id carried by any feature row (primary or not), sorted. */
function observedDuoTermIdsOf(features) {
  const ids = new Set();
  features.forEach((f) => {
    if (Number.isInteger(f.duoTerm)) ids.add(f.duoTerm);
    (Array.isArray(f.duoTermCodes) ? f.duoTermCodes : []).forEach((c) => {
      const id = CODE_TO_DUO_TERM_ID[normalizeDuoCode(c)];
      if (id !== undefined) ids.add(id);
    });
  });
  return Array.from(ids).sort((a, b) => a - b);
}

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
  rngs = {},
  teStrata = null
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
    if (calculateAUC(teY, proba) == null) continue; // degenerate AUC for this classifier
    const pred = proba.map(p => (p >= 0.5 ? 1 : 0));
    const ev = evaluateBinaryClassification(teY, pred, proba);
    const confusion = calculateConfusionMatrix(teY, pred);
    const permutationRng = classifier === 'lr'
      ? rngs.lrPermutation
      : rngs.rfPermutation;
    // AUC within o and its within-o permutation p-value (plain AUC and
    // permutation test when o takes one value).
    const { auc, pValue } = stratifiedPermutationTestAUC(
      teY,
      proba,
      teStrata || teY.map(() => 0),
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
  // Default: every policy in one task, with o as an input and the AUC taken
  // within o. ctx.perOutcome (diagnostic): each task once per access outcome.
  if (ctx.perOutcome) {
    return outcomeStrata(ctx.normalizedFeatures).flatMap(({ outcome, rows }) =>
      buildPchStratumRecords(rows, outcome, ctx, baseSeed));
  }
  return buildPchStratumRecords(ctx.normalizedFeatures, null, ctx, baseSeed);
}

// Feature matrix of `rows`, with o appended as a model input when `adjust`
// (the capture holds both outcomes).
function featureMatrix(rows, labelKey, adjust) {
  const X = prepareClassificationData(rows, labelKey).X;
  return adjust ? X.map((x, i) => [...x, rows[i].satisfy]) : X;
}

function buildPchStratumRecords(normalizedFeatures, outcome, ctx, baseSeed) {
  const { observedDuoTermIds, testRatio, permutationIterations: permIterations, rfOpts } = ctx;
  const isolated = Number.isInteger(baseSeed);
  // Unstratified captures keep their original RNG streams.
  const streamParts = outcome ? ['pch', outcome] : ['pch'];
  const rng = (...parts) => isolated
    ? createRng(baseSeed, ...streamParts, ...parts)
    : Math.random;
  // One execution per policy per seed (see core/subsample.js), then a
  // policy-disjoint split of that subsample.
  const sampled = oneExecutionPerPolicy(normalizedFeatures, rng('duo', 'subsample'));
  const { train, test } = splitTrainTest(
    sampled,
    testRatio,
    rng('duo', 'split')
  );
  // o enters as a model input and AUC stratum only when both outcomes occur,
  // so granted-only captures keep their original computation.
  const adjust = new Set(sampled.map((f) => f.satisfy)).size > 1;
  const trX = featureMatrix(train, 'duoTerm', adjust);
  const teX = featureMatrix(test, 'duoTerm', adjust);
  const records = [];
  for (const termId of observedDuoTermIds) {
    const code = DUO_TO_ATTRIBUTE_CODE[termId];
    const labelOf = f => (hasDuoTerm(f, termId) ? 1 : 0);
    const trY = train.map(labelOf);
    const teY = test.map(labelOf);
    if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
    const key = stratumKey(outcome, `DUO ${code}`);
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
      },
      adjust ? test.map((f) => f.satisfy) : null
    ));
  }

  // ICD-10 chapter inference (one-vs-rest). Only rows carrying an ICD-10 chapter
  // participate; each chapter is judged one-vs-rest (AUC + permutation are binary).
  {
    const icdAll = sampled.filter(
      f => f.icd10Chapter !== undefined && f.icd10Chapter !== null
    );
    if (icdAll.length > 0) {
      const icdChapters = [...new Set(icdAll.map(f => f.icd10Chapter))].sort((a, b) => a - b);
      const { train: icdTrain, test: icdTest } = splitTrainTest(
        icdAll,
        testRatio,
        rng('icd', 'split')
      );
      const icdTrX = featureMatrix(icdTrain, 'icd10Chapter', adjust);
      const icdTeX = featureMatrix(icdTest, 'icd10Chapter', adjust);
      for (const ch of icdChapters) {
        const labelOf = f => (f.icd10Chapter === ch ? 1 : 0);
        const trY = icdTrain.map(labelOf);
        const teY = icdTest.map(labelOf);
        if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
        const key = stratumKey(outcome, `ICD ch${ch}`);
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
          },
          adjust ? icdTest.map((f) => f.satisfy) : null
        ));
      }
    }
  }

  return records;
}

module.exports = {
  buildPchRecordsForSeed,
  bothAttacks,
  DUO_TO_ATTRIBUTE_CODE,
  hasDuoTerm,
  observedDuoTermIdsOf
};
