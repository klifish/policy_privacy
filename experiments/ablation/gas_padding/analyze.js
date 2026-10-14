'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const { verifyAblation } = require('./verify');

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    rootDir: path.resolve(__dirname, 'polygonAmoy'),
    concurrency: 1,
    seeds: 30,
    bootstrapIterations: 500
  };
  for (const arg of argv) {
    if (arg.startsWith('--root-dir=')) options.rootDir = path.resolve(arg.split('=')[1]);
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.split('=')[1]);
    else if (arg.startsWith('--seeds=')) options.seeds = Number(arg.split('=')[1]);
    else if (arg.startsWith('--bootstrap-iterations=')) options.bootstrapIterations = Number(arg.split('=')[1]);
    // The ablation compares AUCs; a low count only shortens the per-seed
    // permutation tests, whose significance columns are then not meaningful.
    else if (arg.startsWith('--permutation-iterations=')) options.permutationIterations = Number(arg.split('=')[1]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function run(command, args, { allowVerdictFailure = false, expectedFile = null } = {}) {
  console.log(`\n$ ${[command, ...args].join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (!allowVerdictFailure || !expectedFile || !fs.existsSync(expectedFile)) {
      throw new Error(`Command failed with status ${result.status}: ${command}`);
    }
    console.log(`Command returned ${result.status} because the privacy verdict was not PASS; report exists and will be compared.`);
  }
}

function pythonExecutable() {
  const venv = path.resolve(__dirname, '../../../.venv/bin/python');
  return fs.existsSync(venv) ? venv : 'python3';
}

function analyzeProfile(rootDir, profile, options) {
  const unifiedDir = path.join(rootDir, profile);
  const outputBase = path.join(rootDir, 'comparison', 'supervised', profile);
  const common = [
    '--use-unified-dataset',
    '--unified-dir', unifiedDir,
    '--phase', '2',
    '--multiseed-seeds', String(options.seeds),
    '--concurrency', String(options.concurrency),
    '--include-seed-records',
    ...(options.permutationIterations ? ['--permutation-iterations', String(options.permutationIterations)] : [])
  ];
  const jobs = [
    {
      script: 'experiments/analysis/crosscheck/pch/run_experiment.js',
      name: 'pch',
      report: 'evaluation_report.json',
      extra: []
    },
    {
      script: 'experiments/analysis/crosscheck/pi/run_experiment.js',
      name: 'pi',
      report: 'pi_report.json',
      extra: []
    },
    {
      script: 'experiments/analysis/crosscheck/spp/run_experiment.js',
      name: 'spp',
      report: 'report.json',
      extra: ['--balance-method', 'undersample']
    }
  ];
  for (const job of jobs) {
    const output = path.join(outputBase, job.name);
    const expectedFile = path.join(output, job.report);
    run('node', [job.script, ...common, '--output', output, ...job.extra], {
      allowVerdictFailure: true,
      expectedFile
    });
  }

  const clusteringBase = path.join(rootDir, 'comparison', 'clustering', profile);
  run(pythonExecutable(), [
    '-m', 'experiments.analysis.clustering.run_all_clustering',
    '--source-dir', unifiedDir,
    '--work-dir', path.join(clusteringBase, 'work'),
    '--results-dir', path.join(clusteringBase, 'results')
  ]);
}

function main() {
  const options = parseArgs();
  verifyAblation(options.rootDir);
  for (const profile of ['b1_unpadded', 'b2_padded']) {
    analyzeProfile(options.rootDir, profile, options);
  }
  run(pythonExecutable(), [
    path.join(__dirname, 'compare.py'),
    '--root-dir', options.rootDir,
    '--bootstrap-iterations', String(options.bootstrapIterations)
  ]);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

module.exports = { analyzeProfile };
