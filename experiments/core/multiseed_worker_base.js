'use strict';

/**
 * Shared worker_threads plumbing for the parallel multi-seed verdict.
 *
 * Each experiment ships a tiny worker-entry module (e.g.
 * structure_and_parameter_privacy/multiseed_worker.js) that calls runSeedWorker()
 * with two callbacks:
 *
 *   buildCtx(workerData)            -> ctx   (reconstruct the closure's captured
 *                                             inputs from serializable workerData;
 *                                             called ONCE per worker)
 *   buildRecordsForSeed(seedIndex, ctx) -> records[]  (the per-seed record
 *                                             producer — the SAME pure function the
 *                                             serial runOnce closure calls)
 *
 * This base owns the message protocol with the pool driver in
 * core/multiseed_criterion.js (runSeedsInWorkers): it receives one seed index at
 * a time, runs it inside withSeededRandom(seedFor(s, salt)) — so the worker's
 * own (isolate-local) Math.random reproduces the exact serial PRNG stream — and
 * posts the records back keyed by seed index. console output is silenced inside
 * the worker so attack chatter never reaches the parent.
 */

const { parentPort, workerData } = require('worker_threads');
const { withSeededRandom, seedFor } = require('./multiseed_criterion');

function runSeedWorker(buildCtx, buildRecordsForSeed) {
  if (!parentPort) {
    throw new Error('multiseed_worker_base: must be run inside a worker_threads Worker');
  }
  // Silence per-attack console chatter (matches the serial closures' console
  // muting) so only the parent's printVerdict writes to stdout.
  const noop = () => {};
  console.log = noop;
  console.warn = noop;

  const salt = (workerData && workerData.salt) >>> 0;
  const ctx = buildCtx(workerData);

  parentPort.on('message', (msg) => {
    if (!msg || msg.type === 'done') {
      // No more work for this worker; exit cleanly (code 0).
      process.exit(0);
      return;
    }
    if (msg.type === 'seed') {
      const s = msg.seedIndex;
      const records = withSeededRandom(seedFor(s, salt), () => buildRecordsForSeed(s, ctx)) || [];
      parentPort.postMessage({ type: 'result', seedIndex: s, records });
    }
  });
}

module.exports = { runSeedWorker };
