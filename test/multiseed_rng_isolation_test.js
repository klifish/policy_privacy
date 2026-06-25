'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('chai');

const { createRng, deriveSeed } = require('../experiments/core/random');
const {
  evaluateMultiseed,
  withSeededRandom
} = require('../experiments/core/multiseed_criterion');
const { normalizeFeatures } = require('../experiments/core/feature_extractor');
const {
  buildPchRecordsForSeed
} = require('../experiments/policy_content_hiding/seed_records');
const {
  buildPiRecordsForSeed
} = require('../experiments/policy_indistinguishability/seed_records');
const {
  runSupervisedAttacks
} = require('../experiments/structure_and_parameter_privacy/attacks');
const {
  buildSppRecordsForSeed
} = require('../experiments/structure_and_parameter_privacy/seed_records');

const PCH_WORKER = path.resolve(__dirname, '../experiments/policy_content_hiding/multiseed_worker.js');
const PI_WORKER = path.resolve(__dirname, '../experiments/policy_indistinguishability/multiseed_worker.js');
const SPP_WORKER = path.resolve(__dirname, '../experiments/structure_and_parameter_privacy/multiseed_worker.js');

const FEATURE_KEYS = [
  'commitGasUsed',
  'commitCalldataLength',
  'accessGasUsed',
  'accessCalldataLength',
  'proofSize',
  'commitLogsCount',
  'commitLogsSize',
  'accessLogsCount',
  'accessLogsSize'
];

function featureBag(i, offset = 0) {
  return {
    commitGasUsed: 100000 + offset + i * 19,
    commitCalldataLength: 300 + (i % 7),
    accessGasUsed: 700000 + offset + i * 23,
    accessCalldataLength: 200 + (i % 5),
    proofSize: 700 + (i % 11),
    commitLogsCount: i % 3,
    commitLogsSize: 150 + (i % 13),
    accessLogsCount: (i + 1) % 3,
    accessLogsSize: 250 + (i % 17)
  };
}

function keyed(records) {
  return Object.fromEntries(
    records.map((record) => [`${record.key}:${record.classifier || 'single'}`, record])
  );
}

function makePchFeatures() {
  return Array.from({ length: 48 }, (_, i) => ({
    policyIndex: i,
    duoTerm: i % 2,
    duoTermCodes: [i % 2 === 0 ? 'GR' : 'DS'],
    ontologyNamespace: null,
    ontologyValue: null,
    icd10Chapter: null,
    satisfy: i % 2 === 0,
    blockDifference: 1,
    ...featureBag(i)
  }));
}

function makePiPairs() {
  return Array.from({ length: 12 }, (_, pairIndex) => ({
    pairId: `pair-${pairIndex}`,
    pairType: pairIndex < 6 ? 'semantic' : 'structural',
    policies: [0, 1].map((label) => ({
      policyId: `pair-${pairIndex}-policy-${label}`,
      features: Array.from({ length: 2 }, (_, executionIndex) => ({
        features: featureBag(pairIndex * 4 + executionIndex, label * 31),
        satisfy: executionIndex % 2 === 0,
        duoTerm: label,
        ontologyNamespace: null,
        ontologyValue: null
      }))
    }))
  }));
}

function makeSppExecutions() {
  const structures = ['and_only', 'or_only'];
  const predicates = ['none', 'single'];
  return Array.from({ length: 48 }, (_, i) => ({
    policyIndex: i,
    structureType: structures[i % structures.length],
    predicateCombo: predicates[Math.floor(i / 2) % predicates.length],
    paramType: i % 2 === 0 ? 'small' : 'large',
    features: featureBag(i)
  }));
}

