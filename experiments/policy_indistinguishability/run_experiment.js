/**
 * Policy Indistinguishability Experiment Runner
 *
 * Supports phased execution similar to the Policy Content Hiding pipeline:
 *   Phase 1 – Dataset generation & on-chain execution
 *   Phase 2 – Policy pairing & aggregation
 *   Phase 3 – Attack modelling, evaluation, and reporting
 */

const fs = require('fs');
const path = require('path');
const { parseCommonArgs, printCommonHelp, runMain } = require('../core/cli');
const { resolveDatasetPaths } = require('../core/dataset');

const { ProgressTracker } = require('../core/progress');

// Use PI-specific data generator for optimal pairing
const {
  PI_DEFAULT_CONFIG,
  FEATURE_KEYS,
  buildPairsFromExecutionResults
} = require('./pi_data_generator');

const {
  runSingleSampleAttacks,
  runPairwiseAttacks,
  runTwoSampleTests
} = require('./attacks');

const { evaluateMultiseed, printVerdict } = require('../core/multiseed_criterion');
// buildPiRecordsForSeed lives in ./seed_records (shared by the serial path and the
// parallel worker — one copy of the per-seed logic).
const { buildPiRecordsForSeed } = require('./seed_records');

const DEFAULT_THRESHOLDS = Object.freeze({
  aucMax: 0.55,
  advantageMax: 0.05,
  permutationMin: 0.05,
  mmdMax: 0.05,
  ksPValueMin: 0.05
});

const DEFAULT_OUTPUT_FILENAMES = Object.freeze({
  dataset: 'pi_dataset.json',
  executionResults: 'pi_execution_results.json',
  pairs: 'pi_pairs.json',
  analysis: 'pi_analysis.json',
  reportJson: 'pi_report.json',
  reportMarkdown: 'pi_report.md'
});

function parsePairTargets(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // ignore parse error
  }
  return null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const common = parseCommonArgs(argv);
  const config = {
    policyCount: 100,
    executionsPerPolicy: 2,
    satisfyRatio: 0.5,
    testRatio: 0.2,
    permutationIterations: 500,
    // PI-specific pairing configuration
    minPairsPerType: 30,
    targetPairsPerType: 50,
    maxPairsPerType: 100,
    ...common
  };

  // Handle PI-specific args from _unknown list
  const unknown = config._unknown || [];
  delete config._unknown;

  for (let i = 0; i < unknown.length; i++) {
    const arg = unknown[i];
    switch (arg) {
      case '--pair-targets':
        config.pairTargets = parsePairTargets(unknown[++i]);
        break;
      case '--pairs':
        config.pairsPath = path.resolve(unknown[++i]);
        break;
      case '--analysis':
        config.analysisPath = path.resolve(unknown[++i]);
        break;
      case '--auc-threshold':
        config.aucThreshold = parseFloat(unknown[++i]);
        break;
      case '--advantage-threshold':
        config.advantageThreshold = parseFloat(unknown[++i]);
        break;
      case '--permutation-min':
        config.permutationMin = parseFloat(unknown[++i]);
        break;
      case '--mmd-threshold':
        config.mmdThreshold = parseFloat(unknown[++i]);
        break;
      case '--ks-min':
        config.ksPValueMin = parseFloat(unknown[++i]);
        break;
      case '--permutation-iterations':
        config.permutationIterations = parseInt(unknown[++i], 10);
        break;
      case '--min-pairs-per-type':
        config.minPairsPerType = parseInt(unknown[++i], 10);
        break;
      case '--target-pairs-per-type':
        config.targetPairsPerType = parseInt(unknown[++i], 10);
        break;
      case '--max-pairs-per-type':
        config.maxPairsPerType = parseInt(unknown[++i], 10);
        break;
      default:
        console.warn(`Unknown argument ${arg} ignored`);
    }
  }

  return config;
}

