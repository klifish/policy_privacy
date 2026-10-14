/**
 * Policy Indistinguishability cross-check (JS): the within-pair attack on the
 * designed PI pairs of a capture (see ./seed_records.js), judged per pair type
 * by the shared multi-seed double criterion.
 *
 * A positive control repeats the attack with one synthetic column, N(0, 1)
 * shifted by --control-shift on side 1. A type is PASS only when its control is
 * detected; a type whose control is missed is INCONCLUSIVE.
 *
 * Usage:
 *   node experiments/analysis/crosscheck/pi/run_experiment.js --use-unified-dataset \
 *     --unified-dir <capture dir> --output <dir> [--concurrency N]
 */

const fs = require('fs');
const path = require('path');
const { parseCommonArgs, printCommonHelp, runMain } = require('../../../core/cli');
const { resolveDatasetPaths } = require('../../../core/dataset');
const { evaluateMultiseed, printVerdict, pickVerdictText } = require('../../../core/multiseed_criterion');
const { buildPiRecordsForSeed, loadPairs, PAIR_TYPES } = require('./seed_records');

const CONTROL_SHIFT = 0.75;

function parseArgs(argv = process.argv.slice(2)) {
  const config = {
    permutationIterations: 500,
    controlShift: CONTROL_SHIFT,
    ...parseCommonArgs(argv)
  };
  const unknown = config._unknown || [];
  delete config._unknown;
  for (let i = 0; i < unknown.length; i++) {
    const arg = unknown[i];
    if (arg === '--permutation-iterations') config.permutationIterations = parseInt(unknown[++i], 10);
    else if (arg === '--control-shift') config.controlShift = parseFloat(unknown[++i]);
    else console.warn(`Unknown argument ${arg} ignored`);
  }
  return config;
}

function printUsage() {
  console.log('Usage: node experiments/analysis/crosscheck/pi/run_experiment.js [options]');
  printCommonHelp();
  console.log('  --permutation-iterations <n>      Within-cell label permutations per seed (default: 500)');
  console.log(`  --control-shift <d>               Positive-control shift in SD (default: ${CONTROL_SHIFT})`);
}

function typeStatus(task, control) {
  if (task.passed === false) return 'FAIL';
  if (task.passed === null) return 'NOT JUDGED';
  return control && control.passed === false ? 'PASS' : 'INCONCLUSIVE';
}

function renderMarkdown(report) {
  const lines = [
    '# Policy Indistinguishability (within-pair attack)',
    '',
    `- **Overall:** ${pickVerdictText(report.overallPassed, { pass: 'PASS', fail: 'FAIL', inconclusive: 'INCONCLUSIVE' })}`,
    `- **Pairs:** ${Object.entries(report.pairCounts).map(([t, n]) => `${t} ${n}`).join(', ')}`,
    `- **Seeds:** ${report.multiseedVerdict.criterion.seeds}; positive-control shift ${report.controlShift} SD`,
    '',
    '| Pair type | LR AUC | LR sig | RF AUC | RF sig | control LR / RF AUC | status |',
    '|---|---:|---:|---:|---:|---:|---|'
  ];
  for (const task of report.multiseedVerdict.tasks) {
    const control = report.controlVerdict.tasks.find((t) => t.key === task.key);
    const leg = (t, c) => t.classifiers[c];
    lines.push(`| ${task.key} | ${leg(task, 'lr').auc.mean.toFixed(3)} | ${leg(task, 'lr').sigFraction.toFixed(2)} | ` +
      `${leg(task, 'rf').auc.mean.toFixed(3)} | ${leg(task, 'rf').sigFraction.toFixed(2)} | ` +
      `${leg(control, 'lr').auc.mean.toFixed(3)} / ${leg(control, 'rf').auc.mean.toFixed(3)} | ${task.status} |`);
  }
  return lines.join('\n') + '\n';
}

async function runExperiment(config = {}) {
  const outputDir = path.resolve(
    config.outputDir || path.resolve(__dirname, '../../../results/crosscheck/pi', config.network || 'localhost')
  );
  fs.mkdirSync(outputDir, { recursive: true });
  const { executionResultsPath } = resolveDatasetPaths(config, 'pi');
  if (!executionResultsPath || !fs.existsSync(executionResultsPath)) {
    throw new Error(`pi_dataset.json not found at ${executionResultsPath}; pass --use-unified-dataset --unified-dir <capture>`);
  }
  const pairs = loadPairs(JSON.parse(fs.readFileSync(executionResultsPath, 'utf8')));
  const pairCounts = {};
  pairs.forEach((pair) => { pairCounts[pair.pairType] = (pairCounts[pair.pairType] || 0) + 1; });
  console.log(`Loaded ${pairs.length} pairs from ${executionResultsPath}:`, pairCounts);

  const seeds = config.multiseedSeeds ?? 30;
  const iters = config.permutationIterations;
  const rfOpts = { trees: config.rfTrees || 50, maxDepth: config.rfMaxDepth || 10 };
  const concurrency = config.concurrency ?? 1;
  const verdictFor = (controlShift) => {
    const ctx = { pairs, permutationIterations: iters, rfOpts, controlShift };
    return evaluateMultiseed(
      (seedIndex, baseSeed) => buildPiRecordsForSeed(seedIndex, ctx, baseSeed),
      {
        seeds,
        permutationIterations: iters,
        includeSeedRecords: config.includeSeedRecords === true,
        concurrency,
        workerEntry: concurrency > 1 ? path.join(__dirname, 'multiseed_worker.js') : undefined,
        workerData: concurrency > 1 ? {
          piDatasetPath: executionResultsPath,
          permutationIterations: iters,
          rfOpts,
          controlShift
        } : undefined
      }
    );
  };

  const verdict = await verdictFor(null);
  const controlVerdict = await verdictFor(config.controlShift);
  for (const task of verdict.tasks) {
    const control = controlVerdict.tasks.find((t) => t.key === task.key);
    task.status = typeStatus(task, control);
    task.positiveControlDetected = Boolean(control && control.passed === false);
  }
  printVerdict('Policy Indistinguishability', verdict, 'within-pair split');
  printVerdict('PI positive control (should FAIL)', controlVerdict, 'within-pair split');

  const judged = verdict.tasks.filter((t) => !t.nonGating && t.passed !== null);
  let overallPassed = null;
  if (judged.some((t) => t.status === 'FAIL')) overallPassed = false;
  else if (judged.length > 0 && judged.every((t) => t.status === 'PASS')) overallPassed = true;
  verdict.overallPassed = overallPassed;

  const report = {
    experiment: 'Policy Indistinguishability',
    timestamp: new Date().toISOString(),
    datasetPath: executionResultsPath,
    pairTypes: PAIR_TYPES,
    pairCounts,
    controlShift: config.controlShift,
    multiseedVerdict: verdict,
    controlVerdict,
    overallPassed
  };
  fs.writeFileSync(path.join(outputDir, 'pi_report.json'), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(outputDir, 'pi_report.md'), renderMarkdown(report));
  console.log(`\nOverall PI (multi-seed): ${pickVerdictText(overallPassed, { pass: 'PASS', fail: 'FAIL', inconclusive: 'INCONCLUSIVE' })}`);
  console.log(`Report -> ${path.join(outputDir, 'pi_report.json')}`);
  return report;
}

runMain(module, {
  runExperiment,
  parseArgs,
  printUsage,
  getPassedFlag: (r) => r.overallPassed
});

module.exports = { runExperiment };
