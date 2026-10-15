'use strict';

/**
 * Per-seed verdict records for the within-pair PI attack, in a standalone
 * module so the parallel worker (multiseed_worker.js) can import it without the
 * run_experiment graph.
 *
 * The PI attacker knows the two candidate policies of a pair and can run each,
 * so it trains on executions of the pair itself. Every execution commits its
 * own policy instance, so training and test executions never share a
 * commitment. Per seed and pair, each (side, outcome) cell is split half train /
 * half test, so both outcomes appear on both sides of the split; one classifier
 * per pair is trained on the observable features (the decision o is not an
 * input), and the test AUC is computed over the pair's test executions. A pair
 * type's statistic is the mean pair AUC; its permutation null shuffles test
 * labels within pairs on fixed scores. Mirrors
 * experiments/analysis/supervised/pi_supervised.py.
 */

const { LogisticRegression, RandomForest } = require('../../../core/classifiers');
const { calculateAUC } = require('../../../core/evaluator');
const { createRng, shuffleInPlace } = require('../../../core/random');
const { outcomeOf } = require('../../../core/subsample');
const { FEATURE_KEYS } = require('./feature_keys');

const PAIR_TYPES = Object.freeze(['semantic_equivalent', 'weak_equivalent', 'controlled_difference']);
const TEST_FRACTION = 0.5;

function numeric(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string' && value.startsWith('0x')) return Number(BigInt(value));
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Group pi_dataset rows into pairs: [{ pairId, pairType, rows: [{ x, side, o }] }]. */
function loadPairs(dataset) {
  const byPair = new Map();
  for (const entry of dataset) {
    const pair = entry.piPair;
    if (!pair) continue;
    const outcome = outcomeOf(entry);
    if (!outcome) throw new Error(`execution ${entry.policyId}#${entry.executionId} has no outcome`);
    if (!byPair.has(pair.pairId)) byPair.set(pair.pairId, { pairId: pair.pairId, pairType: pair.pairType, rows: [] });
    byPair.get(pair.pairId).rows.push({
      x: FEATURE_KEYS.map((key) => numeric((entry.features || {})[key])),
      side: Number(pair.side),
      o: outcome === 'granted' ? 1 : 0
    });
  }
  if (byPair.size === 0) {
    throw new Error('pi_dataset.json has no designed PI pairs (piPair); capture with a piLayer config');
  }
  return [...byPair.keys()].sort().map((id) => byPair.get(id));
}

/** Test flags: half of every (side, outcome) cell, at least one row each way. */
function splitPair(rows, rng) {
  const test = new Array(rows.length).fill(false);
  for (const side of [0, 1]) {
    for (const o of [0, 1]) {
      const idx = rows.map((r, i) => i).filter((i) => rows[i].side === side && rows[i].o === o);
      if (idx.length < 2) throw new Error(`cell side=${side} o=${o} has ${idx.length} executions`);
      const nTest = Math.min(idx.length - 1, Math.max(1, Math.round(idx.length * TEST_FRACTION)));
      shuffleInPlace(idx, rng).slice(0, nTest).forEach((i) => { test[i] = true; });
    }
  }
  return test;
}

function gaussian(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Standardize with training statistics, dropping columns constant in training. */
function standardize(trainX, testX) {
  const d = trainX[0].length;
  const keep = [];
  const stats = [];
  for (let j = 0; j < d; j++) {
    const col = trainX.map((x) => x[j]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const sd = Math.sqrt(col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length);
    if (sd > 0) {
      keep.push(j);
      stats.push([mean, sd]);
    }
  }
  const apply = (X) => X.map((x) => keep.map((j, k) => (x[j] - stats[k][0]) / stats[k][1]));
  return { train: apply(trainX), test: apply(testX), width: keep.length };
}

function averageRanks(values) {
  const order = values.map((v, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(values.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j += 1;
    for (let k = i; k <= j; k++) ranks[order[k]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return ranks;
}

function aucFromRanks(labels, ranks) {
  let nPos = 0;
  let sum = 0;
  labels.forEach((y, i) => { if (y === 1) { nPos += 1; sum += ranks[i]; } });
  const nNeg = labels.length - nPos;
  return (sum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
}

/**
 * Records for ONE seed: per pair type and classifier, the mean pair AUC and its
 * within-pair permutation p-value.
 *
 * @param {number} seedIndex
 * @param {{pairs:Array, permutationIterations:number, rfOpts:{trees:number,maxDepth:number},
 *          controlShift:(number|null)}} ctx
 */
function buildPiRecordsForSeed(seedIndex, ctx, baseSeed) {
  const { pairs, permutationIterations: iters, rfOpts = {}, controlShift = null } = ctx;
  const seed = Number.isInteger(baseSeed) ? baseSeed : seedIndex;
  const rng = (...parts) => createRng(seed, 'pi', ...parts);
  const records = [];
  for (const pairType of PAIR_TYPES) {
    const typePairs = pairs.filter((p) => p.pairType === pairType);
    if (typePairs.length === 0) continue;
    const perPair = { lr: [], rf: [] };
    let testN = 0;
    for (const pair of typePairs) {
      let X = pair.rows.map((r) => [...r.x]);
      if (controlShift !== null) {
        const control = rng('control', pair.pairId);
        X = X.map((x, i) => [...x, gaussian(control) + controlShift * pair.rows[i].side]);
      }
      const test = splitPair(pair.rows, rng('split', pair.pairId));
      const trIdx = [];
      const teIdx = [];
      test.forEach((t, i) => (t ? teIdx : trIdx).push(i));
      testN += teIdx.length;
      const trY = trIdx.map((i) => pair.rows[i].side);
      const { train, test: testX, width } = standardize(trIdx.map((i) => X[i]), teIdx.map((i) => X[i]));
      const scores = {};
      if (width === 0) {
        scores.lr = teIdx.map(() => 0.5);
        scores.rf = teIdx.map(() => 0.5);
      } else {
        const lr = new LogisticRegression(0.1, 500);
        lr.train(train, trY);
        scores.lr = lr.predictProba(testX);
        const rf = new RandomForest(rfOpts.trees || 50, rfOpts.maxDepth || 10, rng('rf', pair.pairId));
        rf.train(train, trY);
        scores.rf = rf.predictProba(testX);
      }
      for (const classifier of ['lr', 'rf']) {
        const permRng = rng('perm', pair.pairId, classifier);
        const labels = teIdx.map((i) => pair.rows[i].side);
        const pairScores = scores[classifier];
        const ranks = averageRanks(pairScores);
        const observed = calculateAUC(labels, pairScores);
        const permuted = labels.slice();
        const nullAucs = new Array(iters);
        for (let it = 0; it < iters; it++) {
          shuffleInPlace(permuted, permRng);
          nullAucs[it] = aucFromRanks(permuted, ranks);
        }
        perPair[classifier].push({ observed, nullAucs });
      }
    }
    for (const classifier of ['lr', 'rf']) {
      const list = perPair[classifier];
      const stat = list.reduce((a, c) => a + c.observed, 0) / list.length;
      let exceed = 0;
      for (let it = 0; it < iters; it++) {
        const permStat = list.reduce((a, c) => a + c.nullAucs[it], 0) / list.length;
        if (permStat >= stat - 1e-12) exceed += 1;
      }
      records.push({
        key: pairType,
        perClassifier: true,
        classifier,
        auc: stat,
        advantage: Math.abs(stat - 0.5),
        permPValue: (exceed + 1) / (iters + 1),
        n: testN
      });
    }
  }
  return records;
}

module.exports = { buildPiRecordsForSeed, loadPairs, splitPair, PAIR_TYPES };
