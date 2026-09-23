'use strict';

/*
 * Offline circuit-capacity benchmark for the revision scalability study.
 *
 * Two controlled sweeps are run without touching the frozen RC1 artifacts:
 *   1. DEPTH = 32,64,128 with MERKLE_LEVELS=8 and a mixed policy.
 *   2. MERKLE_LEVELS = 4,8,12,16 with DEPTH=64 and an ontology-heavy policy.
 *
 * Each variant keeps N=13, M=11, K=5, RANGE_BITS=32 and the same five-signal
 * Groth16 interface. Builds live under build/cost_sweep. Raw, reproducible
 * results are written to experiments/results/cost/circuit_capacity_raw.* and
 * are later merged with the policy/load benchmark by
 * scripts/render_scalability_report.js.
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
const MIXED_LOGIC = '(DS OR RS) AND HMB AND US AND TS';
const ONTOLOGY_HEAVY_LOGIC = 'DS AND RS AND POA AND GS AND CC';

function numberList(value, label) {
  const values = [...new Set(String(value).split(',').map(Number))];
  if (!values.length || values.some((item) => !Number.isInteger(item) || item <= 0)) {
    throw new Error(`${label} must be a comma-separated list of positive integers`);
  }
  return values;
}

function parseArgs(argv) {
  const options = { depths: [32, 64, 128], merkleLevels: [4, 8, 12, 16], proofs: 30, skipBuild: false };
  for (const arg of argv) {
    if (arg.startsWith('--depths=')) options.depths = numberList(arg.split('=')[1], 'depths');
    else if (arg.startsWith('--merkle-levels=')) options.merkleLevels = numberList(arg.split('=')[1], 'merkle-levels');
    else if (arg.startsWith('--proofs=')) options.proofs = Number(arg.split('=')[1]);
    else if (arg === '--skip-build') options.skipBuild = true;
  }
  if (!Number.isInteger(options.proofs) || options.proofs < 1) throw new Error('proofs must be a positive integer');
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
    constraints: pick('# of Constraints'), wires: pick('# of Wires'),
    privateInputs: pick('# of Private Inputs'), publicInputs: pick('# of Public Inputs'),
    outputs: pick('# of Outputs'), labels: pick('# of Labels')
  };
}

function ptauFor(constraints) {
  const power = Math.ceil(Math.log2(constraints + 1));
  const candidate = PTAU_FILES.find((item) => item.power >= power);
  if (!candidate) throw new Error(`No local ptau large enough for ${constraints} constraints`);
  const file = path.join(ROOT, 'build', 'circuits', candidate.file);
  if (!fs.existsSync(file)) throw new Error(`Missing ptau ${file}`);
  return { ...candidate, file };
}

function variantDirectory(depth, merkleLevels) {
  return path.join(SWEEP_DIR, merkleLevels === 8 ? `depth_${depth}` : `depth_${depth}_merkle_${merkleLevels}`);
}

function buildVariant(depth, merkleLevels, options) {
  const dir = variantDirectory(depth, merkleLevels);
  fs.mkdirSync(dir, { recursive: true });
  const instance = path.join(dir, 'policy_privacy_main_instance.circom');
  const r1cs = path.join(dir, 'policy_privacy_main_instance.r1cs');
  const zkey = path.join(dir, 'policy_privacy_main_final.zkey');
  const vkey = path.join(dir, 'policy_privacy_main_vk.json');
  const wasm = path.join(dir, 'policy_privacy_main_instance_js', 'policy_privacy_main_instance.wasm');
  const record = { depth, merkleLevels, dir: path.relative(ROOT, dir) };

  if (!options.skipBuild || ![r1cs, zkey, vkey, wasm].every(fs.existsSync)) {
    fs.writeFileSync(instance, [
      'pragma circom 2.0.0;',
      'include "policy_privacy_main.circom";',
      `// Offline capacity benchmark: DEPTH=${depth}, MERKLE_LEVELS=${merkleLevels}.`,
      'component main {',
      '    public [policyCommitment, paramsCommitment, contextHash, requestEpoch]',
      `} = PolicyPrivacyMain(13, 11, ${depth}, 5, ${merkleLevels}, 32);`,
      ''
    ].join('\n'));
    console.log(`[capacity d=${depth} m=${merkleLevels}] compiling`);
    record.compileMs = run(CIRCOM, [instance, '--r1cs', '--wasm', '--sym', '--O2', '-o', dir,
      '-l', path.join(ROOT, 'node_modules'), '-l', path.join(ROOT, 'circuits')]);
    record.r1cs = r1csInfo(r1cs);
    const ptau = ptauFor(record.r1cs.constraints);
    record.ptau = { power: ptau.power, file: path.basename(ptau.file) };
    console.log(`[capacity d=${depth} m=${merkleLevels}] ${record.r1cs.constraints} constraints; setup 2^${ptau.power}`);
    record.setupMs = run(SNARKJS, ['groth16', 'setup', r1cs, ptau.file, zkey]);
    run(SNARKJS, ['zkey', 'export', 'verificationkey', zkey, vkey]);
  } else {
    record.r1cs = r1csInfo(r1cs);
  }
  record.zkeyBytes = fs.statSync(zkey).size;
  record.wasmBytes = fs.statSync(wasm).size;
  return record;
}

function proveVariant(depth, merkleLevels, dir, proofs, logic) {
  console.log(`[capacity d=${depth} m=${merkleLevels}] proving x${proofs}: ${logic}`);
  const child = spawnSync(process.execPath, [path.join(__dirname, 'circuit_cost_sweep_prove.js'), `--count=${proofs}`, `--logic=${logic}`], {
    env: {
      ...process.env,
      PROTOCOL_CIRCUITS_DIR: path.resolve(ROOT, dir),
      PROTOCOL_CIRCUIT_DEPTH: String(depth),
      PROTOCOL_MERKLE_LEVELS: String(merkleLevels)
    },
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024
  });
  if (child.status !== 0) throw new Error(`prove child failed for d=${depth}, m=${merkleLevels}:\n${child.stderr}`);
  return JSON.parse(child.stdout.trim().split('\n').pop());
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function timingSummary(timings, key) {
  const values = timings.map((item) => item[key]).filter(Number.isFinite);
  return { median: quantile(values, 0.5), p25: quantile(values, 0.25), p75: quantile(values, 0.75), p95: quantile(values, 0.95) };
}

function benchmarkRow(kind, depth, merkleLevels, logic, options) {
  const build = buildVariant(depth, merkleLevels, options);
  const proof = proveVariant(depth, merkleLevels, build.dir, options.proofs, logic);
  if (!proof.timings.every((item) => item.verified === true)) throw new Error(`Unverified proof in ${kind} row`);
  return {
    kind, ...build, logic, tokens: proof.tokens, numOperations: proof.numOperations,
    proofs: proof.timings.length, backend: proof.timings[0]?.backend || null,
    witnessMs: timingSummary(proof.timings, 'witnessMs'),
    proveMs: timingSummary(proof.timings, 'proveMs'),
    verifyMs: timingSummary(proof.timings, 'verifyMs'), timings: proof.timings
  };
}

function rc1Reference() {
  if (!fs.existsSync(RC1_MANIFEST)) return null;
  const circuit = JSON.parse(fs.readFileSync(RC1_MANIFEST, 'utf8')).circuit || {};
  return { parameters: circuit.parameters || null, r1cs: circuit.r1cs || null, optimization: circuit.optimization || null };
}

function renderRows(title, rows) {
  const lines = [
    `## ${title}`, '',
    '| DEPTH | Merkle levels | Constraints | zkey MB | WASM MB | Witness ms median/p95 | Prove ms median/p95 | Verify ms median/p95 | Proofs |',
    '|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
  ];
  for (const row of rows) {
    lines.push(`| ${row.depth} | ${row.merkleLevels} | ${row.r1cs.constraints.toLocaleString('en-US')} | ` +
      `${(row.zkeyBytes / 1e6).toFixed(1)} | ${(row.wasmBytes / 1e6).toFixed(1)} | ` +
      `${row.witnessMs.median.toFixed(0)}/${row.witnessMs.p95.toFixed(0)} | ` +
      `${row.proveMs.median.toFixed(0)}/${row.proveMs.p95.toFixed(0)} | ` +
      `${row.verifyMs.median.toFixed(0)}/${row.verifyMs.p95.toFixed(0)} | ${row.proofs} |`);
  }
  return lines;
}

function renderMarkdown(report) {
  return [
    '# Circuit capacity scalability benchmark', '',
    `Host: ${report.host.cpu} (${report.host.cores} cores), Node ${report.host.node}; backend ${report.depthSweep[0]?.backend || 'n/a'}.`,
    'Every row keeps N=13, M=11, K=5, RANGE_BITS=32 and five public signals.',
    'The setups are benchmark-grade and do not replace the frozen RC1 artifacts.', '',
    ...renderRows('Program-length capacity', report.depthSweep), '',
    ...renderRows('Merkle capacity', report.merkleSweep), '',
    `Depth policy: \`${MIXED_LOGIC}\`.`,
    `Merkle policy: \`${ONTOLOGY_HEAVY_LOGIC}\`.`
  ].join('\n') + '\n';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const depthSweep = options.depths.map((depth) => benchmarkRow('depth', depth, 8, MIXED_LOGIC, options));
  const merkleSweep = options.merkleLevels.map((levels) => benchmarkRow('merkle', 64, levels, ONTOLOGY_HEAVY_LOGIC, options));
  const report = {
    generatedAt: new Date().toISOString(),
    host: { cpu: os.cpus()[0]?.model || 'unknown', cores: os.cpus().length, node: process.version, platform: os.platform() },
    fixedParameters: { N: 13, M: 11, K: 5, RANGE_BITS: 32, publicSignals: 5 },
    repetitions: options.proofs, rc1: rc1Reference(), depthSweep, merkleSweep
  };
  fs.writeFileSync(path.join(OUT_DIR, 'circuit_capacity_raw.json'), JSON.stringify(report, null, 2));
  const markdown = renderMarkdown(report);
  fs.writeFileSync(path.join(OUT_DIR, 'circuit_capacity_raw.md'), markdown);
  console.log(markdown);
}

main();
