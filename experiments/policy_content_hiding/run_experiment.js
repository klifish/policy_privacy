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
const { ethers } = require('hardhat');

const {
  DUO_TERMS,
  generateDataset,
  executeDataset
} = require('./data_generator');

const {
  extractFeatures,
  normalizeFeatures,
  splitTrainTest,
  prepareClassificationData,
  calculateFeatureStats
} = require('./feature_extractor');

const {
  LogisticRegression,
  SimpleDecisionTree,
  RandomForest
} = require('./classifiers');

const {
  evaluateClassificationTasks,
  checkPrivacyThresholds
} = require('./evaluator');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--phase' && i + 1 < args.length) {
      config.phase = parseInt(args[++i]);
    } else if (arg === '--dataset' && i + 1 < args.length) {
      config.datasetPath = args[++i];
    } else if (arg === '--features' && i + 1 < args.length) {
      config.featuresPath = args[++i];
    } else if (arg === '--results' && i + 1 < args.length) {
      config.resultsPath = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      config.outputDir = args[++i];
    } else if (arg === '--num-duo-terms' && i + 1 < args.length) {
      config.numDuoTerms = parseInt(args[++i]);
    } else if (arg === '--executions' && i + 1 < args.length) {
      config.executionsPerPolicy = parseInt(args[++i]);
    }
  }
  
  return config;
}

/**
 * Run the complete experiment
 */
