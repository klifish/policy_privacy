'use strict';

// A sharded capture runs the positions p of the seeded execution order with
// p % N == i in shard i and merges the shards afterwards. The merge must
// reproduce one capture: every definition executed exactly once, against one
// contract, from the same code, in canonical order.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { expect } = require('chai');

const { mergeShards } = require('../experiments/capture/merge_shards');
const { shuffleExecutionOrder } = require('../experiments/capture/execution_order');
const { shardSize } = require('../scripts/shard_wallets');

const CONTRACT = '0x00000000000000000000000000000000000000aa';
const PROVENANCE = { commitHash: 'abc', workingTreeDiffSha256: null, zkeySha256: 'z', protectionProfile: 'b2_padded' };

function definitions() {
  const rows = [];
  for (let p = 0; p < 9; p++) {
    const execs = p < 2 ? 4 : 1;
    for (let e = 0; e < execs; e++) {
      rows.push({
        policyId: `policy-${p}`,
        executionId: e,
        satisfy: e % 2 === 0,
        piPair: p < 2 ? { pairId: 'pi-x-0', pairType: 'semantic_equivalent', side: p } : null
      });
    }
  }
  return rows;
}

function write(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function buildCapture(count, mutate = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shards-'));
  const defs = definitions();
  const seed = 'test-seed';
  write(path.join(root, 'policy_definitions.json'), defs);
  write(path.join(root, 'config.json'), { executionOrderSeed: seed });
  write(path.join(root, 'metadata.json'), { provenance: PROVENANCE });
  write(path.join(root, 'contract.json'), { policyPrivacyAddress: CONTRACT, network: 'test' });
  const order = shuffleExecutionOrder(defs, seed);
  const shards = Array.from({ length: count }, () => []);
  order.forEach((entry, position) => {
    const tx = { to: CONTRACT, from: `0x${position % count}` };
    shards[position % count].push({
      ...entry,
      accessGranted: entry.satisfy,
      transactions: { commit: { tx }, resource: { tx }, access: { tx } }
    });
  });
  shards.forEach((rows, index) => {
    const dir = path.join(root, 'shards', `shard-${index}`);
    write(path.join(dir, 'executed_dataset.json'), rows);
    write(path.join(dir, 'metadata.json'), { provenance: PROVENANCE });
    write(path.join(dir, 'shard.json'), { index, count, executions: rows.length, contract: CONTRACT, deployer: `d${index}`, tps: `t${index}` });
  });
  mutate(root, shards);
  return { root, defs, order };
}

describe('Sharded capture', () => {
  it('sizes each shard by its positions', () => {
    expect([0, 1, 2, 3].map((i) => shardSize(1977, 4, i))).to.deep.equal([495, 494, 494, 494]);
    expect([0, 1, 2].map((i) => shardSize(2, 3, i))).to.deep.equal([1, 1, 0]);
  });

  it('merges every execution once, in canonical order, with its planned position', () => {
    const { root, defs, order } = buildCapture(3);
    const { manifest } = mergeShards(root);
    const merged = JSON.parse(fs.readFileSync(path.join(root, 'executed_dataset.json'), 'utf8'));
    expect(merged.map((r) => `${r.policyId}#${r.executionId}`)).to.deep.equal(defs.map((r) => `${r.policyId}#${r.executionId}`));
    const planned = new Map(order.map((e, i) => [`${e.policyId}#${e.executionId}`, i]));
    merged.forEach((r) => {
      expect(r.executionSequence).to.equal(planned.get(`${r.policyId}#${r.executionId}`));
      expect(r.captureShard).to.equal(r.executionSequence % 3);
    });
    expect(manifest.shards.map((s) => s.executions)).to.deep.equal([5, 5, 5]);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'pi_dataset.json'), 'utf8'))).to.have.length(8);
  });

  it('refuses a shard that has not finished', () => {
    const { root } = buildCapture(2, (dir) => write(path.join(dir, 'shards', 'shard-1', 'execution_checkpoint.json'), {}));
    expect(() => mergeShards(root)).to.throw('has not finished');
  });

  it('refuses a missing, duplicated or misplaced execution', () => {
    const drop = buildCapture(2, (dir, shards) => {
      shards[0].pop();
      write(path.join(dir, 'shards', 'shard-0', 'executed_dataset.json'), shards[0]);
      write(path.join(dir, 'shards', 'shard-0', 'shard.json'), { index: 0, count: 2, executions: shards[0].length, contract: CONTRACT });
    });
    expect(() => mergeShards(drop.root)).to.throw('were not executed');

    const misplaced = buildCapture(2, (dir, shards) => {
      const moved = shards[1].shift();
      shards[0].push(moved);
      write(path.join(dir, 'shards', 'shard-0', 'executed_dataset.json'), shards[0]);
      write(path.join(dir, 'shards', 'shard-0', 'shard.json'), { index: 0, count: 2, executions: shards[0].length, contract: CONTRACT });
    });
    expect(() => mergeShards(misplaced.root)).to.throw('belongs to another shard');
  });

  it('refuses shards from other code or another contract', () => {
    const code = buildCapture(2, (dir) => write(path.join(dir, 'shards', 'shard-1', 'metadata.json'), {
      provenance: { ...PROVENANCE, commitHash: 'def' }
    }));
    expect(() => mergeShards(code.root)).to.throw('commitHash');

    const contract = buildCapture(2, (dir, shards) => {
      shards[1][0].transactions.access.tx = { to: '0x00000000000000000000000000000000000000bb' };
      write(path.join(dir, 'shards', 'shard-1', 'executed_dataset.json'), shards[1]);
    });
    expect(() => mergeShards(contract.root)).to.throw('did not go to the capture contract');
  });
});