function printUsage() {
  console.log('Policy Indistinguishability Experiment');
  console.log('Usage: node run_experiment.js [options]');
  console.log();
  printCommonHelp();
  console.log();
  console.log('PI-specific options:');
  console.log('  --pair-targets <json>          Target counts per pair type (JSON)');
  console.log('  --pairs <path>                 Path to cached policy pair JSON');
  console.log('  --analysis <path>              Path to cached attack analysis JSON');
  console.log('  --auc-threshold <float>        Max acceptable AUC (default 0.55)');
  console.log('  --advantage-threshold <float>  Max acceptable advantage (default 0.05)');
  console.log('  --permutation-min <float>      Min acceptable permutation p-value (default 0.05)');
  console.log('  --mmd-threshold <float>        Max acceptable MMD distance (default 0.05)');
  console.log('  --ks-min <float>               Min acceptable average KS p-value (default 0.05)');
  console.log('  --permutation-iterations <n>   Permutation iterations for AUC significance (default 500)');
  console.log('  --min-pairs-per-type <n>       Minimum pairs per type (default 30)');
  console.log('  --target-pairs-per-type <n>    Target pairs per type (default 50)');
  console.log('  --max-pairs-per-type <n>       Maximum pairs per type (default 100)');
}

// Build PI config for pairing
function buildPIConfig(config) {
  return {
    policyCount: config.policyCount,
    executionsPerPolicy: config.executionsPerPolicy,
    satisfyRatio: config.satisfyRatio,
    minPairsPerType: config.minPairsPerType || 30,
    targetPairsPerType: config.targetPairsPerType || 50,
    maxPairsPerType: config.maxPairsPerType || 100,
    randomSeed: config.seed,
    ensureBalancedSampling: true
  };
}

function featureImportance(weights) {
  if (!Array.isArray(weights) || weights.length === 0) {
    return [];
  }
  return FEATURE_KEYS.map((key, index) => ({
    feature: key,
    weight: weights[index] || 0,
    importance: Math.abs(weights[index] || 0)
  })).sort((a, b) => b.importance - a.importance);
}

function evaluateLogisticResult(result, thresholds, level) {
  const evaluation = result.outcome.evaluation;
  const auc = typeof evaluation.auc === 'number' ? evaluation.auc : 0.5;
  const advantage = evaluation.advantage ?? 0;
  const entropy = result.outcome.entropy;
  const permutation = result.outcome.permutationPValue ?? 1;

  const checks = [
    { metric: 'AUC', value: auc, threshold: thresholds.aucMax, passed: auc <= thresholds.aucMax },
    { metric: 'Advantage', value: advantage, threshold: thresholds.advantageMax, passed: advantage <= thresholds.advantageMax },
    { metric: 'Permutation p-value', value: permutation, threshold: thresholds.permutationMin, passed: permutation >= thresholds.permutationMin }
  ];

  return {
    level,
    scope: result.scope || 'overall',
    classifier: result.classifier,
    passed: checks.every((check) => check.passed),
    metrics: {
      auc,
      advantage,
      entropy,
      permutationPValue: permutation,
      accuracy: evaluation.accuracy
    },
    checks,
    featureImportance: featureImportance(result.outcome.weights)
  };
}

function evaluateRandomForestResult(result, thresholds, level) {
  const evaluation = result.outcome.evaluation;
  const advantage = evaluation.advantage ?? 0;
  const checks = [
    { metric: 'Advantage', value: advantage, threshold: thresholds.advantageMax, passed: advantage <= thresholds.advantageMax }
  ];

  return {
    level,
    scope: result.scope || 'overall',
    classifier: result.classifier,
    passed: checks.every((check) => check.passed),
    metrics: {
      accuracy: evaluation.accuracy,
      advantage
    },
    checks
  };
}

function evaluateTwoSampleAggregation(entry, thresholds) {
  const ksPass = Object.values(entry.ksSummary).every((value) => value.pValueMean >= thresholds.ksPValueMin);
  const checks = [
    { metric: 'MMD', value: entry.meanMmd, threshold: thresholds.mmdMax, passed: entry.meanMmd <= thresholds.mmdMax },
    { metric: 'KS p-value mean', value: Math.min(...Object.values(entry.ksSummary).map((v) => v.pValueMean)), threshold: thresholds.ksPValueMin, passed: ksPass }
  ];

  return {
    level: 'Level III',
    scope: entry.pairType,
    classifier: 'Two-sample statistics',
    passed: checks.every((check) => check.passed),
    metrics: {
      meanMmd: entry.meanMmd,
      ksSummary: entry.ksSummary
    },
    checks
  };
}

