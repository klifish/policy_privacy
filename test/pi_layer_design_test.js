'use strict';

// The capture design behind the PI and denied-request evaluation: every policy
// gets granted and denied requests, PI pairs of the manuscript's three types
// are drawn with random sides and no policy in two pairs, and every execution
// commits its own policy instance (fresh randomizer), so a PI attacker cannot
// match executions by h.

const { expect } = require('chai');

const {
  buildSatisfactionPlan,
  generateDataset,
  PI_PAIR_TYPES
} = require('../experiments/core/data_generator');
const { buildExperimentSlices } = require('../experiments/capture/artifacts');
const { validatePILayer } = require('../experiments/capture/validator');
const { selectPolicies } = require('../experiments/ablation/gas_padding/prepare');
const { calculatePolicyCommitment } = require('../lib/prover');
const { outcomeStrata, stratumKey } = require('../experiments/core/subsample');
const { buildSppRecordsForSeed } = require('../experiments/analysis/crosscheck/spp/seed_records');
const SMOKE = require('../experiments/capture/configs/unified_dataset_config_decoupled_smoke.json');

function seededRng(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

describe('Satisfaction plan', () => {
  it('gives every policy with two or more executions both outcomes', () => {
    const rng = seededRng(1);
    for (const [n, ratio, granted] of [[2, 0.5, 1], [24, 0.5, 12], [3, 0.1, 1], [3, 0.95, 2], [5, 0.5, 3]]) {
      const plan = buildSatisfactionPlan(n, ratio, rng);
      expect(plan).to.have.length(n);
      expect(plan.filter(Boolean)).to.have.length(granted);
    }
  });

  it('keeps single executions and pure ratios unchanged', () => {
    const rng = seededRng(2);
    expect(buildSatisfactionPlan(1, 0.5, rng).filter(Boolean)).to.have.length(1);
    expect(buildSatisfactionPlan(4, 1, rng).every(Boolean)).to.equal(true);
    expect(buildSatisfactionPlan(4, 0, rng).some(Boolean)).to.equal(false);
  });
});

describe('Outcome strata', () => {
  const rows = (outcomes) => outcomes.map((granted, i) => ({ policyIndex: i, accessGranted: granted }));

  it('splits a capture with both outcomes and leaves a granted-only capture whole', () => {
    expect(outcomeStrata(rows([true, false, true])).map((s) => [s.outcome, s.rows.length]))
      .to.deep.equal([['granted', 2], ['denied', 1]]);
    expect(outcomeStrata(rows([true, true])).map((s) => s.outcome)).to.deep.equal([null]);
    expect(stratumKey(null, 'DUO GR')).to.equal('DUO GR');
    expect(stratumKey('denied', 'DUO GR')).to.equal('denied | DUO GR');
  });

  it('runs every SPP contrast once per outcome only on request, and over all policies by default', () => {
    const executions = [];
    for (let i = 0; i < 48; i++) {
      for (const granted of [true, false]) {
        executions.push({
          policyIndex: i,
          executionId: granted ? 0 : 1,
          accessGranted: granted,
          structureType: i % 2 ? 'and_only' : 'or_only',
          features: { commitGasUsed: 1000 + i, accessGasUsed: 9000 + (granted ? 50 : 0) + i * 3 }
        });
      }
    }
    const ctx = {
      executionResults: executions,
      targetAttributes: ['structureType'],
      testRatio: 0.3,
      permutationIterations: 2,
      balanceMethod: 'undersample'
    };
    const keys = (records) => [...new Set(records.map((r) => r.key))].sort();
    expect(keys(buildSppRecordsForSeed(0, { ...ctx, perOutcome: true }, 7))).to.deep.equal([
      'denied | structureType: or_only/and_only',
      'granted | structureType: or_only/and_only'
    ]);
    expect(keys(buildSppRecordsForSeed(0, ctx, 7))).to.deep.equal(['structureType: or_only/and_only']);
  });
});

describe('Outcome-stratified AUC', () => {
  const { stratifiedPermutationTestAUC, permutationTestAUC } = require('../experiments/core/evaluator');
  const { createRng } = require('../experiments/core/random');

  it('equals the plain AUC and permutation test for one stratum', () => {
    const y = [0, 1, 0, 1, 1, 0, 1, 0];
    const p = [0.1, 0.9, 0.3, 0.6, 0.4, 0.2, 0.8, 0.7];
    expect(stratifiedPermutationTestAUC(y, p, y.map(() => 0), 50, createRng(1, 'a')))
      .to.deep.equal(permutationTestAUC(y, p, 50, createRng(1, 'a')));
  });

  it('does not score an outcome imbalance between the classes', () => {
    // Class 1 is 80% granted, class 0 20%; the score is o itself.
    const y = [];
    const o = [];
    for (let i = 0; i < 100; i++) {
      y.push(i < 50 ? 1 : 0);
      o.push((i < 50 ? i < 40 : i < 60) ? 1 : 0);
    }
    const scores = o.map((v, i) => v + (i % 7) * 1e-6);
    const { auc, pValue } = stratifiedPermutationTestAUC(y, scores, o, 200, createRng(2, 'b'));
    expect(Math.abs(auc - 0.5)).to.be.below(0.2);
    expect(pValue).to.be.above(0.05);
  });
});

describe('PI layer capture design (smoke config)', function () {
  this.timeout(300000);
  let dataset;

  before(async () => {
    dataset = await generateDataset({ ...SMOKE });
  });

  it('draws the configured pairs, each passing its type check', () => {
    const result = validatePILayer(dataset, { ...SMOKE });
    expect(result.issues).to.deep.equal([]);
    for (const type of PI_PAIR_TYPES) expect(result.pairTypes[type]).to.equal(SMOKE.piLayer.pairsPerType);
  });

  it('puts no policy in two pairs and gives each pair two sides', () => {
    const pairOf = new Map();
    const sides = new Map();
    for (const row of dataset.filter((r) => r.piPair)) {
      const seen = pairOf.get(row.policyId);
      expect(seen === undefined || seen === row.piPair.pairId).to.equal(true);
      pairOf.set(row.policyId, row.piPair.pairId);
      if (!sides.has(row.piPair.pairId)) sides.set(row.piPair.pairId, new Set());
      sides.get(row.piPair.pairId).add(`${row.piPair.side}:${row.policyId}`);
    }
    for (const members of sides.values()) expect(members.size).to.equal(2);
  });

  it('gives paired policies k granted and k denied requests, and others one balanced request', () => {
    const byPolicy = new Map();
    dataset.forEach((row) => {
      if (!byPolicy.has(row.policyId)) byPolicy.set(row.policyId, []);
      byPolicy.get(row.policyId).push(row);
    });
    let single = 0;
    let granted = 0;
    for (const rows of byPolicy.values()) {
      if (rows[0].piPair) {
        const k = SMOKE.piLayer.executionsPerOutcome;
        expect([rows.filter((r) => r.satisfy).length, rows.filter((r) => !r.satisfy).length]).to.deep.equal([k, k]);
      } else {
        expect(rows).to.have.length(1);
        single += 1;
        if (rows[0].satisfy) granted += 1;
      }
    }
    expect(Math.abs(granted - single / 2)).to.be.at.most(1);
  });

  it('never pairs two policies with the same content', () => {
    const content = new Map();
    dataset.filter((r) => r.piPair).forEach((r) => {
      content.set(r.policyId, { pair: r.piPair.pairId, key: JSON.stringify([r.policy, r.predicateParameters]) });
    });
    const byPair = new Map();
    for (const { pair, key } of content.values()) {
      if (!byPair.has(pair)) byPair.set(pair, []);
      byPair.get(pair).push(key);
    }
    for (const keys of byPair.values()) expect(keys[0]).to.not.equal(keys[1]);
  });

  it('commits every execution with its own randomizer', async () => {
    expect(new Set(dataset.map((r) => r.randomizer)).size).to.equal(dataset.length);
    for (const row of dataset.slice(0, 6)) {
      const commitment = await calculatePolicyCommitment(row.policy, BigInt(row.randomizer), row.numOperations);
      expect(BigInt(commitment)).to.equal(BigInt(row.policyCommitment));
      expect(row.structure.policyCommitment).to.equal(row.policyCommitment);
    }
  });

  it('gives PI only the pairs and SPP every policy', () => {
    const slices = buildExperimentSlices(dataset, 3);
    expect(slices.pch).to.have.length(dataset.length);
    expect(slices.pi.every((r) => r.piPair)).to.equal(true);
    expect(slices.pi).to.have.length(dataset.filter((r) => r.piPair).length);
    expect(new Set(slices.spp.map((r) => r.policyId)).size).to.equal(new Set(dataset.map((r) => r.policyId)).size);
  });

  it('keeps every PI pair whole in the ablation subset', () => {
    const definitions = dataset.map((row, index) => ({ ...row, policyIndex: row.policyIndex ?? index }));
    const selection = selectPolicies(definitions, { minRowsPerClass: 1, minPoliciesPerClass: 1 });
    const selected = new Set(selection.indices);
    definitions.forEach((row, index) => {
      if (row.piPair) expect(selected.has(index)).to.equal(true);
    });
  });
});
