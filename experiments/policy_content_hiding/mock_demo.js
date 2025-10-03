/**
 * Mock Demo for Policy Content Hiding Evaluation
 * 
 * This demo simulates the experiment flow without requiring full circuit builds.
 * It shows how the components work together with mock execution data.
 */

const fs = require('fs');
const path = require('path');

const {
  DUO_TERMS,
  ICD10_CHAPTERS,
  ONTOLOGY_LINKED_TERMS,
  isOntologyLinked,
  generateDataset
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
 * Generate mock execution results
 */
function generateMockExecutionResults(dataset) {
  return dataset.map((item, i) => {
    // Simulate observable features with randomness
    // Key insight: in a secure system, these features should NOT correlate with policy content
    // We add randomness to simulate constant-time operations and uniform distributions
    
    // Base values with consistent ranges (simulating secure implementation)
    const commitGasBase = 52000;
    const commitGasVariance = 500; // Small variance due to blockchain conditions
    
    const accessGasBase = 255000;
    const accessGasVariance = 2000; // Small variance due to blockchain conditions
    
    const proofSizeBase = 1000;
    const proofSizeVariance = 10; // Very small variance (proof size should be constant)
    
    const proofTimeBase = 2000;
    const proofTimeVariance = 200; // Small variance due to system load
    
    return {
      ...item,
      features: {
        // Gas usage - should be constant for same circuit regardless of inputs
        commitGasUsed: (commitGasBase + Math.floor(Math.random() * commitGasVariance)).toString(),
        commitCalldataLength: 100 + Math.floor(Math.random() * 5), // Nearly constant
        accessGasUsed: (accessGasBase + Math.floor(Math.random() * accessGasVariance)).toString(),
        accessCalldataLength: 470 + Math.floor(Math.random() * 10), // Nearly constant
        
        // Proof features - should be constant
        proofSize: proofSizeBase + Math.floor(Math.random() * proofSizeVariance),
        proofGenerationTime: proofTimeBase + Math.floor(Math.random() * proofTimeVariance),
        
        // Event features - should be constant
        commitLogsCount: 1,
        commitLogsSize: 200 + Math.floor(Math.random() * 10),
        accessLogsCount: 2,
        accessLogsSize: 380 + Math.floor(Math.random() * 20),
        
        // Timing - random (blocks are unpredictable)
        blockDifference: Math.floor(Math.random() * 3)
      }
    };
  });
}

/**
 * Run mock experiment
 */
async function runMockDemo() {
  console.log('='.repeat(60));
  console.log('Policy Content Hiding Evaluation - Mock Demo');
  console.log('='.repeat(60));
  console.log();
  console.log('This demo simulates the experiment with mock execution data.');
  console.log('For real evaluation, run with actual circuit builds.');
  console.log();
  
  // Configuration
  const config = {
    numDuoTerms: 3,
    numIcd10Chapters: 5,
    executionsPerPolicy: 10
  };
  
  console.log('Configuration:');
  console.log(`  - DUO terms: ${config.numDuoTerms}`);
  console.log(`  - ICD-10 chapters: ${config.numIcd10Chapters}`);
  console.log(`  - Executions per policy: ${config.executionsPerPolicy}`);
  console.log(`  - Total: ${config.numDuoTerms * config.numIcd10Chapters * config.executionsPerPolicy} executions`);
  console.log();
  
  // Phase 1: Generate Dataset
  console.log('Phase 1: Data Generation');
  console.log('-'.repeat(60));
  
  const duoTerms = Object.values(DUO_TERMS).slice(0, config.numDuoTerms);
  const icd10Chapters = Object.values(ICD10_CHAPTERS).slice(0, config.numIcd10Chapters);
  
  const dataset = generateDataset({
    duoTerms,
    icd10Chapters,
    executionsPerPolicy: config.executionsPerPolicy
  });
  
  console.log(`Generated ${dataset.length} policy instances`);
  console.log();
  
  // Simulate execution results
  console.log('Simulating policy executions with mock data...');
  const executionResults = generateMockExecutionResults(dataset);
  console.log(`Generated ${executionResults.length} mock execution results`);
  console.log();
  
  // Phase 2: Feature Extraction
  console.log('Phase 2: Feature Extraction');
  console.log('-'.repeat(60));
  
  const features = extractFeatures(executionResults);
  console.log(`Extracted ${features.length} feature vectors`);
  
  const featureStats = calculateFeatureStats(features);
  console.log('Feature statistics:');
  for (const [name, stats] of Object.entries(featureStats).slice(0, 5)) {
    console.log(`  ${name}: mean=${stats.mean.toFixed(2)}, std=${stats.std.toFixed(2)}`);
  }
  console.log('  ...');
  console.log();
  
  const normalizedFeatures = normalizeFeatures(features);
  const { train: trainData, test: testData } = splitTrainTest(normalizedFeatures, 0.3);
  console.log(`Split data: ${trainData.length} train, ${testData.length} test`);
  console.log();
  
  // Phase 3: Attack Modeling
  console.log('Phase 3: Attack Modeling');
  console.log('-'.repeat(60));
  
  const classificationResults = [];
  
  // Task 1: DUO Term Presence (Binary)
  console.log('Task 1: DUO Term Presence Prediction');
  for (let duoTerm = 0; duoTerm < config.numDuoTerms; duoTerm++) {
    const trainY = trainData.map(f => f.duoTerm === duoTerm ? 1 : 0);
    const testY = testData.map(f => f.duoTerm === duoTerm ? 1 : 0);
    
    const { X: trainX } = prepareClassificationData(trainData, 'duoTerm');
    const { X: testX } = prepareClassificationData(testData, 'duoTerm');
    
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
  console.log(`  Trained ${config.numDuoTerms} binary classifiers`);
  console.log();
  
  // Task 2: ICD-10 Chapter Prediction (Multi-class)
  console.log('Task 2: ICD-10 Chapter Prediction');
  
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
  
  console.log('  Trained 2 multi-class classifiers');
  console.log();
  
  // Phase 4: Evaluation
  console.log('Phase 4: Evaluation');
  console.log('-'.repeat(60));
  
  const evaluation = evaluateClassificationTasks(classificationResults);
  
  console.log('Classification Results:');
  console.log();
  for (const result of evaluation.results) {
    console.log(`${result.task}:`);
    console.log(`  Accuracy: ${(result.accuracy * 100).toFixed(2)}%`);
    console.log(`  Random Baseline: ${(result.randomBaseline * 100).toFixed(2)}%`);
    console.log(`  Advantage: ${(result.advantage * 100).toFixed(2)}%`);
    
    if (result.auc !== null && result.auc !== undefined) {
      console.log(`  AUC: ${result.auc.toFixed(4)}`);
    }
    console.log();
  }
  
  // Privacy Check
  const privacyCheck = checkPrivacyThresholds(evaluation, {
    aucMax: 0.55,
    advantageMax: 0.05
  });
  
  console.log('Privacy Threshold Check:');
  console.log(`  AUC Threshold: ≤ 0.55`);
  console.log(`  Advantage Threshold: ≤ 0.05`);
  console.log();
  
  for (const result of privacyCheck.results) {
    const status = result.passed ? '✓' : '✗';
    console.log(`  ${status} ${result.task}`);
  }
  console.log();
  
  const overallStatus = privacyCheck.overallPassed ? '✓ PASS' : '✗ FAIL';
  console.log(`Overall: ${overallStatus}`);
  console.log();
  
  // Conclusion
  console.log('='.repeat(60));
  console.log('Conclusion');
  console.log('='.repeat(60));
  
  if (privacyCheck.overallPassed) {
    console.log('✓ Policy Content Hiding achieved!');
    console.log('  Adversaries cannot infer policy content from observable features');
    console.log('  better than random guessing.');
  } else {
    console.log('⚠️  Warning: Some classifiers exceeded privacy thresholds.');
    console.log('  This may indicate potential information leakage.');
  }
  console.log();
  
  console.log('Note: This is a mock demo with simulated data.');
  console.log('For real evaluation, build circuits and run the full experiment.');
  console.log();
  
  return {
    evaluation,
    privacyCheck
  };
}

// Run if called directly
if (require.main === module) {
  runMockDemo()
    .then(result => {
      process.exit(result.privacyCheck.overallPassed ? 0 : 1);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

module.exports = { runMockDemo };
