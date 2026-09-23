'use strict';

/* Merge the raw capacity and policy/load benchmarks into the revision's
 * source-of-record scalability report. No benchmark is executed here. */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'experiments', 'results', 'cost');
const CAPACITY_PATH = path.join(OUT_DIR, 'circuit_capacity_raw.json');
const POLICY_PATH = path.join(OUT_DIR, 'policy_scalability_raw.json');
const OUTPUT_JSON = path.join(OUT_DIR, 'scalability_sweep.json');
const OUTPUT_MD = path.join(OUT_DIR, 'scalability_sweep.md');
const ACCESS_GAS = 1_056_674;
const COMMIT_GAS = 304_098;
const GAS_PRICE_GWEI = 30;
const DAILY_ACCESS_SCENARIOS = [1_000, 10_000, 100_000];

function readJson(file) {
  if (!fs.existsSync(file)) throw new Error(`Missing benchmark result: ${file}`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function workloadRows(sustainableThroughput) {
  return DAILY_ACCESS_SCENARIOS.map((accessesPerDay) => {
    const averageRequestsPerSecond = accessesPerDay / 86_400;
    const accessGasPerDay = accessesPerDay * ACCESS_GAS;
    return {
      accessesPerDay,
      averageRequestsPerSecond,
      accessGasPerDay,
      accessPolPerDayAt30Gwei: accessGasPerDay * GAS_PRICE_GWEI * 1e-9,
      tpsInstancesWith50PercentHeadroom: Math.max(1, Math.ceil((averageRequestsPerSecond * 1.5) / sustainableThroughput))
    };
  });
}

function f0(value) { return Number(value).toFixed(0); }
function f2(value) { return Number(value).toFixed(2); }
function f3(value) { return Number(value).toFixed(3); }

function render(report) {
  const lines = [
    '# Scalability study source of record', '',
    `Generated: ${report.generatedAt}`, '',
    '## Circuit capacity', '',
    '| Sweep | DEPTH | Merkle levels | Constraints | zkey MB | Witness ms median/p95 | Prove ms median/p95 |',
    '|---|---:|---:|---:|---:|---:|---:|'
  ];
  for (const row of [...report.capacity.depthSweep, ...report.capacity.merkleSweep]) {
    lines.push(`| ${row.kind} | ${row.depth} | ${row.merkleLevels} | ${row.r1cs.constraints.toLocaleString('en-US')} | ` +
      `${(row.zkeyBytes / 1e6).toFixed(1)} | ${f0(row.witnessMs.median)}/${f0(row.witnessMs.p95)} | ` +
      `${f0(row.proveMs.median)}/${f0(row.proveMs.p95)} |`);
  }
  lines.push('', '## Fixed-circuit policy complexity', '',
    '| Policy | Tokens | Active slots | Total ms median/p95 | Prove ms median/p95 |',
    '|---|---:|---:|---:|---:|');
  for (const row of report.policy.policyScenarios) {
    lines.push(`| ${row.label} | ${row.tokens} | ${row.activePredicateSlots} | ` +
      `${f0(row.timings.totalMs.median)}/${f0(row.timings.totalMs.p95)} | ` +
      `${f0(row.timings.proveMs.median)}/${f0(row.timings.proveMs.p95)} |`);
  }
  lines.push('', '## TPS load', '',
    '| Concurrency | Requests | Throughput proofs/s | Latency ms median/p95 |',
    '|---:|---:|---:|---:|');
  for (const row of report.policy.load) {
    lines.push(`| ${row.concurrency} | ${row.requests} | ${f3(row.throughputPerSecond)} | ` +
      `${f0(row.latencyMs.median)}/${f0(row.latencyMs.p95)} |`);
  }
  lines.push('', '## Scenario-based daily workload', '',
    '| Accesses/day | Average requests/s | Access gas/day | POL/day at 30 gwei | TPS instances (+50% headroom) |',
    '|---:|---:|---:|---:|---:|');
  for (const row of report.workload.scenarios) {
    lines.push(`| ${row.accessesPerDay.toLocaleString('en-US')} | ${f3(row.averageRequestsPerSecond)} | ` +
      `${row.accessGasPerDay.toLocaleString('en-US')} | ${f2(row.accessPolPerDayAt30Gwei)} | ` +
      `${row.tpsInstancesWith50PercentHeadroom} |`);
  }
  lines.push('', `One policy commit is ${COMMIT_GAS.toLocaleString('en-US')} gas, or ` +
    `${f3(COMMIT_GAS * GAS_PRICE_GWEI * 1e-9)} POL at 30 gwei; it is reported separately because no commit/access ratio is assumed.`, '',
    'The workload rows are scenarios, not measurements of a hospital trace or public-chain throughput.');
  return lines.join('\n') + '\n';
}

function main() {
  const capacity = readJson(CAPACITY_PATH);
  const policy = readJson(POLICY_PATH);
  const sustainableThroughput = Math.max(...policy.load.map((row) => row.throughputPerSecond));
  const report = {
    generatedAt: new Date().toISOString(),
    capacity,
    policy,
    workload: {
      accessGas: ACCESS_GAS,
      commitGas: COMMIT_GAS,
      gasPriceGwei: GAS_PRICE_GWEI,
      sustainableThroughputProofsPerSecond: sustainableThroughput,
      headroomFraction: 0.5,
      scenarios: workloadRows(sustainableThroughput)
    }
  };
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2));
  const markdown = render(report);
  fs.writeFileSync(OUTPUT_MD, markdown);
  console.log(markdown);
}

main();
