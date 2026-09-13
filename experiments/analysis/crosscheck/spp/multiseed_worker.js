'use strict';

/**
 * Worker entry for the parallel SPP multi-seed verdict. Reconstructs the per-seed
 * context from serializable workerData (re-reads the execution-results dataset)
 * and delegates each seed to the SAME buildSppRecordsForSeed used by the serial
 * path — so the worker produces byte-identical records. See
 * core/multiseed_worker_base.js for the message protocol.
 */

const fs = require('fs');
const { runSeedWorker } = require('../../../core/multiseed_worker_base');
const { buildSppRecordsForSeed } = require('./seed_records');

runSeedWorker(
  (workerData) => ({
    executionResults: JSON.parse(fs.readFileSync(workerData.executionResultsPath, 'utf8')),
    targetAttributes: workerData.targetAttributes,
    testRatio: workerData.testRatio,
    permutationIterations: workerData.permutationIterations,
    balanceMethod: workerData.balanceMethod
  }),
  (seedIndex, ctx, baseSeed) => buildSppRecordsForSeed(seedIndex, ctx, baseSeed)
);