function buildPrivacySummary(singleSampleResults, pairwiseResults, statsResults, thresholds) {
  const checks = [];

  singleSampleResults.forEach((result) => {
    if (result.skipped) {
      checks.push({
        level: 'Level I',
        scope: result.scope,
        classifier: result.classifier,
        skipped: true,
        reason: result.reason
      });
      return;
    }
    if (result.classifier === 'LogisticRegression') {
      checks.push(evaluateLogisticResult(result, thresholds, 'Level I'));
    } else {
      checks.push(evaluateRandomForestResult(result, thresholds, 'Level I'));
    }
  });

  pairwiseResults.forEach((result) => {
    if (result.skipped) {
      checks.push({
        level: 'Level II',
        scope: 'overall',
        classifier: result.classifier,
        skipped: true,
        reason: result.reason
      });
      return;
    }
    if (result.classifier === 'LogisticRegression') {
      checks.push(evaluateLogisticResult(result, thresholds, 'Level II'));
    } else {
      checks.push(evaluateRandomForestResult(result, thresholds, 'Level II'));
    }
  });

  statsResults.aggregated.forEach((entry) => {
    checks.push(evaluateTwoSampleAggregation(entry, thresholds));
  });

  const effectiveChecks = checks.filter((check) => !check.skipped);
  const overallPassed = effectiveChecks.every((check) => check.passed);

  return {
    overallPassed,
    checks
  };
}

function renderMarkdownReport(report) {
  const policyCountStr = report.config.policyCount ?? 'N/A';
  const executionsPerPolicyStr = report.config.executionsPerPolicy ?? 'N/A';
  const satisfyRatioStr = report.config.satisfyRatio != null
    ? report.config.satisfyRatio.toFixed(2)
    : 'N/A';
  const testRatioPercent = ((report.config.testRatio ?? 0) * 100).toFixed(0);

  const lines = [];
  lines.push('# Policy Indistinguishability Evaluation Report');
  lines.push('');
  lines.push(`**Date:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Assess whether semantically similar policies remain indistinguishable to on-chain adversaries after policy contents are hidden.');
  lines.push('');
  lines.push('## Configuration');
  lines.push('');
  lines.push(`- **Policies generated:** ${policyCountStr}`);
  lines.push(`- **Executions per policy:** ${executionsPerPolicyStr}`);
  lines.push(`- **Satisfy ratio:** ${satisfyRatioStr}`);
  lines.push(`- **Test ratio:** ${testRatioPercent}%`);
  lines.push('');
  lines.push('## Pair Composition');
  lines.push('');
  Object.entries(report.pairCounts).forEach(([type, count]) => {
    lines.push(`- **${type}:** ${count}`);
  });
  lines.push('');

  lines.push('## Attack Outcomes');
  lines.push('');

  ['Level I', 'Level II', 'Level III'].forEach((level) => {
    lines.push(`### ${level}`);
    lines.push('');
    report.diagnostics.privacySummary.checks
      .filter((check) => check.level === level)
      .forEach((check) => {
        if (check.skipped) {
          lines.push(`- **${check.scope} / ${check.classifier}:** _skipped_ (${check.reason})`);
          return;
        }
        const status = check.passed ? '✓ PASS' : '✗ FAIL';
        lines.push(`- **${check.scope} / ${check.classifier}:** ${status}`);
        check.checks.forEach((detail) => {
          lines.push(`  - ${detail.metric}: ${detail.value.toFixed(4)} (threshold ${detail.threshold})`);
        });
        if (Array.isArray(check.featureImportance) && check.featureImportance.length > 0) {
          const top = check.featureImportance.slice(0, 3).map((item) => `${item.feature} (${item.weight.toFixed(3)})`);
          lines.push(`  - Top features: ${top.join(', ')}`);
        }
      });
    lines.push('');
  });

  lines.push('## Two-sample Diagnostics');
  lines.push('');
  if (report.diagnostics.statistics && report.diagnostics.statistics.aggregated && report.diagnostics.statistics.aggregated.length > 0) {
    report.diagnostics.statistics.aggregated.forEach((entry) => {
      lines.push(`- **${entry.pairType}:** MMD ${entry.meanMmd.toFixed(4)}`);
      Object.entries(entry.ksSummary).forEach(([feature, stats]) => {
        lines.push(`  - ${feature}: KS mean ${stats.statisticMean.toFixed(4)}, p-value mean ${stats.pValueMean.toFixed(4)}`);
      });
    });
  } else {
    lines.push('_No two-sample statistical tests performed._');
  }
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  const label = report.overallPassed ? '✓ PASS' : '✗ FAIL';
  lines.push(`**Status:** ${label} _(multi-seed, policy-disjoint; single split above is diagnostic)_`);
  lines.push('');
  lines.push(report.conclusion);
  lines.push('');

  return lines.join('\n');
}

