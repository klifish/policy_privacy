'use strict';

/*
 * Fixed-RC1 policy-complexity and TPS load benchmark.
 *
 * The circuit, proving key and five-signal public interface stay fixed. Four
 * legal policies exercise progressively richer combinations of ontology,
 * profile, requester-allowlist and obligation slots. The first phase measures
 * per-policy proof timings; the second rotates the same policies through a
 * bounded-concurrency request queue.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'experiments', 'results', 'cost');
const H = require(path.join(ROOT, 'test', 'duo', 'helpers', 'duo_v3_harness'));
const { generateProof } = require(path.join(ROOT, 'tps', 'proofGenerator'));

const SCENARIOS = [
  { id: 'simple', label: 'Simple', logic: 'DS' },
  { id: 'ontology_heavy', label: 'Ontology-heavy', logic: 'DS AND RS AND POA AND GS AND CC' },
  { id: 'profile_heavy', label: 'Profile-heavy', logic: 'GRU AND HMB AND NMDS AND GSO AND NPUNCU AND NPOA AND NPU AND NCU' },
  {
    id: 'max_mixed',
    label: 'Max-mixed',
    logic: 'DS AND RS AND POA AND GS AND CC AND US AND PS AND IS AND MOR AND TS AND GRU AND HMB AND NMDS AND GSO AND NPUNCU AND NPOA AND NPU AND NCU'
  }
];

function integerArg(args, name, fallback) {
  const arg = args.find((item) => item.startsWith(`--${name}=`));
  const value = arg ? Number(arg.split('=')[1]) : fallback;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name} must be a positive integer`);
  return value;
}

function listArg(args, name, fallback) {
  const arg = args.find((item) => item.startsWith(`--${name}=`));
  const values = arg ? arg.split('=')[1].split(',').map(Number) : fallback;
  if (!values.length || values.some((value) => !Number.isInteger(value) || value < 1)) {
    throw new Error(`${name} must be a comma-separated list of positive integers`);
  }
  return [...new Set(values)];
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function summary(values) {
  return { median: quantile(values, 0.5), p25: quantile(values, 0.25), p75: quantile(values, 0.75), p95: quantile(values, 0.95) };
}

let nonceCounter = 1_000_000n;
async function proveRequest(ctx, fixtures, profile) {
  const nonce = nonceCounter++;
  const started = Date.now();
  const { evidence, idReq } = await H.evidenceFor(ctx, profile, fixtures, {
    resourceId: H.WITNESS_PUBLIC.resourceId,
    requestEpoch: H.WITNESS_PUBLIC.requestEpoch
  });
  const result = await generateProof(ctx.material, evidence, {
    policyCommitment: ctx.artifacts.policyCommitment,
    idReq,
    idRes: H.WITNESS_PUBLIC.resourceId,
    nonce,
    requestEpoch: H.WITNESS_PUBLIC.requestEpoch
  });
  const totalMs = Date.now() - started;
  if (!result.timings.verified) throw new Error(`Proof did not verify for ${ctx.logic}`);
  if (BigInt(result.pubSignals[0]) !== 1n) throw new Error(`Policy did not authorize: ${ctx.logic}`);
  return { totalMs, ...result.timings };
}

async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

function timingReport(timings) {
  return {
    totalMs: summary(timings.map((item) => item.totalMs)),
    witnessMs: summary(timings.map((item) => item.witnessMs)),
    proveMs: summary(timings.map((item) => item.proveMs)),
    verifyMs: summary(timings.map((item) => item.verifyMs)),
    backend: timings[0]?.backend || null,
    verified: timings.every((item) => item.verified === true)
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Fixed-circuit policy complexity and TPS load benchmark', '',
    `Host: ${report.host.cpu} (${report.host.cores} cores), Node ${report.host.node}.`,
    `RC1 dimensions: DEPTH=64, MERKLE_LEVELS=8; ${report.policyRepetitions} measured proofs per policy after ${report.warmups} warm-ups.`, '',
    '## Policy complexity', '',
    '| Policy | Tokens | Active slots | Total ms median/p95 | Witness ms median/p95 | Prove ms median/p95 | Verify ms median/p95 |',
    '|---|---:|---:|---:|---:|---:|---:|'
  ];
  for (const row of report.policyScenarios) {
    lines.push(`| ${row.label} | ${row.tokens} | ${row.activePredicateSlots} | ` +
      `${row.timings.totalMs.median.toFixed(0)}/${row.timings.totalMs.p95.toFixed(0)} | ` +
      `${row.timings.witnessMs.median.toFixed(0)}/${row.timings.witnessMs.p95.toFixed(0)} | ` +
      `${row.timings.proveMs.median.toFixed(0)}/${row.timings.proveMs.p95.toFixed(0)} | ` +
      `${row.timings.verifyMs.median.toFixed(0)}/${row.timings.verifyMs.p95.toFixed(0)} |`);
  }
  lines.push('', '## TPS load', '', '| Concurrency | Requests | Throughput proofs/s | Latency ms median/p95 |', '|---:|---:|---:|---:|');
  for (const row of report.load) {
    lines.push(`| ${row.concurrency} | ${row.requests} | ${row.throughputPerSecond.toFixed(3)} | ` +
      `${row.latencyMs.median.toFixed(0)}/${row.latencyMs.p95.toFixed(0)} |`);
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const args = process.argv.slice(2);
  const proofs = integerArg(args, 'proofs', 30);
  const warmups = integerArg(args, 'warmups', 5);
  const loadRequests = integerArg(args, 'load-requests', 100);
  const concurrencyLevels = listArg(args, 'concurrency', [1, 2, 4]);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const fixtures = await H.buildTermFixtures();
  const profile = H.resolveProfile();
  const contexts = [];
  for (const scenario of SCENARIOS) {
    console.log(`[policy] compiling ${scenario.id}`);
    contexts.push({ ...scenario, ctx: await H.compilePolicy(scenario.logic, fixtures) });
  }

  const policyScenarios = [];
  for (const scenario of contexts) {
    console.log(`[policy] ${scenario.id}: warm-up x${warmups}, measure x${proofs}`);
    for (let index = 0; index < warmups; index += 1) await proveRequest(scenario.ctx, fixtures, profile);
    const timings = [];
    for (let index = 0; index < proofs; index += 1) timings.push(await proveRequest(scenario.ctx, fixtures, profile));
    policyScenarios.push({
      id: scenario.id,
      label: scenario.label,
      logic: scenario.logic,
      tokens: scenario.ctx.artifacts.numOperations,
      activePredicateSlots: scenario.ctx.material.predicateTypes.filter((type) => type !== 4).length,
      repetitions: proofs,
      timings: timingReport(timings),
      rawTimings: timings
    });
  }

  const load = [];
  for (const concurrency of concurrencyLevels) {
    console.log(`[load] concurrency=${concurrency}: warm-up x${warmups}, measure x${loadRequests}`);
    const warmupItems = Array.from({ length: warmups }, (_, index) => contexts[index % contexts.length]);
    await runPool(warmupItems, concurrency, (scenario) => proveRequest(scenario.ctx, fixtures, profile));
    const items = Array.from({ length: loadRequests }, (_, index) => contexts[index % contexts.length]);
    const started = Date.now();
    const timings = await runPool(items, concurrency, (scenario) => proveRequest(scenario.ctx, fixtures, profile));
    const wallMs = Date.now() - started;
    load.push({
      concurrency,
      requests: loadRequests,
      wallMs,
      throughputPerSecond: loadRequests / (wallMs / 1000),
      latencyMs: summary(timings.map((item) => item.totalMs)),
      verified: timings.every((item) => item.verified === true),
      rawTimings: timings
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    host: { cpu: os.cpus()[0]?.model || 'unknown', cores: os.cpus().length, node: process.version, platform: os.platform() },
    circuit: { N: 13, M: 11, DEPTH: 64, MERKLE_LEVELS: 8, publicSignals: 5 },
    warmups,
    policyRepetitions: proofs,
    loadRequests,
    policyScenarios,
    load
  };
  fs.writeFileSync(path.join(OUT_DIR, 'policy_scalability_raw.json'), JSON.stringify(report, null, 2));
  const markdown = renderMarkdown(report);
  fs.writeFileSync(path.join(OUT_DIR, 'policy_scalability_raw.md'), markdown);
  console.log(markdown);
}

main().then(
  () => process.stdout.write('', () => process.exit(0)),
  (error) => { console.error(error.stack || error.message); process.exit(1); }
);
