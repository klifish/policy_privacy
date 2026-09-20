'use strict';

/*
 * Offline circuit-cost sweep over the policy program length DEPTH.
 *
 * For each DEPTH the script instantiates PolicyPrivacyMain(13, 11, DEPTH, 5, 8, 32)
 * (N, M, K, MERKLE_LEVELS and RANGE_BITS as in the RC1 instance), compiles it with
 * the same --O2 flag as scripts/build_protocol_release.js,
 * reads the R1CS size, runs a benchmark-grade Groth16 setup against the local
 * powers-of-tau file, and times witness generation and proving for a
 * representative DUO V3 policy through the same prover the TPS uses
 * (scripts/circuit_cost_sweep_prove.js). Nothing here touches the RC1 release
 * artifacts or the chain: Groth16 verification cost depends only on the number
 * of public signals (fixed at 5), so on-chain gas is invariant in DEPTH.
 *
 *   node scripts/circuit_cost_sweep.js [--depths=32,64,128] [--proofs=5] [--skip-build]
 *
 * Output: experiments/results/cost/circuit_depth_sweep.{json,md}
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SWEEP_DIR = path.join(ROOT, 'build', 'cost_sweep');
const OUT_DIR = path.join(ROOT, 'experiments', 'results', 'cost');
const CIRCOM = path.join(ROOT, 'node_modules', '.bin', 'circom2');
const SNARKJS = path.join(ROOT, 'node_modules', '.bin', 'snarkjs');
const PTAU_FILES = [
  { power: 16, file: 'powersOfTau28_hez_final_16.ptau' },
  { power: 18, file: 'powersOfTau28_hez_final_18.ptau' },
  { power: 20, file: 'ppot_0080_20.ptau' }
];
const RC1_MANIFEST = path.join(ROOT, 'protocol', 'releases', 'v3.0.0-rc1.json');

function parseArgs(argv) {
  const options = { depths: [32, 64, 128], proofs: 5, skipBuild: false };
  for (const arg of argv) {
    if (arg.startsWith('--depths=')) options.depths = arg.split('=')[1].split(',').map(Number);
    else if (arg.startsWith('--proofs=')) options.proofs = Number(arg.split('=')[1]);
    else if (arg === '--skip-build') options.skipBuild = true;
  }
  return options;
}

function run(cmd, args, opts = {}) {
  const started = Date.now();
  execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024, ...opts });
  return Date.now() - started;
}

function r1csInfo(r1csPath) {
  const out = execFileSync(SNARKJS, ['r1cs', 'info', r1csPath], { encoding: 'utf8' });
  const pick = (label) => {
    const match = out.match(new RegExp(`${label}:\\s*(\\d+)`));
    return match ? Number(match[1]) : null;
  };
  return {
    constraints: pick('# of Constraints'),
    wires: pick('# of Wires'),
    privateInputs: pick('# of Private Inputs'),
    publicInputs: pick('# of Public Inputs'),
    outputs: pick('# of Outputs'),
    labels: pick('# of Labels')
  };
}

function ptauFor(constraints) {
  const power = Math.ceil(Math.log2(constraints + 1));
  const candidate = PTAU_FILES.find((p) => p.power >= power);
  if (!candidate) throw new Error(`No local ptau large enough for ${constraints} constraints`);
  const file = path.join(ROOT, 'build', 'circuits', candidate.file);
  if (!fs.existsSync(file)) throw new Error(`Missing ptau ${file}`);
  return { ...candidate, file };
}

function buildDepth(depth, options) {
  const dir = path.join(SWEEP_DIR, `depth_${depth}`);
  fs.mkdirSync(dir, { recursive: true });
  const instance = path.join(dir, 'policy_privacy_main_instance.circom');
  const r1cs = path.join(dir, 'policy_privacy_main_instance.r1cs');
  const zkey = path.join(dir, 'policy_privacy_main_final.zkey');
  const vkey = path.join(dir, 'policy_privacy_main_vk.json');
  const record = { depth, dir };

  if (!options.skipBuild || !fs.existsSync(zkey)) {
    fs.writeFileSync(instance, [
      'pragma circom 2.0.0;',
      'include "policy_privacy_main.circom";',
      `// Cost-sweep instance: RC1 parameters with DEPTH=${depth}.`,
      'component main {',
      '    public [policyCommitment, paramsCommitment, contextHash, requestEpoch]',
      `} = PolicyPrivacyMain(13, 11, ${depth}, 5, 8, 32);`,
      ''
    ].join('\n'));
    console.log(`[depth ${depth}] compiling`);
    record.compileMs = run(CIRCOM, [instance, '--r1cs', '--wasm', '--sym', '--O2', '-o', dir,
      '-l', path.join(ROOT, 'node_modules'), '-l', path.join(ROOT, 'circuits')]);
    record.r1cs = r1csInfo(r1cs);
    const ptau = ptauFor(record.r1cs.constraints);
    record.ptau = { power: ptau.power, file: path.basename(ptau.file) };
    console.log(`[depth ${depth}] ${record.r1cs.constraints} constraints; groth16 setup with 2^${ptau.power} ptau`);
    record.setupMs = run(SNARKJS, ['groth16', 'setup', r1cs, ptau.file, zkey]);
    run(SNARKJS, ['zkey', 'export', 'verificationkey', zkey, vkey]);
  } else {
    record.r1cs = r1csInfo(r1cs);
  }
  record.zkeyBytes = fs.statSync(zkey).size;
  record.wasmBytes = fs.statSync(path.join(dir, 'policy_privacy_main_instance_js', 'policy_privacy_main_instance.wasm')).size;
  return record;
}

function proveDepth(depth, dir, proofs) {
  console.log(`[depth ${depth}] proving x${proofs}`);
  const child = spawnSync(process.execPath, [path.join(__dirname, 'circuit_cost_sweep_prove.js'), `--count=${proofs}`], {
    env: { ...process.env, PROTOCOL_CIRCUITS_DIR: dir, PROTOCOL_CIRCUIT_DEPTH: String(depth) },
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  if (child.status !== 0) {
    throw new Error(`prove child failed at DEPTH=${depth}:\n${child.stderr}`);
  }
  const line = child.stdout.trim().split('\n').pop();
  return JSON.parse(line);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rc1Reference() {
  if (!fs.existsSync(RC1_MANIFEST)) return null;
  const manifest = JSON.parse(fs.readFileSync(RC1_MANIFEST, 'utf8'));
  const circuit = manifest.circuit || {};
  return { parameters: circuit.parameters || null, r1cs: circuit.r1cs || null, optimization: circuit.optimization || null };
}

function renderMarkdown(report) {
  const lines = [
    '# Circuit cost sweep over DEPTH',
    '',
    `Host: ${report.host.cpu} (${report.host.cores} cores), Node ${report.host.node}, prover backend ${report.rows[0]?.backend || 'n/a'}.`,
    'N=13, M=11, K=5, MERKLE_LEVELS=8, RANGE_BITS=32 fixed (RC1 parameters); only DEPTH varies.',
    'Groth16 setup is benchmark-grade (no ceremony). Verification cost is independent of DEPTH: the',
    'statement keeps 5 public signals, so on-chain verifier gas and the padded access/commit gas do not change.',
    '',
    '| DEPTH | constraints | wires | zkey (MB) | wasm (MB) | witness ms (median) | prove ms (median) | verify ms (median) | proofs |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for (const row of report.rows) {
    lines.push(`| ${row.depth} | ${row.r1cs.constraints.toLocaleString('en-US')} | ${row.r1cs.wires.toLocaleString('en-US')} | ` +
      `${(row.zkeyBytes / 1e6).toFixed(1)} | ${(row.wasmBytes / 1e6).toFixed(1)} | ${row.witnessMsMedian.toFixed(0)} | ` +
      `${row.proveMsMedian.toFixed(0)} | ${row.verifyMsMedian.toFixed(0)} | ${row.proofs} |`);
  }
  lines.push('');
  if (report.rc1) {
    lines.push(`RC1 release reference (DEPTH=64, ${report.rc1.optimization}): ${JSON.stringify(report.rc1.r1cs)}`);
    lines.push('');
  }
  lines.push(`Representative policy: \`${report.rows[0]?.logic}\` (${report.rows[0]?.tokens} tokens at DEPTH=${report.rows[0]?.depth}).`);
  return lines.join('\n') + '\n';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const rows = [];
  for (const depth of options.depths) {
    const build = buildDepth(depth, options);
    const proof = proveDepth(depth, build.dir, options.proofs);
    rows.push({
      ...build,
      logic: proof.logic, tokens: proof.tokens, numOperations: proof.numOperations,
      proofs: proof.timings.length,
      backend: proof.timings[0].backend,
      witnessMsMedian: median(proof.timings.map((t) => t.witnessMs)),
      proveMsMedian: median(proof.timings.map((t) => t.proveMs)),
      verifyMsMedian: median(proof.timings.map((t) => t.verifyMs)),
      timings: proof.timings
    });
  }
  const report = {
    generatedAt: new Date().toISOString(),
    host: { cpu: os.cpus()[0]?.model || 'unknown', cores: os.cpus().length, node: process.version, platform: os.platform() },
    fixedParameters: { N: 13, M: 11, K: 5, MERKLE_LEVELS: 8, RANGE_BITS: 32, publicSignals: 5 },
    rc1: rc1Reference(),
    rows
  };
  fs.writeFileSync(path.join(OUT_DIR, 'circuit_depth_sweep.json'), JSON.stringify(report, null, 2));
  const markdown = renderMarkdown(report);
  fs.writeFileSync(path.join(OUT_DIR, 'circuit_depth_sweep.md'), markdown);
  console.log(markdown);
}

main();