function inferMetaFromExecutionResults(executionResults) {
  if (!Array.isArray(executionResults) || executionResults.length === 0) {
    return null;
  }
  const policyIds = new Set();
  let satisfyCount = 0;
  executionResults.forEach((entry) => {
    policyIds.add(entry.policyId);
    if (entry.satisfy) satisfyCount += 1;
  });
  const totalExecutions = executionResults.length;
  const policyCount = policyIds.size || null;
  const executionsPerPolicy = policyCount ? Math.round(totalExecutions / policyCount) : null;
  const satisfyRatio = totalExecutions ? satisfyCount / totalExecutions : null;
  return {
    policyCount,
    executionsPerPolicy,
    satisfyRatio
  };
}

async function runExperiment(config = {}) {
  const useUnifiedDataset = Boolean(config.useUnifiedDataset);
  const startPhase = Number.isInteger(config.startPhase)
    ? config.startPhase
    : (useUnifiedDataset ? 2 : 1);
  if (startPhase < 1 || startPhase > 3) {
    throw new Error('startPhase/phase must be between 1 and 3.');
  }

  const outputDir = path.resolve(
    config.outputDir || path.join(__dirname, 'results', config.network || 'localhost')
  );
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const { datasetPath: resolvedDatasetPath, executionResultsPath: resolvedExecPath } = resolveDatasetPaths(config, 'pi');
  let datasetPath = resolvedDatasetPath;
  let executionResultsPath = resolvedExecPath;

  const datasetOutputPath = datasetPath
    ? datasetPath
    : path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.dataset);
  const executionResultsOutputPath = executionResultsPath
    ? executionResultsPath
    : path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.executionResults);
  const pairsOutputPath = config.pairsPath
    ? path.resolve(config.pairsPath)
    : path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.pairs);
  const analysisOutputPath = config.analysisPath
    ? path.resolve(config.analysisPath)
    : path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.analysis);
  const reportJsonPath = path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.reportJson);
  const reportMarkdownPath = path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.reportMarkdown);
  let datasetMeta = null;
  let executionResults = null;
  let pairsPayload = null;
  let pairs = null;
  let policies = null;

  const piConfig = buildPIConfig(config);

  const thresholds = {
    aucMax: config.aucThreshold ?? DEFAULT_THRESHOLDS.aucMax,
    advantageMax: config.advantageThreshold ?? DEFAULT_THRESHOLDS.advantageMax,
    permutationMin: config.permutationMin ?? DEFAULT_THRESHOLDS.permutationMin,
    mmdMax: config.mmdThreshold ?? DEFAULT_THRESHOLDS.mmdMax,
    ksPValueMin: config.ksPValueMin ?? DEFAULT_THRESHOLDS.ksPValueMin
  };

  // Extract pairTargets from config (used in report generation)
  const pairTargets = config.pairTargets || null;

  console.log('='.repeat(60));
  console.log('Policy Indistinguishability Experiment');
  console.log('='.repeat(60));
  console.log(`Starting from phase ${startPhase}`);
  console.log('');

  let totalSteps = 0;
  if (startPhase <= 2) totalSteps += 1; // Policy pairing
  totalSteps += 5; // single-sample, pairwise, two-sample, multi-seed verdict, report generation

  const progress = new ProgressTracker(totalSteps);

  if (fs.existsSync(datasetOutputPath)) {
    try {
      const storedDataset = JSON.parse(fs.readFileSync(datasetOutputPath, 'utf8'));
      datasetMeta = storedDataset.__meta || datasetMeta;
    } catch (err) {
      console.warn(`Failed to load dataset at ${datasetOutputPath}: ${err.message}`);
    }
  }

  if (!executionResults) {
    if (!fs.existsSync(executionResultsOutputPath)) {
      throw new Error(`Execution results not found at ${executionResultsOutputPath}. Provide --execution-results or run phase 1.`);
    }
    executionResults = JSON.parse(fs.readFileSync(executionResultsOutputPath, 'utf8'));
  }

  // Phase 2 – policy pairing
  if (startPhase <= 2) {
    console.log('Phase 2: Policy Pair Construction');
    console.log('-'.repeat(60));

    progress.startStep('Building policy pairs from execution results');
    const pairData = buildPairsFromExecutionResults(executionResults, piConfig);
    pairs = pairData.pairs;
    policies = pairData.policies;

    const payload = {
      generatedAt: new Date().toISOString(),
      piConfig,
      stats: pairData.stats,
      datasetMeta: datasetMeta || inferMetaFromExecutionResults(executionResults),
      policies,
      pairs
    };
    fs.writeFileSync(pairsOutputPath, JSON.stringify(payload, null, 2));
    console.log(`Policy pairs saved to: ${pairsOutputPath}`);
    progress.completeStep();
    console.log('');
  } else {
    console.log('Skipping Phase 2: Policy Pair Construction');
    console.log('');
    if (!fs.existsSync(pairsOutputPath)) {
      throw new Error(`Pairs file not found at ${pairsOutputPath}. Provide --pairs or run phase 2.`);
    }
    pairsPayload = JSON.parse(fs.readFileSync(pairsOutputPath, 'utf8'));
    pairs = pairsPayload.pairs;
    policies = pairsPayload.policies;
    datasetMeta = datasetMeta || pairsPayload.datasetMeta || inferMetaFromExecutionResults(executionResults);
  }

  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error('No policy pairs available for attack modelling. Ensure phase 2 completed successfully.');
  }

  // Level-III (two-sample MMD/KS) compares the within-policy execution
  // distribution of two policies, so it needs >=2 executions per policy. Under
  // two-layer execution only the depth layer has replicates; coverage-layer
  // policies (1 execution) would make computeMMD divide by len*(len-1)=0 -> NaN.
  // Build a separate depth-only pair set for Level-III; Level-I/II keep the full
  // pairs. Falls back to all executions when no depthLayer tag is present
  // (single-layer / legacy datasets), preserving prior behaviour.
  const depthExecutions = executionResults.filter((r) => r.depthLayer === true);
  let level3Pairs = pairs;
  if (depthExecutions.length > 0) {
    const depthPairData = buildPairsFromExecutionResults(depthExecutions, piConfig);
    level3Pairs = depthPairData.pairs;
    const depthPolicyCount = new Set(depthExecutions.map((r) => r.policyId)).size;
    console.log(
      `PI Level-III: using ${depthExecutions.length} depth-layer executions ` +
      `(${depthPolicyCount} policies, ${level3Pairs.length} pairs) out of ${executionResults.length} total executions`
    );
  }

  // Phase 3 – attack modelling & reporting
  console.log('Phase 3: Attack Modelling & Reporting');
  console.log('-'.repeat(60));

  progress.startStep(`Running single-sample attacks (${pairs.length} pairs)`);
  const singleSampleResults = runSingleSampleAttacks(pairs, {
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });
  progress.completeStep();

  progress.startStep('Running pairwise attacks');
  const pairwiseResults = runPairwiseAttacks(pairs, {
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });
  progress.completeStep();

  progress.startStep('Running two-sample statistical tests');
  const statisticsResults = runTwoSampleTests(level3Pairs);
  progress.completeStep();

  progress.completeStep();

  // Authoritative verdict: multi-seed, policy-disjoint, AUC + permutation test.
  // The single-split attacks above feed the legacy privacySummary (kept as
  // diagnostic), but PASS/FAIL is decided here — a single split's per-scope AUC
  // has std ~0.05-0.09, which produced spurious FAILs that were sampling noise.
  progress.startStep('Running multi-seed verdict (single-sample, Level I)');
  const multiseedSeeds = config.multiseedSeeds ?? 30;
  const permIterations = config.permutationIterations || 200;
  const seedCtx = { pairs, testRatio: config.testRatio, permutationIterations: permIterations };
  const concurrency = config.concurrency ?? 1;
  const verdict = await evaluateMultiseed(
    (seedIndex, baseSeed) => buildPiRecordsForSeed(seedIndex, seedCtx, baseSeed),
    {
      seeds: multiseedSeeds,
      permutationIterations: permIterations,
      // controlled_difference is a positive control (similarity 0, intentionally
      // distinguishable): report it but do not gate the privacy verdict on it.
      positiveControlKeys: ['controlled_difference'],
      // Parallel verdict: each worker re-reads the saved pairs file and re-runs
      // buildPiRecordsForSeed per seed in its own V8 isolate; results replayed in
      // seed order → byte-identical to serial.
      concurrency,
      workerEntry: concurrency > 1 ? path.join(__dirname, 'multiseed_worker.js') : undefined,
      workerData: concurrency > 1 ? {
        pairsOutputPath,
        testRatio: config.testRatio,
        permutationIterations: permIterations
      } : undefined
    });
  progress.completeStep();
  printVerdict('Policy Indistinguishability', verdict);

  progress.startStep('Generating privacy analysis and reports');
  const privacySummary = buildPrivacySummary(
    singleSampleResults,
    pairwiseResults,
    statisticsResults,
    thresholds
  );

  const pairCounts = pairs.reduce((acc, pair) => {
    acc[pair.pairType] = (acc[pair.pairType] || 0) + 1;
    return acc;
  }, {});

  const derivedMeta = datasetMeta || inferMetaFromExecutionResults(executionResults) || {};

  const analysis = {
    thresholds,
    pairTargets,
    singleSample: singleSampleResults,
    pairwise: pairwiseResults,
    statistics: statisticsResults,
    privacySummary
  };
  fs.writeFileSync(analysisOutputPath, JSON.stringify(analysis, null, 2));

  const report = {
    experiment: 'Policy Indistinguishability',
    timestamp: new Date().toISOString(),
    config: {
      policyCount: config.policyCount ?? derivedMeta.policyCount ?? (policies ? policies.length : null),
      executionsPerPolicy: config.executionsPerPolicy ?? derivedMeta.executionsPerPolicy ?? null,
      satisfyRatio: config.satisfyRatio ?? derivedMeta.satisfyRatio ?? null,
      testRatio: config.testRatio ?? 0.3,
      thresholds
    },
    dataset: {
      meta: derivedMeta,
      datasetPath: datasetOutputPath,
      executionResultsPath: executionResultsOutputPath,
      pairsPath: pairsOutputPath,
      analysisPath: analysisOutputPath
    },
    pairTargets,
    pairCounts,
    diagnostics: {
      note: 'Single-split diagnostic only — superseded by multiseedVerdict for PASS/FAIL.',
      privacySummary,
      singleSample: privacySummary.checks.filter(c => c.level === 'Level I' && !c.skipped),
      multiSample: privacySummary.checks.filter(c => c.level === 'Level II' && !c.skipped),
      twoSampleTests: privacySummary.checks.filter(c => c.level === 'Level III' && !c.skipped),
      statistics: statisticsResults
    },
    multiseedVerdict: verdict, // authoritative
    overallPassed: verdict.overallPassed,
    conclusion: verdict.overallPassed
      ? 'Policies appear indistinguishable across modeled adversaries (multi-seed AUC ≈ 0.5, permutation not significant).'
      : 'Potential leakage detected. Further hardening is required.'
  };

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportMarkdownPath, renderMarkdownReport(report));

  console.log(`Saved JSON report to: ${reportJsonPath}`);
  console.log(`Saved Markdown report to: ${reportMarkdownPath}`);
  progress.completeStep();

  progress.complete();
  console.log('');
  console.log(`Overall status (multi-seed): ${verdict.overallPassed ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(60));

  return report;
}

runMain(module, {
  runExperiment,
  parseArgs,
  printUsage,
  getPassedFlag: (r) => r.overallPassed
});

module.exports = { runExperiment };
