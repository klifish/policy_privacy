'use strict';

/**
 * Worker entry for the parallel PCH multi-seed verdict. Reconstructs the per-seed
 * context from serializable workerData — re-reads the saved features file and
 * re-derives normalizedFeatures + observedDuoTermIds exactly as the serial path
 * does — and delegates each seed to the SAME buildPchRecordsForSeed, so the worker
 * produces byte-identical records. See core/multiseed_worker_base.js for the
 * message protocol.
 */

const fs = require('fs');
const { normalizeFeatures } = require('../../../core/feature_extractor');
const { runSeedWorker } = require('../../../core/multiseed_worker_base');
const { buildPchRecordsForSeed } = require('./seed_records');

runSeedWorker(
  (workerData) => {
    const stored = JSON.parse(fs.readFileSync(workerData.featuresOutputPath, 'utf8'));
    const features = Array.isArray(stored) ? stored : stored.features;
    const normalizedFeatures = normalizeFeatures(features);
    const observedDuoTermIds = Array.from(new Set(normalizedFeatures.map(f => f.duoTerm))).sort((a, b) => a - b);
    return {
      normalizedFeatures,
      observedDuoTermIds,
      testRatio: workerData.testRatio,
      permutationIterations: workerData.permutationIterations,
      rfOpts: workerData.rfOpts,
      perOutcome: workerData.perOutcome === true
    };
  },
  (seedIndex, ctx, baseSeed) => buildPchRecordsForSeed(seedIndex, ctx, baseSeed)
);
