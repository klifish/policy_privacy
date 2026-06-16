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
const { parseCommonArgs, printCommonHelp, runMain } = require('../core/cli');
const { resolveDatasetPaths } = require('../core/dataset');

const {
  DUO_TERMS
} = require('../core/data_generator');

// DUO term ID to attribute code mapping
const DUO_TO_ATTRIBUTE_CODE = {
  0: 'GR',  // GENERAL_RESEARCH
  1: 'DS',  // DISEASE_SPECIFIC
  2: 'RS',  // RESEARCH_SPECIFIC
  3: 'POA', // POPULATION_ANCESTRY
  4: 'GS',  // GEOGRAPHICAL_RESTRICTION
  5: 'CC'   // CLINICAL_CARE
};

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
} = require('../core/feature_extractor');

const {
  LogisticRegression,
  RandomForest
} = require('../core/classifiers');

const {
  evaluateClassificationTasks,
  checkPrivacyThresholds,
  calculateAUC,
  permutationTestAUC,
  evaluateBinaryClassification
} = require('../core/evaluator');

const { evaluateMultiseed, printVerdict } = require('../core/multiseed_criterion');


/**
 * Run BOTH attackers (logistic regression and random forest) on one binary
 * inference task and return the stronger one as the gating record. "Stronger" =
 * higher AUC; the permutation p-value is taken from the SAME classifier whose
 * AUC won, so the reported AUC and its significance test describe one model
 * (taking max-AUC from one model and its p-value from another would be
 * inconsistent). This upgrades the privacy claim from "logistic regression can't
 * infer it" to "neither a linear nor a non-linear attacker can", and matches
 * SPP, which already runs LR + RF (see structure_and_parameter_privacy/attacks.js).
 *
 * @returns {{key,auc,advantage,permPValue,n,classifier}|null} null on degenerate AUC.
 */
function strongestAttack(key, trX, trY, teX, teY, permIterations, rfOpts = {}) {
  const { trees = 50, maxDepth = 10 } = rfOpts;
  const lr = new LogisticRegression(0.1, 500);
  lr.train(trX, trY);
  const lrProba = lr.predictProba(teX);
  const lrAuc = calculateAUC(teY, lrProba);

  const rf = new RandomForest(trees, maxDepth);
  rf.train(trX, trY);
  const rfProba = rf.predictProba(teX);
  const rfAuc = calculateAUC(teY, rfProba);

  let auc, proba, classifier;
  if (rfAuc != null && (lrAuc == null || rfAuc >= lrAuc)) {
    auc = rfAuc; proba = rfProba; classifier = 'rf';
  } else if (lrAuc != null) {
    auc = lrAuc; proba = lrProba; classifier = 'lr';
  } else {
    return null; // both degenerate
  }

  const { pValue } = permutationTestAUC(teY, proba, permIterations);
  return {
    key,
    auc,
    advantage: Math.abs(auc - 0.5), // AUC-based advantage, matches multiseed_eval
    permPValue: pValue,
    n: teY.length,
    classifier
  };
}


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
    } else if (arg === '--advantage-threshold') {
      config.advantageThreshold = parseFloat(unknown[++i]);
    } else if (arg === '--evaluate-dataset' || arg === '--dataset-quality') {
      config.evaluateDataset = true;
    } else if (arg === '--dataset-quality-output') {
      config.datasetQualityOutput = path.resolve(unknown[++i]);
    } else {
      console.warn(`Ignoring unknown argument: ${arg}`);
    }
  }

  return config;
}

function printUsage() {
  console.log('Policy Content Hiding Experiment');
  console.log('Usage: node run_experiment.js [options]');
  console.log();
  printCommonHelp();
  console.log();
  console.log('PCH-specific options:');
  console.log('  --features <path>               Path to saved features (for resuming at phase 3)');
  console.log('  --results <path>                Alias for --features');
  console.log('  --executions <value>            Executions per policy (number) or execution results path (legacy)');
  console.log('  --num-duo-terms <n>             Number of DUO terms to include when generating data');
  console.log('  --auc-threshold <float>         AUC threshold for privacy checks');
  console.log('  --advantage-threshold <float>   Advantage threshold for privacy checks');
  console.log('  --evaluate-dataset              Evaluate dataset quality after generation or load');
  console.log('  --dataset-quality-output <path> Override path for dataset quality JSON output');
}

