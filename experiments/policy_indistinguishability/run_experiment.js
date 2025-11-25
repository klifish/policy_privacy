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

// Progress tracking utilities
class ProgressTracker {
  constructor(totalSteps) {
    this.totalSteps = totalSteps;
    this.currentStep = 0;
    this.startTime = Date.now();
    this.stepStartTime = Date.now();
    this.stepTimings = [];
    this.subStepMode = false;
  }

  startStep(stepName) {
    this.currentStep++;
    this.stepStartTime = Date.now();
    this.currentStepName = stepName;
    this.subStepMode = false;
    this._displayProgress();
  }

  completeStep() {
    const stepDuration = Date.now() - this.stepStartTime;
    this.stepTimings.push(stepDuration);
    this.subStepMode = false;
    this._displayProgress(true);
  }

  // For fine-grained progress within a step (e.g., executing policies one by one)
  updateSubProgress(current, total, extraInfo = '') {
    this.subStepMode = true;
    this.subStepCurrent = current;
    this.subStepTotal = total;
    this.subStepInfo = extraInfo;
    this._displayProgress(false, true);
  }

  _displayProgress(completed = false, isSubStep = false) {
    const elapsed = Date.now() - this.startTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedSecondsRemainder = elapsedSeconds % 60;

    const percentage = ((this.currentStep / this.totalSteps) * 100).toFixed(1);
    const progressBar = this._generateProgressBar(this.currentStep, this.totalSteps);

    let timeEstimate = '';
    if (this.stepTimings.length > 0 && this.currentStep < this.totalSteps) {
      const avgStepTime = this.stepTimings.reduce((a, b) => a + b, 0) / this.stepTimings.length;
      const remainingSteps = this.totalSteps - this.currentStep;
      const estimatedRemainingTime = avgStepTime * remainingSteps;
      const estMinutes = Math.floor(estimatedRemainingTime / 60000);
      const estSeconds = Math.floor((estimatedRemainingTime % 60000) / 1000);
      timeEstimate = ` | ETA: ${estMinutes}m ${estSeconds}s`;
    }

    const status = completed ? '✓' : '▶';

    if (isSubStep && this.subStepMode) {
      // Display sub-step progress with fine-grained ETA
      const subPercentage = ((this.subStepCurrent / this.subStepTotal) * 100).toFixed(1);
      const subProgressBar = this._generateProgressBar(this.subStepCurrent, this.subStepTotal, 20);

      // Calculate ETA based on current sub-step progress
      const stepElapsed = Date.now() - this.stepStartTime;
      let subTimeEstimate = '';
      if (this.subStepCurrent > 0 && this.subStepCurrent < this.subStepTotal) {
        const avgTimePerSubStep = stepElapsed / this.subStepCurrent;
        const remainingSubSteps = this.subStepTotal - this.subStepCurrent;
        const estRemainingTime = avgTimePerSubStep * remainingSubSteps;
        const estMin = Math.floor(estRemainingTime / 60000);
        const estSec = Math.floor((estRemainingTime % 60000) / 1000);
        subTimeEstimate = ` | ETA: ${estMin}m ${estSec}s`;
      }

      // Use \r to overwrite the same line for sub-progress updates
      process.stdout.write(`\r${status} [${this.currentStep}/${this.totalSteps}] ${progressBar} ${percentage}% | ${this.currentStepName}`);
      process.stdout.write(`\n   └─ [${this.subStepCurrent}/${this.subStepTotal}] ${subProgressBar} ${subPercentage}%${this.subStepInfo}${subTimeEstimate}${' '.repeat(20)}`);
    } else {
      console.log(`\n${status} [${this.currentStep}/${this.totalSteps}] ${progressBar} ${percentage}% | ${this.currentStepName}`);
      console.log(`   Time elapsed: ${elapsedMinutes}m ${elapsedSecondsRemainder}s${timeEstimate}`);
    }
  }

  _generateProgressBar(current, total, width = 30) {
    const filled = Math.floor((current / total) * width);
    const empty = width - filled;
    return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
  }

  complete() {
    const totalTime = Date.now() - this.startTime;
    const totalMinutes = Math.floor(totalTime / 60000);
    const totalSeconds = Math.floor((totalTime % 60000) / 1000);
    console.log(`\n\n✓ All steps completed in ${totalMinutes}m ${totalSeconds}s`);
  }
}

