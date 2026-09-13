'use strict';

/**
 * Observable on-chain feature keys for PI, in a STANDALONE constants module so it
 * can be imported without loading data_generator (which transitively requires
 * hardhat/ffjavascript and spawns a stray web-worker thread). attacks.js /
 * feature_extractor.js import from here so the parallel verdict worker stays
 * light. data_generator.js re-exports FEATURE_KEYS from here for compatibility.
 *
 * Excludes proof-timing fields (proofGenerationTime end-to-end; proofWitnessTime /
 * proofProveTime / proofVerifyTime server-side) — performance side-metrics, not a
 * policy-content channel — and blockDifference (a confounded harness artifact:
 * execution order × network drift). This is an explicit whitelist, so adding new
 * non-observable fields to a record does not silently leak them into attacks.
 */
const FEATURE_KEYS = Object.freeze([
  'commitGasUsed',
  'commitCalldataLength',
  'accessGasUsed',
  'accessCalldataLength',
  'proofSize',
  'commitLogsCount',
  'commitLogsSize',
  'accessLogsCount',
  'accessLogsSize'
]);

module.exports = { FEATURE_KEYS };
