'use strict';

/**
 * Worker entry for the parallel PI multi-seed verdict. Rebuilds the pairs from
 * the capture's pi_dataset.json and delegates each seed to the SAME
 * buildPiRecordsForSeed, so the worker produces byte-identical records. See
 * core/multiseed_worker_base.js for the message protocol.
 */

const fs = require('fs');
const { runSeedWorker } = require('../../../core/multiseed_worker_base');
const { buildPiRecordsForSeed, loadPairs } = require('./seed_records');

runSeedWorker(
  (workerData) => ({
    pairs: loadPairs(JSON.parse(fs.readFileSync(workerData.piDatasetPath, 'utf8'))),
    permutationIterations: workerData.permutationIterations,
    rfOpts: workerData.rfOpts,
    controlShift: workerData.controlShift
  }),
  (seedIndex, ctx, baseSeed) => buildPiRecordsForSeed(seedIndex, ctx, baseSeed)
);
