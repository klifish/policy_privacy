/**
 * Test suite for Policy Content Hiding Evaluation Experiment
 */

const { expect } = require('chai');
const path = require('path');
const fs = require('fs');

const {
  DUO_TERMS,
  ICD10_CHAPTERS,
  OBI_RESEARCH_TYPES,
  HANCESTRO_GROUPS,
  ONTOLOGY_LINKED_TERMS,
  isOntologyLinked,
  getOntologyNamespace,
  generatePolicy,
  generateRequesterAttrs,
  generateDataset
} = require('../../experiments/policy_content_hiding/data_generator');

const {
  loadDataset,
  evaluateDatasetQuality,
  formatQualityReport
} = require('../../experiments/policy_content_hiding/dataset_quality');

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

describe('Policy Content Hiding Evaluation', function () {
  this.timeout(300000); // 5 minutes for full experiment

  describe('Data Generator', function () {
    it('should generate ontology-linked policy with DUO term and external ontology', async function () {
      // DISEASE_SPECIFIC is ontology-linked, requires ICD-10
      const policy = await generatePolicy(DUO_TERMS.DISEASE_SPECIFIC, ICD10_CHAPTERS.INFECTIOUS);
      // console.log('Generated Policy:', policy);

      expect(policy).to.have.property('policy');
      expect(policy.policy).to.be.an('array').with.lengthOf(10);
      expect(policy).to.have.property('duoTerm', DUO_TERMS.DISEASE_SPECIFIC);
      expect(policy).to.have.property('ontologyNamespace', 'ICD10');
      expect(policy).to.have.property('ontologyValue', ICD10_CHAPTERS.INFECTIOUS);
      expect(policy).to.have.property('requiresOntology', true);
      expect(policy).to.have.property('numOperations', 3);  // attr AND predicate requires 3 tokens
    });

    it('should generate ontology-linked policy for research-specific with OBI', async function () {
      // RESEARCH_SPECIFIC is ontology-linked, requires OBI
      const policy = await generatePolicy(DUO_TERMS.RESEARCH_SPECIFIC, OBI_RESEARCH_TYPES.RCT);

      expect(policy).to.have.property('policy');
      expect(policy.policy).to.be.an('array').with.lengthOf(10);
      expect(policy).to.have.property('duoTerm', DUO_TERMS.RESEARCH_SPECIFIC);
      expect(policy).to.have.property('ontologyNamespace', 'OBI');
      expect(policy).to.have.property('ontologyValue', OBI_RESEARCH_TYPES.RCT);
      expect(policy).to.have.property('requiresOntology', true);
      expect(policy).to.have.property('numOperations', 3);  // attr AND predicate requires 3 tokens
    });

    it('should generate non-ontology-linked policy without external ontology', async function () {
      // GENERAL_RESEARCH is not ontology-linked
      const policy = await generatePolicy(DUO_TERMS.GENERAL_RESEARCH);

      expect(policy).to.have.property('policy');
      expect(policy.policy).to.be.an('array').with.lengthOf(10);
      expect(policy).to.have.property('duoTerm', DUO_TERMS.GENERAL_RESEARCH);
      expect(policy).to.have.property('ontologyNamespace', null);
      expect(policy).to.have.property('ontologyValue', null);
      expect(policy).to.have.property('requiresOntology', false);
      expect(policy).to.have.property('numOperations', 1);  // single attr requires 1 token
    });

    it('should correctly identify ontology-linked DUO terms', function () {
      // Ontology-linked terms
      expect(isOntologyLinked(DUO_TERMS.DISEASE_SPECIFIC)).to.equal(true);
      expect(isOntologyLinked(DUO_TERMS.RESEARCH_SPECIFIC)).to.equal(true);
      expect(isOntologyLinked(DUO_TERMS.POPULATION_ANCESTRY)).to.equal(true);
      expect(isOntologyLinked(DUO_TERMS.GEOGRAPHICAL_RESTRICTION)).to.equal(true);
      expect(isOntologyLinked(DUO_TERMS.CLINICAL_CARE)).to.equal(true);

      // Non-ontology-linked terms
      expect(isOntologyLinked(DUO_TERMS.GENERAL_RESEARCH)).to.equal(false);
      expect(isOntologyLinked(DUO_TERMS.COMMERCIAL_USE)).to.equal(false);
    });

    it('should return correct ontology namespace for ontology-linked terms', function () {
      expect(getOntologyNamespace(DUO_TERMS.DISEASE_SPECIFIC)).to.equal('ICD10');
      expect(getOntologyNamespace(DUO_TERMS.RESEARCH_SPECIFIC)).to.equal('OBI');
      expect(getOntologyNamespace(DUO_TERMS.POPULATION_ANCESTRY)).to.equal('HANCESTRO');
      expect(getOntologyNamespace(DUO_TERMS.GEOGRAPHICAL_RESTRICTION)).to.equal('ISO3166');
      expect(getOntologyNamespace(DUO_TERMS.CLINICAL_CARE)).to.equal('SNOMED');
    });

    it('should generate requester attributes for satisfy/non-satisfy cases', function () {
      const satisfyAttrs = generateRequesterAttrs(DUO_TERMS.GENERAL_RESEARCH, true);
      const nonSatisfyAttrs = generateRequesterAttrs(DUO_TERMS.GENERAL_RESEARCH, false);

      expect(satisfyAttrs).to.be.an('array').with.lengthOf(3);
      expect(satisfyAttrs[0]).to.equal(1);

      expect(nonSatisfyAttrs).to.be.an('array').with.lengthOf(3);
      expect(nonSatisfyAttrs[0]).to.equal(0);
    });

    it('should generate reproducible layered dataset with structural metadata', async function () {
      const dataset = await generateDataset({
        seed: 'unit-test-dataset',
        policyCount: 4,
        executionsPerPolicy: 2,
        satisfyRatio: 0.5,
        duoTerms: [
          DUO_TERMS.GENERAL_RESEARCH,
          DUO_TERMS.DISEASE_SPECIFIC,
          DUO_TERMS.RESEARCH_SPECIFIC,
        ],
        semanticLayers: [
          {
            name: 'single',
            combos: [['GR'], ['DS'], ['RS']],
            minPolicies: 4
          },
          {
            name: 'pair',
            combos: [
              ['GR', 'DS'],
              ['DS', 'RS']
            ],
            minPolicies: 4
          }
        ],
        whitelistBuckets: [4],
        merkleDepthOptions: [3],
        proofTypes: ['merkle_proof'],
        executionProtections: {
          path_unify: [false],
          gas_pad: [false],
          event_pad: [false],
          proof_pad: [false],
          batch_pattern: ['baseline']
        },
        policyDepth: 12
      });

      const quality = evaluateDatasetQuality(dataset);
      // fs.writeFileSync(datasetQualityOutputPath, JSON.stringify(quality, null, 2));
      console.log('Dataset Quality Summary');
      console.log('-'.repeat(60));
      console.log(formatQualityReport(quality));
      console.log();
      // console.log(`Dataset quality report saved to: ${datasetQualityOutputPath}`);


      expect(dataset).to.be.an('array').with.lengthOf(16); // 8 policies * 2 executions
      expect(dataset.__meta).to.include({
        seed: 'unit-test-dataset',
        policyCount: 8,
        executionsPerPolicy: 2
      });
      expect(dataset.__meta.coverage.layers).to.include({
        single: 4,
        pair: 4
      });

      dataset.forEach((item) => {
        expect(item).to.have.property('semantics');
        expect(item).to.have.property('structure');
        expect(item).to.have.property('execution');
        expect(item).to.have.property('policy').that.is.an('array');
        expect(item).to.have.property('requesterAttrs').that.is.an('array');
        expect(item.requesterAttrs).to.have.lengthOf(3);

        const { semantics, structure } = item;
        expect(semantics.duoTerms).to.be.an('array').that.is.not.empty;
        const hasDs = semantics.duoTerms.includes('DS');
        const hasRs = semantics.duoTerms.includes('RS');

        if (hasDs || hasRs) {
          expect(item.requiresOntology).to.equal(true);
          expect(item.ontologyNamespace).to.be.oneOf(['ICD10', 'OBI']);
          expect(item.ontologyValue).to.be.a('number');
          if (hasDs) {
            expect(semantics.icd10Scope).to.be.an('object');
          }
          if (hasRs) {
            expect(semantics.obiScope).to.be.an('object');
          }
          expect(structure.whitelistSize).to.be.greaterThan(0);
          expect(2 ** structure.merkleDepth).to.be.at.least(structure.whitelistSize);
        } else {
          expect(item.requiresOntology).to.equal(false);
          expect(item.ontologyNamespace).to.equal(null);
          expect(item.ontologyValue).to.equal(null);
          expect(structure.whitelistSize).to.equal(0);
        }
      });
    });
  });

  describe('Feature Extractor', function () {
    it('should extract features from execution results', function () {
      const mockResults = [
        {
          duoTerm: 0,
          ontologyNamespace: 'ICD10',
          ontologyValue: 0,
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
      expect(features[0]).to.have.property('ontologyNamespace', 'ICD10');
      expect(features[0]).to.have.property('ontologyValue', 0);
    });

    it('should normalize features', function () {
      const features = [
        { value: 0, duoTerm: 0, ontologyNamespace: 'ICD10', ontologyValue: 0, satisfy: 1 },
        { value: 100, duoTerm: 1, ontologyNamespace: 'OBI', ontologyValue: 1, satisfy: 0 }
      ];

      const normalized = normalizeFeatures(features);

      expect(normalized[0].value).to.equal(0);
      expect(normalized[1].value).to.equal(1);
    });

    it('should split data into train and test sets', function () {
      const data = Array(100).fill(0).map((_, i) => ({ value: i }));
      const { train, test } = splitTrainTest(data, 0.3);

      expect(train.length).to.be.closeTo(70, 5);
      expect(test.length).to.be.closeTo(30, 5);
      expect(train.length + test.length).to.equal(100);
    });

    it('should calculate feature statistics', function () {
      const features = [
        { value: 10, duoTerm: 0, ontologyNamespace: 'ICD10', ontologyValue: 0, satisfy: 1 },
        { value: 20, duoTerm: 1, ontologyNamespace: 'OBI', ontologyValue: 1, satisfy: 0 },
        { value: 30, duoTerm: 0, ontologyNamespace: 'ICD10', ontologyValue: 1, satisfy: 1 }
      ];

      const stats = calculateFeatureStats(features);

      expect(stats).to.have.property('value');
      expect(stats.value).to.have.property('min', 10);
      expect(stats.value).to.have.property('max', 30);
      expect(stats.value.mean).to.be.closeTo(20, 0.1);
    });
  });

  describe('Classifiers', function () {
    describe('Logistic Regression', function () {
      it('should train and predict binary classification', function () {
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

      it('should return probability predictions', function () {
        const X = [[0], [1]];
        const y = [0, 1];

        const lr = new LogisticRegression(0.1, 1000);
        lr.train(X, y);

        const probas = lr.predictProba(X);

        expect(probas).to.be.an('array').with.lengthOf(2);
        expect(probas[0]).to.be.lessThan(probas[1]);
      });
    });

    describe('Decision Tree', function () {
      it('should train and predict multi-class classification', function () {
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

    describe('Random Forest', function () {
      it('should train and predict with ensemble', function () {
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

  describe('Evaluator', function () {
    it('should calculate accuracy', function () {
      const yTrue = [0, 1, 0, 1];
      const yPred = [0, 1, 1, 1];

      const accuracy = calculateAccuracy(yTrue, yPred);

      expect(accuracy).to.equal(0.75);
    });

    it('should calculate AUC', function () {
      const yTrue = [0, 1, 0, 1];
      const yProba = [0.1, 0.9, 0.3, 0.8];

      const auc = calculateAUC(yTrue, yProba);

      expect(auc).to.be.greaterThan(0.5);
      expect(auc).to.be.lessThanOrEqual(1.0);
    });

    it('should calculate advantage over random baseline', function () {
      const accuracy = 0.6;
      const numClasses = 2;

      const advantage = calculateAdvantage(accuracy, numClasses);

      expect(advantage).to.be.closeTo(0.1, 0.001); // 0.6 - 0.5
    });

    it('should evaluate binary classification', function () {
      const yTrue = [0, 1, 0, 1, 1, 0];
      const yPred = [0, 1, 0, 1, 0, 0];
      const yProba = [0.1, 0.9, 0.2, 0.8, 0.4, 0.1];

      const result = evaluateBinaryClassification(yTrue, yPred, yProba, 'Test Task');

      expect(result).to.have.property('task', 'Test Task');
      expect(result).to.have.property('accuracy');
      expect(result).to.have.property('auc');
      expect(result).to.have.property('advantage');
    });

    it('should evaluate multi-class classification', function () {
      const yTrue = [0, 1, 2, 0, 1, 2];
      const yPred = [0, 1, 2, 0, 2, 2];

      const result = evaluateMultiClassification(yTrue, yPred, 'Test Task');

      expect(result).to.have.property('task', 'Test Task');
      expect(result).to.have.property('accuracy');
      expect(result).to.have.property('macroF1');
      expect(result).to.have.property('numClasses', 3);
    });

    it('should check privacy thresholds', function () {
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

});
