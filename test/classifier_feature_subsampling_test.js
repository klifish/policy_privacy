'use strict';

/**
 * Locks the RandomForest feature-subsampling fix.
 *
 * Previously RandomForest only bootstrapped samples; every tree's findBestSplit
 * scanned ALL features, so it was plain bagging — the trees stayed correlated and
 * the "non-linear attacker" leg of the privacy verdict was effectively a single
 * greedy tree's bias. A real random forest considers a random sqrt(d) feature
 * subset at EACH split, decorrelating the trees. These tests assert:
 *   1. default maxFeatures resolves to round(sqrt(d));
 *   2. an injected rng makes training reproducible (so serial == worker holds);
 *   3. subsampling actually fires — different rng seeds yield different forests,
 *      and maxFeatures < d changes behavior vs the disabled (all-features) mode.
 */

const { expect } = require('chai');
const { mulberry32 } = require('../experiments/core/random');
const { RandomForest } = require('../experiments/core/classifiers');

// A separable-ish dataset with several features so subsampling is observable.
function makeData(rng, n = 120, d = 9) {
  const X = [];
  const y = [];
  for (let i = 0; i < n; i++) {
    const label = rng() < 0.5 ? 0 : 1;
    const row = [];
    for (let f = 0; f < d; f++) {
      // Feature 0 carries signal; the rest are noise — a setup where a real RF
      // (which sometimes must split on noise) diverges from all-feature bagging.
      const noise = rng();
      row.push(f === 0 ? label * 0.6 + noise * 0.4 : noise);
    }
    X.push(row);
    y.push(label);
  }
  return { X, y };
}

describe('RandomForest — per-split feature subsampling', () => {
  it("default maxFeatures resolves to round(sqrt(d))", () => {
    const rf = new RandomForest(5, 4, mulberry32(1)); // default maxFeatures='sqrt'
    expect(rf.resolveMaxFeatures(9)).to.equal(3);   // round(sqrt(9)) = 3
    expect(rf.resolveMaxFeatures(16)).to.equal(4);
    expect(rf.resolveMaxFeatures(2)).to.equal(1);   // round(sqrt(2)) = 1
  });

  it('null/0 maxFeatures disables subsampling (all features — plain bagging)', () => {
    const rf = new RandomForest(5, 4, mulberry32(1), null);
    expect(rf.resolveMaxFeatures(9)).to.equal(null);
    const rf0 = new RandomForest(5, 4, mulberry32(1), 0);
    expect(rf0.resolveMaxFeatures(9)).to.equal(null);
  });

  it('is reproducible under the same injected rng (serial == worker invariant)', () => {
    const data = makeData(mulberry32(123));
    const a = new RandomForest(20, 5, mulberry32(77));
    const b = new RandomForest(20, 5, mulberry32(77));
    a.train(data.X, data.y);
    b.train(data.X, data.y);
    expect(a.predictProba(data.X)).to.deep.equal(b.predictProba(data.X));
  });

  it('subsampling actually fires: different rng seeds build different forests', () => {
    const data = makeData(mulberry32(123));
    const a = new RandomForest(20, 5, mulberry32(1));
    const b = new RandomForest(20, 5, mulberry32(2));
    a.train(data.X, data.y);
    b.train(data.X, data.y);
    // Different feature subsets per split -> at least some predicted scores differ.
    expect(a.predictProba(data.X)).to.not.deep.equal(b.predictProba(data.X));
  });

  it('sqrt subsampling differs from the disabled all-features mode', () => {
    const data = makeData(mulberry32(123));
    const sub = new RandomForest(20, 5, mulberry32(9));          // sqrt subsampling
    const all = new RandomForest(20, 5, mulberry32(9), null);    // all features
    sub.train(data.X, data.y);
    all.train(data.X, data.y);
    expect(sub.predictProba(data.X)).to.not.deep.equal(all.predictProba(data.X));
  });
});