describe('Multi-seed isolated RNG streams', function () {
  this.timeout(30000);

  let tmpDir;

  beforeEach(function () {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'multiseed-rng-'));
  });

  afterEach(function () {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('derives reproducible, namespace-independent random streams', function () {
    expect(deriveSeed(123, 'pch', 'split')).to.equal(deriveSeed(123, 'pch', 'split'));
    expect(deriveSeed(123, 'pch', 'split')).to.not.equal(deriveSeed(123, 'pch', 'rf'));

    const first = createRng(123, 'task-a');
    const second = createRng(123, 'task-a');
    expect([first(), first(), first()]).to.deep.equal([second(), second(), second()]);

    const consumed = createRng(123, 'task-a');
    consumed();
    consumed();
    const independent = createRng(123, 'task-b');
    const reference = createRng(123, 'task-b');
    expect([independent(), independent()]).to.deep.equal([reference(), reference()]);
  });

  it('preserves explicit and implicit legacy SPP behavior', function () {
    const executions = makeSppExecutions();
    const run = (config) => {
      const original = console.log;
      try {
        console.log = () => {};
        return withSeededRandom(9876, () => runSupervisedAttacks(executions, config));
      } finally {
        console.log = original;
      }
    };
    const common = {
      targetAttribute: 'structureType',
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample',
      perClassifierPermutation: true
    };

    expect(run(common)).to.deep.equal(run({ ...common, rngMode: 'legacy' }));
  });

  it('makes SPP verdict records independent of the legacy retrain permutation', function () {
    const ctx = {
      executionResults: makeSppExecutions(),
      targetAttributes: ['structureType'],
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample'
    };
    const baseSeed = 0x12345678;

    const withLegacy = buildSppRecordsForSeed(0, {
      ...ctx,
      skipLegacyPermutation: false
    }, baseSeed);
    const skipped = buildSppRecordsForSeed(0, {
      ...ctx,
      skipLegacyPermutation: true
    }, baseSeed);

    expect(skipped).to.deep.equal(withLegacy);
  });

  it('keeps named PCH tasks stable when task traversal order changes', function () {
    const normalizedFeatures = normalizeFeatures(makePchFeatures());
    const base = {
      normalizedFeatures,
      testRatio: 0.3,
      permutationIterations: 2,
      rfOpts: { trees: 3, maxDepth: 3 }
    };
    const forward = buildPchRecordsForSeed(0, {
      ...base,
      observedDuoTermIds: [0, 1]
    }, 111);
    const reverse = buildPchRecordsForSeed(0, {
      ...base,
      observedDuoTermIds: [1, 0]
    }, 111);

    expect(keyed(reverse)).to.deep.equal(keyed(forward));
  });

  it('keeps named PI scopes stable when scope traversal order changes', function () {
    const pairs = makePiPairs();
    const reordered = [...pairs.slice(6), ...pairs.slice(0, 6)];
    const ctx = { testRatio: 0.3, permutationIterations: 2 };
    const forward = keyed(buildPiRecordsForSeed(0, { ...ctx, pairs }, 222));
    const reverse = keyed(buildPiRecordsForSeed(0, { ...ctx, pairs: reordered }, 222));

    expect(reverse['semantic:single']).to.deep.equal(forward['semantic:single']);
    expect(reverse['structural:single']).to.deep.equal(forward['structural:single']);
    expect(reverse['CONTROL: gas>median:lr']).to.deep.equal(forward['CONTROL: gas>median:lr']);
    expect(reverse['CONTROL: gas>median:rf']).to.deep.equal(forward['CONTROL: gas>median:rf']);
  });

  it('keeps named SPP tasks stable when attribute traversal order changes', function () {
    const executionResults = makeSppExecutions();
    const base = {
      executionResults,
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample'
    };
    const forward = buildSppRecordsForSeed(0, {
      ...base,
      targetAttributes: ['structureType', 'predicateCombo']
    }, 333);
    const reverse = buildSppRecordsForSeed(0, {
      ...base,
      targetAttributes: ['predicateCombo', 'structureType']
    }, 333);

    expect(keyed(reverse)).to.deep.equal(keyed(forward));
  });

  it('produces identical PCH serial and worker verdicts', async function () {
    const features = makePchFeatures();
    const featuresPath = path.join(tmpDir, 'features.json');
    fs.writeFileSync(featuresPath, JSON.stringify({ features }));
    const normalizedFeatures = normalizeFeatures(features);
    const ctx = {
      normalizedFeatures,
      observedDuoTermIds: [0, 1],
      testRatio: 0.3,
      permutationIterations: 2,
      rfOpts: { trees: 3, maxDepth: 3 }
    };
    const opts = { seeds: 2, permutationIterations: 2 };
    const serial = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildPchRecordsForSeed(seedIndex, ctx, baseSeed),
      { ...opts, concurrency: 1 }
    );
    const parallel = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildPchRecordsForSeed(seedIndex, ctx, baseSeed),
      {
        ...opts,
        concurrency: 2,
        workerEntry: PCH_WORKER,
        workerData: {
          featuresOutputPath: featuresPath,
          testRatio: 0.3,
          permutationIterations: 2,
          rfOpts: { trees: 3, maxDepth: 3 }
        }
      }
    );
    expect(parallel).to.deep.equal(serial);
  });

  it('produces identical PI serial and worker verdicts', async function () {
    const pairs = makePiPairs();
    const pairsPath = path.join(tmpDir, 'pairs.json');
    fs.writeFileSync(pairsPath, JSON.stringify({ pairs }));
    const ctx = { pairs, testRatio: 0.3, permutationIterations: 2 };
    const opts = { seeds: 2, permutationIterations: 2 };
    const serial = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildPiRecordsForSeed(seedIndex, ctx, baseSeed),
      { ...opts, concurrency: 1 }
    );
    const parallel = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildPiRecordsForSeed(seedIndex, ctx, baseSeed),
      {
        ...opts,
        concurrency: 2,
        workerEntry: PI_WORKER,
        workerData: {
          pairsOutputPath: pairsPath,
          testRatio: 0.3,
          permutationIterations: 2
        }
      }
    );
    expect(parallel).to.deep.equal(serial);
  });

  it('produces identical SPP serial and worker verdicts', async function () {
    const executionResults = makeSppExecutions();
    const executionResultsPath = path.join(tmpDir, 'spp.json');
    fs.writeFileSync(executionResultsPath, JSON.stringify(executionResults));
    const ctx = {
      executionResults,
      targetAttributes: ['structureType'],
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample'
    };
    const opts = { seeds: 2, permutationIterations: 2 };
    const serial = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildSppRecordsForSeed(seedIndex, ctx, baseSeed),
      { ...opts, concurrency: 1 }
    );
    const parallel = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildSppRecordsForSeed(seedIndex, ctx, baseSeed),
      {
        ...opts,
        concurrency: 2,
        workerEntry: SPP_WORKER,
        workerData: {
          executionResultsPath,
          targetAttributes: ['structureType'],
          testRatio: 0.3,
          permutationIterations: 2,
          balanceMethod: 'undersample'
        }
      }
    );
    expect(parallel).to.deep.equal(serial);
  });

  it('skips the legacy SPP permutation only when requested', function () {
    const executions = makeSppExecutions();
    const common = {
      targetAttribute: 'structureType',
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample',
      perClassifierPermutation: true,
      rngMode: 'isolated',
      baseSeed: 444
    };
    const original = console.log;
    let kept;
    let skipped;
    try {
      console.log = () => {};
      kept = runSupervisedAttacks(executions, {
        ...common,
        skipLegacyPermutation: false
      });
      skipped = runSupervisedAttacks(executions, {
        ...common,
        skipLegacyPermutation: true
      });
    } finally {
      console.log = original;
    }

    expect(kept.results[0].logisticRegression.permutationTest).to.be.an('object');
    expect(skipped.results[0].logisticRegression.permutationTest).to.equal(null);
    expect(skipped.results[0].logisticRegression.evaluation)
      .to.deep.equal(kept.results[0].logisticRegression.evaluation);
    expect(skipped.results[0].randomForest)
      .to.deep.equal(kept.results[0].randomForest);
  });
});
