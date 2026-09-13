'use strict';

/**
 * Quantifies and locks the rank-based (Mann–Whitney, average-rank) calculateAUC.
 *
 * The previous step-function AUC mishandled ties: equal-score samples got no
 * half-credit and the result depended on Array.sort ordering. RandomForest
 * scores are discrete vote fractions (k/trees), so ties are pervasive, and
 * permutationTestAUC recomputes AUC over the same tied scores every iteration —
 * biasing p-values toward "non-significant" (toward PASS). These tests assert:
 *   1. NO-TIES: new == old step-function value (behavior-preserving).
 *   2. TIES: new gives the correct 0.5 where the old step value diverges.
 *   3. RF realism: on 1/25-quantized scores, quantify old-vs-new divergence.
 *   4. Edges: all-positive / all-negative -> 0.5 (preserved).
 *   5. Of-record probe: PI control RF probabilities really are 1/25 multiples.
 */

const fs = require('fs');
const path = require('path');
const { expect } = require('chai');

const { calculateAUC } = require('../experiments/core/evaluator');

// The OLD step-function AUC, inlined verbatim as the oracle for divergence demos
// and for the no-ties equivalence property. (Pre-fix implementation.)
function stepAUC(yTrue, yProba) {
  const sorted = yTrue.map((y, i) => ({ y, p: yProba[i] })).sort((a, b) => b.p - a.p);
  const positives = yTrue.filter(y => y === 1).length;
  const negatives = yTrue.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  let tpr = 0, fpr = 0, auc = 0, prevFpr = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].y === 1) {
      tpr += 1 / positives;
    } else {
      fpr += 1 / negatives;
      auc += tpr * (fpr - prevFpr);
      prevFpr = fpr;
    }
  }
  return auc;
}

// Independent reference: average-rank Mann–Whitney AUC, written differently from
// the implementation so a shared bug can't hide. Equivalent to the fraction of
// (pos, neg) pairs where pos ranks above neg, ties counting as 0.5.
function pairwiseAUC(yTrue, yProba) {
  const pos = [], neg = [];
  yTrue.forEach((y, i) => (y === 1 ? pos : neg).push(yProba[i]));
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const p of pos) for (const n of neg) {
    if (p > n) wins += 1;
    else if (p === n) wins += 0.5;
  }
  return wins / (pos.length * neg.length);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('calculateAUC — rank-based with tie handling', () => {
  it('equals the old step-function AUC when there are NO ties', () => {
    const rng = mulberry32(12345);
    for (let trial = 0; trial < 200; trial++) {
      const n = 6 + Math.floor(rng() * 40);
      // Distinct probabilities: use a shuffled set of unique values.
      const probs = Array.from({ length: n }, (_, i) => (i + 1) / (n + 1));
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [probs[i], probs[j]] = [probs[j], probs[i]];
      }
      const labels = probs.map(() => (rng() < 0.5 ? 1 : 0));
      if (!labels.includes(0) || !labels.includes(1)) continue; // skip degenerate
      expect(calculateAUC(labels, probs)).to.be.closeTo(stepAUC(labels, probs), 1e-9);
    }
  });

  it('returns the correct 0.5 on fully-tied scores where the step value diverges', () => {
    const yProba = [0.5, 0.5, 0.5, 0.5];
    const yTrue = [1, 1, 0, 0];
    // Correct AUC: every pos/neg pair is tied -> 0.5.
    expect(calculateAUC(yTrue, yProba)).to.equal(0.5);
    // The old step implementation is order-dependent here and does NOT return 0.5
    // for this label arrangement, demonstrating the bug it fixes.
    expect(stepAUC(yTrue, yProba)).to.not.equal(0.5);
  });

  it('matches the independent pairwise/Mann-Whitney AUC on tied vectors', () => {
    const rng = mulberry32(999);
    for (let trial = 0; trial < 300; trial++) {
      const n = 8 + Math.floor(rng() * 30);
      // RF-like discrete scores: multiples of 1/25 -> heavy ties.
      const probs = Array.from({ length: n }, () => Math.round(rng() * 25) / 25);
      const labels = probs.map(() => (rng() < 0.5 ? 1 : 0));
      if (!labels.includes(0) || !labels.includes(1)) continue;
      expect(calculateAUC(labels, probs)).to.be.closeTo(pairwiseAUC(labels, probs), 1e-12);
    }
  });

  it('quantifies the old-vs-new divergence the fix removes (tied RF-style scores)', () => {
    // Cases where the step function is materially wrong because of ties.
    const cases = [
      // Fully tied 3 pos / 3 neg: correct AUC is 0.5 (no information), but the old
      // step function awards 1.0 — it ranks every sort-first positive above the
      // negatives. This is the worst-case, the exact failure that biased RF.
      { yProba: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], yTrue: [1, 1, 1, 0, 0, 0], correct: 0.5 },
      // Partial ties at two discrete score levels (RF vote fractions).
      { yProba: [0.6, 0.6, 0.4, 0.6, 0.4, 0.4], yTrue: [1, 0, 1, 0, 0, 1], correct: 1 / 3 }
    ];
    for (const { yProba, yTrue, correct } of cases) {
      const neu = calculateAUC(yTrue, yProba);
      const old = stepAUC(yTrue, yProba);
      const ref = pairwiseAUC(yTrue, yProba);
      // eslint-disable-next-line no-console
      console.log(`      tied AUC — rank-based: ${neu.toFixed(4)}, old step: ${old.toFixed(4)}, |delta|: ${Math.abs(neu - old).toFixed(4)}`);
      expect(neu).to.be.closeTo(ref, 1e-12);
      expect(neu).to.be.closeTo(correct, 1e-12);
      expect(Math.abs(neu - old)).to.be.greaterThan(0.1); // materially different
    }
  });

  it('returns 0.5 for all-positive and all-negative label sets', () => {
    expect(calculateAUC([1, 1, 1], [0.2, 0.7, 0.9])).to.equal(0.5);
    expect(calculateAUC([0, 0, 0], [0.2, 0.7, 0.9])).to.equal(0.5);
  });

  it('of-record probe: PI controlled_difference RF probabilities are 1/25 multiples (tie surface is real)', () => {
    const p = path.resolve(
      __dirname,
      '../experiments/results/crosscheck/pi/polygonAmoy/pi_analysis.json'
    );
    if (!fs.existsSync(p)) return; // clean checkout — skip without failing
    const a = JSON.parse(fs.readFileSync(p, 'utf8'));
    const rf = (a.singleSample || []).find(
      x => x.scope === 'controlled_difference' && x.classifier === 'RandomForest'
    );
    if (!rf || !rf.outcome || !Array.isArray(rf.outcome.probabilities)) return;
    const allMultiples = rf.outcome.probabilities.every(
      v => Math.abs(v / 0.04 - Math.round(v / 0.04)) < 1e-9
    );
    expect(allMultiples).to.equal(true);
  });
});