async function runExperiment(config = {}) {
  const {
    // Data generation config
    numDuoTerms = 3,           // Use subset for faster testing
    executionsPerPolicy = 5,   // Reduced for faster testing

    // Output paths
    outputDir = path.join(__dirname, 'results'),

    // ML config
    testRatio = 0.3,

    // Privacy thresholds
    aucThreshold = 0.55,
    advantageThreshold = 0.05,

    // Phase control - allows running specific phase only
    phase = null,             // If set, runs only this phase (1-5), null = all phases
    datasetPath = null,       // Path to existing dataset (required for phase 2+)
    featuresPath = null,      // Path to existing features (required for phase 4+)
    resultsPath = null        // Path to existing results (required for phase 5)
  } = config;

  console.log('='.repeat(60));
  console.log('Policy Content Hiding Evaluation Experiment');
  console.log('='.repeat(60));
  console.log();

  if (phase !== null) {
    console.log(`⚡ Running Phase ${phase} only`);
    console.log();
  }

  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  let dataset, executionResults, features, normalizedFeatures, trainData, testData;
  let classificationResults, evaluationResults;

  // Determine which phases to run
  const runPhase1 = (phase === null || phase === 1);
  const runPhase2 = (phase === null || phase === 2);
  const runPhase3 = (phase === null || phase === 3);
  const runPhase4 = (phase === null || phase === 4);
  const runPhase5 = (phase === null || phase === 5);

  // Phase 1: Data Generation and Execution
  if (runPhase1) {
    console.log('Phase 1: Data Generation and Execution');
    console.log('-'.repeat(60));

    const duoTerms = Object.values(DUO_TERMS).slice(0, numDuoTerms);

    console.log(`Generating dataset with:`);
    console.log(`  - DUO terms: ${numDuoTerms}`);
    console.log(`  - Executions per policy: ${executionsPerPolicy}`);
    console.log();

    dataset = generateDataset({
      duoTerms,
      executionsPerPolicy
    });

    const datasetOutputPath = path.join(outputDir, `dataset_${Date.now()}.json`);
    fs.writeFileSync(datasetOutputPath, JSON.stringify(dataset, null, 2));
    console.log(`Dataset saved to: ${datasetOutputPath}`);
    console.log();

    console.log(`Generated ${dataset.length} policy instances`);
    console.log();

    // Deploy contract for testing
    console.log('Deploying PolicyPrivacy contract...');
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    console.log('Verifier deployed at:', await verifier.getAddress());

    const policyPrivacy = await PolicyPrivacy.deploy(await verifier.getAddress());
    await policyPrivacy.waitForDeployment();
    console.log('PolicyPrivacy deployed at:', await policyPrivacy.getAddress());

    console.log('Contract deployed');
    console.log();

    // Execute dataset
    console.log('Executing policies and collecting features...');
    const executionResultsPath = path.join(outputDir, `execution_results_${Date.now()}.json`);
    executionResults = await executeDataset(dataset, policyPrivacy, executionResultsPath);

    console.log(`Completed ${executionResults.length} executions`);
    console.log();
    
    if (phase === 1) {
      console.log('✓ Phase 1 complete!');
      console.log(`  → To run phase 2: --phase 2 --dataset ${executionResultsPath}`);
      return;
    }
  } else if (phase >= 2) {
    // Load existing execution results
    if (!datasetPath) {
      throw new Error('--dataset path required when starting from phase 2+');
    }
    console.log(`Loading execution results from: ${datasetPath}`);
    executionResults = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
    console.log(`Loaded ${executionResults.length} execution results`);
    console.log();
  }

  // Phase 2: Feature Extraction
  if (runPhase2) {
    console.log('Phase 2: Feature Extraction');
    console.log('-'.repeat(60));

    features = extractFeatures(executionResults);
    console.log(`Extracted ${features.length} feature vectors`);

    const featureStats = calculateFeatureStats(features);
    console.log('Feature statistics:');
    for (const [name, stats] of Object.entries(featureStats)) {
      console.log(`  ${name}: mean=${stats.mean.toFixed(2)}, std=${stats.std.toFixed(2)}`);
    }
    console.log();

    // Save raw features
    const featuresOutputPath = path.join(outputDir, `features_${Date.now()}.json`);
    fs.writeFileSync(
      featuresOutputPath,
      JSON.stringify({ features, stats: featureStats }, null, 2)
    );
    console.log(`Features saved to: ${featuresOutputPath}`);
    console.log();

    // Normalize features
    normalizedFeatures = normalizeFeatures(features);
    
    if (phase === 2) {
      console.log('✓ Phase 2 complete!');
      console.log(`  → To run phase 3: --phase 3 --features ${featuresOutputPath}`);
      return;
    }
  } else if (phase >= 3) {
    // Load existing features
    if (!featuresPath) {
      throw new Error('--features path required when starting from phase 3+');
    }
    console.log(`Loading features from: ${featuresPath}`);
    const featureData = JSON.parse(fs.readFileSync(featuresPath, 'utf8'));
    features = featureData.features;
    normalizedFeatures = normalizeFeatures(features);
    console.log(`Loaded ${features.length} feature vectors`);
    console.log();
  }

  // Phase 3: Attack Modeling
  if (runPhase3) {
    console.log('Phase 3: Attack Modeling');
    console.log('-'.repeat(60));

    // Split data
    const split = splitTrainTest(normalizedFeatures, testRatio);
    trainData = split.train;
    testData = split.test;
    console.log(`Split data: ${trainData.length} train, ${testData.length} test`);
    console.log();

    classificationResults = [];

  // Task 1: DUO Term Presence Prediction (Binary)
  console.log('Task 1: DUO Term Presence Prediction (Binary)');
  for (let duoTerm = 0; duoTerm < numDuoTerms; duoTerm++) {
    console.log(`  Training classifier for DUO term ${duoTerm}...`);

    // Prepare binary labels (1 if policy has this DUO term, 0 otherwise)
    const trainY = trainData.map(f => f.duoTerm === duoTerm ? 1 : 0);
    const testY = testData.map(f => f.duoTerm === duoTerm ? 1 : 0);

    const { X: trainX } = prepareClassificationData(trainData, 'duoTerm');
    const { X: testX } = prepareClassificationData(testData, 'duoTerm');

    // Train logistic regression
    const lr = new LogisticRegression(0.1, 500);
    lr.train(trainX, trainY);

    const predictions = lr.predict(testX);
    const probas = lr.predictProba(testX);

    classificationResults.push({
      type: 'binary',
      taskName: `DUO Term ${duoTerm} Presence`,
      classifier: 'LogisticRegression',
      yTrue: testY,
      yPred: predictions,
      yProba: probas
    });
  }
  console.log();

  // Task 2: ICD-10 Chapter Prediction (Multi-class)
  console.log('Task 2: ICD-10 Chapter Prediction (Multi-class)');
  console.log('  Training Decision Tree classifier...');

  const { X: trainX, y: trainY } = prepareClassificationData(trainData, 'icd10Chapter');
  const { X: testX, y: testY } = prepareClassificationData(testData, 'icd10Chapter');

  const dt = new SimpleDecisionTree(5);
  dt.train(trainX, trainY);
  const dtPredictions = dt.predict(testX);

  classificationResults.push({
    type: 'multi-class',
    taskName: 'ICD-10 Chapter Prediction (DecisionTree)',
    classifier: 'DecisionTree',
    yTrue: testY,
    yPred: dtPredictions
  });

  console.log('  Training Random Forest classifier...');
  const rf = new RandomForest(10, 5);
  rf.train(trainX, trainY);
  const rfPredictions = rf.predict(testX);

    classificationResults.push({
      type: 'multi-class',
      taskName: 'ICD-10 Chapter Prediction (RandomForest)',
      classifier: 'RandomForest',
      yTrue: testY,
      yPred: rfPredictions
    });
    console.log();

    // Save classification results
    const classificationOutputPath = path.join(outputDir, `classification_${Date.now()}.json`);
    fs.writeFileSync(
      classificationOutputPath,
      JSON.stringify(classificationResults, null, 2)
    );
    console.log(`Classification results saved to: ${classificationOutputPath}`);
    console.log();
    
    if (phase === 3) {
      console.log('✓ Phase 3 complete!');
      console.log(`  → To run phase 4: --phase 4 --results ${classificationOutputPath}`);
      return;
    }
  } else if (phase >= 4) {
    // Load existing classification results
    if (!resultsPath) {
      throw new Error('--results path required when starting from phase 4+');
    }
    console.log(`Loading classification results from: ${resultsPath}`);
    classificationResults = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    console.log(`Loaded ${classificationResults.length} classification results`);
    console.log();
  }

  // Phase 4: Evaluation
  if (runPhase4) {
    console.log('Phase 4: Evaluation');
    console.log('-'.repeat(60));

    evaluationResults = evaluateClassificationTasks(classificationResults);

    console.log('Classification Results:');
    for (const result of evaluationResults.results) {
      console.log();
      console.log(`Task: ${result.task}`);
      console.log(`  Type: ${result.type}`);
      console.log(`  Accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
      console.log(`  Random Baseline: ${(result.randomBaseline * 100).toFixed(2)}%`);
      console.log(`  Advantage: ${(result.advantage * 100).toFixed(2)}%`);

      if (result.auc !== null && result.auc !== undefined) {
        console.log(`  AUC: ${result.auc.toFixed(4)}`);
      }

      if (result.type === 'multi-class' && result.macroF1 !== undefined) {
        console.log(`  Macro F1: ${(result.macroF1 * 100).toFixed(2)}%`);
      }
    }
    console.log();

    // Check privacy thresholds
    const privacyCheck = checkPrivacyThresholds(evaluationResults, {
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
    console.log(`Overall: ${privacyCheck.overallPassed ? '✓ PASS' : '✗ FAIL'}`);
    console.log();

    // Save evaluation results
    const evaluationOutputPath = path.join(outputDir, `evaluation_${Date.now()}.json`);
    fs.writeFileSync(
      evaluationOutputPath,
      JSON.stringify({ evaluation: evaluationResults, privacyCheck }, null, 2)
    );
    console.log(`Evaluation results saved to: ${evaluationOutputPath}`);
    console.log();

    if (phase === 4) {
      console.log('✓ Phase 4 complete!');
      console.log(`  → To run phase 5: --phase 5 --results ${evaluationOutputPath}`);
      return;
    }
  } else if (phase === 5) {
    // Load existing evaluation results
    if (!resultsPath) {
      throw new Error('--results path required when running phase 5');
    }
    console.log(`Loading evaluation results from: ${resultsPath}`);
    const loadedData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    evaluationResults = loadedData.evaluation;
    const privacyCheck = loadedData.privacyCheck;
    console.log(`Loaded evaluation results`);
    console.log();
  }

  // Phase 5: Reporting
  if (runPhase5) {
    console.log('Phase 5: Reporting');
    console.log('-'.repeat(60));

    // Need to load privacyCheck if starting from phase 5
    let privacyCheck;
    if (phase === 5 && resultsPath) {
      const loadedData = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
      privacyCheck = loadedData.privacyCheck;
    } else if (!privacyCheck) {
      // Regenerate privacy check from evaluationResults
      privacyCheck = checkPrivacyThresholds(evaluationResults, {
        aucMax: aucThreshold,
        advantageMax: advantageThreshold
      });
    }

    const report = {
      experiment: 'Policy Content Hiding Evaluation',
      timestamp: new Date().toISOString(),
      config: {
        numDuoTerms,
        executionsPerPolicy,
        totalExecutions: executionResults ? executionResults.length : 'N/A',
        testRatio
      },
      evaluation: evaluationResults,
      privacyCheck,
      featureStats: featureStats || {},
      conclusion: privacyCheck.overallPassed
        ? 'System achieves Policy Content Hiding. Adversaries cannot infer policy content better than random guessing.'
        : 'WARNING: System may leak policy content information. Some classifiers exceed privacy thresholds.'
    };

    const reportPath = path.join(outputDir, 'evaluation_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Saved evaluation report to: ${reportPath}`);

    // Generate human-readable report
    const readableReportPath = path.join(outputDir, 'evaluation_report.md');
    const readableReport = generateReadableReport(report);
    fs.writeFileSync(readableReportPath, readableReport);
    console.log(`Saved readable report to: ${readableReportPath}`);
    console.log();

    console.log('='.repeat(60));
    console.log('Experiment Complete');
    console.log('='.repeat(60));

    return report;
  }
}

/**
 * Generate human-readable markdown report
 */
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
  lines.push(`- **DUO Terms:** ${report.config.numDuoTerms}`);
  lines.push(`- **ICD-10 Chapters:** ${report.config.numIcd10Chapters}`);
  lines.push(`- **Executions per Policy:** ${report.config.executionsPerPolicy}`);
  lines.push(`- **Total Executions:** ${report.config.totalExecutions}`);
  lines.push(`- **Test Ratio:** ${(report.config.testRatio * 100).toFixed(0)}%`);
  lines.push('');

  lines.push('## Classification Results');
  lines.push('');

  for (const result of report.evaluation.results) {
    lines.push(`### ${result.task}`);
    lines.push('');
    lines.push(`- **Type:** ${result.type}`);
    lines.push(`- **Accuracy:** ${(result.accuracy * 100).toFixed(2)}%`);
    lines.push(`- **Random Baseline:** ${(result.randomBaseline * 100).toFixed(2)}%`);
    lines.push(`- **Advantage:** ${(result.advantage * 100).toFixed(2)}%`);

    if (result.auc !== null) {
      lines.push(`- **AUC:** ${result.auc.toFixed(4)}`);
    }

    if (result.type === 'multi-class') {
      lines.push(`- **Macro F1:** ${(result.macroF1 * 100).toFixed(2)}%`);
    }

    lines.push('');
  }

  lines.push('## Privacy Threshold Check');
  lines.push('');
  lines.push(`- **AUC Threshold:** ≤ ${report.privacyCheck.thresholds.aucMax}`);
  lines.push(`- **Advantage Threshold:** ≤ ${report.privacyCheck.thresholds.advantageMax}`);
  lines.push('');

  for (const result of report.privacyCheck.results) {
    const status = result.passed ? '✓ PASS' : '✗ FAIL';
    lines.push(`### ${result.task}: ${status}`);
    lines.push('');

    for (const check of result.checks) {
      const checkStatus = check.passed ? '✓' : '✗';
      lines.push(`- ${checkStatus} **${check.metric}:** ${check.value.toFixed(4)} (threshold: ${check.threshold})`);
    }

    lines.push('');
  }

  lines.push('## Overall Result');
  lines.push('');
  const overallStatus = report.privacyCheck.overallPassed ? '✓ **PASS**' : '✗ **FAIL**';
  lines.push(`**Status:** ${overallStatus}`);
  lines.push('');

  lines.push('## Conclusion');
  lines.push('');
  lines.push(report.conclusion);
  lines.push('');

  if (report.privacyCheck.overallPassed) {
    lines.push('The system successfully achieves Policy Content Hiding. Adversaries observing on-chain transactions cannot infer policy content (DUO terms or ICD-10 codes) better than random guessing.');
  } else {
    lines.push('**Warning:** Some classifiers exceeded privacy thresholds. This suggests potential information leakage through observable features. Further investigation and mitigation may be required.');
  }
  lines.push('');

  return lines.join('\n');
}

// Allow running as standalone script
if (require.main === module) {
  runExperiment()
    .then(report => {
      process.exit(report.privacyCheck.overallPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('Experiment failed:', error);
      process.exit(1);
    });
}

module.exports = { runExperiment };
