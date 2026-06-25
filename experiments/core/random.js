'use strict';

/**
 * Small deterministic PRNG used by the experiment harness.
 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Derive a stable 32-bit seed from a base seed and typed namespace components.
 * Length-prefixing prevents ambiguous joins such as ['ab', 'c'] vs ['a', 'bc'].
 */
function deriveSeed(baseSeed, ...namespaceParts) {
  let hash = (2166136261 ^ (baseSeed >>> 0)) >>> 0;
  const input = namespaceParts
    .map((part) => {
      const value = String(part);
      return `${typeof part}:${value.length}:${value}`;
    })
    .join('|');

  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function createRng(baseSeed, ...namespaceParts) {
  return mulberry32(deriveSeed(baseSeed, ...namespaceParts));
}

/**
 * Unbiased in-place Fisher–Yates shuffle driven by an injected rng.
 *
 * Replaces the `arr.sort(() => rng() - 0.5)` idiom, which does NOT produce a
 * uniform permutation (Array.sort with a random comparator is biased and
 * engine-dependent). Same Fisher–Yates as core/evaluator.permutationTestAUC, kept
 * here once for reuse by every split/balance/permutation consumer.
 */
function shuffleInPlace(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { mulberry32, deriveSeed, createRng, shuffleInPlace };
