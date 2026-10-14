#!/usr/bin/env node
'use strict';

/**
 * Wallets for a sharded capture (experiments/capture/run_shards.sh).
 *
 * Shard 0 uses the default keys from .env (AMOY_PRIVATE_KEY pays deployment,
 * commits and resource registrations; TPS_PRIVATE_KEY pays access txs). Shards
 * 1..N-1 each have their own deployer and TPS wallet, stored in a key file
 * (default .env.shards, git-ignored, mode 0600) as SHARD_<i>_DEPLOYER_KEY and
 * SHARD_<i>_TPS_KEY. Keys are never printed.
 *
 *   node scripts/shard_wallets.js generate --count=4
 *   node scripts/shard_wallets.js balances --count=4
 *   node scripts/shard_wallets.js fund --count=4 --executions=1977 --profile=b2_padded [--dry-run]
 *   node scripts/shard_wallets.js sweep --count=4
 *
 * fund tops each shard wallet up to the capture's balance preflight for its
 * share (shard i runs the positions p < executions with p % N == i), from the
 * matching default wallet, and reports whether the default wallets still cover
 * shard 0 (plus the deployment). sweep returns shard balances to the defaults.
 *
 * Options: --file=<key file>, --rpc=<url> (default AMOY_RPC_URL),
 * --gas-price-gwei=<n> (default AMOY_GAS_PRICE_GWEI or 30).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const { estimateDeployerGas, estimateTpsGas } = require('../experiments/core/gas_estimates');

function parseOptions(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (const arg of rest) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (!match) throw new Error(`unexpected argument ${arg}`);
    options[match[1]] = match[2] === undefined ? true : match[2];
  }
  return options;
}

function readKeyFile(file) {
  if (!fs.existsSync(file)) throw new Error(`${file} not found; run generate first`);
  const keys = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^(SHARD_\d+_(?:DEPLOYER|TPS)_KEY)=(0x[0-9a-fA-F]{64})$/.exec(line.trim());
    if (match) keys[match[1]] = match[2];
  }
  return keys;
}

function shardSize(executions, count, index) {
  return index < executions ? Math.floor((executions - index - 1) / count) + 1 : 0;
}

function wallets(options, provider) {
  const count = Number(options.count);
  if (!Number.isInteger(count) || count < 1) throw new Error('--count=N is required');
  const mainDeployer = options['main-deployer-key'] || process.env.AMOY_PRIVATE_KEY;
  const mainTps = options['main-tps-key'] || process.env.TPS_PRIVATE_KEY;
  if (!mainDeployer || !mainTps) throw new Error('AMOY_PRIVATE_KEY and TPS_PRIVATE_KEY must be set');
  const shards = [{ deployer: new ethers.Wallet(mainDeployer, provider), tps: new ethers.Wallet(mainTps, provider) }];
  if (count > 1) {
    const keys = readKeyFile(options.file);
    for (let i = 1; i < count; i += 1) {
      const d = keys[`SHARD_${i}_DEPLOYER_KEY`];
      const t = keys[`SHARD_${i}_TPS_KEY`];
      if (!d || !t) throw new Error(`${options.file} has no keys for shard ${i}`);
      shards.push({ deployer: new ethers.Wallet(d, provider), tps: new ethers.Wallet(t, provider) });
    }
  }
  return shards;
}

function generate(options) {
  const count = Number(options.count);
  if (!Number.isInteger(count) || count < 2) throw new Error('--count=N (N >= 2) is required');
  if (fs.existsSync(options.file)) throw new Error(`${options.file} exists; refusing to overwrite keys`);
  const lines = ['# Shard capture keys (scripts/shard_wallets.js). Keep secret; never commit.'];
  const addresses = [];
  for (let i = 1; i < count; i += 1) {
    const deployer = ethers.Wallet.createRandom();
    const tps = ethers.Wallet.createRandom();
    lines.push(`SHARD_${i}_DEPLOYER_KEY=${deployer.privateKey}`, `SHARD_${i}_TPS_KEY=${tps.privateKey}`);
    addresses.push(`shard ${i}: deployer ${deployer.address}  tps ${tps.address}`);
  }
  fs.writeFileSync(options.file, lines.join('\n') + '\n', { mode: 0o600 });
  console.log(`Wrote ${count - 1} shard key pairs to ${options.file} (mode 600)`);
  addresses.forEach((line) => console.log(`  ${line}`));
}

async function balances(options, provider) {
  for (const [i, shard] of wallets(options, provider).entries()) {
    const [d, t] = await Promise.all([provider.getBalance(shard.deployer.address), provider.getBalance(shard.tps.address)]);
    console.log(`shard ${i}: deployer ${shard.deployer.address} ${ethers.formatEther(d)}  tps ${shard.tps.address} ${ethers.formatEther(t)}`);
  }
}

async function fund(options, provider, gasPrice) {
  const executions = Number(options.executions);
  if (!Number.isInteger(executions) || executions < 1) throw new Error('--executions=<total> is required');
  if (!['b2_padded', 'b1_unpadded'].includes(options.profile)) throw new Error('--profile=b2_padded|b1_unpadded is required');
  const padded = options.profile === 'b2_padded';
  const shards = wallets(options, provider);
  const count = shards.length;
  const transfers = [];
  for (const [i, shard] of shards.entries()) {
    const n = shardSize(executions, count, i);
    const need = {
      deployer: estimateDeployerGas(n, { padded, includeDeployment: i === 0 }) * gasPrice,
      tps: estimateTpsGas(n, { padded }) * gasPrice
    };
    for (const role of ['deployer', 'tps']) {
      const balance = await provider.getBalance(shard[role].address);
      const shortfall = need[role] > balance ? need[role] - balance : 0n;
      console.log(`shard ${i} ${role.padEnd(8)} ${n} executions: needs ${ethers.formatEther(need[role])}, ` +
        `has ${ethers.formatEther(balance)}${shortfall ? `, short ${ethers.formatEther(shortfall)}` : ''}`);
      if (i > 0 && shortfall > 0n) transfers.push({ from: shards[0][role], to: shard[role].address, value: shortfall, i, role });
      if (i === 0 && shortfall > 0n) transfers.push({ uncovered: true, i, role, value: shortfall });
    }
  }
  // The default wallets fund the shards and still have to cover shard 0.
  for (const role of ['deployer', 'tps']) {
    const outgoing = transfers.filter((t) => !t.uncovered && t.role === role).reduce((a, t) => a + t.value + 21000n * gasPrice, 0n);
    const n0 = shardSize(executions, count, 0);
    const own = (role === 'deployer'
      ? estimateDeployerGas(n0, { padded, includeDeployment: true })
      : estimateTpsGas(n0, { padded })) * gasPrice;
    const balance = await provider.getBalance(shards[0][role].address);
    const after = balance - outgoing;
    console.log(`default ${role}: ${ethers.formatEther(balance)} - transfers ${ethers.formatEther(outgoing)} = ` +
      `${ethers.formatEther(after)} for its own share ${ethers.formatEther(own)}${after < own ? '  ** SHORT **' : ''}`);
    if (after < own && !options['dry-run']) throw new Error(`default ${role} wallet cannot fund the shards and its own share`);
  }
  if (options['dry-run']) return;
  for (const t of transfers.filter((x) => !x.uncovered)) {
    const tx = await t.from.sendTransaction({ to: t.to, value: t.value, gasPrice, gasLimit: 21000n });
    await tx.wait(1);
    console.log(`funded shard ${t.i} ${t.role} with ${ethers.formatEther(t.value)} (${tx.hash})`);
  }
}

async function sweep(options, provider, gasPrice) {
  const shards = wallets(options, provider);
  for (const [i, shard] of shards.entries()) {
    if (i === 0) continue;
    for (const role of ['deployer', 'tps']) {
      const balance = await provider.getBalance(shard[role].address);
      const value = balance - 21000n * gasPrice;
      if (value <= 0n) continue;
      const tx = await shard[role].sendTransaction({ to: shards[0][role].address, value, gasPrice, gasLimit: 21000n });
      await tx.wait(1);
      console.log(`returned ${ethers.formatEther(value)} from shard ${i} ${role} (${tx.hash})`);
    }
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  options.file = path.resolve(options.file || '.env.shards');
  if (options.command === 'generate') return generate(options);
  const rpc = options.rpc || process.env.AMOY_RPC_URL;
  if (!rpc) throw new Error('--rpc or AMOY_RPC_URL is required');
  const provider = new ethers.JsonRpcProvider(rpc);
  const gasPrice = BigInt(options['gas-price-gwei'] || process.env.AMOY_GAS_PRICE_GWEI || 30) * 1_000_000_000n;
  try {
    if (options.command === 'balances') return await balances(options, provider);
    if (options.command === 'fund') return await fund(options, provider, gasPrice);
    if (options.command === 'sweep') return await sweep(options, provider, gasPrice);
    throw new Error(`unknown command ${options.command}; see the header of scripts/shard_wallets.js`);
  } finally {
    provider.destroy();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { shardSize };
