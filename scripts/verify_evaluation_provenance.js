'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const outputArg = args.find(arg => arg.startsWith('--output='));
const outputPath = outputArg ? path.resolve(repoRoot, outputArg.slice('--output='.length)) : null;
const unknownArgs = args.filter(arg => !arg.startsWith('--output='));

if (unknownArgs.length > 0) {
  console.error(`Unknown arguments: ${unknownArgs.join(', ')}`);
  process.exit(2);
}

const featureKeys = [
  'commitGasUsed',
  'commitCalldataLength',
  'accessGasUsed',
  'accessCalldataLength',
  'proofSize',
  'commitLogsCount',
  'commitLogsSize',
  'accessLogsCount',
  'accessLogsSize'
];
const gasKeys = new Set(['commitGasUsed', 'accessGasUsed']);
const expectedCriterion = {
  seeds: 30,
  aucMax: 0.55,
  permAlpha: 0.05,
  sigFractionMax: 0.5,
  minTestSamples: 20
};
const experiments = {
  pch: {
    taskCount: 20,
    dataset: 'experiments/data/polygonAmoy/pch_dataset.json',
    pythonVerdict: 'experiments/results/supervised/pch_supervised_verdict.json',
    jsReport: 'experiments/results/crosscheck/pch/polygonAmoy/evaluation_report.json',
    comparison: 'experiments/results/supervised/pch_js_comparison.json',
    table: 'paper_mdpi/tables/tab_pch_terms.tex'
  },
  pi: {
    // Three designed pair types; captures before the PI layer pooled four scopes.
    taskCount: 3,
    dataset: 'experiments/data/polygonAmoy/pi_dataset.json',
    pythonVerdict: 'experiments/results/supervised/pi_supervised_verdict.json',
    jsReport: 'experiments/results/crosscheck/pi/polygonAmoy/pi_report.json',
    comparison: 'experiments/results/supervised/pi_js_comparison.json',
    table: 'paper_mdpi/tables/tab_pi_pairs.tex'
  },
  spp: {
    taskCount: 21,
    dataset: 'experiments/data/polygonAmoy/spp_dataset.json',
    pythonVerdict: 'experiments/results/supervised/spp_supervised_verdict.json',
    jsReport: 'experiments/results/crosscheck/spp/polygonAmoy/report.json',
    comparison: 'experiments/results/supervised/spp_js_comparison.json',
    table: 'paper_mdpi/tables/tab_spp_contrasts.tex'
  }
};

const errors = [];
const warnings = [];

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}

function requireFile(relativePath) {
  const filePath = absolute(relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`Missing ${relativePath}`);
    return null;
  }
  return filePath;
}

