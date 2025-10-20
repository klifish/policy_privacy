/**
 * Policy Indistinguishability Experiment Runner
 */

const fs = require('fs');
const path = require('path');

const {
  generatePolicyPairsDataset,
  FEATURE_KEYS
} = require('./data_generator');
const {
  runSingleSampleAttacks,
  runPairwiseAttacks,
  runTwoSampleTests
} = require('./attacks');

const DEFAULT_THRESHOLDS = Object.freeze({
  aucMax: 0.55,
  advantageMax: 0.05,
  permutationMin: 0.05,
  mmdMax: 0.05,
  ksPValueMin: 0.05
});

function parsePairTargets(value) {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const config = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--output':
        config.outputDir = path.resolve(argv[++i]);
        break;
      case '--policy-count':
        config.policyCount = parseInt(argv[++i], 10);
        break;
      case '--executions-per-policy':
        config.executionsPerPolicy = parseInt(argv[++i], 10);
        break;
      case '--satisfy-ratio':
        config.satisfyRatio = parseFloat(argv[++i]);
        break;
      case '--test-ratio':
        config.testRatio = parseFloat(argv[++i]);
        break;
      case '--pair-targets':
        config.pairTargets = parsePairTargets(argv[++i]);
        break;
      case '--auc-threshold':
        config.aucThreshold = parseFloat(argv[++i]);
        break;
      case '--advantage-threshold':
        config.advantageThreshold = parseFloat(argv[++i]);
        break;
      case '--permutation-min':
        config.permutationMin = parseFloat(argv[++i]);
        break;
      case '--mmd-threshold':
        config.mmdThreshold = parseFloat(argv[++i]);
        break;
      case '--ks-min':
        config.ksPValueMin = parseFloat(argv[++i]);
        break;
      case '--permutation-iterations':
        config.permutationIterations = parseInt(argv[++i], 10);
        break;
      case '--seed':
        config.seed = argv[++i];
        break;
      case '--help':
      case '-h':
        config.help = true;
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
  console.log('Options:');
  console.log('  --output <dir>                 Output directory (default: ./results)');
  console.log('  --policy-count <n>             Number of base policies to generate');
  console.log('  --executions-per-policy <n>    Number of executions per policy');
  console.log('  --satisfy-ratio <float>        Ratio of satisfying executions (default 0.5)');
  console.log('  --test-ratio <float>           Train/test split ratio (default 0.3)');
  console.log('  --pair-targets <json>          Target counts per pair type (JSON)');
  console.log('  --auc-threshold <float>        Max acceptable AUC (default 0.55)');
  console.log('  --advantage-threshold <float>  Max acceptable advantage over random (default 0.05)');
  console.log('  --permutation-min <float>      Min acceptable permutation p-value (default 0.05)');
  console.log('  --mmd-threshold <float>        Max acceptable MMD distance (default 0.05)');
  console.log('  --ks-min <float>               Min acceptable average KS p-value (default 0.05)');
  console.log('  --permutation-iterations <n>   Permutation iterations for AUC significance (default 500)');
  console.log('  --seed <value>                 Deterministic dataset seed');
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
  lines.push(`- **Policies generated:** ${report.config.policyCount}`);
  lines.push(`- **Executions per policy:** ${report.config.executionsPerPolicy}`);
  lines.push(`- **Satisfy ratio:** ${report.config.satisfyRatio}`);
  lines.push(`- **Test ratio:** ${(report.config.testRatio * 100).toFixed(0)}%`);
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
    report.privacySummary.checks
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
  report.statistics.aggregated.forEach((entry) => {
    lines.push(`- **${entry.pairType}:** MMD ${entry.meanMmd.toFixed(4)}`);
    Object.entries(entry.ksSummary).forEach(([feature, stats]) => {
      lines.push(`  - ${feature}: KS mean ${stats.statisticMean.toFixed(4)}, p-value mean ${stats.pValueMean.toFixed(4)}`);
    });
  });
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  const label = report.privacySummary.overallPassed ? '✓ PASS' : '✗ FAIL';
  lines.push(`**Status:** ${label}`);
  lines.push('');
  lines.push(report.conclusion);
  lines.push('');

  return lines.join('\n');
}

async function runExperiment(config = {}) {
  const outputDir = path.resolve(config.outputDir || path.join(__dirname, 'results'));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const thresholds = {
    aucMax: config.aucThreshold ?? DEFAULT_THRESHOLDS.aucMax,
    advantageMax: config.advantageThreshold ?? DEFAULT_THRESHOLDS.advantageMax,
    permutationMin: config.permutationMin ?? DEFAULT_THRESHOLDS.permutationMin,
    mmdMax: config.mmdThreshold ?? DEFAULT_THRESHOLDS.mmdMax,
    ksPValueMin: config.ksPValueMin ?? DEFAULT_THRESHOLDS.ksPValueMin
  };

  const generation = await generatePolicyPairsDataset({
    policyCount: config.policyCount,
    executionsPerPolicy: config.executionsPerPolicy,
    satisfyRatio: config.satisfyRatio,
    pairTargets: config.pairTargets,
    seed: config.seed,
    outputDir
  });

  const singleSampleResults = runSingleSampleAttacks(generation.pairs, {
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });

  const pairwiseResults = runPairwiseAttacks(generation.pairs, {
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });

  const statisticsResults = runTwoSampleTests(generation.pairs);

  const privacySummary = buildPrivacySummary(
    singleSampleResults,
    pairwiseResults,
    statisticsResults,
    thresholds
  );

  const pairCounts = generation.pairs.reduce((acc, pair) => {
    acc[pair.pairType] = (acc[pair.pairType] || 0) + 1;
    return acc;
  }, {});

  const report = {
    experiment: 'Policy Indistinguishability',
    timestamp: new Date().toISOString(),
    config: {
      policyCount: generation.datasetMeta.policyCount,
      executionsPerPolicy: config.executionsPerPolicy ?? generation.datasetMeta.executionsPerPolicy ?? 0,
      satisfyRatio: config.satisfyRatio ?? generation.datasetMeta.satisfyRatio ?? 0.5,
      testRatio: config.testRatio ?? 0.3,
      thresholds
    },
    dataset: {
      meta: generation.datasetMeta,
      executionResultsPath: generation.executionResultsPath
    },
    pairCounts,
    singleSample: singleSampleResults,
    pairwise: pairwiseResults,
    statistics: statisticsResults,
    privacySummary,
    conclusion: privacySummary.overallPassed
      ? 'Policies appear indistinguishable across modeled adversaries.'
      : 'Potential leakage detected. Further hardening is required.'
  };

  const jsonPath = path.join(outputDir, 'pi_report.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const markdownPath = path.join(outputDir, 'pi_report.md');
  fs.writeFileSync(markdownPath, renderMarkdownReport(report));

  return report;
}

if (require.main === module) {
  const config = parseArgs();
  if (config.help) {
    printUsage();
    process.exit(0);
  }

  runExperiment(config)
    .then((report) => {
      console.log(`Report saved. Overall status: ${report.privacySummary.overallPassed ? 'PASS' : 'FAIL'}`);
      process.exit(report.privacySummary.overallPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error('PI experiment failed:', error);
      process.exit(1);
    });
}

module.exports = { runExperiment };
