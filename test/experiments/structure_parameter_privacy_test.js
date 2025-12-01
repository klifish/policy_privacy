/**
 * Structure & Parameter Privacy Tests
 *
 * Validates dataset annotations and attack helpers.
 */

const { expect } = require('chai');

const {
  generateDataset,
  analyzeLogicShape,
  classifyStructureType,
  classifyPredicateCombo,
  classifyParameterType,
  STRUCTURE_TYPES,
  PREDICATE_COMBOS,
  PARAMETER_TYPES
} = require('../../experiments/structure_and_parameter_privacy/data_generator');

const {
  runSupervisedAttacks,
  runStatisticalTests,
  runClusteringAttack,
  extractFeatures,
  featuresToArray,
  FEATURE_KEYS
} = require('../../experiments/structure_and_parameter_privacy/attacks');

describe('Structure & Parameter Privacy Experiment', function () {
  this.timeout(120000);

  describe('Annotation Helpers', function () {
    it('analyzes logic structure and detects predicates', function () {
      const logic = '((GR & (DS & P[ICD10])) | (RS & P[OBI]))';
      const stats = analyzeLogicShape(logic);

      expect(stats.hasAnd).to.equal(true);
      expect(stats.hasOr).to.equal(true);
      expect(stats.maxDepth).to.be.greaterThan(2);
      expect(stats.predicateNamespaces).to.include('ICD10');
      expect(stats.predicateNamespaces).to.include('OBI');
      expect(stats.attributeTokens).to.include('GR');
      expect(stats.attributeTokens).to.include('DS');
    });

    it('classifies structure/predicate/parameter categories', function () {
      const logic = '(GR & (DS & P[ICD10]))';
      const stats = analyzeLogicShape(logic);

      expect(classifyStructureType(stats)).to.equal(STRUCTURE_TYPES.WITH_SETS);
      expect(classifyPredicateCombo(stats)).to.equal(PREDICATE_COMBOS.SINGLE_PREDICATE_MIXED);

      const policy = {
        structure: {
          whitelistSize: 4,
          merkleDepth: 3
        }
      };
      expect(classifyParameterType(policy)).to.equal(PARAMETER_TYPES.NARROW_RANGE);
    });
  });

  describe('Dataset Generation', function () {
    it('annotates each policy with structure metadata', async function () {
      const dataset = await generateDataset({
        policyCount: 6,
        executionsPerPolicy: 1,
        satisfyRatio: 0.5,
        seed: 'unit-test-spp'
      });

      expect(dataset.__meta).to.be.an('object');
      expect(dataset.length).to.be.greaterThan(0);

      const sample = dataset[0];
      expect(sample).to.include.keys('policyId', 'structureType', 'predicateCombo', 'paramType');
      expect(Object.values(STRUCTURE_TYPES)).to.include(sample.structureType);
      expect(Object.values(PREDICATE_COMBOS)).to.include(sample.predicateCombo);
      expect(Object.values(PARAMETER_TYPES)).to.include(sample.paramType);
    });

    it('is deterministic given the same seed', async function () {
      const seed = 'deterministic-spp-seed';
      const datasetA = await generateDataset({
        policyCount: 4,
        executionsPerPolicy: 1,
        seed
      });
      const datasetB = await generateDataset({
        policyCount: 4,
        executionsPerPolicy: 1,
        seed
      });

      expect(datasetA.length).to.equal(datasetB.length);
      for (let i = 0; i < datasetA.length; i++) {
        expect(datasetA[i].policyId).to.equal(datasetB[i].policyId);
        expect(datasetA[i].structureType).to.equal(datasetB[i].structureType);
        expect(datasetA[i].paramType).to.equal(datasetB[i].paramType);
      }
    });
  });

  describe('Attack Helpers', function () {
    function generateMockExecutionResults(count = 60) {
      const structures = Object.values(STRUCTURE_TYPES);
      const predicateCombos = Object.values(PREDICATE_COMBOS);
      const paramTypes = Object.values(PARAMETER_TYPES);

      return Array.from({ length: count }, (_, i) => {
        const structureType = structures[i % structures.length];
        const predicateCombo = predicateCombos[i % predicateCombos.length];
        const paramType = paramTypes[i % paramTypes.length];

        return {
          policyId: `policy_${i}`,
          structureType,
          predicateCombo,
          paramType,
          features: {
            commitGasUsed: 100000 + Math.random() * 50000,
            commitCalldataLength: 1000 + Math.random() * 500,
            accessGasUsed: 80000 + Math.random() * 40000,
            accessCalldataLength: 800 + Math.random() * 400,
            proofSize: 1500 + Math.random() * 200,
            commitLogsCount: 2,
            commitLogsSize: 200,
            accessLogsCount: 1,
            accessLogsSize: 100,
            blockDifference: 1 + Math.floor(Math.random() * 4)
          }
        };
      });
    }

    it('extracts numeric features consistently', function () {
      const mockResult = {
        features: {
          commitGasUsed: 123456,
          commitCalldataLength: 1024,
          accessGasUsed: 78901,
          accessCalldataLength: 768,
          proofSize: 1536,
          commitLogsCount: 2,
          commitLogsSize: 256,
          accessLogsCount: 1,
          accessLogsSize: 128,
          blockDifference: 3
        }
      };

      const bag = extractFeatures(mockResult);
      expect(bag).to.have.all.keys(FEATURE_KEYS);

      const asArray = featuresToArray(bag);
      expect(asArray).to.be.an('array').with.lengthOf(FEATURE_KEYS.length);
    });

    it('runs supervised attacks on mock data', function () {
      const mockResults = generateMockExecutionResults();
      const results = runSupervisedAttacks(mockResults, {
        targetAttribute: 'structureType',
        testRatio: 0.3,
        permutationIterations: 50
      });

      expect(results.targetAttribute).to.equal('structureType');
      expect(results.results).to.be.an('array');
    });

    it('runs statistical tests on mock data', function () {
      const mockResults = generateMockExecutionResults();
      const results = runStatisticalTests(mockResults, {
        targetAttribute: 'structureType'
      });

      expect(results.targetAttribute).to.equal('structureType');
      expect(results.results).to.be.an('array');
    });

    it('runs clustering attack on mock data', function () {
      const mockResults = generateMockExecutionResults();
      const results = runClusteringAttack(mockResults, {
        targetAttribute: 'structureType',
        kValues: [2, 3]
      });

      expect(results.targetAttribute).to.equal('structureType');
      expect(results.results).to.be.an('array');
    });
  });

  describe('Integration', function () {
    it('generates dataset and evaluates attacks end-to-end', async function () {
      const dataset = await generateDataset({
        policyCount: 8,
        executionsPerPolicy: 1,
        satisfyRatio: 0.5,
        seed: 'spp-integration-test'
      });

      const mockResults = dataset.map((entry, idx) => ({
        ...entry,
        policyId: `${entry.policyId}_${idx}`,
        features: {
          commitGasUsed: 100000 + Math.random() * 20000,
          commitCalldataLength: 900 + Math.random() * 200,
          accessGasUsed: 80000 + Math.random() * 15000,
          accessCalldataLength: 750 + Math.random() * 150,
          proofSize: 1500 + Math.random() * 100,
          commitLogsCount: 2,
          commitLogsSize: 200,
          accessLogsCount: 1,
          accessLogsSize: 100,
          blockDifference: 1
        }
      }));

      const supervised = runSupervisedAttacks(mockResults, {
        targetAttribute: 'structureType',
        permutationIterations: 25
      });
      const statistical = runStatisticalTests(mockResults, {
        targetAttribute: 'structureType'
      });
      const clustering = runClusteringAttack(mockResults, {
        targetAttribute: 'structureType',
        kValues: [2]
      });

      expect(supervised.results).to.be.an('array');
      expect(statistical.results).to.be.an('array');
      expect(clustering.results).to.be.an('array');
    });
  });
});