function readJson(relativePath) {
  const filePath = requireFile(relativePath);
  if (!filePath) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function git(argsForGit) {
  try {
    return execFileSync('git', argsForGit, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch (_error) {
    return null;
  }
}

function normalizeCriterion(criterion = {}) {
  return {
    seeds: criterion.seeds,
    aucMax: criterion.aucMax,
    permAlpha: criterion.permAlpha,
    sigFractionMax: criterion.sigFractionMax,
    minTestSamples: criterion.minTestSamples
  };
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function tasksOf(verdict) {
  return verdict?.tasks || verdict?.contrasts || [];
}

function taskKey(task) {
  const key = String(task?.key || `${task?.target}:${task?.class0}/${task?.class1}`);
  // JS and Python order the two classes of an SPP contrast differently
  // (`paramType: none/large` vs `paramType: large/none`); match on the sorted
  // pair, as compare_with_js_verdict.py does.
  const [prefix, rest] = key.split(': ');
  if (rest && rest.split('/').length === 2) {
    return `${prefix}: ${rest.split('/').sort().join('/')}`;
  }
  return key;
}

function compareVerdicts(pythonVerdict, jsVerdict, expectedTaskCount) {
  if (!pythonVerdict || !jsVerdict) return false;
  const pythonTasks = new Map(tasksOf(pythonVerdict).map(task => [taskKey(task), task]));
  const jsTasks = new Map(tasksOf(jsVerdict).map(task => [taskKey(task), task]));
  if (pythonTasks.size !== expectedTaskCount || jsTasks.size !== expectedTaskCount) return false;
  if (pythonVerdict.overallPassed !== jsVerdict.overallPassed) return false;
  if (!equalJson(normalizeCriterion(pythonVerdict.criterion), normalizeCriterion(jsVerdict.criterion))) return false;
  for (const [key, pythonTask] of pythonTasks) {
    const jsTask = jsTasks.get(key);
    if (!jsTask) return false;
    if (pythonTask.passed !== jsTask.passed || pythonTask.nonGating !== jsTask.nonGating) return false;
  }
  return true;
}

const GAS_DECOMPOSITION = 'experiments/results/supervised/gas_decomposition_diagnostic.json';
const VALUE_GATE = 'experiments/results/value_gate/b1_unpadded/calldata_value_gate.json';

// Tasks on which the JS cross-check FAILs a task that the Python of-record
// verdict passes, explained by the gas decomposition diagnostic: the of-record
// protocol passes once the calldata cost is removed from both gas features, so
// what the JS attack picks up is carried by calldata values, and the calldata
// value gate, which tests every calldata value directly, passes on the same
// capture. Returns null when any mismatch is not of this kind.
function explainedMismatches(name, pythonVerdict, jsVerdict, datasetPath) {
  if (!pythonVerdict || !jsVerdict) return null;
  const jsTasks = new Map(tasksOf(jsVerdict).map(task => [taskKey(task), task]));
  const mismatched = tasksOf(pythonVerdict).filter(pythonTask => {
    const jsTask = jsTasks.get(taskKey(pythonTask));
    return !jsTask || pythonTask.passed !== jsTask.passed || !!pythonTask.nonGating !== !!jsTask.nonGating;
  });
  if (mismatched.length === 0) return null;
  const diagnostic = readJson(GAS_DECOMPOSITION);
  const gate = readJson(VALUE_GATE);
  const experiment = diagnostic?.experiments?.[name];
  if (!experiment || gate?.passed !== true) return null;
  if (!datasetPath || experiment.datasetSha256 !== sha256(datasetPath)) return null;
  const explained = [];
  for (const pythonTask of mismatched) {
    const jsTask = jsTasks.get(taskKey(pythonTask));
    const entry = experiment.tasks?.[pythonTask.key];
    if (pythonTask.passed !== true || jsTask?.passed !== false || entry?.executionOnly?.passed !== true) return null;
    explained.push(pythonTask.key);
  }
  return explained;
}

function featureCardinality(rows, key) {
  return new Set(rows.map(row => row?.features?.[key])).size;
}

function validateMarkdownLinks(relativePath) {
  const filePath = requireFile(relativePath);
  if (!filePath) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const target = match[1].trim();
    if (/^(?:https?:|mailto:|#)/.test(target)) continue;
    const pathOnly = target.split('#')[0];
    if (!pathOnly) continue;
    const resolved = path.resolve(path.dirname(filePath), pathOnly);
    if (!fs.existsSync(resolved)) {
      errors.push(`Broken link in ${relativePath}: ${target}`);
    }
  }
}

const metadata = readJson('experiments/data/polygonAmoy/metadata.json');
const currentCommit = git(['rev-parse', 'HEAD']);
const currentBranch = git(['branch', '--show-current']);
const artifactCommit = git([
  'log', '-1', '--format=%H', '--',
  'experiments/data/polygonAmoy'
]) || git([
  'log', '-1', '--format=%H', '--',
  'experiments/unified/artifacts_data/polygonAmoy'
]);
const latestImplementationChange = git([
  'log', '-1', '--format=%H %cI', '--',
  'circuits', 'contracts', 'experiments/core', 'experiments/capture', 'tps'
]);

const manifest = {
  schemaVersion: 1,
  checkedAt: new Date().toISOString(),
  repository: {
    branch: currentBranch,
    commit: currentCommit,
    dirty: Boolean(git(['status', '--porcelain'])),
    artifactCommit,
    latestImplementationChange
  },
  dataset: {
    generatedAt: metadata?.generatedAt || null,
    seed: metadata?.seed || null,
    policyCount: metadata?.policyCount || null,
    featureKeys,
    experiments: {}
  },
  verdicts: {},
  clustering: {},
  errors,
  warnings
};

for (const [name, config] of Object.entries(experiments)) {
  const datasetPath = requireFile(config.dataset);
  const dataset = datasetPath ? readJson(config.dataset) : null;
  if (dataset && !Array.isArray(dataset)) {
    errors.push(`${config.dataset} must contain a JSON array`);
  }

  const cardinality = {};
  if (Array.isArray(dataset)) {
    for (const key of featureKeys) cardinality[key] = featureCardinality(dataset, key);
    const unexpectedVariable = featureKeys.filter(key => cardinality[key] > 1 && !gasKeys.has(key));
    if (unexpectedVariable.length > 0) {
      errors.push(`${config.dataset} has unexpected variable transcript features: ${unexpectedVariable.join(', ')}`);
    }
  }

  manifest.dataset.experiments[name] = {
    path: config.dataset,
    sha256: datasetPath ? sha256(datasetPath) : null,
    records: Array.isArray(dataset) ? dataset.length : null,
    featureCardinality: cardinality
  };

  const pythonVerdict = readJson(config.pythonVerdict);
  const jsReport = readJson(config.jsReport);
  const jsVerdict = jsReport?.multiseedVerdict;
  const comparison = readJson(config.comparison);
  const pythonTasks = tasksOf(pythonVerdict);
  const jsTasks = tasksOf(jsVerdict);
  // PCH and SPP run every task once per access outcome when the capture has
  // granted and denied executions.
  const stratified = name !== 'pi' && pythonTasks.some(task => task.outcome);
  const designedPi = name === 'pi' && pythonTasks.some(task => task.positiveControl);
  const taskCount = name === 'pi' && !designedPi ? 4 : config.taskCount * (stratified ? 2 : 1);
  const liveMatch = compareVerdicts(pythonVerdict, jsVerdict, taskCount);

  if (pythonVerdict && !equalJson(normalizeCriterion(pythonVerdict.criterion), expectedCriterion)) {
    errors.push(`${config.pythonVerdict} does not use the MDPI 30-seed verdict criterion`);
  }
  if (pythonVerdict && pythonVerdict.criterion?.permIters !== 500) {
    errors.push(`${config.pythonVerdict} must use 500 permutation iterations`);
  }
  if (pythonVerdict && pythonTasks.length !== taskCount) {
    errors.push(`${config.pythonVerdict} has ${pythonTasks.length} tasks; expected ${taskCount}`);
  }
  if (!jsVerdict) {
    errors.push(`${config.jsReport} has no multiseedVerdict`);
  } else if (jsTasks.length !== taskCount) {
    errors.push(`${config.jsReport} has ${jsTasks.length} tasks; expected ${taskCount}`);
  }
  // A Python/JS disagreement on a task is an error unless it is a JS FAIL on a
  // task the Python of-record verdict passes and the gas decomposition
  // diagnostic explains it (see explainedMismatches). The task stays PASS of
  // record; the diagnostic only explains the JS FAIL.
  const explained = explainedMismatches(name, pythonVerdict, jsVerdict, datasetPath);
  if (comparison && comparison.matches !== true) {
    const message = `${config.comparison} reports a Python/JS verdict mismatch`;
    (explained ? warnings : errors).push(explained ? `${message} (explained by gas decomposition: ${explained.join(', ')})` : message);
  }
  if (!liveMatch) {
    const message = `${name} Python/JS verdicts differ when checked directly`;
    (explained ? warnings : errors).push(explained ? `${message} (explained by gas decomposition: ${explained.join(', ')})` : message);
  }

  const tablePath = requireFile(config.table);
  if (tablePath) {
    const table = fs.readFileSync(tablePath, 'utf8');
    if (!table.includes(config.pythonVerdict)) {
      errors.push(`${config.table} does not cite ${config.pythonVerdict}`);
    }
  }

  manifest.verdicts[name] = {
    sourceOfRecord: config.pythonVerdict,
    crossCheck: config.jsReport,
    taskCount: pythonTasks.length,
    pythonOverallPassed: pythonVerdict?.overallPassed,
    jsOverallPassed: jsVerdict?.overallPassed,
    comparisonArtifactMatches: comparison?.matches,
    liveMatch,
    criterion: pythonVerdict?.criterion || null,
    jsPermutationIterations: jsVerdict?.criterion?.permutationIterations ?? null
  };
}

const summaryTable = requireFile('paper_mdpi/tables/tab_privacy_summary.tex');
if (summaryTable) {
  const content = fs.readFileSync(summaryTable, 'utf8');
  for (const config of Object.values(experiments)) {
    if (!content.includes(config.pythonVerdict)) {
      errors.push(`paper_mdpi/tables/tab_privacy_summary.tex does not cite ${config.pythonVerdict}`);
    }
  }
}

// Clustering runs once per access outcome for captures with both outcomes.
const clusteringFiles = [
  'pch/pch_global_duo_clustering.csv',
  'pch/pch_global_icd10_clustering.csv',
  'pi/pi_balanced_debiased.csv',
  'spp/spp_clustering_summary.csv'
];
const clusteringRoot = 'experiments/results/clustering';
const clusteringStrata = fs.existsSync(absolute(`${clusteringRoot}/granted`)) ? ['granted/', 'denied/'] : [''];
const clusteringOutputs = clusteringStrata.flatMap(
  stratum => clusteringFiles.map(file => `${clusteringRoot}/${stratum}${file}`)
);
for (const relativePath of clusteringOutputs) {
  const filePath = requireFile(relativePath);
  manifest.clustering[relativePath] = filePath ? {
    sha256: sha256(filePath),
    bytes: fs.statSync(filePath).size
  } : null;
  if (filePath && fs.statSync(filePath).size === 0) {
    errors.push(`Empty clustering output: ${relativePath}`);
  }
}

for (const document of [
  'README.md',
  'docs/EXPERIMENT_PIPELINE.md',
  'experiments/README.md',
  'experiments/docs/README.md',
  'experiments/analysis/supervised/README.md'
]) {
  validateMarkdownLinks(document);
}

if (metadata?.generatedAt && latestImplementationChange) {
  const latestDate = latestImplementationChange.split(' ')[1];
  if (latestDate && new Date(latestDate) > new Date(metadata.generatedAt)) {
    warnings.push(
      `The Amoy capture (${metadata.generatedAt}) predates the latest implementation change (${latestDate}); ` +
      'offline analysis does not make it a capture of the current implementation.'
    );
  }
}

if (outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Provenance manifest written to ${path.relative(repoRoot, outputPath)}`);
}

console.log(`Evaluation provenance: ${errors.length} error(s), ${warnings.length} warning(s)`);
console.log(`  branch/commit: ${currentBranch || 'unknown'} ${currentCommit?.slice(0, 12) || 'unknown'}${manifest.repository.dirty ? ' (dirty)' : ''}`);
console.log(`  Amoy generated: ${metadata?.generatedAt || 'unknown'}`);
for (const [name, entry] of Object.entries(manifest.dataset.experiments)) {
  const variable = Object.entries(entry.featureCardinality)
    .filter(([, count]) => count > 1)
    .map(([key]) => key);
  console.log(`  ${name}: ${entry.records} rows, sha256 ${entry.sha256?.slice(0, 12)}, variable features: ${variable.join(', ')}`);
}
for (const [name, verdict] of Object.entries(manifest.verdicts)) {
  console.log(`  ${name}: ${verdict.taskCount} tasks, Python=${verdict.pythonOverallPassed}, JS=${verdict.jsOverallPassed}, match=${verdict.liveMatch}`);
}
for (const warning of warnings) console.warn(`WARN: ${warning}`);
for (const error of errors) console.error(`ERROR: ${error}`);

if (errors.length > 0) process.exit(1);
