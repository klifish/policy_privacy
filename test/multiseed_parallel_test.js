'use strict';

const path = require('path');
const { expect } = require('chai');

const { parseCommonArgs } = require('../experiments/core/cli');
const {
  evaluateMultiseed,
  withSeededRandom,
  seedFor
} = require('../experiments/core/multiseed_criterion');
const {
  buildSppRecordsForSeed
} = require('../experiments/structure_and_parameter_privacy/seed_records');

const workerEntry = path.resolve(__dirname, 'fixtures/multiseed_worker_fixture.js');

function serialFixtureRecord(seedIndex) {
  return [{
    key: seedIndex % 2 === 0 ? 'even' : 'odd',
    auc: Math.random(),
    advantage: Math.random(),
    permPValue: Math.random(),
    n: 25 + seedIndex
  }];
}

describe('Multi-seed parallel execution', function () {
  this.timeout(10000);

  it('reassembles out-of-order worker results identically to serial execution', async function () {
    const opts = { seeds: 7, seedSalt: 1234 };
    const serial = await evaluateMultiseed(serialFixtureRecord, {
      ...opts,
      concurrency: 1
    });
    const parallel = await evaluateMultiseed(serialFixtureRecord, {
      ...opts,
      concurrency: 3,
      workerEntry
    });

    expect(parallel).to.deep.equal(serial);
  });

  it('handles more requested workers than seeds and clean idle exits', async function () {
    const serial = await evaluateMultiseed(serialFixtureRecord, {
      seeds: 2,
      concurrency: 1
    });
    const parallel = await evaluateMultiseed(serialFixtureRecord, {
      seeds: 2,
      concurrency: 32,
      workerEntry
    });

    expect(parallel).to.deep.equal(serial);
  });

  it('rejects when a worker exits successfully before returning its assigned seed', async function () {
    let error;
    try {
      await evaluateMultiseed(serialFixtureRecord, {
        seeds: 2,
        concurrency: 2,
        workerEntry,
        workerData: { mode: 'exit-zero' }
      });
    } catch (err) {
      error = err;
    }

    expect(error).to.be.an('error');
    expect(error.message).to.match(/exited before completing seed 0/);
  });

  it('propagates worker exceptions', async function () {
    let error;
    try {
      await evaluateMultiseed(serialFixtureRecord, {
        seeds: 2,
        concurrency: 2,
        workerEntry,
        workerData: { mode: 'throw' }
      });
    } catch (err) {
      error = err;
    }

    expect(error).to.be.an('error');
    expect(error.message).to.match(/fixture worker failure/);
  });

  it('rejects malformed worker record containers', async function () {
    let error;
    try {
      await evaluateMultiseed(serialFixtureRecord, {
        seeds: 1,
        concurrency: 2,
        workerEntry,
        workerData: { mode: 'non-array' }
      });
    } catch (err) {
      error = err;
    }

    expect(error).to.be.an('error');
    expect(error.message).to.match(/non-array records for seed 0/);
  });

  it('rejects invalid programmatic seed and concurrency values', async function () {
    for (const opts of [
      { seeds: 0, concurrency: 1 },
      { seeds: 1, concurrency: 0 },
      { seeds: 1, concurrency: NaN },
      { seeds: 1.5, concurrency: 1 }
    ]) {
      let error;
      try {
        await evaluateMultiseed(serialFixtureRecord, opts);
      } catch (err) {
        error = err;
      }
      expect(error, JSON.stringify(opts)).to.be.instanceOf(TypeError);
    }
  });

  it('validates CLI values and supports --flag=value syntax', function () {
    expect(parseCommonArgs(['--concurrency', '4', '--multiseed-seeds=12']))
      .to.include({ concurrency: 4, multiseedSeeds: 12 });
    expect(() => parseCommonArgs(['--concurrency', 'x'])).to.throw(/positive integer/);
    expect(() => parseCommonArgs(['--concurrency=0'])).to.throw(/positive integer/);
    expect(() => parseCommonArgs(['--multiseed-seeds', '-1'])).to.throw(/positive integer/);
  });

  it('keeps SPP none contrasts so aggregation can report them as underpowered', function () {
    const executionResults = Array.from({ length: 30 }, (_, i) => ({
      policyIndex: i,
      predicateCombo: i < 15 ? 'none' : 'single',
      features: {
        commitGasUsed: 100000 + i * 17,
        commitCalldataLength: 1000 + (i % 3),
        accessGasUsed: 80000 + i * 13,
        accessCalldataLength: 800 + (i % 5),
        proofSize: 1500 + (i % 7),
        commitLogsCount: i % 2,
        commitLogsSize: 200 + (i % 4),
        accessLogsCount: (i + 1) % 2,
        accessLogsSize: 100 + (i % 6),
        blockDifference: 1 + (i % 4)
      }
    }));
    const records = withSeededRandom(seedFor(0), () => buildSppRecordsForSeed(0, {
      executionResults,
      targetAttributes: ['predicateCombo'],
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample'
    }));

    expect(records.some(r => r.key === 'predicateCombo: none/single')).to.equal(true);
    expect(records.find(r => r.key === 'predicateCombo: none/single').n).to.be.below(20);
  });
});
