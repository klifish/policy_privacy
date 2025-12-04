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

const {
  getArtifactPaths
} = require('../unified_dataset_artifacts');

const { ProgressTracker } = require('../core/progress');

// Use PI-specific data generator for optimal pairing
const {
  PI_DEFAULT_CONFIG,
  FEATURE_KEYS,
  buildPairsFromExecutionResults
} = require('./pi_data_generator');

// Import dataset generation from original for compatibility
const {
  generateDataset
} = require('./data_generator');

const {
  runSingleSampleAttacks,
  runPairwiseAttacks,
  runTwoSampleTests
} = require('./attacks');

// Import executePolicy from the base data generator for fine-grained execution
const { executePolicy } = require('../policy_content_hiding/data_generator');

// Checkpoint utilities
function saveCheckpoint(checkpointPath, phase, step, data) {
  const checkpoint = {
    timestamp: new Date().toISOString(),
    phase,
    step,
    data
  };
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function loadCheckpoint(checkpointPath) {
  if (!fs.existsSync(checkpointPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
  } catch (error) {
    console.warn(`Failed to load checkpoint: ${error.message}`);
    return null;
  }
}

function clearCheckpoint(checkpointPath) {
  if (fs.existsSync(checkpointPath)) {
    fs.unlinkSync(checkpointPath);
  }
}

// Execute dataset sequentially with real-time progress tracking and checkpoint support
async function executeDatasetWithProgress(dataset, contract, outputPath, progressTracker, checkpointPath) {
  let results = [];
  let startIndex = 0;

  // Try to resume from checkpoint
  if (checkpointPath) {
    const checkpoint = loadCheckpoint(checkpointPath);
    if (checkpoint && checkpoint.phase === 'execution' && checkpoint.data) {
      results = checkpoint.data.results || [];
      startIndex = checkpoint.data.lastIndex + 1;
      console.log(`\n   Resuming from checkpoint: ${results.length} policies already executed`);
    }
  }

  console.log(`Executing ${dataset.length - startIndex} policy instances sequentially (${startIndex} already done)...`);

  for (let i = startIndex; i < dataset.length; i++) {
    const policyData = dataset[i];

    try {
      const result = await executePolicy(policyData, contract);
      results.push(result);

      // Save checkpoint every 10 executions, including the dataset for full context recovery
      if (checkpointPath && (i + 1) % 10 === 0) {
        saveCheckpoint(checkpointPath, 'execution', 'executing_dataset', {
          lastIndex: i,
          results,
          dataset  // Save the dataset for complete context recovery
        });
      }

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

  // Clear checkpoint after successful completion
  if (checkpointPath) {
    clearCheckpoint(checkpointPath);
  }

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
  reportMarkdown: 'pi_report.md',
  checkpoint: 'pi_checkpoint.json'
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
    policyCount: 100,
    executionsPerPolicy: 2,  // Increased from 2 for better statistics
    satisfyRatio: 0.5,
    testRatio: 0.2,
    permutationIterations: 500,
    // PI-specific pairing configuration
    minPairsPerType: 30,
    targetPairsPerType: 50,
    maxPairsPerType: 100
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
      case '--min-pairs-per-type':
        config.minPairsPerType = parseInt(argv[++i], 10);
        break;
      case '--target-pairs-per-type':
        config.targetPairsPerType = parseInt(argv[++i], 10);
        break;
      case '--max-pairs-per-type':
        config.maxPairsPerType = parseInt(argv[++i], 10);
        break;
      case '--seed':
        config.seed = argv[++i];
        break;
      case '--resume':
        config.resume = true;
        break;
      case '--checkpoint':
        config.checkpointPath = path.resolve(argv[++i]);
        break;
      case '--use-unified-dataset':
      case '--unified':
        config.useUnifiedDataset = true;
        break;
      case '--unified-dir':
        config.unifiedDatasetDir = path.resolve(argv[++i]);
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
      default:
        if (arg.startsWith('--unified-dir=')) {
          config.unifiedDatasetDir = path.resolve(arg.split('=')[1]);
        } else {
          console.warn(`Unknown argument ${arg} ignored`);
        }
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
  console.log('  --use-unified-dataset          Reuse artifacts from unified dataset pipeline');
  console.log('  --unified-dir <path>           Override unified artifact directory');
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
  console.log('  --seed <value>                 Deterministic dataset seed');
  console.log('  --resume                       Resume from checkpoint if available');
  console.log('  --checkpoint <path>            Custom checkpoint file path');
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
  const useUnifiedDataset = Boolean(config.useUnifiedDataset);
  const startPhase = Number.isInteger(config.startPhase)
    ? config.startPhase
    : (useUnifiedDataset ? 2 : 1);
  if (startPhase < 1 || startPhase > 3) {
    throw new Error('startPhase/phase must be between 1 and 3.');
  }

  const outputDir = path.resolve(config.outputDir || path.join(__dirname, 'results'));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let datasetPath = config.datasetPath ? path.resolve(config.datasetPath) : null;
  let executionResultsPath = config.executionResultsPath ? path.resolve(config.executionResultsPath) : null;
  let unifiedPaths = null;

  if (useUnifiedDataset) {
    unifiedPaths = getArtifactPaths(config.unifiedDatasetDir);
    console.log('Using unified dataset artifacts:');
    console.log(`  Base dir: ${unifiedPaths.dir}`);
    console.log(`  Policies: ${unifiedPaths.policyDefinitions}`);
    console.log(`  Executions: ${unifiedPaths.piDataset}`);
    console.log();

    if (!datasetPath) {
      datasetPath = unifiedPaths.policyDefinitions;
    }
    if (!executionResultsPath) {
      executionResultsPath = unifiedPaths.piDataset;
    }
  }

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
  const checkpointPath = config.checkpointPath
    ? path.resolve(config.checkpointPath)
    : path.join(outputDir, DEFAULT_OUTPUT_FILENAMES.checkpoint);

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

    let dataset = null;

    // Check if resuming from a checkpoint that contains the dataset
    if (config.resume && checkpointPath) {
      const checkpoint = loadCheckpoint(checkpointPath);
      if (checkpoint && checkpoint.phase === 'execution' && checkpoint.data && checkpoint.data.dataset) {
        dataset = checkpoint.data.dataset;
        datasetMeta = dataset.__meta || inferMetaFromExecutionResults(checkpoint.data.results || []);
        console.log(`Resuming with dataset from checkpoint (${dataset.length} entries)`);
      }
    }

    // If no checkpoint dataset, check if dataset file exists
    if (!dataset && fs.existsSync(datasetOutputPath)) {
      try {
        dataset = JSON.parse(fs.readFileSync(datasetOutputPath, 'utf8'));
        datasetMeta = dataset.__meta || inferMetaFromExecutionResults(dataset);
        console.log(`Loaded existing dataset from ${datasetOutputPath} (${dataset.length} entries)`);
      } catch (err) {
        console.warn(`Failed to load dataset from ${datasetOutputPath}: ${err.message}`);
      }
    }

    // Only generate new dataset if none exists
    if (!dataset) {
      const datasetConfig = {
        policyCount: config.policyCount,
        executionsPerPolicy: config.executionsPerPolicy,
        satisfyRatio: config.satisfyRatio,
        seed: config.seed,
        // Override semantic layers to respect policyCount instead of using high minPolicies defaults
        semanticLayers: [
          {
            name: 'singleton',
            combos: [['GR'], ['DS'], ['RS']],
            minPolicies: 0  // Let policyCount control the total
          },
          {
            name: 'pair',
            combos: [['GR', 'DS'], ['GR', 'RS'], ['DS', 'RS']],
            minPolicies: 0  // Let policyCount control the total
          }
        ]
      };
      progress.startStep('Generating dataset');
      dataset = await generateDataset(datasetConfig);
      datasetMeta = dataset.__meta || inferMetaFromExecutionResults(dataset);
      fs.writeFileSync(datasetOutputPath, JSON.stringify(dataset, null, 2));
      console.log(`Dataset saved to: ${datasetOutputPath}`);
      progress.completeStep();
    } else {
      progress.startStep('Using existing dataset');
      progress.completeStep();
    }

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
    executionResults = await executeDatasetWithProgress(dataset, policyPrivacy, executionResultsOutputPath, progress, config.resume ? checkpointPath : null);
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
