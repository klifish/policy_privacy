'use strict';

/**
 * Observable on-chain feature keys for PI, in a STANDALONE constants module so it
 * can be imported without loading data_generator (which transitively requires
 * hardhat/ffjavascript and spawns a stray web-worker thread). attacks.js /
 * feature_extractor.js import from here so the parallel verdict worker stays
 * light. data_generator.js re-exports FEATURE_KEYS from here for compatibility.
 *
 * Excludes proofGenerationTime (client-side only) and blockDifference (a confounded
 * harness artifact: execution order × network drift, not a policy-content channel).
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
