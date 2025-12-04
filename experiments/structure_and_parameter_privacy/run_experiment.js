/**
 * Structure & Parameter Privacy Experiment Runner
 *
 * Tests whether policy structure and parameters leak through side channels
 * after applying postfix interpreter + padding protections.
 *
 * Phases:
 *   Phase 1 – Dataset generation & on-chain execution
 *   Phase 2 – Attack modeling (supervised, statistical, clustering)
 *   Phase 3 – Evaluation & reporting
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');

const {
  generateDataset
} = require('./data_generator');

const {
  runSupervisedAttacks,
  runStatisticalTests,
  runClusteringAttack
} = require('./attacks');

const {
  executePolicy
} = require('../policy_content_hiding/data_generator');

const {
  getArtifactPaths
} = require('../unified_dataset_artifacts');

const { ProgressTracker } = require('../core/progress');
const {
  ensureSufficientBalance,
  deployPolicyPrivacyContracts
} = require('../core/blockchain');

async function executeDatasetWithProgress(dataset, contract, outputPath, progressTracker) {
  const results = [];
  console.log(`Executing ${dataset.length} policy instances sequentially...`);

  for (let i = 0; i < dataset.length; i++) {
    const policyData = dataset[i];
    try {
      const result = await executePolicy(policyData, contract);
      results.push(result);
      if (progressTracker) {
        progressTracker.updateSubProgress(i + 1, dataset.length,
          ` | Executed ${i + 1}/${dataset.length} policies`);
      }
    } catch (error) {
      console.error(`\nError executing policy ${i}:`, error.message);
      if (progressTracker) {
        progressTracker.updateSubProgress(i + 1, dataset.length,
          ` | Executed ${i + 1}/${dataset.length} policies (1 failed)`);
      }
    }
  }

  if (progressTracker) {
    progressTracker.updateSubProgress(dataset.length, dataset.length, ' | Complete');
  }

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\n   Saved ${results.length}/${dataset.length} execution results to ${outputPath}`);

  return results;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  policyCount: 120,
  executionsPerPolicy: 3,
  satisfyRatio: 0.5,
  testRatio: 0.3,
  permutationIterations: 500,
  kValues: [2, 3, 4, 5],
  seed: 'spp-experiment'
};

const DEFAULT_THRESHOLDS = {
  maxAdvantage: 0.05,
  maxAUC: 0.55,
  minPermutationPValue: 0.05,
  maxMMD: 0.05,
  minKSPValue: 0.05,
  minSilhouette: 0.3
};

/**
 * Parse command line arguments
 */
