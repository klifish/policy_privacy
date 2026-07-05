'use strict';

/**
 * Locks the unbiased Fisher–Yates shuffleInPlace that replaced the
 * `arr.sort(() => rng() - 0.5)` idiom across every split/balance/permutation path.
 *
 * The sort-with-random-comparator idiom does NOT produce a uniform permutation
 * (the comparator is non-transitive; the resulting distribution is skewed and
 * engine-dependent). That biased every train/test split and undermined the
 * multi-seed variance estimate. These tests assert (1) determinism under an
 * injected rng, and (2) that Fisher–Yates is statistically uniform where the old
 * idiom is visibly skewed.
 */

const { expect } = require('chai');
const { mulberry32, shuffleInPlace } = require('../experiments/core/random');

// The OLD biased idiom, inlined as the contrast oracle.
function biasedShuffle(arr, rng) {
  return [...arr].sort(() => rng() - 0.5);
}

function permKey(arr) {
  return arr.join(',');
}

describe('shuffleInPlace — unbiased Fisher–Yates', () => {
  it('is deterministic under the same injected rng', () => {
    const a = shuffleInPlace([0, 1, 2, 3, 4, 5, 6, 7], mulberry32(42));
    const b = shuffleInPlace([0, 1, 2, 3, 4, 5, 6, 7], mulberry32(42));
    expect(a).to.deep.equal(b);
  });

  it('returns the same array reference (in place) and preserves the multiset', () => {
    const arr = [3, 1, 2];
    const out = shuffleInPlace(arr, mulberry32(1));
    expect(out).to.equal(arr); // same reference
    expect([...out].sort((x, y) => x - y)).to.deep.equal([1, 2, 3]);
  });

  it('produces a near-uniform distribution over permutations (where sort-shuffle is skewed)', () => {
    // Count how often each of the 6 permutations of [0,1,2] appears.
    const TRIALS = 60000;
    const fair = {};
    const biased = {};
    const rf = mulberry32(7);
    const rb = mulberry32(7);
    for (let i = 0; i < TRIALS; i++) {
      const f = permKey(shuffleInPlace([0, 1, 2], rf));
      fair[f] = (fair[f] || 0) + 1;
      const b = permKey(biasedShuffle([0, 1, 2], rb));
      biased[b] = (biased[b] || 0) + 1;
    }

    const expected = TRIALS / 6;
    const fairDevs = Object.values(fair).map(c => Math.abs(c - expected) / expected);
    const biasedDevs = Object.values(biased).map(c => Math.abs(c - expected) / expected);
    // eslint-disable-next-line no-console
    console.log(`      max dev from uniform — Fisher-Yates: ${(Math.max(...fairDevs) * 100).toFixed(1)}%, sort-shuffle: ${(Math.max(...biasedDevs) * 100).toFixed(1)}%`);

    // Fisher–Yates: all permutations present and each within ~10% of uniform.
    expect(Object.keys(fair).length).to.equal(6);
    expect(Math.max(...fairDevs)).to.be.lessThan(0.1);
    // The old sort-shuffle is visibly more skewed than Fisher–Yates.
    expect(Math.max(...biasedDevs)).to.be.greaterThan(Math.max(...fairDevs));
  });
});
