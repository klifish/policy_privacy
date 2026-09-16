'use strict';

/**
 * One execution per policy for one evaluation seed.
 *
 * Executions of one policy share every feature except the padded gas draws, so
 * a depth-layer policy with 30 executions would contribute 30 near-duplicate
 * rows and dominate a row-level AUC and its row-level permutation test (the
 * two-layer corpus puts 41% of executions in 2% of policies). Sampling one
 * execution per policy per seed makes rows independent units; the depth layer
 * keeps its role in the clustering check only. Mirrors
 * `one_execution_per_group` in experiments/analysis/supervised/common.py.
 *
 * Deterministic for a given rng and row order: policies and executions are
 * visited in sorted key order.
 */
function oneExecutionPerPolicy(rows, rng = Math.random, options = {}) {
  const policyKey = options.policyKey || ((row) => row.policyIndex ?? row.policyId);
  const execKey = options.execKey || ((row, index) => row.executionId ?? index);
  const byPolicy = new Map();
  rows.forEach((row, index) => {
    const policy = String(policyKey(row));
    const exec = String(execKey(row, index));
    if (!byPolicy.has(policy)) byPolicy.set(policy, new Map());
    const execs = byPolicy.get(policy);
    if (!execs.has(exec)) execs.set(exec, []);
    execs.get(exec).push(index);
  });
  const keep = new Set();
  for (const policy of [...byPolicy.keys()].sort()) {
    const execs = byPolicy.get(policy);
    const ids = [...execs.keys()].sort();
    const chosen = ids[Math.floor(rng() * ids.length)];
    execs.get(chosen).forEach((index) => keep.add(index));
  }
  return rows.filter((_, index) => keep.has(index));
}

/**
 * Same rule for PI pair records: pick one execution per policyId across all
 * pairs and keep only that execution in every pair the policy appears in.
 */
function oneExecutionPerPolicyInPairs(pairs, rng = Math.random) {
  const execsByPolicy = new Map();
  pairs.forEach((pair) => {
    (pair.policies || []).forEach((policy) => {
      const key = String(policy.policyId);
      if (!execsByPolicy.has(key)) execsByPolicy.set(key, new Set());
      (policy.features || []).forEach((run, index) => {
        execsByPolicy.get(key).add(String(run.executionId ?? index));
      });
    });
  });
  const chosen = new Map();
  for (const policy of [...execsByPolicy.keys()].sort()) {
    const ids = [...execsByPolicy.get(policy)].sort();
    chosen.set(policy, ids[Math.floor(rng() * ids.length)]);
  }
  return pairs.map((pair) => ({
    ...pair,
    policies: (pair.policies || []).map((policy) => ({
      ...policy,
      features: (policy.features || []).filter((run, index) =>
        String(run.executionId ?? index) === chosen.get(String(policy.policyId)))
    }))
  }));
}

module.exports = { oneExecutionPerPolicy, oneExecutionPerPolicyInPairs };
