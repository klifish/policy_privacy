'use strict';

// The capture executes policies in a seeded order that does not follow the
// generator's layer grouping, so policy IDs, request epochs and block numbers
// carry no label information (experiments/capture/execution_order.js).

const { expect } = require('chai');
const {
  shuffleExecutionOrder,
  restoreCanonicalOrder,
  assertCheckpointOrder
} = require('../experiments/capture/execution_order');

const LAYERS = ['trivial_ontology', 'and_chain', 'or_chain', 'mixed_chain', 'profile_only'];

// Generator order: every layer's executions in one contiguous block.
const dataset = LAYERS.flatMap((layer) =>
  Array.from({ length: 100 }, (_, i) => ({ policyId: `${layer}-${i}`, executionId: 0, layer })));

describe('Seeded on-chain execution order', function () {
  it('is a permutation of the dataset', function () {
    const ordered = shuffleExecutionOrder(dataset, 'seed-a');
    expect(ordered).to.have.lengthOf(dataset.length);
    const ids = (entries) => entries.map((e) => e.policyId).sort();
    expect(ids(ordered)).to.deep.equal(ids(dataset));
  });

  it('is reproducible for a seed and changes with the seed', function () {
    const key = (entries) => entries.map((e) => e.policyId).join(',');
    expect(key(shuffleExecutionOrder(dataset, 'seed-a'))).to.equal(key(shuffleExecutionOrder(dataset, 'seed-a')));
    expect(key(shuffleExecutionOrder(dataset, 'seed-a'))).to.not.equal(key(shuffleExecutionOrder(dataset, 'seed-b')));
  });

  it('does not keep the layer blocks together', function () {
    const ordered = shuffleExecutionOrder(dataset, 'seed-a');
    // Every layer should appear in every fifth of the execution order.
    for (let part = 0; part < 5; part += 1) {
      const slice = ordered.slice(part * 100, (part + 1) * 100);
      expect(new Set(slice.map((e) => e.layer)).size).to.equal(LAYERS.length);
    }
  });

  it('restores the canonical order and records the on-chain position', function () {
    const ordered = shuffleExecutionOrder(dataset, 'seed-a');
    const results = ordered.map((entry) => ({ ...entry, gas: 1 }));
    const restored = restoreCanonicalOrder(results, dataset);
    expect(restored.map((r) => r.policyId)).to.deep.equal(dataset.map((e) => e.policyId));
    restored.forEach((r) => expect(ordered[r.executionSequence].policyId).to.equal(r.policyId));
  });

  it('rejects duplicate executions', function () {
    expect(() => shuffleExecutionOrder([...dataset, dataset[0]], 'seed-a')).to.throw(/duplicate execution/);
  });

  it('refuses to resume a checkpoint written for another order', function () {
    const ordered = shuffleExecutionOrder(dataset, 'seed-a');
    expect(() => assertCheckpointOrder(ordered, ordered)).to.not.throw();
    expect(() => assertCheckpointOrder(shuffleExecutionOrder(dataset, 'seed-b'), ordered))
      .to.throw(/different execution order/);
  });
});