async function runExperiment(config = {}) {
  const {
    numDuoTerms = 6,
    executionsPerPolicy = 2,
    policyCount = undefined,
    network = 'localhost',
    outputDir = path.join(__dirname, 'results', network),
    testRatio = 0.3,
    aucThreshold = 0.55,
    advantageThreshold = 0.05,
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

  const duoTerms = Object.values(DUO_TERMS).slice(0, numDuoTerms);
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
  const observedDuoTermIds = Array.from(new Set(normalizedFeatures.map(f => f.duoTerm))).sort((a, b) => a - b);

  const duoTrain = prepareClassificationData(trainData, 'duoTerm');
  const duoTest = prepareClassificationData(testData, 'duoTerm');

  console.log('Task 1: DUO Term Presence Prediction (Binary)');
  for (const duoTermId of observedDuoTermIds) {
    console.log(`  Training classifier for DUO term ${duoTermId}...`);

    // Fixed: Use duoTermCodes array to check if term is present (not just primary term)
    const duoCode = DUO_TO_ATTRIBUTE_CODE[duoTermId];
    const trainY = trainData.map(f => {
      // Check if this term is in the duoTermCodes array
      const hasTerm = f.duoTerm === duoTermId ||
        (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(duoCode));
      return hasTerm ? 1 : 0;
    });
    const testY = testData.map(f => {
      const hasTerm = f.duoTerm === duoTermId ||
        (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(duoCode));
      return hasTerm ? 1 : 0;
    });

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
  console.log('Note: AUC and Advantage are the primary privacy indicators.');
  console.log('AUC ≤ 0.55 and Advantage ≤ 5% indicate good privacy protection.');
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

    const advStatus = result.advantage <= advantageThreshold ? '✓' : '✗';
    console.log(`  ${advStatus} Advantage: ${(result.advantage * 100).toFixed(2)}%`);
    console.log(`     → Adversary performs ${(result.advantage * 100).toFixed(2)}% better than random guessing`);

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
    aucMax: aucThreshold,
    advantageMax: advantageThreshold
  });

  console.log('Privacy Threshold Check:');
  console.log(`  AUC Threshold: ≤ ${aucThreshold}`);
  console.log(`  Advantage Threshold: ≤ ${advantageThreshold}`);
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
  // at ~3 executions/policy, and raw advantage is unstable on imbalanced test
  // sets, so it is not the basis for PASS/FAIL.
  const multiseedSeeds = config.multiseedSeeds || 30;
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
  const verdict = evaluateMultiseed((seedIndex) => {
    const { train, test } = splitTrainTest(normalizedFeatures, testRatio);
    const trX = prepareClassificationData(train, 'duoTerm').X;
    const teX = prepareClassificationData(test, 'duoTerm').X;
    const records = [];
    for (const termId of observedDuoTermIds) {
      const code = DUO_TO_ATTRIBUTE_CODE[termId];
      const labelOf = f => (f.duoTerm === termId ||
        (Array.isArray(f.duoTermCodes) && f.duoTermCodes.includes(code))) ? 1 : 0;
      const trY = train.map(labelOf);
      const teY = test.map(labelOf);
      if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
      const rec = strongestAttack(`DUO ${code}`, trX, trY, teX, teY, permIterations, rfOpts);
      if (rec) records.push(rec);
    }

    // ICD-10 chapter inference (one-vs-rest), included in the multi-seed verdict
    // like the DUO tasks. Only rows that actually carry an ICD-10 chapter
    // participate — other ontologies (OBI/HANCESTRO/...) have no ICD label and
    // would inject an `undefined` class (the old single-split bug). AUC +
    // permutation are binary-only, so each chapter is judged one-vs-rest.
    {
      const icdAll = normalizedFeatures.filter(
        f => f.icd10Chapter !== undefined && f.icd10Chapter !== null
      );
      if (icdAll.length > 0) {
        const icdChapters = [...new Set(icdAll.map(f => f.icd10Chapter))].sort((a, b) => a - b);
        const { train: icdTrain, test: icdTest } = splitTrainTest(icdAll, testRatio);
        const icdTrX = prepareClassificationData(icdTrain, 'icd10Chapter').X;
        const icdTeX = prepareClassificationData(icdTest, 'icd10Chapter').X;
        for (const ch of icdChapters) {
          const labelOf = f => (f.icd10Chapter === ch ? 1 : 0);
          const trY = icdTrain.map(labelOf);
          const teY = icdTest.map(labelOf);
          if (new Set(trY).size < 2 || new Set(teY).size < 2) continue; // degenerate split
          const rec = strongestAttack(`ICD ch${ch}`, icdTrX, trY, icdTeX, teY, permIterations, rfOpts);
          if (rec) records.push(rec);
        }
      }
    }

    // Positive control (attack-validity sanity check): a synthetic, known-
    // separable label derived from commitGasUsed (which is a real observable
    // feature). The SAME pipeline (normalized X + LogisticRegression) should
    // recover it with high AUC/F1, proving the ≈0.5 AUC on real DUO labels is
    // "no signal", not a broken attack. Reported but non-gating.
    {
      const gasVals = train.map(f => f.commitGasUsed).filter(v => typeof v === 'number');
      const gasMedian = gasVals.length
        ? [...gasVals].sort((a, b) => a - b)[Math.floor(gasVals.length / 2)]
        : null;
      const ctrlLabel = f => (f.commitGasUsed > gasMedian ? 1 : 0);
      const ctrlTrY = train.map(ctrlLabel);
      const ctrlTeY = test.map(ctrlLabel);
      if (gasMedian != null && new Set(ctrlTrY).size === 2 && new Set(ctrlTeY).size === 2) {
        const lr = new LogisticRegression(0.1, 500);
        lr.train(trX, ctrlTrY);
        const proba = lr.predictProba(teX);
        const auc = calculateAUC(ctrlTeY, proba);
        if (auc != null) {
          const pred = proba.map(p => (p >= 0.5 ? 1 : 0));
          const ev = evaluateBinaryClassification(ctrlTeY, pred, proba);
          const { pValue } = permutationTestAUC(ctrlTeY, proba, permIterations);
          records.push({
            key: 'CONTROL: gas>median',
            auc,
            advantage: Math.abs(auc - 0.5),
            permPValue: pValue,
            n: ctrlTeY.length,
            precision: ev.precision,
            recall: ev.recall,
            f1: ev.f1
          });
        }
      }
    }
    return records;
  }, {
    seeds: multiseedSeeds,
    permutationIterations: permIterations,
    positiveControlKeys: ['CONTROL: gas>median']
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
    conclusion: verdict.overallPassed
      ? 'System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing (multi-seed AUC ≈ 0.5, permutation not significant).'
      : 'WARNING: System may leak policy content information. Multi-seed attack exceeds privacy thresholds.'
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
  lines.push('**Note:** AUC (Area Under ROC Curve) and Advantage are the primary privacy metrics.');
  lines.push('- **AUC ≤ 0.55:** Indicates adversary cannot rank samples better than random');
  lines.push('- **Advantage ≤ 5%:** Indicates adversary gains minimal benefit over random guessing');
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

    const advStatus = result.advantage <= 0.05 ? '✓ PASS' : '✗ FAIL';
    lines.push(`- **Advantage:** ${(result.advantage * 100).toFixed(2)}% (${advStatus})`);
    lines.push(`  - *Interpretation: Adversary performs ${(result.advantage * 100).toFixed(2)}% better than random guessing*`);

    // Secondary metrics
    if (result.type === 'multi-class' && result.macroF1 !== undefined && result.macroF1 !== null) {
      lines.push(`- **Macro F1:** ${(result.macroF1 * 100).toFixed(2)}%`);
    }

    lines.push('');
  }

  lines.push('## Privacy Threshold Check');
  lines.push('');
  lines.push(`- **AUC Threshold:** ≤ ${report.diagnostics.privacyCheck.thresholds.aucMax}`);
  lines.push(`- **Advantage Threshold:** ≤ ${report.diagnostics.privacyCheck.thresholds.advantageMax}`);
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
    lines.push(`Criterion: a task FAILs iff AUC_mean > ${mv.criterion.aucMax} **and** significant-seed fraction ≥ ${mv.criterion.sigFractionMax} (permutation α=${mv.criterion.permAlpha}); both required, otherwise PASS. Over ${mv.criterion.seeds} policy-disjoint seeds, each task attacked by **both** logistic regression and random forest with the stronger (higher-AUC) model reported. Advantage reported, not gating.`);
    lines.push('');
    lines.push('| Task | AUC mean±std | perm p mean | %sig seeds | RF-won seeds | median test n | Verdict |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const t of mv.tasks) {
      if (t.positiveControl) continue; // shown separately under Attack-validity
      const auc = Number.isNaN(t.auc.mean) ? 'n/a' : `${t.auc.mean.toFixed(3)} ± ${t.auc.std.toFixed(3)}`;
      const pm = Number.isNaN(t.permPValue.mean) ? 'n/a' : t.permPValue.mean.toFixed(3);
      const pct = t.sigFraction == null ? 'n/a' : `${(t.sigFraction * 100).toFixed(0)}%`;
      const rfw = t.rfWinFraction == null ? 'n/a' : `${(t.rfWinFraction * 100).toFixed(0)}%`;
      const verdict = t.skipped ? 'skipped'
        : t.underpowered ? '— (underpowered, non-gating)'
        : (t.passed ? '✓ PASS' : '✗ FAIL');
      lines.push(`| ${t.key} | ${auc} | ${pm} | ${pct} | ${rfw} | ${t.medianTestN ?? 'n/a'} | ${verdict} |`);
    }
    lines.push('');
  }

  const control = (report.multiseedVerdict.tasks || []).find(t => t.positiveControl);
  if (control && control.prf) {
    lines.push('## Attack-validity (positive control)');
    lines.push('');
    lines.push(`- **${control.key}:** AUC ${control.auc.mean.toFixed(3)} ± ${control.auc.std.toFixed(3)}, ` +
      `P/R/F1 = ${control.prf.precision.mean.toFixed(2)} / ${control.prf.recall.mean.toFixed(2)} / ${control.prf.f1.mean.toFixed(2)}`);
    lines.push('');
    lines.push('> The same attack pipeline recovers a synthetic, known-separable label ' +
      '(derived from observable gas) with high AUC/F1. This confirms the ≈0.5 AUC on real ' +
      'policy-content labels reflects *absence of signal*, not a broken attack. ' +
      'Non-gating sanity check.');
    lines.push('');
  }

  lines.push('## Overall Result');
  lines.push('');
  const overallStatus = report.overallPassed ? '✓ **PASS**' : '✗ **FAIL**';
  lines.push(`**Status:** ${overallStatus} _(multi-seed, policy-disjoint; single split shown above is diagnostic)_`);
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  lines.push(report.conclusion);
  lines.push('');

  if (report.overallPassed) {
    lines.push('The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.');
  } else {
    lines.push('**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.');
  }
  lines.push('');

  return lines.join('\n');
}

runMain(module, {
  runExperiment,
  parseArgs,
  printUsage,
  getPassedFlag: (r) => r.overallPassed
});

module.exports = { runExperiment };
