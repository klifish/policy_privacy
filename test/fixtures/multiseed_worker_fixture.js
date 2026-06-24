'use strict';

const { runSeedWorker } = require('../../experiments/core/multiseed_worker_base');

runSeedWorker(
  (workerData) => ({ mode: workerData.mode || 'normal' }),
  (seedIndex, ctx) => {
    if (ctx.mode === 'exit-zero' && seedIndex === 0) {
      process.exit(0);
    }
    if (ctx.mode === 'throw' && seedIndex === 0) {
      throw new Error('fixture worker failure');
    }
    if (ctx.mode === 'non-array' && seedIndex === 0) {
      return { key: 'invalid-record-container' };
    }

    // Force completion order to differ from seed order when multiple workers run.
    const waitMs = seedIndex === 0 ? 5 : Math.max(0, 30 - seedIndex * 3);
    const until = Date.now() + waitMs;
    while (Date.now() < until) {
      // Intentional bounded busy wait for deterministic worker ordering in tests.
    }

    return [{
      key: seedIndex % 2 === 0 ? 'even' : 'odd',
      auc: Math.random(),
      advantage: Math.random(),
      permPValue: Math.random(),
      n: 25 + seedIndex
    }];
  }
);