function parseArgs(argv = process.argv.slice(2)) {
  const config = { ...DEFAULT_CONFIG };

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
      case '--permutation-iterations':
        config.permutationIterations = parseInt(argv[++i], 10);
        break;
      case '--phase':
        config.startPhase = parseInt(argv[++i], 10);
        break;
      case '--dataset':
        config.datasetPath = path.resolve(argv[++i]);
        break;
      case '--execution-results':
        config.executionResultsPath = path.resolve(argv[++i]);
        break;
      case '--seed':
        config.seed = argv[++i];
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

/**
 * Print usage information
 */
function printUsage() {
  console.log('Structure & Parameter Privacy Experiment');
  console.log('Usage: node run_experiment.js [options]');
  console.log('Options:');
  console.log('  --output <dir>                    Output directory (default: ./results)');
  console.log('  --policy-count <n>                Number of base policies to generate (default: 120)');
  console.log('  --executions-per-policy <n>       Executions per policy (default: 3)');
  console.log('  --satisfy-ratio <float>           Ratio of satisfying executions (default: 0.5)');
  console.log('  --test-ratio <float>              Train/test split ratio (default: 0.3)');
  console.log('  --permutation-iterations <n>      Permutation test iterations (default: 500)');
  console.log('  --phase <1|2|3>                   Resume from given phase');
  console.log('  --dataset <path>                  Use pre-generated dataset JSON (phase ≥2)');
  console.log('  --execution-results <path>        Path to cached execution results');
  console.log('  --use-unified-dataset             Reuse dataset/executions from unified pipeline');
  console.log('  --unified-dir <path>              Override unified artifact directory');
  console.log('  --seed <value>                    Random seed for reproducibility');
  console.log('  --help, -h                        Show this help message');
}

/**
 * Evaluate attack results against thresholds
 */
function evaluateResults(supervisedResults, statisticalResults, clusteringResults, thresholds) {
  const evaluation = {
    supervised: {},
    statistical: {},
    clustering: {},
    overallPassed: true
  };

  // Evaluate supervised attacks
  Object.entries(supervisedResults).forEach(([target, results]) => {
    const failures = [];

    results.results.forEach(result => {
      if (result.skipped) return;

      const lrAdv = result.logisticRegression?.evaluation?.advantage || 0;
      const rfAdv = result.randomForest?.evaluation?.advantage || 0;
      const permPValue = result.logisticRegression?.permutationTest?.pValue || 1;

      if (lrAdv > thresholds.maxAdvantage) {
        failures.push({
          comparison: `${result.class0} vs ${result.class1}`,
          attack: 'Logistic Regression',
          metric: 'advantage',
          value: lrAdv,
          threshold: thresholds.maxAdvantage
        });
      }

      if (rfAdv > thresholds.maxAdvantage) {
        failures.push({
          comparison: `${result.class0} vs ${result.class1}`,
          attack: 'Random Forest',
          metric: 'advantage',
          value: rfAdv,
          threshold: thresholds.maxAdvantage
        });
      }

      if (permPValue < thresholds.minPermutationPValue) {
        failures.push({
          comparison: `${result.class0} vs ${result.class1}`,
          attack: 'Permutation Test',
          metric: 'p-value',
          value: permPValue,
          threshold: thresholds.minPermutationPValue
        });
      }
    });

    evaluation.supervised[target] = {
      passed: failures.length === 0,
      failures
    };

    if (failures.length > 0) {
      evaluation.overallPassed = false;
    }
  });

  // Evaluate statistical tests
  Object.entries(statisticalResults).forEach(([target, results]) => {
    const failures = [];

    results.results.forEach(result => {
      if (result.mmd.mmd > thresholds.maxMMD) {
        failures.push({
          comparison: `${result.class0} vs ${result.class1}`,
          test: 'MMD',
          value: result.mmd.mmd,
          threshold: thresholds.maxMMD
        });
      }

      if (result.avgKsPValue < thresholds.minKSPValue) {
        failures.push({
          comparison: `${result.class0} vs ${result.class1}`,
          test: 'KS Test',
          value: result.avgKsPValue,
          threshold: thresholds.minKSPValue
        });
      }
    });

    evaluation.statistical[target] = {
      passed: failures.length === 0,
      failures
    };

    if (failures.length > 0) {
      evaluation.overallPassed = false;
    }
  });

  // Evaluate clustering
  Object.entries(clusteringResults).forEach(([target, results]) => {
    const failures = [];

    results.results.forEach(result => {
      // High silhouette indicates good clustering (potential leak)
      if (result.silhouette > thresholds.minSilhouette) {
        failures.push({
          k: result.k,
          metric: 'silhouette',
          value: result.silhouette,
          threshold: thresholds.minSilhouette
        });
      }

      // High ARI indicates clustering matches true labels (leak)
      if (result.ari !== null && result.ari > 0.3) {
        failures.push({
          k: result.k,
          metric: 'ARI',
          value: result.ari,
          threshold: 0.3
        });
      }
    });

    evaluation.clustering[target] = {
      passed: failures.length === 0,
      failures
    };

    if (failures.length > 0) {
      evaluation.overallPassed = false;
    }
  });

  return evaluation;
}

/**
 * Generate markdown report
 */
function generateMarkdownReport(report) {
  const lines = [];

  lines.push('# Structure & Parameter Privacy Evaluation Report');
  lines.push('');
  lines.push(`**Date:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');

  lines.push('## Objective');
  lines.push('');
  lines.push('Evaluate whether policy structure and parameters leak through side channels');
  lines.push('after applying postfix interpreter + padding protections.');
  lines.push('');

  lines.push('## Configuration');
  lines.push('');
  lines.push(`- **Policy count:** ${report.config.policyCount}`);
  lines.push(`- **Executions per policy:** ${report.config.executionsPerPolicy}`);
  lines.push(`- **Satisfy ratio:** ${report.config.satisfyRatio.toFixed(2)}`);
  lines.push(`- **Test ratio:** ${(report.config.testRatio * 100).toFixed(0)}%`);
  if (report.dataset.meta?.families !== undefined) {
    lines.push(`- **Generated families:** ${report.dataset.meta.families}`);
  }
  if (report.dataset.meta?.totalExecutions !== undefined) {
    lines.push(`- **Total executions:** ${report.dataset.meta.totalExecutions}`);
  }
  lines.push('');

  if (report.dataset.meta?.sppSummary) {
    const summary = report.dataset.meta.sppSummary;
    lines.push('**Dataset coverage:**');
    lines.push('');
    lines.push(`- Structure types: ${JSON.stringify(summary.structureTypes)}`);
    lines.push(`- Predicate combos: ${JSON.stringify(summary.predicateCombos)}`);
    lines.push(`- Parameter types: ${JSON.stringify(summary.parameterTypes)}`);
    lines.push('');
  }

  lines.push('## Attack Results');
  lines.push('');

  // Supervised attacks
  lines.push('### Supervised Classification Attacks');
  lines.push('');
  Object.entries(report.attacks.supervised).forEach(([target, results]) => {
    lines.push(`#### Target: ${target}`);
    lines.push('');

    const passed = report.evaluation.supervised[target].passed;
    lines.push(`**Status:** ${passed ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');

    if (!passed) {
      lines.push('**Failures:**');
      report.evaluation.supervised[target].failures.forEach(failure => {
        lines.push(`- ${failure.comparison} / ${failure.attack}: ${failure.metric}=${failure.value.toFixed(4)} (threshold: ${failure.threshold})`);
      });
      lines.push('');
    }
  });

  // Statistical tests
  lines.push('### Statistical Hypothesis Tests');
  lines.push('');
  Object.entries(report.attacks.statistical).forEach(([target, results]) => {
    lines.push(`#### Target: ${target}`);
    lines.push('');

    const passed = report.evaluation.statistical[target].passed;
    lines.push(`**Status:** ${passed ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');

    if (!passed) {
      lines.push('**Failures:**');
      report.evaluation.statistical[target].failures.forEach(failure => {
        lines.push(`- ${failure.comparison} / ${failure.test}: ${failure.value.toFixed(4)} (threshold: ${failure.threshold})`);
      });
      lines.push('');
    }
  });

  // Clustering attacks
  lines.push('### Unsupervised Clustering Attacks');
  lines.push('');
  Object.entries(report.attacks.clustering).forEach(([target, results]) => {
    lines.push(`#### Target: ${target}`);
    lines.push('');

    const passed = report.evaluation.clustering[target].passed;
    lines.push(`**Status:** ${passed ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');

    if (!passed) {
      lines.push('**Failures:**');
      report.evaluation.clustering[target].failures.forEach(failure => {
        lines.push(`- k=${failure.k} / ${failure.metric}: ${failure.value.toFixed(4)} (threshold: ${failure.threshold})`);
      });
      lines.push('');
    }
  });

  lines.push('## Conclusion');
  lines.push('');
  lines.push(`**Overall Status:** ${report.evaluation.overallPassed ? '✓ PASS' : '✗ FAIL'}`);
  lines.push('');
  lines.push(report.conclusion);
  lines.push('');

  return lines.join('\n');
}

/**
 * Main experiment runner
 */
async function runExperiment(config = {}) {
  const useUnifiedDataset = Boolean(config.useUnifiedDataset);
  const startPhase = Number.isInteger(config.startPhase)
    ? config.startPhase
    : (useUnifiedDataset ? 2 : 1);
  const outputDir = path.resolve(config.outputDir || path.join(__dirname, 'results'));

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputDatasetPath = path.join(outputDir, 'dataset.json');
  let datasetSourcePath = config.datasetPath ? path.resolve(config.datasetPath) : null;
  let executionResultsPath = config.executionResultsPath ? path.resolve(config.executionResultsPath) : null;

  let unifiedPaths = null;
  if (useUnifiedDataset) {
    unifiedPaths = getArtifactPaths(config.unifiedDatasetDir);
    console.log('Using unified dataset artifacts:');
    console.log(`  Base dir: ${unifiedPaths.dir}`);
    console.log(`  Policies: ${unifiedPaths.policyDefinitions}`);
    console.log(`  Executions: ${unifiedPaths.sppDataset}`);
    console.log();

    if (!datasetSourcePath) {
      datasetSourcePath = unifiedPaths.policyDefinitions;
    }
    if (!executionResultsPath) {
      executionResultsPath = unifiedPaths.sppDataset;
    }
  }

  if (!datasetSourcePath) {
    datasetSourcePath = outputDatasetPath;
  }

  if (!executionResultsPath) {
    executionResultsPath = path.join(outputDir, 'execution_results.json');
  }
  const reportJsonPath = path.join(outputDir, 'report.json');
  const reportMarkdownPath = path.join(outputDir, 'report.md');

  let dataset = null;
  let datasetMeta = null;
  let executionResults = null;

  console.log('='.repeat(60));
  console.log('Structure & Parameter Privacy Experiment');
  console.log('='.repeat(60));
  console.log(`Starting from phase ${startPhase}`);
  console.log('');

  const totalSteps = (startPhase <= 1 ? 4 : 0) + 4;
  const progress = new ProgressTracker(totalSteps);

  // Phase 1: Dataset generation & on-chain execution
  if (startPhase <= 1) {
    progress.startStep('Generating dataset with structure annotations');
    dataset = await generateDataset({
      policyCount: config.policyCount,
      executionsPerPolicy: config.executionsPerPolicy,
      satisfyRatio: config.satisfyRatio,
      seed: config.seed,
      duoTerms: config.duoTerms,
      semanticLayers: config.semanticLayers
    });
    datasetMeta = dataset.__meta;

    fs.writeFileSync(outputDatasetPath, JSON.stringify(dataset, null, 2));
    datasetSourcePath = outputDatasetPath;
    console.log(`Dataset saved to: ${outputDatasetPath}`);
    if (datasetMeta?.sppSummary) {
      console.log('Structure coverage:', datasetMeta.sppSummary.structureTypes);
      console.log('Parameter coverage:', datasetMeta.sppSummary.parameterTypes);
      console.log('Predicate coverage:', datasetMeta.sppSummary.predicateCombos);
    }
    progress.completeStep();

    const provider = ethers.provider;
    const [signer] = await ethers.getSigners();
    await ensureSufficientBalance({
      provider,
      signer,
      executionCount: dataset.length
    });

    progress.startStep('Deploying PolicyPrivacy contracts');
    const policyPrivacy = await deployPolicyPrivacyContracts();
    progress.completeStep();

    progress.startStep(`Executing ${dataset.length} policies on-chain`);
    executionResults = await executeDatasetWithProgress(
      dataset,
      policyPrivacy,
      executionResultsPath,
      progress
    );
    progress.completeStep();
  } else {
    if (fs.existsSync(datasetSourcePath)) {
      dataset = JSON.parse(fs.readFileSync(datasetSourcePath, 'utf8'));
      datasetMeta = dataset.__meta;
      console.log(`Loaded dataset metadata from: ${datasetSourcePath}`);
    } else {
      console.warn(`Dataset file not found at ${datasetSourcePath}. Provide --dataset <path> if needed.`);
    }

    const resolvedExecPath = config.executionResultsPath || executionResultsPath;
    if (!fs.existsSync(resolvedExecPath)) {
      throw new Error(`Execution results not found at ${resolvedExecPath}`);
    }
    executionResults = JSON.parse(fs.readFileSync(resolvedExecPath, 'utf8'));
    console.log(`Loaded execution results from: ${resolvedExecPath}`);
  }

  // Phase 2: Attack modeling
  console.log('\nPhase 2: Attack Modeling');
  console.log('-'.repeat(60));

  progress.startStep('Running supervised classification attacks');
  const supervisedStructure = runSupervisedAttacks(executionResults, {
    targetAttribute: 'structureType',
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });

  const supervisedPredicate = runSupervisedAttacks(executionResults, {
    targetAttribute: 'predicateCombo',
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });

  const supervisedParam = runSupervisedAttacks(executionResults, {
    targetAttribute: 'paramType',
    testRatio: config.testRatio,
    permutationIterations: config.permutationIterations
  });
  progress.completeStep();

  progress.startStep('Running statistical hypothesis tests');
  const statisticalStructure = runStatisticalTests(executionResults, {
    targetAttribute: 'structureType'
  });

  const statisticalPredicate = runStatisticalTests(executionResults, {
    targetAttribute: 'predicateCombo'
  });

  const statisticalParam = runStatisticalTests(executionResults, {
    targetAttribute: 'paramType'
  });
  progress.completeStep();

  progress.startStep('Running unsupervised clustering attacks');
  const clusteringStructure = runClusteringAttack(executionResults, {
    targetAttribute: 'structureType',
    kValues: config.kValues
  });

  const clusteringPredicate = runClusteringAttack(executionResults, {
    targetAttribute: 'predicateCombo',
    kValues: config.kValues
  });

  const clusteringParam = runClusteringAttack(executionResults, {
    targetAttribute: 'paramType',
    kValues: config.kValues
  });
  progress.completeStep();

  // Phase 3: Evaluation & reporting
  console.log('\nPhase 3: Evaluation & Reporting');
  console.log('-'.repeat(60));

  progress.startStep('Generating evaluation and reports');

  const supervisedResults = {
    structureType: supervisedStructure,
    predicateCombo: supervisedPredicate,
    paramType: supervisedParam
  };

  const statisticalResults = {
    structureType: statisticalStructure,
    predicateCombo: statisticalPredicate,
    paramType: statisticalParam
  };

  const clusteringResults = {
    structureType: clusteringStructure,
    predicateCombo: clusteringPredicate,
    paramType: clusteringParam
  };

  const evaluation = evaluateResults(
    supervisedResults,
    statisticalResults,
    clusteringResults,
    DEFAULT_THRESHOLDS
  );

  const report = {
    experiment: 'Structure & Parameter Privacy',
    timestamp: new Date().toISOString(),
    config: {
      policyCount: config.policyCount,
      executionsPerPolicy: config.executionsPerPolicy,
      satisfyRatio: config.satisfyRatio,
      testRatio: config.testRatio,
      seed: config.seed
    },
    dataset: {
      meta: datasetMeta,
      datasetPath: datasetSourcePath,
      executionResultsPath
    },
    thresholds: DEFAULT_THRESHOLDS,
    attacks: {
      supervised: supervisedResults,
      statistical: statisticalResults,
      clustering: clusteringResults
    },
    evaluation,
    conclusion: evaluation.overallPassed
      ? 'Policy structure and parameters appear well-protected against side-channel analysis.'
      : 'Potential leakage detected in structure or parameters. Further hardening recommended.'
  };

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(reportMarkdownPath, generateMarkdownReport(report));

  console.log(`Saved JSON report to: ${reportJsonPath}`);
  console.log(`Saved Markdown report to: ${reportMarkdownPath}`);
  progress.completeStep();

  progress.complete();
  console.log('');
  console.log(`Overall status: ${evaluation.overallPassed ? 'PASS' : 'FAIL'}`);
  console.log('='.repeat(60));

  return report;
}

// CLI entry point
if (require.main === module) {
  const config = parseArgs();

  if (config.help) {
    printUsage();
    process.exit(0);
  }

  console.log('Configuration:', config);

  runExperiment(config)
    .then((report) => {
      process.exit(report.evaluation.overallPassed ? 0 : 1);
    })
    .catch((error) => {
      console.error('Experiment failed:', error);
      process.exit(1);
    });
}

module.exports = { runExperiment };
