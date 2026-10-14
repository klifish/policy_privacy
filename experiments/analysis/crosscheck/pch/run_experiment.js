/**
 * Policy Content Hiding Evaluation Experiment
 *
 * Main experiment runner that executes all phases:
 * 1. Data generation and execution
 * 2. Feature extraction
 * 3. Attack modeling
 * 4. Evaluation
 * 5. Reporting
 */

const fs = require('fs');
const path = require('path');
const { parseCommonArgs, printCommonHelp, runMain } = require('../../../core/cli');
const { resolveDatasetPaths } = require('../../../core/dataset');

// DUO term ID to attribute code mapping
const {
  loadDataset,
  evaluateDatasetQuality,
  formatQualityReport
} = require('./dataset_quality');

const {
  extractFeatures,
  normalizeFeatures,
  splitTrainTest,
  prepareClassificationData,
  calculateFeatureStats
} = require('../../../core/feature_extractor');

const {
  LogisticRegression,
  RandomForest
} = require('../../../core/classifiers');

const {
  evaluateClassificationTasks,
  checkPrivacyThresholds,
  calculateAUC,
  permutationTestAUC,
  evaluateBinaryClassification,
  calculateConfusionMatrix
} = require('../../../core/evaluator');

const { evaluateMultiseed, printVerdict, pickVerdictText } = require('../../../core/multiseed_criterion');


// bothAttacks, buildPchRecordsForSeed and DUO_TO_ATTRIBUTE_CODE live in
// ./seed_records (a lightweight module the parallel worker can load without the
// hardhat/ffjavascript graph that core/dataset/data_generator pulls in).
const {
  buildPchRecordsForSeed,
  DUO_TO_ATTRIBUTE_CODE,
  hasDuoTerm,
  observedDuoTermIdsOf
} = require("./seed_records");
function parseArgs(argv = process.argv.slice(2)) {
  const config = parseCommonArgs(argv.filter(a => a !== '--'));

  // Handle PCH-specific args and special aliases from _unknown list
  const unknown = config._unknown || [];
  delete config._unknown;

  for (let i = 0; i < unknown.length; i++) {
    const arg = unknown[i];
    if (arg === '--executions') {
      const value = unknown[++i];
      if (/^\d+$/.test(value)) {
        config.executionsPerPolicy = parseInt(value, 10);
      } else {
        config.executionResultsPath = path.resolve(value);
      }
    } else if (arg === '--features' || arg === '--results') {
      config.featuresPath = path.resolve(unknown[++i]);
    } else if (arg === '--num-duo-terms') {
      config.numDuoTerms = parseInt(unknown[++i], 10);
    } else if (arg === '--auc-threshold') {
      config.aucThreshold = parseFloat(unknown[++i]);
    } else if (arg === '--evaluate-dataset' || arg === '--dataset-quality') {
      config.evaluateDataset = true;
    } else if (arg === '--dataset-quality-output') {
      config.datasetQualityOutput = path.resolve(unknown[++i]);
    } else if (arg === '--per-outcome') {
      config.perOutcome = true;
    } else if (arg === '--permutation-iterations') {
      config.permutationIterations = parseInt(unknown[++i], 10);
    } else {
      console.warn(`Ignoring unknown argument: ${arg}`);
    }
  }

  return config;
}

function printUsage() {
  console.log('Policy Content Hiding Experiment');
  console.log('Usage: node run_experiment.js [options]');
  printCommonHelp();
  console.log();
  console.log('PCH-specific options:');
  console.log('  --features <path>               Path to saved features (for resuming at phase 3)');
  console.log('  --results <path>                Alias for --features');
  console.log('  --executions <value>            Executions per policy (number) or execution results path (legacy)');
  console.log('  --num-duo-terms <n>             Number of DUO terms to include when generating data');
  console.log('  --auc-threshold <float>         AUC threshold for privacy checks');
  console.log('  --evaluate-dataset              Evaluate dataset quality after generation or load');
  console.log('  --dataset-quality-output <path> Override path for dataset quality JSON output');
}

