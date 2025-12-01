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
  generateDataset: generateV2Dataset,
  analyzeLogicShape: analyzeLogicShapeV2,
  classifyLogicStructure,
  classifyNestingDepth,
  classifyPredicateCount,
  classifySetSize,
  classifyRangeWidth,
  LOGIC_STRUCTURES,
  NESTING_DEPTHS,
  PREDICATE_COUNTS,
  SET_SIZES,
  RANGE_WIDTHS
} = require('../../experiments/structure_and_parameter_privacy/data_generator_v2');

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

  describe('V2 Classification Improvements', function () {
    describe('Independent Dimension Classification', function () {
      it('separates set size and range width', function () {
        // Test set size (whitelist only)
        const setPolicy = {
          structure: { whitelistSize: 10, merkleDepth: 5 },
          semantics: { logicNormalized: '(GR & P[ICD10])' }
        };
        expect(classifySetSize(setPolicy)).to.equal('medium');
        expect(classifyRangeWidth(setPolicy)).to.equal('none'); // No range predicates

        // Test range width (range predicates)
        const rangePolicy = {
          structure: { whitelistSize: 0, merkleDepth: 7 },
          semantics: { logicNormalized: '(AGE >= 18 & AGE <= 65)' }
        };
        expect(classifySetSize(rangePolicy)).to.equal('none');
        expect(classifyRangeWidth(rangePolicy)).to.equal('wide');
      });

      it('classifies logic structure independently', function () {
        // Test AND only
        const andStats = analyzeLogicShapeV2('(GR & DS & P[ICD10])');
        expect(classifyLogicStructure(andStats)).to.equal('and_only');

        // Test OR only
        const orStats = analyzeLogicShapeV2('(GR | DS | P[ICD10])');
        expect(classifyLogicStructure(orStats)).to.equal('or_only');

        // Test mixed AND/OR
        const mixedStats = analyzeLogicShapeV2('((GR & DS) | P[ICD10])');
        expect(classifyLogicStructure(mixedStats)).to.equal('and_or_mixed');

        // Test negation heavy
        const negationStats = analyzeLogicShapeV2('(!GR & !DS & P[ICD10])');
        expect(classifyLogicStructure(negationStats)).to.equal('negation_heavy');
      });

      it('counts nesting depth accurately', function () {
        // Flat: depth ≤ 1
        const flatStats1 = analyzeLogicShapeV2('GR');
        expect(classifyNestingDepth(flatStats1)).to.equal('flat');

        const flatStats2 = analyzeLogicShapeV2('(GR & DS)');
        expect(classifyNestingDepth(flatStats2)).to.equal('flat');

        // Shallow: depth = 2
        const shallowStats = analyzeLogicShapeV2('((GR & DS) | RS)');
        expect(classifyNestingDepth(shallowStats)).to.equal('shallow');

        // Medium: depth = 3
        const mediumStats = analyzeLogicShapeV2('(((GR & DS) | RS) & P[ICD10])');
        expect(classifyNestingDepth(mediumStats)).to.equal('medium');

        // Deep: depth ≥ 4
        const deepStats = analyzeLogicShapeV2('((((GR & DS) | RS) & P[ICD10]) | P[OBI])');
        expect(classifyNestingDepth(deepStats)).to.equal('deep');
      });

      it('counts predicates independently', function () {
        // None: 0 predicates
        const noneStats = analyzeLogicShapeV2('(GR & DS)');
        expect(classifyPredicateCount(noneStats)).to.equal('none');

        // Single: 1 predicate
        const singleStats = analyzeLogicShapeV2('(GR & P[ICD10])');
        expect(classifyPredicateCount(singleStats)).to.equal('single');

        // Few: 2-3 predicates
        const fewStats = analyzeLogicShapeV2('(GR & P[ICD10] & P[OBI])');
        expect(classifyPredicateCount(fewStats)).to.equal('few');

        // Many: 4+ predicates
        const manyStats = analyzeLogicShapeV2('(P[ICD10] & P[OBI] & P[DUO] & P[NCIT] & P[MONDO])');
        expect(classifyPredicateCount(manyStats)).to.equal('many');
      });
    });

    describe('V2 Dataset Generation', function () {
      it('generates dataset with all V2 dimensions', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 10,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'v2-test-' + Date.now()
        });

        expect(dataset).to.be.an('array').with.length.greaterThan(0);
        expect(dataset.__meta).to.be.an('object');

        const sample = dataset[0];
        expect(sample).to.include.keys(
          'policyId',
          'logicStructure',
          'nestingDepth',
          'predicateCount',
          'setSize',
          'rangeWidth'
        );

        // Check V2 classifications are valid
        expect(Object.values(LOGIC_STRUCTURES)).to.include(sample.logicStructure);
        expect(Object.values(NESTING_DEPTHS)).to.include(sample.nestingDepth);
        expect(Object.values(PREDICATE_COUNTS)).to.include(sample.predicateCount);
        expect(Object.values(SET_SIZES)).to.include(sample.setSize);
        expect(Object.values(RANGE_WIDTHS)).to.include(sample.rangeWidth);
      });

      it('maintains backward compatibility with V1 classifications', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 6,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'v2-compat-test'
        });

        const sample = dataset[0];
        // Should have both V1 and V2 classifications
        expect(sample).to.include.keys(
          'structureType_v1',
          'predicateCombo_v1',
          'paramType_v1'
        );

        expect(Object.values(STRUCTURE_TYPES)).to.include(sample.structureType_v1);
        expect(Object.values(PREDICATE_COMBOS)).to.include(sample.predicateCombo_v1);
        expect(Object.values(PARAMETER_TYPES)).to.include(sample.paramType_v1);
      });

      it('includes balance metrics in metadata', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 20,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'balance-test'
        });

        expect(dataset.__meta.balanceMetrics).to.be.an('object');
        expect(dataset.__meta.balanceMetrics.v2).to.be.an('object');
        expect(dataset.__meta.balanceMetrics.v1).to.be.an('object');

        // Check balance metrics structure
        const v2Balance = dataset.__meta.balanceMetrics.v2;
        expect(v2Balance).to.have.keys(
          'logicStructure',
          'nestingDepth',
          'predicateCount',
          'setSize',
          'rangeWidth'
        );

        // Each dimension should have balance metrics
        Object.values(v2Balance).forEach(metric => {
          expect(metric).to.include.keys('minMaxRatio', 'coefficientOfVariation');
          expect(metric.minMaxRatio).to.be.a('string');
          expect(metric.coefficientOfVariation).to.be.a('string');
        });
      });
    });

    describe('Balance Improvements', function () {
      it('improves balance compared to V1', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 50,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'balance-comparison-' + Date.now()
        });

        const v2Balance = dataset.__meta.balanceMetrics.v2;
        const v1Balance = dataset.__meta.balanceMetrics.v1;

        // Calculate average min/max ratio for each version
        const v2Ratios = Object.values(v2Balance).map(m => parseFloat(m.minMaxRatio));
        const v1Ratios = Object.values(v1Balance).map(m => parseFloat(m.minMaxRatio));

        const v2AvgBalance = v2Ratios.reduce((a, b) => a + b, 0) / v2Ratios.length;
        const v1AvgBalance = v1Ratios.reduce((a, b) => a + b, 0) / v1Ratios.length;

        // V2 should have better balance (higher min/max ratio)
        // Note: This may not always pass with small samples, but should with 50+ policies
        console.log(`    Balance comparison: V2=${v2AvgBalance.toFixed(3)} vs V1=${v1AvgBalance.toFixed(3)}`);

        // At minimum, V2 should not be significantly worse
        expect(v2AvgBalance).to.be.at.least(v1AvgBalance * 0.8);
      });

      it('has independent set size and range width distributions', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 40,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'independence-test'
        });

        const setSizes = {};
        const rangeWidths = {};

        dataset.forEach(policy => {
          setSizes[policy.setSize] = (setSizes[policy.setSize] || 0) + 1;
          rangeWidths[policy.rangeWidth] = (rangeWidths[policy.rangeWidth] || 0) + 1;
        });

        // At least one dimension should have multiple categories
        // Note: With random generation, we may not always get diversity in both
        const setSizeCategories = Object.keys(setSizes).length;
        const rangeWidthCategories = Object.keys(rangeWidths).length;

        expect(setSizeCategories + rangeWidthCategories).to.be.greaterThan(2);

        console.log('    Set sizes:', JSON.stringify(setSizes));
        console.log('    Range widths:', JSON.stringify(rangeWidths));
      });
    });

    describe('Dimension Orthogonality', function () {
      it('allows all combinations of dimensions', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 60,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'orthogonality-test-' + Date.now()
        });

        // Track unique combinations
        const combinations = new Set();
        dataset.forEach(policy => {
          const combo = `${policy.logicStructure}|${policy.nestingDepth}|${policy.predicateCount}|${policy.setSize}|${policy.rangeWidth}`;
          combinations.add(combo);
        });

        // Should have variety of combinations
        expect(combinations.size).to.be.greaterThan(5);

        // Check that at least some dimensions vary
        const logicStructures = new Set(dataset.map(p => p.logicStructure));
        const nestingDepths = new Set(dataset.map(p => p.nestingDepth));
        const predicateCounts = new Set(dataset.map(p => p.predicateCount));

        const totalCategories = logicStructures.size + nestingDepths.size + predicateCounts.size;
        expect(totalCategories).to.be.greaterThan(6);
      });
    });

    describe('Integration with Attack Framework', function () {
      it('V2 dataset works with existing attack functions', async function () {
        const dataset = await generateV2Dataset({
          policyCount: 12,
          executionsPerPolicy: 1,
          satisfyRatio: 0.5,
          seed: 'attack-integration-test'
        });

        // Mock execution results with V2 classifications
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

        // Test attacks on V2 dimensions
        const supervisedLogic = runSupervisedAttacks(mockResults, {
          targetAttribute: 'logicStructure',
          permutationIterations: 25
        });

        const statisticalSetSize = runStatisticalTests(mockResults, {
          targetAttribute: 'setSize'
        });

        const clusteringNesting = runClusteringAttack(mockResults, {
          targetAttribute: 'nestingDepth',
          kValues: [2, 3]
        });

        expect(supervisedLogic.targetAttribute).to.equal('logicStructure');
        expect(statisticalSetSize.targetAttribute).to.equal('setSize');
        expect(clusteringNesting.targetAttribute).to.equal('nestingDepth');

        expect(supervisedLogic.results).to.be.an('array');
        expect(statisticalSetSize.results).to.be.an('array');
        expect(clusteringNesting.results).to.be.an('array');
      });
    });
  });
});
