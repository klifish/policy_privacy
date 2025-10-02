/**
 * Test suite for Policy Content Hiding Evaluation Experiment
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

const {
  DUO_TERMS,
  ICD10_CHAPTERS,
  generatePolicy,
  generateRequesterAttrs,
  generateDataset
} = require('../../experiments/policy_content_hiding/data_generator');

const {
  extractFeatures,
  normalizeFeatures,
  splitTrainTest,
  prepareClassificationData,
  calculateFeatureStats
} = require('../../experiments/policy_content_hiding/feature_extractor');

const {
  LogisticRegression,
  SimpleDecisionTree,
  RandomForest
} = require('../../experiments/policy_content_hiding/classifiers');

const {
  calculateAccuracy,
  calculateAUC,
  calculateAdvantage,
  evaluateBinaryClassification,
  evaluateMultiClassification,
  checkPrivacyThresholds
} = require('../../experiments/policy_content_hiding/evaluator');

describe('Policy Content Hiding Evaluation', function() {
  this.timeout(300000); // 5 minutes for full experiment
  
  describe('Data Generator', function() {
    it('should generate policy with DUO term and ICD-10 chapter', function() {
      const policy = generatePolicy(DUO_TERMS.GENERAL_RESEARCH, ICD10_CHAPTERS.INFECTIOUS);
      
      expect(policy).to.have.property('policy');
      expect(policy.policy).to.be.an('array').with.lengthOf(10);
      expect(policy).to.have.property('duoTerm', DUO_TERMS.GENERAL_RESEARCH);
      expect(policy).to.have.property('icd10Chapter', ICD10_CHAPTERS.INFECTIOUS);
    });
    
    it('should generate requester attributes for satisfy/non-satisfy cases', function() {
      const satisfyAttrs = generateRequesterAttrs(DUO_TERMS.GENERAL_RESEARCH, true);
      const nonSatisfyAttrs = generateRequesterAttrs(DUO_TERMS.GENERAL_RESEARCH, false);
      
      expect(satisfyAttrs).to.be.an('array').with.lengthOf(3);
      expect(satisfyAttrs[0]).to.equal(1);
      
      expect(nonSatisfyAttrs).to.be.an('array').with.lengthOf(3);
      expect(nonSatisfyAttrs[0]).to.equal(0);
    });
    
    it('should generate dataset with specified parameters', function() {
      const dataset = generateDataset({
        duoTerms: [0, 1],
        icd10Chapters: [0, 1],
        executionsPerPolicy: 2
      });
      
      // 2 DUO terms * 2 ICD-10 chapters * 2 executions = 8 total
      expect(dataset).to.be.an('array').with.lengthOf(8);
      
      dataset.forEach(item => {
        expect(item).to.have.property('policy');
        expect(item).to.have.property('duoTerm');
        expect(item).to.have.property('icd10Chapter');
        expect(item).to.have.property('requesterAttrs');
        expect(item).to.have.property('satisfy');
      });
    });
  });
  
  describe('Feature Extractor', function() {
    it('should extract features from execution results', function() {
      const mockResults = [
        {
          duoTerm: 0,
          icd10Chapter: 0,
          satisfy: true,
          features: {
            commitGasUsed: '50000',
            commitCalldataLength: 100,
            accessGasUsed: '300000',
            accessCalldataLength: 500,
            proofSize: 1000,
            proofGenerationTime: 2000,
            commitLogsCount: 1,
            commitLogsSize: 200,
            accessLogsCount: 2,
            accessLogsSize: 400,
            blockDifference: 1
          }
        }
      ];
      
      const features = extractFeatures(mockResults);
      
      expect(features).to.be.an('array').with.lengthOf(1);
      expect(features[0]).to.have.property('commitGasUsed', 50000);
      expect(features[0]).to.have.property('duoTerm', 0);
      expect(features[0]).to.have.property('icd10Chapter', 0);
    });
    
    it('should normalize features', function() {
      const features = [
        { value: 0, duoTerm: 0, icd10Chapter: 0, satisfy: 1 },
        { value: 100, duoTerm: 1, icd10Chapter: 1, satisfy: 0 }
      ];
      
      const normalized = normalizeFeatures(features);
      
      expect(normalized[0].value).to.equal(0);
      expect(normalized[1].value).to.equal(1);
    });
    
    it('should split data into train and test sets', function() {
      const data = Array(100).fill(0).map((_, i) => ({ value: i }));
      const { train, test } = splitTrainTest(data, 0.3);
      
      expect(train.length).to.be.closeTo(70, 5);
      expect(test.length).to.be.closeTo(30, 5);
      expect(train.length + test.length).to.equal(100);
    });
    
    it('should calculate feature statistics', function() {
      const features = [
        { value: 10, duoTerm: 0, icd10Chapter: 0, satisfy: 1 },
        { value: 20, duoTerm: 1, icd10Chapter: 1, satisfy: 0 },
        { value: 30, duoTerm: 0, icd10Chapter: 1, satisfy: 1 }
      ];
      
      const stats = calculateFeatureStats(features);
      
      expect(stats).to.have.property('value');
      expect(stats.value).to.have.property('min', 10);
      expect(stats.value).to.have.property('max', 30);
      expect(stats.value.mean).to.be.closeTo(20, 0.1);
    });
  });
  
  describe('Classifiers', function() {
    describe('Logistic Regression', function() {
      it('should train and predict binary classification', function() {
        const X = [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1]
        ];
        const y = [0, 0, 0, 1]; // AND function
        
        const lr = new LogisticRegression(0.1, 1000);
        lr.train(X, y);
        
        const predictions = lr.predict(X);
        
        // Should learn AND function reasonably well
        expect(predictions[0]).to.equal(0);
        expect(predictions[3]).to.equal(1);
      });
      
      it('should return probability predictions', function() {
        const X = [[0], [1]];
        const y = [0, 1];
        
        const lr = new LogisticRegression(0.1, 1000);
        lr.train(X, y);
        
        const probas = lr.predictProba(X);
        
        expect(probas).to.be.an('array').with.lengthOf(2);
        expect(probas[0]).to.be.lessThan(probas[1]);
      });
    });
    
    describe('Decision Tree', function() {
      it('should train and predict multi-class classification', function() {
        const X = [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
          [2, 2],
          [2, 3]
        ];
        const y = [0, 0, 1, 1, 2, 2];
        
        const dt = new SimpleDecisionTree(3);
        dt.train(X, y);
        
        const predictions = dt.predict(X);
        
        // Should classify training data correctly
        expect(predictions).to.deep.equal(y);
      });
    });
    
    describe('Random Forest', function() {
      it('should train and predict with ensemble', function() {
        const X = [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 1],
          [2, 2],
          [2, 3]
        ];
        const y = [0, 0, 1, 1, 2, 2];
        
        const rf = new RandomForest(5, 3);
        rf.train(X, y);
        
        const predictions = rf.predict(X);
        
        expect(predictions).to.be.an('array').with.lengthOf(X.length);
      });
    });
  });
  
  describe('Evaluator', function() {
    it('should calculate accuracy', function() {
      const yTrue = [0, 1, 0, 1];
      const yPred = [0, 1, 1, 1];
      
      const accuracy = calculateAccuracy(yTrue, yPred);
      
      expect(accuracy).to.equal(0.75);
    });
    
    it('should calculate AUC', function() {
      const yTrue = [0, 1, 0, 1];
      const yProba = [0.1, 0.9, 0.3, 0.8];
      
      const auc = calculateAUC(yTrue, yProba);
      
      expect(auc).to.be.greaterThan(0.5);
      expect(auc).to.be.lessThanOrEqual(1.0);
    });
    
    it('should calculate advantage over random baseline', function() {
      const accuracy = 0.6;
      const numClasses = 2;
      
      const advantage = calculateAdvantage(accuracy, numClasses);
      
      expect(advantage).to.be.closeTo(0.1, 0.001); // 0.6 - 0.5
    });
    
    it('should evaluate binary classification', function() {
      const yTrue = [0, 1, 0, 1, 1, 0];
      const yPred = [0, 1, 0, 1, 0, 0];
      const yProba = [0.1, 0.9, 0.2, 0.8, 0.4, 0.1];
      
      const result = evaluateBinaryClassification(yTrue, yPred, yProba, 'Test Task');
      
      expect(result).to.have.property('task', 'Test Task');
      expect(result).to.have.property('accuracy');
      expect(result).to.have.property('auc');
      expect(result).to.have.property('advantage');
    });
    
    it('should evaluate multi-class classification', function() {
      const yTrue = [0, 1, 2, 0, 1, 2];
      const yPred = [0, 1, 2, 0, 2, 2];
      
      const result = evaluateMultiClassification(yTrue, yPred, 'Test Task');
      
      expect(result).to.have.property('task', 'Test Task');
      expect(result).to.have.property('accuracy');
      expect(result).to.have.property('macroF1');
      expect(result).to.have.property('numClasses', 3);
    });
    
    it('should check privacy thresholds', function() {
      const evaluation = {
        results: [
          {
            task: 'Test Task 1',
            type: 'binary',
            auc: 0.52,
            advantage: 0.03
          },
          {
            task: 'Test Task 2',
            type: 'multi-class',
            advantage: 0.02
          }
        ]
      };
      
      const check = checkPrivacyThresholds(evaluation, {
        aucMax: 0.55,
        advantageMax: 0.05
      });
      
      expect(check).to.have.property('overallPassed', true);
      expect(check.results).to.be.an('array').with.lengthOf(2);
    });
  });
  
  describe('Integration Test (Minimal)', function() {
    it('should run minimal experiment end-to-end', async function() {
      this.timeout(60000); // 1 minute for minimal test
      
      // Check if circuits are built
      const circuitWasmPath = path.join(__dirname, '../../build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm');
      const zkeyPath = path.join(__dirname, '../../build/circuits/policy_privacy_main_final.zkey');
      
      if (!fs.existsSync(circuitWasmPath) || !fs.existsSync(zkeyPath)) {
        console.log('\n⚠️  Skipping integration test: circuits not built');
        console.log('   Run "npm run build:circuit:full" to build circuits first');
        this.skip();
        return;
      }
      
      const { runExperiment } = require('../../experiments/policy_content_hiding/run_experiment');
      
      // Run with minimal configuration
      const report = await runExperiment({
        numDuoTerms: 2,           // Minimal for testing
        numIcd10Chapters: 2,       // Minimal for testing
        executionsPerPolicy: 2,    // Minimal for testing
        testRatio: 0.3,
        outputDir: path.join(__dirname, '../../experiments/policy_content_hiding/test_results')
      });
      
      // Verify report structure
      expect(report).to.have.property('experiment', 'Policy Content Hiding Evaluation');
      expect(report).to.have.property('evaluation');
      expect(report).to.have.property('privacyCheck');
      expect(report).to.have.property('conclusion');
      
      // Verify evaluation results
      expect(report.evaluation.results).to.be.an('array');
      expect(report.evaluation.results.length).to.be.greaterThan(0);
      
      // Verify privacy check
      expect(report.privacyCheck).to.have.property('overallPassed');
      expect(report.privacyCheck.results).to.be.an('array');
      
      console.log('\nExperiment Summary:');
      console.log(`Total executions: ${report.config.totalExecutions}`);
      console.log(`Privacy check: ${report.privacyCheck.overallPassed ? 'PASS' : 'FAIL'}`);
      console.log(`Conclusion: ${report.conclusion}`);
    });
  });
});