async function runExperiment(config = {}) {
  const {
    numDuoTerms = 10,
    executionsPerPolicy = 2,
    policyCount = undefined,
    network = 'localhost',
    outputDir = path.resolve(__dirname, '../../../results/crosscheck/pch', network),
    testRatio = 0.3,
    aucThreshold = 0.55,
    startPhase: startPhaseOverride = undefined,
    datasetPath: initialDatasetPath = null,
    executionResultsPath: initialExecutionResultsPath = null,
    featuresPath = null,
    evaluateDataset = false,
    datasetQualityOutput = null,
    phase: phaseAlias = undefined,
    useUnifiedDataset = false,
    unifiedDatasetDir = null
  } = config;

  const startAtPhase = Number.isInteger(phaseAlias)
    ? phaseAlias
    : Number.isInteger(startPhaseOverride)
      ? startPhaseOverride
      : (useUnifiedDataset ? 2 : 1);

  if (startAtPhase < 1 || startAtPhase > 3) {
    throw new Error('startPhase/phase must be between 1 and 3 when resuming the experiment.');
  }

  const resolvedOutputDir = path.resolve(outputDir);
  if (!fs.existsSync(resolvedOutputDir)) {
    fs.mkdirSync(resolvedOutputDir, { recursive: true });
  }

  let featuresPathOverride = featuresPath ? path.resolve(featuresPath) : null;

  const { datasetPath, executionResultsPath } = resolveDatasetPaths(
    { useUnifiedDataset, unifiedDatasetDir, network, datasetPath: initialDatasetPath, executionResultsPath: initialExecutionResultsPath },
    'pch'
  );
  let datasetPathOverride = datasetPath ? path.resolve(datasetPath) : null;
  let executionResultsPathOverride = executionResultsPath ? path.resolve(executionResultsPath) : null;

  const timestamp = Date.now();
  const datasetOutputPath = datasetPathOverride
    ? datasetPathOverride
    : path.join(resolvedOutputDir, `dataset_${timestamp}.json`);
  const executionResultsOutputPath = executionResultsPathOverride
    ? executionResultsPathOverride
    : path.join(resolvedOutputDir, 'execution_results.json');
  const featuresOutputPath = featuresPathOverride
    ? featuresPathOverride
    : path.join(resolvedOutputDir, 'features.json');
  const datasetQualityOutputPath = datasetQualityOutput
    ? path.resolve(datasetQualityOutput)
    : path.join(resolvedOutputDir, 'dataset_quality.json');

  let datasetQualityHandled = false;

  function maybeEvaluateDataset(currentDataset, sourcePath) {
    if (!evaluateDataset || datasetQualityHandled) {
      return;
    }
    if (!Array.isArray(currentDataset)) {
      console.warn('Dataset quality requested but dataset is unavailable or invalid.');
      return;
    }
    try {
      const quality = evaluateDatasetQuality(currentDataset);
      fs.writeFileSync(datasetQualityOutputPath, JSON.stringify(quality, null, 2));
      console.log('Dataset Quality Summary');
      console.log('-'.repeat(60));
      console.log(formatQualityReport(quality));
      console.log();
      console.log(`Dataset quality report saved to: ${datasetQualityOutputPath}`);
      if (sourcePath) {
        console.log(`Evaluated dataset source: ${sourcePath}`);
      }
      console.log();
      datasetQualityHandled = true;
    } catch (error) {
      console.error('Dataset quality evaluation failed:', error.message);
    }
  }

  console.log('='.repeat(60));
  console.log('Policy Content Hiding Evaluation Experiment');
  console.log('='.repeat(60));
  console.log();

  const duoTerms = Object.values(DUO_TO_ATTRIBUTE_CODE).slice(0, numDuoTerms);
  console.log(`Using DUO terms: ${duoTerms.join(', ')}`);
  console.log();

  let dataset;
  let executionResults;
  let features;
  let normalizedFeatures;
  let featureStats;

  if (evaluateDataset && !datasetQualityHandled) {
    const candidatePath = datasetPath
      ? path.resolve(datasetPath)
      : datasetOutputPath;
    if (fs.existsSync(candidatePath)) {
      try {
        dataset = loadDataset(candidatePath);
        maybeEvaluateDataset(dataset, candidatePath);
      } catch (error) {
        console.error('Failed to evaluate dataset quality:', error.message);
      }
    } else {
      console.warn('Dataset quality requested but dataset file not found. Provide --dataset <path>.');
    }
  }

  // Phase 2: Feature Extraction
  if (startAtPhase <= 2) {
    console.log('Phase 2: Feature Extraction');
    console.log('-'.repeat(60));

    if (!executionResults) {
      if (!fs.existsSync(executionResultsOutputPath)) {
        throw new Error('Execution results not found. Provide --execution-results <path> or run phase 1 first.');
      }

      console.log(`Loading execution results from: ${executionResultsOutputPath}`);
      executionResults = JSON.parse(fs.readFileSync(executionResultsOutputPath, 'utf8'));
      console.log(`Loaded ${executionResults.length} execution results`);
      console.log();
    }

    features = extractFeatures(executionResults);
    console.log(`Extracted ${features.length} feature vectors`);

    featureStats = calculateFeatureStats(features);
    console.log('Feature statistics:');
    for (const [name, stats] of Object.entries(featureStats)) {
      console.log(`  ${name}: mean=${stats.mean.toFixed(2)}, std=${stats.std.toFixed(2)}`);
    }
    console.log();

    fs.writeFileSync(
      featuresOutputPath,
      JSON.stringify({ features, stats: featureStats }, null, 2)
    );
    console.log(`Features saved to: ${featuresOutputPath}`);
    console.log();

    normalizedFeatures = normalizeFeatures(features);
  } else {
    console.log('Skipping Phase 2: Feature Extraction');
    console.log();

    if (!features) {
      if (!fs.existsSync(featuresOutputPath)) {
        throw new Error('Features not found. Provide --features <path> or run phase 2 first.');
      }

      console.log(`Loading features from: ${featuresOutputPath}`);
      const stored = JSON.parse(fs.readFileSync(featuresOutputPath, 'utf8'));

      if (Array.isArray(stored)) {
        features = stored;
        featureStats = calculateFeatureStats(features);
      } else {
        features = stored.features;
        featureStats = stored.stats || calculateFeatureStats(features);
      }

      console.log(`Loaded ${features.length} feature vectors`);
      console.log();

      normalizedFeatures = normalizeFeatures(features);
    }
  }

  if (!normalizedFeatures || normalizedFeatures.length === 0) {
    throw new Error('No features available for attack modeling. Ensure phase 2 has been executed or provide a features file.');
  }

  // Phase 3: Attack Modeling
  console.log('Phase 3: Attack Modeling');
  console.log('-'.repeat(60));

  const { train: trainData, test: testData } = splitTrainTest(normalizedFeatures, testRatio);
  console.log(`Split data: ${trainData.length} train, ${testData.length} test`);
  console.log();

  const classificationResults = [];
  // Multi-label: a term counts as observed when any row carries it, not only
  // rows whose primary term it is.
  const observedDuoTermIds = observedDuoTermIdsOf(normalizedFeatures);

  const duoTrain = prepareClassificationData(trainData, 'duoTerm');
  const duoTest = prepareClassificationData(testData, 'duoTerm');

  console.log('Task 1: DUO Term Presence Prediction (Binary)');
  for (const duoTermId of observedDuoTermIds) {
    console.log(`  Training classifier for DUO term ${duoTermId}...`);

    // Multi-label: present if primary term or anywhere in duoTermCodes.
    const trainY = trainData.map(f => (hasDuoTerm(f, duoTermId) ? 1 : 0));
    const testY = testData.map(f => (hasDuoTerm(f, duoTermId) ? 1 : 0));

    // Log label distribution
    const trainPositives = trainY.filter(y => y === 1).length;
    const testPositives = testY.filter(y => y === 1).length;
    const trainRatio = trainPositives / trainY.length;
    const testRatio = testPositives / testY.length;

    console.log(`    Train: ${trainPositives}/${trainY.length} positive (${(trainRatio * 100).toFixed(1)}%)`);
    console.log(`    Test: ${testPositives}/${testY.length} positive (${(testRatio * 100).toFixed(1)}%)`);

    // Warn about severe class imbalance
    if (testRatio < 0.3 || testRatio > 0.7) {
      console.log(`    ⚠️  Class imbalance detected - Accuracy metric may be misleading!`);
    }

    const lr = new LogisticRegression(0.1, 500);
    lr.train(duoTrain.X, trainY);

    const predictions = lr.predict(duoTest.X);
    const probabilities = lr.predictProba(duoTest.X);

    classificationResults.push({
      type: 'binary',
      taskName: `DUO Term ${duoTermId} Presence`,
      classifier: 'LogisticRegression',
      yTrue: testY,
      yPred: predictions,
      yProba: probabilities,
      classDistribution: {
        testPositive: testPositives,
        testTotal: testY.length,
        testRatio: testRatio
      }
    });
  }
  console.log();

  console.log('Task 2: ICD-10 Chapter Prediction (Multi-class)');
  console.log('  Training Random Forest classifier...');

  // Only rows that actually carry an ICD-10 chapter; otherwise the label set
  // includes `undefined` (rows from other ontologies) and the task degenerates.
  const icdTrainData = trainData.filter(f => f.icd10Chapter !== undefined && f.icd10Chapter !== null);
  const icdTestData = testData.filter(f => f.icd10Chapter !== undefined && f.icd10Chapter !== null);
  const icdTrain = prepareClassificationData(icdTrainData, 'icd10Chapter');
  const icdTest = prepareClassificationData(icdTestData, 'icd10Chapter');

  const randomForest = new RandomForest(10, 5);
  randomForest.train(icdTrain.X, icdTrain.y);
  const randomForestPredictions = randomForest.predict(icdTest.X);

  classificationResults.push({
    type: 'multi-class',
    taskName: 'ICD-10 Chapter Prediction (RandomForest)',
    classifier: 'RandomForest',
    yTrue: icdTest.y,
    yPred: randomForestPredictions
  });
  console.log();

  // Phase 4: Evaluation
  console.log('Phase 4: Evaluation');
  console.log('-'.repeat(60));

  const evaluation = evaluateClassificationTasks(classificationResults);

  console.log('Classification Results (Privacy Metrics):');
  console.log('Note: AUC is the primary single-split privacy diagnostic.');
  console.log('AUC ≤ 0.55 indicates the adversary cannot rank samples better than random.');
  console.log('');
  for (const result of evaluation.results) {
    console.log(`Task: ${result.task}`);
    console.log(`  Type: ${result.type}`);

    // Show class distribution if available
    if (result.classDistribution) {
      const dist = result.classDistribution;
      console.log(`  Test Set: ${dist.testPositive}/${dist.testTotal} positive (${(dist.testRatio * 100).toFixed(1)}%)`);
    }

    // Primary privacy metrics
    if (result.auc !== null && result.auc !== undefined) {
      const aucStatus = result.auc <= aucThreshold ? '✓' : '✗';
      console.log(`  ${aucStatus} AUC: ${result.auc.toFixed(4)} (threshold: ≤${aucThreshold})`);
    }

    // Secondary metrics for diagnostics
    if (result.type === 'binary') {
      console.log(`  Precision: ${(result.precision * 100).toFixed(2)}%, Recall: ${(result.recall * 100).toFixed(2)}%, F1: ${(result.f1 * 100).toFixed(2)}%`);
    }

    if (result.type === 'multi-class' && result.macroF1 !== undefined && result.macroF1 !== null) {
      console.log(`  Macro F1: ${(result.macroF1 * 100).toFixed(2)}%`);
    }

    console.log();

    // Note: Accuracy removed - misleading for imbalanced datasets
    // Use AUC as the primary metric for privacy evaluation
  }
  console.log();

  // Check privacy thresholds
  const privacyCheck = checkPrivacyThresholds(evaluation, {
    aucMax: aucThreshold
  });

  console.log('Privacy Threshold Check:');
  console.log(`  AUC Threshold: ≤ ${aucThreshold}`);
  console.log();

  for (const result of privacyCheck.results) {
    console.log(`  ${result.task}: ${result.passed ? '✓ PASS' : '✗ FAIL'}`);
    for (const check of result.checks) {
      const status = check.passed ? '✓' : '✗';
      console.log(`    ${status} ${check.metric}: ${check.value.toFixed(4)} (threshold: ${check.threshold})`);
    }
  }
  console.log();
  console.log(`Single-split (diagnostic) Overall: ${privacyCheck.overallPassed ? '✓ PASS' : '✗ FAIL'}`);
  console.log();

  // Authoritative verdict: multi-seed, policy-disjoint, AUC + permutation test.
  // The single split above is kept only as a diagnostic — its AUC has std ~0.05
  // at ~3 executions/policy, and raw accuracy advantage is unstable on imbalanced test
  // sets, so it is not the basis for PASS/FAIL.
  const multiseedSeeds = config.multiseedSeeds ?? 30;
  const permIterations = config.permutationIterations || 200;
  // Random-forest hyperparameters for the second (non-linear) attacker, matching
  // SPP's forest (50 trees, depth 10). A depth scan (3→10) confirmed RF's
  // higher-than-LR AUC on some ICD chapters is NOT depth overfitting — the AUC
  // is depth-invariant (~0.6 even at depth 3), i.e. RF is finding a genuine but
  // weak non-linear structure in the gas features that the linear model can't.
  // That weak signal is governed by the gas features' low ICC (<0.4: within-
  // policy pad noise exceeds between-policy signal), so the permutation test is
  // what decides whether it is a real channel. Hence the verdict's double
  // criterion (AUC AND permutation) rather than depth tuning.
  const rfOpts = {
    trees: config.rfTrees || 50,
    maxDepth: config.rfMaxDepth || 10
  };
  const seedCtx = {
    normalizedFeatures,
    observedDuoTermIds,
    testRatio,
    permutationIterations: permIterations,
    rfOpts,
    perOutcome: config.perOutcome === true
  };
  const concurrency = config.concurrency ?? 1;
  const verdict = await evaluateMultiseed(
    (seedIndex, baseSeed) => buildPchRecordsForSeed(seedIndex, seedCtx, baseSeed),
    {
      seeds: multiseedSeeds,
      permutationIterations: permIterations,
      includeSeedRecords: config.includeSeedRecords === true,
      // Parallel verdict: each worker re-derives normalizedFeatures from the saved
      // features file and re-runs buildPchRecordsForSeed per seed in its own V8
      // isolate; results replayed in seed order → byte-identical to serial.
      concurrency,
      workerEntry: concurrency > 1 ? path.join(__dirname, 'multiseed_worker.js') : undefined,
      workerData: concurrency > 1 ? {
        featuresOutputPath,
        testRatio,
        permutationIterations: permIterations,
        rfOpts,
        perOutcome: config.perOutcome === true
      } : undefined
    });

  printVerdict('Policy Content Hiding', verdict);
  console.log();

  // Phase 5: Reporting
  console.log('Phase 5: Reporting');
  console.log('-'.repeat(60));

  const icdChapterCount = new Set(
    normalizedFeatures
      .map(f => f.icd10Chapter)
      .filter(v => v !== undefined && v !== null)
  ).size;
  const totalExecutions = executionResults
    ? executionResults.length
    : features
      ? features.length
      : normalizedFeatures.length;

  const report = {
    experiment: 'Policy Content Hiding Evaluation',
    timestamp: new Date().toISOString(),
    config: {
      numDuoTermsRequested: numDuoTerms,
      numDuoTermsObserved: observedDuoTermIds.length,
      numIcd10Chapters: icdChapterCount,
      executionsPerPolicy,
      totalExecutions,
      testRatio
    },
    diagnostics: {
      note: 'Single-split diagnostic only — superseded by multiseedVerdict for PASS/FAIL.',
      evaluation,
      privacyCheck
    },
    multiseedVerdict: verdict, // authoritative
    featureStats,
    overallPassed: verdict.overallPassed,
    conclusion: pickVerdictText(verdict.overallPassed, {
      pass: 'System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).',
      fail: 'WARNING: System may leak policy content information. Multi-seed attack exceeds privacy thresholds.',
      inconclusive: 'INCONCLUSIVE: no gating task was judgeable, so no privacy claim is made.'
    })
  };

  const reportPath = path.join(resolvedOutputDir, 'evaluation_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Saved evaluation report to: ${reportPath}`);

  const readableReportPath = path.join(resolvedOutputDir, 'evaluation_report.md');
  const readableReport = generateReadableReport(report);
  fs.writeFileSync(readableReportPath, readableReport);
  console.log(`Saved readable report to: ${readableReportPath}`);
  console.log();

  console.log('='.repeat(60));
  console.log('Experiment Complete');
  console.log('='.repeat(60));

  return report;
}

function generateReadableReport(report) {
  const lines = [];

  lines.push('# Policy Content Hiding Evaluation Report');
  lines.push('');
  lines.push(`**Date:** ${new Date(report.timestamp).toLocaleString()}`);
  lines.push('');

  lines.push('## Objective');
  lines.push('');
  lines.push('Evaluate whether the Policy Privacy system achieves **Policy Content Hiding** — i.e., an adversary observing only on-chain transcripts cannot infer DUO terms or ICD-10 codes better than random guessing.');
  lines.push('');

  lines.push('## Experiment Configuration');
  lines.push('');
  lines.push(`- **DUO Terms (requested):** ${report.config.numDuoTermsRequested}`);
  lines.push(`- **DUO Terms (observed):** ${report.config.numDuoTermsObserved ?? 'N/A'}`);
  lines.push(`- **ICD-10 Chapters:** ${report.config.numIcd10Chapters}`);
  lines.push(`- **Executions per Policy:** ${report.config.executionsPerPolicy}`);
  lines.push(`- **Total Executions:** ${report.config.totalExecutions}`);
  lines.push(`- **Test Ratio:** ${(report.config.testRatio * 100).toFixed(0)}%`);
  lines.push('');

  lines.push('## Privacy Evaluation Results');
  lines.push('');
  lines.push('**Note:** AUC (Area Under ROC Curve) is the primary single-split privacy diagnostic.');
  lines.push('- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random');
  lines.push('');
  lines.push('> Accuracy metric removed: misleading for imbalanced datasets in privacy evaluation.');
  lines.push('');

  for (const result of report.diagnostics.evaluation.results) {
    lines.push(`### ${result.task}`);
    lines.push('');
    lines.push(`- **Type:** ${result.type}`);

    // Primary privacy metrics first
    if (result.auc !== null && result.auc !== undefined) {
      const aucStatus = result.auc <= 0.55 ? '✓ PASS' : '✗ FAIL';
      lines.push(`- **AUC:** ${result.auc.toFixed(4)} (${aucStatus})`);
    }

    // Secondary metrics
    if (result.type === 'multi-class' && result.macroF1 !== undefined && result.macroF1 !== null) {
      lines.push(`- **Macro F1:** ${(result.macroF1 * 100).toFixed(2)}%`);
    }

    lines.push('');
  }

  lines.push('## Privacy Threshold Check');
  lines.push('');
  lines.push(`- **AUC Threshold:** ≤ ${report.diagnostics.privacyCheck.thresholds.aucMax}`);
  lines.push('');

  for (const result of report.diagnostics.privacyCheck.results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    lines.push(`### ${result.task}: ${status}`);
    lines.push('');

    for (const check of result.checks) {
      const checkStatus = check.passed ? '✓' : '✗';
      lines.push(`- ${checkStatus} **${check.metric}:** ${check.value.toFixed(4)} (threshold: ${check.threshold})`);
    }

    lines.push('');
  }

  // Authoritative multi-seed verdict table (the basis for PASS/FAIL). Lists
  // every gating task (DUO terms + ICD-10 chapters one-vs-rest) so the report
  // faithfully shows each task's verdict, including any boundary case.
  const mv = report.multiseedVerdict;
  if (mv && Array.isArray(mv.tasks)) {
    lines.push('## Multi-seed Verdict (authoritative)');
    lines.push('');
    lines.push(`Criterion: a task FAILs iff AUC_mean > ${mv.criterion.aucMax} **and** significant-seed fraction ≥ ${mv.criterion.sigFractionMax} (permutation α=${mv.criterion.permAlpha}). Over ${mv.criterion.seeds} policy-disjoint seeds, each task is attacked by **both** logistic regression (LR) and random forest (RF), reported side by side; a task FAILs if **either** classifier clears the double criterion, so PASS means neither a linear nor a non-linear attacker leaks. Raw accuracy advantage is retained in JSON for legacy diagnostics only.`);
    lines.push('');
    lines.push('| Task | LR AUC mean±std | LR %sig | RF AUC mean±std | RF %sig | median test n | Verdict |');
    lines.push('|---|---|---|---|---|---|---|');
    const fmtAuc = (ms) => Number.isNaN(ms.mean) ? 'n/a' : `${ms.mean.toFixed(3)} ± ${ms.std.toFixed(3)}`;
    const fmtSig = (s) => s == null ? 'n/a' : `${(s * 100).toFixed(0)}%`;
    for (const t of mv.tasks) {
      const verdict = t.skipped ? 'skipped'
        : t.underpowered ? '— (underpowered, non-gating)'
        : (t.passed ? '✓ PASS' : '✗ FAIL');
      if (t.classifiers) {
        const { lr, rf } = t.classifiers;
        lines.push(`| ${t.key} | ${fmtAuc(lr.auc)} | ${fmtSig(lr.sigFraction)} | ${fmtAuc(rf.auc)} | ${fmtSig(rf.sigFraction)} | ${t.medianTestN ?? 'n/a'} | ${verdict} |`);
      } else {
        // Defensive fallback for any single-classifier task (none in PCH today).
        const auc = fmtAuc(t.auc);
        const pct = fmtSig(t.sigFraction);
        lines.push(`| ${t.key} | ${auc} | ${pct} | n/a | n/a | ${t.medianTestN ?? 'n/a'} | ${verdict} |`);
      }
    }
    lines.push('');
  }

  lines.push('## Overall Result');
  lines.push('');
  const overallStatus = pickVerdictText(report.overallPassed, {
    pass: '✓ **PASS**',
    fail: '✗ **FAIL**',
    inconclusive: '? **INCONCLUSIVE**'
  });
  lines.push(`**Status:** ${overallStatus} _(multi-seed, policy-disjoint; single split shown above is diagnostic)_`);
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  lines.push(report.conclusion);
  lines.push('');

  lines.push(pickVerdictText(report.overallPassed, {
    pass: 'The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.',
    fail: '**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.',
    inconclusive: '**Inconclusive:** no gating task was judgeable, so no privacy claim is made.'
  }));
  lines.push('');

  return lines.join('\n');
}

runMain(module, {
  runExperiment,
  parseArgs,
  printUsage,
  getPassedFlag: (r) => r.overallPassed
});

module.exports = { runExperiment, buildPchRecordsForSeed };
