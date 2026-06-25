'use strict';

const { expect } = require('chai');

const { createRng } = require('../experiments/core/random');
const { evaluateMultiseed } = require('../experiments/core/multiseed_criterion');
const {
  buildSingleSampleDataset,
  normalizeSamples,
  trainTestSplit
} = require('../experiments/policy_indistinguishability/feature_extractor');
const {
  runGasMedianPositiveControl
} = require('../experiments/policy_indistinguishability/attacks');
const {
  buildPiRecordsForSeed
} = require('../experiments/policy_indistinguishability/seed_records');

const CONTROL_SCOPE = 'CONTROL: gas>median';

function featureBag(commitGasUsed, offset = 0) {
  return {
    commitGasUsed,
    commitCalldataLength: 300 + offset,
    accessGasUsed: 700000 + commitGasUsed,
    accessCalldataLength: 200 + offset,
    proofSize: 700 + offset,
    commitLogsCount: offset % 3,
    commitLogsSize: 150 + offset,
    accessLogsCount: (offset + 1) % 3,
    accessLogsSize: 250 + offset
  };
}

function makePairs(pairType = 'controlled_difference') {
  let policyNumber = 0;
  return Array.from({ length: 20 }, (_, pairIndex) => ({
    pairId: `pair-${pairIndex}`,
    pairType,
    policies: [0, 1].map(() => {
      const id = policyNumber++;
      return {
        policyId: `policy-${id}`,
        features: [
          100 + id,
          100000 + id,
          200000 + id
        ].map((gas, executionIndex) => ({
          features: featureBag(gas, executionIndex),
          satisfy: executionIndex % 2 === 0,
          duoTerm: id % 2,
          ontologyNamespace: null,
          ontologyValue: null
        }))
      };
    })
  }));
}

function expectedTrainingMedian(pairs, testRatio, baseSeed) {
  const dataset = buildSingleSampleDataset(pairs).sort((a, b) => {
    const pairOrder = String(a.pairId).localeCompare(String(b.pairId));
    if (pairOrder !== 0) return pairOrder;
    return String(a.policyId).localeCompare(String(b.policyId));
  });
  const { samples } = normalizeSamples(dataset);
  const { train, test } = trainTestSplit(
    samples,
    testRatio,
    createRng(baseSeed, 'pi', CONTROL_SCOPE, 'split')
  );
  const gas = train
    .map(sample => sample.features.commitGasUsed)
    .sort((a, b) => a - b);
  return {
    median: gas[Math.floor(gas.length / 2)],
    testPolicyIds: new Set(test.map(sample => sample.policyId))
  };
}

describe('PI gas-median positive control', function () {
  this.timeout(30000);

  it('runs both PI classifiers and separates the known gas-derived label', function () {
    const results = runGasMedianPositiveControl(makePairs(), {
      testRatio: 0.3,
      permutationIterations: 50,
      rngMode: 'isolated',
      baseSeed: 12345
    });

    expect(results.map(result => result.classifier))
      .to.deep.equal(['LogisticRegression', 'RandomForest']);
    for (const result of results) {
      expect(result.skipped).to.not.equal(true);
      expect(result.outcome.evaluation.auc).to.be.greaterThan(0.95);
      expect(result.outcome.permutationPValue).to.be.below(0.05);
      expect(result.dataset.controlThreshold).to.be.a('number');
    }
  });

  it('fits the gas threshold on training policies only', function () {
    const pairs = makePairs();
    const testRatio = 0.3;
    const baseSeed = 24680;
    const expected = expectedTrainingMedian(pairs, testRatio, baseSeed);

    const first = runGasMedianPositiveControl(pairs, {
      testRatio,
      permutationIterations: 2,
      rngMode: 'isolated',
      baseSeed
    });
    expect(first[0].dataset.controlThreshold).to.equal(expected.median);

    const changedTestGas = structuredClone(pairs);
    for (const pair of changedTestGas) {
      for (const policy of pair.policies) {
        if (!expected.testPolicyIds.has(policy.policyId)) continue;
        for (const execution of policy.features) {
          execution.features.commitGasUsed += 10000000;
        }
      }
    }
    const second = runGasMedianPositiveControl(changedTestGas, {
      testRatio,
      permutationIterations: 2,
      rngMode: 'isolated',
      baseSeed
    });
    expect(second[0].dataset.controlThreshold).to.equal(expected.median);
  });

  it('emits deterministic LR and RF control records alongside PI scopes', function () {
    const ctx = {
      pairs: makePairs('semantic_equivalent'),
      testRatio: 0.3,
      permutationIterations: 5
    };
    const first = buildPiRecordsForSeed(0, ctx, 112233);
    const second = buildPiRecordsForSeed(0, ctx, 112233);
    expect(second).to.deep.equal(first);

    const controls = first.filter(record => record.key === CONTROL_SCOPE);
    expect(controls.map(record => record.classifier)).to.deep.equal(['lr', 'rf']);
    expect(controls.every(record => record.perClassifier === true)).to.equal(true);
    expect(controls.every(record => record.auc > 0.95)).to.equal(true);
  });

  it('makes the verdict inconclusive when the control cannot form two classes', async function () {
    const pairs = makePairs('semantic_equivalent');
    for (const pair of pairs) {
      for (const policy of pair.policies) {
        for (const execution of policy.features) {
          execution.features.commitGasUsed = 123456;
        }
      }
    }
    const ctx = {
      pairs,
      testRatio: 0.3,
      permutationIterations: 5
    };
    const verdict = await evaluateMultiseed(
      (seedIndex, baseSeed) => buildPiRecordsForSeed(seedIndex, ctx, baseSeed),
      {
        seeds: 2,
        positiveControlKeys: [CONTROL_SCOPE]
      }
    );
    expect(verdict.missingPositiveControlKeys).to.deep.equal([CONTROL_SCOPE]);
    expect(verdict.controlsValid).to.equal(false);
    expect(verdict.overallPassed).to.equal(null);
  });
});