const {
  DEFAULT_PAIR_TARGETS,
  FEATURE_KEYS,
  generateDataset,
  buildPairsFromExecutionResults
} = require('./data_generator');
const {
  runSingleSampleAttacks,
  runPairwiseAttacks,
  runTwoSampleTests
} = require('./attacks');

// Import executePolicy from the base data generator for fine-grained execution
const { executePolicy } = require('../policy_content_hiding/data_generator');

// Execute dataset sequentially with real-time progress tracking
async function executeDatasetWithProgress(dataset, contract, outputPath, progressTracker) {
  const results = [];

  console.log(`Executing ${dataset.length} policy instances sequentially...`);

  for (let i = 0; i < dataset.length; i++) {
    const policyData = dataset[i];

    try {
      const result = await executePolicy(policyData, contract);
      results.push(result);

      // Update progress after each execution
      if (progressTracker) {
        progressTracker.updateSubProgress(
          i + 1,
          dataset.length,
          ` | Executed ${i + 1}/${dataset.length} policies`
        );
      }
    } catch (error) {
      console.error(`\nError executing policy ${i}:`, error.message);

      // Update progress even on failure
      if (progressTracker) {
        progressTracker.updateSubProgress(
          i + 1,
          dataset.length,
          ` | Executed ${i + 1}/${dataset.length} policies (1 failed)`
        );
      }
      // Continue with next policy instead of stopping
    }
  }

  // Final sub-progress update
  if (progressTracker) {
    progressTracker.updateSubProgress(dataset.length, dataset.length, ' | Complete');
  }

  // Save results
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n   Saved ${results.length}/${dataset.length} successful results to ${outputPath}`);

  return results;
}

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
  const config = {
    policyCount: 200,
    executionsPerPolicy: 2,
    satisfyRatio: 0.5,
    testRatio: 0.3,
    permutationIterations: 500
  };

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
      case '--phase':
      case '--start-phase':
        config.startPhase = parseInt(argv[++i], 10);
        break;
      case '--dataset':
        config.datasetPath = path.resolve(argv[++i]);
        break;
      case '--execution-results':
        config.executionResultsPath = path.resolve(argv[++i]);
        break;
      case '--pairs':
        config.pairsPath = path.resolve(argv[++i]);
        break;
      case '--analysis':
        config.analysisPath = path.resolve(argv[++i]);
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
  console.log('  --phase <1|2|3>                Resume pipeline from given phase');
  console.log('  --dataset <path>               Path to cached dataset JSON');
  console.log('  --execution-results <path>     Path to cached execution results JSON');
  console.log('  --pairs <path>                 Path to cached policy pair JSON');
  console.log('  --analysis <path>              Path to cached attack analysis JSON');
  console.log('  --auc-threshold <float>        Max acceptable AUC (default 0.55)');
  console.log('  --advantage-threshold <float>  Max acceptable advantage (default 0.05)');
  console.log('  --permutation-min <float>      Min acceptable permutation p-value (default 0.05)');
  console.log('  --mmd-threshold <float>        Max acceptable MMD distance (default 0.05)');
  console.log('  --ks-min <float>               Min acceptable average KS p-value (default 0.05)');
  console.log('  --permutation-iterations <n>   Permutation iterations for AUC significance (default 500)');
  console.log('  --seed <value>                 Deterministic dataset seed');
}

function normalizePairTargets(targets) {
  if (!targets || typeof targets !== 'object') {
    return { ...DEFAULT_PAIR_TARGETS };
  }
  return Object.keys(DEFAULT_PAIR_TARGETS).reduce((acc, key) => {
    acc[key] = typeof targets[key] === 'number'
      ? targets[key]
      : DEFAULT_PAIR_TARGETS[key];
    return acc;
  }, {});
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
  const startPhase = Number.isInteger(config.startPhase) ? config.startPhase : 1;
  if (startPhase < 1 || startPhase > 3) {
    throw new Error('startPhase/phase must be between 1 and 3.');
  }

  const outputDir = path.resolve(config.outputDir || path.join(__dirname, 'results'));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const datasetOutputPath = config.datasetPath
    ? path.resolve(config.datasetPath)
    : path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.dataset);
  const executionResultsOutputPath = config.executionResultsPath
    ? path.resolve(config.executionResultsPath)
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

  let pairTargets = normalizePairTargets(config.pairTargets);

  const thresholds = {
    aucMax: config.aucThreshold ?? DEFAULT_THRESHOLDS.aucMax,
    advantageMax: config.advantageThreshold ?? DEFAULT_THRESHOLDS.advantageMax,
    permutationMin: config.permutationMin ?? DEFAULT_THRESHOLDS.permutationMin,
    mmdMax: config.mmdThreshold ?? DEFAULT_THRESHOLDS.mmdMax,
    ksPValueMin: config.ksPValueMin ?? DEFAULT_THRESHOLDS.ksPValueMin
  };

  console.log('='.repeat(60));
  console.log('Policy Indistinguishability Experiment');
  console.log('='.repeat(60));
  console.log(`Starting from phase ${startPhase}`);
  console.log('');

  // Initialize progress tracker based on starting phase
  let totalSteps = 0;
  if (startPhase <= 1) totalSteps += 3; // Dataset generation, contract deployment, execution
  if (startPhase <= 2) totalSteps += 1; // Policy pairing
  totalSteps += 4; // Single-sample attacks, pairwise attacks, two-sample tests, report generation

  const progress = new ProgressTracker(totalSteps);

  // Phase 1 – dataset generation & execution
  if (startPhase <= 1) {
    console.log('Phase 1: Dataset Generation & Execution');
    console.log('-'.repeat(60));
    const datasetConfig = {
      policyCount: config.policyCount,
      executionsPerPolicy: config.executionsPerPolicy,
      satisfyRatio: config.satisfyRatio,
      seed: config.seed
    };
    console.log(datasetConfig);

    progress.startStep('Generating dataset');
    const dataset = await generateDataset(datasetConfig);
    datasetMeta = dataset.__meta || inferMetaFromExecutionResults(dataset);
    fs.writeFileSync(datasetOutputPath, JSON.stringify(dataset, null, 2));
    console.log(`Dataset saved to: ${datasetOutputPath}`);
    progress.completeStep();

    progress.startStep('Deploying contracts (Verifier & PolicyPrivacy)');
    const { ethers } = require('hardhat');
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');

    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();

    const policyPrivacy = await PolicyPrivacy.deploy(await verifier.getAddress());
    await policyPrivacy.waitForDeployment();
    console.log(`Contracts deployed successfully`);
    progress.completeStep();

    progress.startStep(`Executing dataset on-chain (${dataset.length} executions)`);
    executionResults = await executeDatasetWithProgress(dataset, policyPrivacy, executionResultsOutputPath, progress);
    progress.completeStep();
    console.log('');
  } else {
    console.log('Skipping Phase 1: Dataset Generation & Execution');
    console.log('');
    if (fs.existsSync(datasetOutputPath)) {
      try {
        const storedDataset = JSON.parse(fs.readFileSync(datasetOutputPath, 'utf8'));
        datasetMeta = storedDataset.__meta || datasetMeta;
      } catch (err) {
        console.warn(`Failed to load dataset at ${datasetOutputPath}: ${err.message}`);
      }
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
    const pairData = buildPairsFromExecutionResults(executionResults, pairTargets);
    pairs = pairData.pairs;
    policies = pairData.policies;

    const payload = {
      generatedAt: new Date().toISOString(),
      pairTargets,
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
    if (pairsPayload.pairTargets) {
      pairTargets = normalizePairTargets(pairsPayload.pairTargets);
    }
    datasetMeta = datasetMeta || pairsPayload.datasetMeta || inferMetaFromExecutionResults(executionResults);
  }

  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error('No policy pairs available for attack modelling. Ensure phase 2 completed successfully.');
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
  const statisticsResults = runTwoSampleTests(pairs);
  progress.completeStep();

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
    singleSample: singleSampleResults,
    pairwise: pairwiseResults,
    statistics: statisticsResults,
    privacySummary,
    conclusion: privacySummary.overallPassed
      ? 'Policies appear indistinguishable across modeled adversaries.'
      : 'Potential leakage detected. Further hardening is required.'
  };

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportMarkdownPath, renderMarkdownReport(report));

  console.log(`Saved JSON report to: ${reportJsonPath}`);
  console.log(`Saved Markdown report to: ${reportMarkdownPath}`);
  progress.completeStep();

  progress.complete();
  console.log('');
  console.log(`Overall status: ${privacySummary.overallPassed ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(60));

  return report;
}

if (require.main === module) {
  const config = parseArgs();
  if (config.help) {
    printUsage();
    process.exit(0);
  }

  console.log(config);
  runExperiment(config)
    .then((report) => {
      process.exit(report.privacySummary.overallPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error('PI experiment failed:', error);
      process.exit(1);
    });
}

module.exports = { runExperiment };
