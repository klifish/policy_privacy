'use strict';

// On-chain execution order for a capture.
//
// The contract assigns policy and resource IDs sequentially, and the request
// epoch and block numbers follow the order in which executions reach the chain.
// The generator emits executions grouped by layer, so executing them in that
// order makes every one of these public values a label proxy (in the evaluated
// 2026-09 Amoy capture, policyId alone separated the trivial layer with AUC 1).
// Executions therefore run in an order fixed by hashing a seed with each
// execution's identity: independent of every label, and reproducible, so a
// checkpoint resume continues the same order. Results are returned to the
// canonical (generator) order afterwards, so downstream slicing is unchanged.

const crypto = require('crypto');

const DEFAULT_EXECUTION_ORDER_SEED = 'tps-zkpi-execution-order-v1';

function executionKey(entry) {
  if (entry.policyId === undefined || entry.executionId === undefined) {
    throw new Error('execution entries need policyId and executionId to be ordered');
  }
  return `${entry.policyId}#${entry.executionId}`;
}

function orderHash(seed, entry) {
  return crypto.createHash('sha256').update(`${seed}|${executionKey(entry)}`).digest('hex');
}

/** Return a new array with the executions in seeded, label-independent order. */
function shuffleExecutionOrder(dataset, seed = DEFAULT_EXECUTION_ORDER_SEED) {
  const keyed = dataset.map((entry) => ({ entry, hash: orderHash(seed, entry) }));
  const seen = new Set();
  for (const { entry } of keyed) {
    const key = executionKey(entry);
    if (seen.has(key)) throw new Error(`duplicate execution ${key}`);
    seen.add(key);
  }
  keyed.sort((a, b) => (a.hash < b.hash ? -1 : a.hash > b.hash ? 1 : 0));
  return keyed.map(({ entry }) => entry);
}

/**
 * Put execution results back into the canonical dataset order and record each
 * one's on-chain position as `executionSequence`.
 */
function restoreCanonicalOrder(results, canonicalDataset) {
  const position = new Map(canonicalDataset.map((entry, index) => [executionKey(entry), index]));
  return results
    .map((result, sequence) => {
      const key = executionKey(result);
      if (!position.has(key)) throw new Error(`execution result ${key} is not in the dataset`);
      return { ...result, executionSequence: sequence };
    })
    .sort((a, b) => position.get(executionKey(a)) - position.get(executionKey(b)));
}

/** Throw unless a checkpoint was written for the same execution order. */
function assertCheckpointOrder(checkpointDataset, orderedDataset) {
  if (!Array.isArray(checkpointDataset)) return;
  const same = checkpointDataset.length === orderedDataset.length &&
    checkpointDataset.every((entry, i) => executionKey(entry) === executionKey(orderedDataset[i]));
  if (!same) {
    throw new Error('checkpoint was written for a different execution order; resume with the same seed and dataset');
  }
}

module.exports = {
  DEFAULT_EXECUTION_ORDER_SEED,
  shuffleExecutionOrder,
  restoreCanonicalOrder,
  assertCheckpointOrder
};
