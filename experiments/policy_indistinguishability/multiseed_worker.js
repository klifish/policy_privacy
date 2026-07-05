'use strict';

/**
 * Worker entry for the parallel PI multi-seed verdict. Reconstructs the per-seed
 * context by re-reading the saved pairs file (written by phase 2 before the
 * verdict block), and delegates each seed to the SAME buildPiRecordsForSeed, so
 * the worker produces byte-identical records. See core/multiseed_worker_base.js
 * for the message protocol.
 */

const fs = require('fs');
const { runSeedWorker } = require('../core/multiseed_worker_base');
const { buildPiRecordsForSeed } = require('./seed_records');

runSeedWorker(
  (workerData) => {
    const payload = JSON.parse(fs.readFileSync(workerData.pairsOutputPath, 'utf8'));
    const pairs = Array.isArray(payload) ? payload : payload.pairs;
    return {
      pairs,
      testRatio: workerData.testRatio,
      permutationIterations: workerData.permutationIterations
    };
  },
  (seedIndex, ctx, baseSeed) => buildPiRecordsForSeed(seedIndex, ctx, baseSeed)
);
