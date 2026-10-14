#!/usr/bin/env node
'use strict';

/**
 * Merge the shards of a capture into one artifact set.
 *
 * A sharded capture (run_shards.sh) writes the shared definitions, config and
 * contract.json to its root and one run per shard to <root>/shards/shard-<i>.
 * Shard i executed the positions p of the seeded execution order with
 * p % N == i. This script checks that every shard finished, used the same
 * contract and code, and executed exactly its positions, so that every
 * definition was executed exactly once; it then writes the executions in
 * canonical order to the root, with executionSequence set to the planned
 * position in the seeded order, and the experiment slices next to them.
 *
 * Usage: node experiments/capture/merge_shards.js <capture root> [--spp-executions=3]
 */

const fs = require('fs');
const path = require('path');

const { getArtifactPaths, writeExecutionArtifacts } = require('./artifacts');
const { shuffleExecutionOrder, restoreCanonicalOrder } = require('./execution_order');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function executionKey(entry) {
  return `${entry.policyId}#${entry.executionId}`;
}

function sameAddress(a, b) {
  return Boolean(a) && Boolean(b) && String(a).toLowerCase() === String(b).toLowerCase();
}

function shardDirectories(rootDir) {
  const shardsDir = path.join(rootDir, 'shards');
  if (!fs.existsSync(shardsDir)) throw new Error(`no shards directory in ${rootDir}`);
  return fs.readdirSync(shardsDir)
    .filter((name) => /^shard-\d+$/.test(name))
    .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
    .map((name) => path.join(shardsDir, name));
}

function mergeShards(rootDir, { sppExecutionsPerPolicy = 3 } = {}) {
  const root = getArtifactPaths(rootDir);
  const definitions = readJson(root.policyDefinitions);
  const config = readJson(root.config);
  const contract = readJson(path.join(root.dir, 'contract.json'));
  const rootProvenance = readJson(root.metadata).provenance || {};
  const order = shuffleExecutionOrder(definitions, config.executionOrderSeed);
  const position = new Map(order.map((entry, index) => [executionKey(entry), index]));

  const dirs = shardDirectories(root.dir);
  const results = [];
  const shards = [];
  dirs.forEach((dir, expectedIndex) => {
    const info = readJson(path.join(dir, 'shard.json'));
    if (info.index !== expectedIndex || info.count !== dirs.length) {
      throw new Error(`${dir}: shard ${info.index}/${info.count}, expected ${expectedIndex}/${dirs.length}`);
    }
    if (fs.existsSync(path.join(dir, 'execution_checkpoint.json'))) {
      throw new Error(`${dir}: shard has not finished (checkpoint present)`);
    }
    if (!sameAddress(info.contract, contract.policyPrivacyAddress)) {
      throw new Error(`${dir}: shard used contract ${info.contract}, not ${contract.policyPrivacyAddress}`);
    }
    const provenance = readJson(path.join(dir, 'metadata.json')).provenance || {};
    for (const field of ['commitHash', 'workingTreeDiffSha256', 'zkeySha256', 'protectionProfile']) {
      if (provenance[field] !== rootProvenance[field]) {
        throw new Error(`${dir}: provenance ${field} ${provenance[field]} differs from the root's ${rootProvenance[field]}`);
      }
    }
    const rows = readJson(path.join(dir, 'executed_dataset.json'));
    if (rows.length !== info.executions) {
      throw new Error(`${dir}: ${rows.length} executions, shard.json expects ${info.executions}`);
    }
    for (const row of rows) {
      const key = executionKey(row);
      if (!position.has(key)) throw new Error(`${dir}: execution ${key} is not in the definitions`);
      if (position.get(key) % info.count !== info.index) {
        throw new Error(`${dir}: execution ${key} belongs to another shard`);
      }
      for (const kind of ['commit', 'resource', 'access']) {
        const tx = row.transactions?.[kind]?.tx;
        if (!tx || !sameAddress(tx.to, contract.policyPrivacyAddress)) {
          throw new Error(`${dir}: execution ${key} ${kind} tx did not go to the capture contract`);
        }
      }
      results.push({ ...row, captureShard: info.index });
    }
    shards.push({
      index: info.index,
      executions: rows.length,
      deployer: info.deployer,
      tps: info.tps
    });
  });

  const seen = new Set();
  for (const row of results) {
    const key = executionKey(row);
    if (seen.has(key)) throw new Error(`execution ${key} appears in two shards`);
    seen.add(key);
  }
  if (seen.size !== definitions.length) {
    const missing = definitions.filter((entry) => !seen.has(executionKey(entry))).map(executionKey);
    throw new Error(`${missing.length} definitions were not executed, e.g. ${missing.slice(0, 3).join(', ')}`);
  }

  // Sorted by planned position, so restoreCanonicalOrder records that position
  // as executionSequence.
  results.sort((a, b) => position.get(executionKey(a)) - position.get(executionKey(b)));
  const merged = restoreCanonicalOrder(results, definitions);
  const paths = writeExecutionArtifacts({ executions: merged, artifactDir: root.dir, sppExecutionsPerPolicy });
  const manifest = {
    mergedAt: new Date().toISOString(),
    contract: contract.policyPrivacyAddress,
    network: contract.network,
    executionOrderSeed: config.executionOrderSeed,
    executions: merged.length,
    shards
  };
  fs.writeFileSync(path.join(root.dir, 'merge_manifest.json'), JSON.stringify(manifest, null, 2));
  return { paths, manifest };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const rootDir = args.find((arg) => !arg.startsWith('--'));
  const sppArg = args.find((arg) => arg.startsWith('--spp-executions='));
  if (!rootDir) {
    console.error('Usage: node experiments/capture/merge_shards.js <capture root> [--spp-executions=3]');
    process.exit(2);
  }
  try {
    const { manifest } = mergeShards(path.resolve(rootDir), {
      sppExecutionsPerPolicy: sppArg ? Number(sppArg.split('=')[1]) : 3
    });
    console.log(`Merged ${manifest.executions} executions from ${manifest.shards.length} shards ` +
      `(${manifest.shards.map((s) => s.executions).join(' + ')}) at ${manifest.contract}`);
  } catch (error) {
    console.error(`Merge failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = { mergeShards };
