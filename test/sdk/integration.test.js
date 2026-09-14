const { expect } = require('chai');
const PolicyPrivacy = require('../../lib');
const path = require('path');
const fs = require('fs');

// Legacy V1/V2 SDK fixtures: they assume DEPTH=20 and pre-DUO-V3 policy forms.
// Current end-to-end coverage is in test/duo/*.test.js and is RC-gated.
describe.skip('Legacy SDK - Integration Tests', function() {
  this.timeout(60000);

  describe('Module Exports', function() {
    it('should export all compiler functions', function() {
      expect(PolicyPrivacy).to.have.property('generatePolicyArtifacts');
      expect(PolicyPrivacy.generatePolicyArtifacts).to.be.a('function');
    });

    it('should export all prover functions', function() {
      expect(PolicyPrivacy).to.have.property('initPoseidon');
      expect(PolicyPrivacy).to.have.property('calculatePolicyCommitment');
      expect(PolicyPrivacy).to.have.property('calculateParamsCommitment');
      expect(PolicyPrivacy).to.have.property('createCircuitInput');
      expect(PolicyPrivacy).to.have.property('generateProof');

      expect(PolicyPrivacy.initPoseidon).to.be.a('function');
      expect(PolicyPrivacy.calculatePolicyCommitment).to.be.a('function');
      expect(PolicyPrivacy.calculateParamsCommitment).to.be.a('function');
      expect(PolicyPrivacy.createCircuitInput).to.be.a('function');
      expect(PolicyPrivacy.generateProof).to.be.a('function');
    });

    it('should export Contracts object', function() {
      expect(PolicyPrivacy).to.have.property('Contracts');
      expect(PolicyPrivacy.Contracts).to.be.an('object');
    });
  });

  describe('End-to-End Workflow: Compile -> Prove', function() {
    it('should complete full workflow from policy to circuit input', async function() {
      // Step 1: Define a policy
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      // Step 2: Compile policy to artifacts
      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '12345'
      });

      expect(artifacts).to.have.property('tokens');
      expect(artifacts).to.have.property('policyCommitment');
      expect(artifacts.tokens).to.be.an('array');

      // Step 3: Calculate params commitment
      const paramsCommitment = await PolicyPrivacy.calculateParamsCommitment({
        merkleRoots: ['0', '0', '0', '0', '0'],
        credPublicKeys: ['0', '0', '0', '0', '0'],
        rangeMin: ['0', '0', '0', '0', '0'],
        rangeMax: ['0', '0', '0', '0', '0'],
        ontologyPolicyIds: ['0', '0', '0', '0', '0'],
        ontologyEpochs: ['0', '0', '0', '0', '0']
      });

      expect(paramsCommitment).to.be.a('string');

      // Step 4: Create circuit input
      const input = PolicyPrivacy.createCircuitInput(artifacts.policyCommitment, {
        policy: artifacts.tokens,
        randomizer: BigInt('12345'),
        requesterAttrs: [1, 1, 0, 0, 0, 0],
        paramsCommitment,
        predicateTypes: [4, 4, 4, 4, 4]
      });

      expect(input).to.have.property('policy');
      expect(input).to.have.property('policyCommitment');
      expect(input).to.have.property('paramsCommitment');
      expect(input.policyCommitment).to.equal(artifacts.policyCommitment);
      expect(input.paramsCommitment).to.equal(paramsCommitment);
    });

    it('should produce consistent results across multiple runs', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const randomizer = '999888777';
      const options = { depth: 20, randomizer };

      // Run twice with same inputs
      const artifacts1 = await PolicyPrivacy.generatePolicyArtifacts(policy, options);
      const artifacts2 = await PolicyPrivacy.generatePolicyArtifacts(policy, options);

      // Should produce identical results
      expect(artifacts1.policyCommitment).to.equal(artifacts2.policyCommitment);
      expect(artifacts1.tokens).to.deep.equal(artifacts2.tokens);
    });
  });

  describe('Realistic Healthcare Scenarios', function() {
    it('should handle diabetes research consent policy', async function() {
      const policy = {
        attributeOrder: ['DS', 'GR'],
        logic: 'DS AND GR',
        attributes: {
          DS: {
            comparison: 'IN',
            value: 'icd10:E10-E14' // Diabetes codes
          },
          GR: true
        },
        predicates: [
          {
            slot: 0,
            duo: 'DS',
            namespace: 'ICD10',
            root: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
          }
        ]
      };

      // Compile policy
      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x' + '1'.repeat(64)
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.policyCommitment).to.be.a('string');

      // Calculate params with merkle root for ICD-10 tree
      const paramsCommitment = await PolicyPrivacy.calculateParamsCommitment({
        merkleRoots: ['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', '0', '0', '0', '0']
      });

      // Create input for requester with GR and DS attributes
      const input = PolicyPrivacy.createCircuitInput(artifacts.policyCommitment, {
        policy: artifacts.tokens,
        requesterAttrs: [1, 1, 0, 0, 0, 0], // GR=1, DS=1
        paramsCommitment,
        predicateTypes: [1, 4, 4, 4, 4], // Merkle proof for DS
        merkleRoots: ['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', '0', '0', '0', '0']
      });

      expect(input.requesterAttrs).to.deep.equal([1, 1, 0, 0, 0, 0]);
      expect(input.predicateTypes[0]).to.equal(1); // Merkle predicate
    });

    it('should handle multi-attribute OR policy', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS', 'RS'],
        logic: 'GR OR DS OR RS',
        attributes: {
          GR: true,
          DS: true,
          RS: true
        }
      };

      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '54321'
      });

      expect(artifacts.tokens).to.be.an('array');
      expect(artifacts.tokens.length).to.be.greaterThan(3); // operands + operators

      const input = PolicyPrivacy.createCircuitInput(artifacts.policyCommitment, {
        policy: artifacts.tokens,
        requesterAttrs: [1, 0, 0, 0, 0, 0] // Only GR attribute
      });

      expect(input.requesterAttrs[0]).to.equal(1);
    });

    it('should handle complex nested logic', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS', 'RS', 'CC'],
        logic: '((GR AND DS) OR (RS AND CC))',
        attributes: {
          GR: true,
          DS: true,
          RS: true,
          CC: true
        }
      };

      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20
      });

      expect(artifacts.tokens).to.be.an('array');

      const paramsCommitment = await PolicyPrivacy.calculateParamsCommitment();

      const input = PolicyPrivacy.createCircuitInput(artifacts.policyCommitment, {
        policy: artifacts.tokens,
        requesterAttrs: [1, 1, 0, 0, 0, 0], // GR and DS
        paramsCommitment
      });

      expect(input.policy).to.have.lengthOf(20);
    });
  });

  describe('Privacy Properties', function() {
    it('should demonstrate commitment hiding property', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      // Same policy, different randomizers
      const artifacts1 = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '111'
      });

      const artifacts2 = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '222'
      });

      // Different commitments (hiding property)
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);

      // But same tokens (same policy)
      expect(artifacts1.tokens).to.deep.equal(artifacts2.tokens);
    });

    it('should demonstrate commitment binding property', async function() {
      const policy1 = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const policy2 = {
        attributeOrder: ['DS'],
        logic: 'DS',
        attributes: { DS: true }
      };

      const randomizer = '12345';

      const artifacts1 = await PolicyPrivacy.generatePolicyArtifacts(policy1, {
        depth: 20,
        randomizer
      });

      const artifacts2 = await PolicyPrivacy.generatePolicyArtifacts(policy2, {
        depth: 20,
        randomizer
      });

      // Different policies -> different commitments (binding property)
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
      expect(artifacts1.tokens).to.not.deep.equal(artifacts2.tokens);
    });

    it('should support parameter commitment calculation', async function() {
      // Public parameters that can be verified on-chain
      const publicParams = {
        merkleRoots: [
          '0x1111111111111111111111111111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222222222222222222222222222',
          '0', '0', '0'
        ],
        credPublicKeys: [
          '0x3333333333333333333333333333333333333333333333333333333333333333',
          '0', '0', '0', '0'
        ],
        rangeMin: ['0', '10', '0', '0', '0'],
        rangeMax: ['100', '1000', '0', '0', '0'],
        ontologyPolicyIds: ['1', '2', '0', '0', '0'],
        ontologyEpochs: ['1000', '2000', '0', '0', '0']
      };

      const commitment1 = await PolicyPrivacy.calculateParamsCommitment(publicParams);
      const commitment2 = await PolicyPrivacy.calculateParamsCommitment(publicParams);

      // Same parameters -> same commitment (deterministic)
      expect(commitment1).to.equal(commitment2);

      // Modify one parameter
      const modifiedParams = { ...publicParams, rangeMin: ['0', '20', '0', '0', '0'] };
      const commitment3 = await PolicyPrivacy.calculateParamsCommitment(modifiedParams);

      // Different parameters -> different commitment
      expect(commitment1).to.not.equal(commitment3);
    });
  });

  describe('Error Handling and Edge Cases', function() {
    it('should handle minimal policy', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, { depth: 20 });
      expect(artifacts).to.exist;
    });

    it('should handle policy with no predicates', async function() {
      const policy = {
        attributeOrder: ['GR', 'CU'],
        logic: 'GR AND CU',
        attributes: {
          GR: true,
          CU: true
        }
      };

      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, { depth: 20 });

      const input = PolicyPrivacy.createCircuitInput(artifacts.policyCommitment, {
        policy: artifacts.tokens,
        requesterAttrs: [1, 0, 0, 0, 0, 0]
      });

      // All predicates should be inactive (type 4)
      expect(input.predicateTypes.every(t => t === 4)).to.be.true;
    });

    it('should handle zero values in params commitment', async function() {
      const commitment = await PolicyPrivacy.calculateParamsCommitment({
        merkleRoots: ['0', '0', '0', '0', '0'],
        credPublicKeys: ['0', '0', '0', '0', '0'],
        rangeMin: ['0', '0', '0', '0', '0'],
        rangeMax: ['0', '0', '0', '0', '0'],
        ontologyPolicyIds: ['0', '0', '0', '0', '0'],
        ontologyEpochs: ['0', '0', '0', '0', '0']
      });

      expect(commitment).to.be.a('string');
      expect(BigInt(commitment)).to.be.greaterThan(0n);
    });

    it('should auto-normalize predicate types', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, { depth: 20 });

      const input = PolicyPrivacy.createCircuitInput(artifacts.policyCommitment, {
        policy: artifacts.tokens,
        predicateTypes: [0, 0, 0, 0, 0], // All unset
        merkleRoots: ['0', '0', '0', '0', '0'] // All zero
      });

      // Should auto-normalize to inactive (4)
      expect(input.predicateTypes.every(t => t === 4)).to.be.true;
    });
  });

  describe('Data Type Conversions', function() {
    it('should handle various numeric types for randomizer', async function() {
      const policy = {
        attributeOrder: ['GR'],
        logic: 'GR',
        attributes: { GR: true }
      };

      // String randomizer
      const artifacts1 = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '12345'
      });

      // Hex string randomizer
      const artifacts2 = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '0x3039'
      });

      expect(artifacts1.policyCommitment).to.exist;
      expect(artifacts2.policyCommitment).to.exist;
      expect(artifacts1.policyCommitment).to.not.equal(artifacts2.policyCommitment);
    });

    it('should handle mixed types in params commitment', async function() {
      const commitment = await PolicyPrivacy.calculateParamsCommitment({
        merkleRoots: ['123', BigInt('456'), '0x789', 999],
        rangeMin: [0, '10', BigInt('20'), '0x1E']
      });

      expect(commitment).to.be.a('string');
    });

    it('should handle BigInt in circuit input', async function() {
      const input = PolicyPrivacy.createCircuitInput('12345', {
        randomizer: BigInt('999888777666555444')
      });

      expect(input.randomizer).to.be.a('string');
      expect(input.randomizer).to.equal('999888777666555444');
    });
  });

  describe('Contract Integration Readiness', function() {
    it('should prepare data compatible with on-chain verification', async function() {
      const policy = {
        attributeOrder: ['GR', 'DS'],
        logic: 'GR AND DS',
        attributes: {
          GR: true,
          DS: true
        }
      };

      const artifacts = await PolicyPrivacy.generatePolicyArtifacts(policy, {
        depth: 20,
        randomizer: '12345'
      });

      const paramsCommitment = await PolicyPrivacy.calculateParamsCommitment({
        merkleRoots: ['100', '0', '0', '0', '0']
      });

      // Commitments should be numeric strings (compatible with Solidity uint256)
      expect(artifacts.policyCommitment).to.match(/^\d+$/);
      expect(paramsCommitment).to.match(/^\d+$/);

      // Should be valid BigInt
      expect(() => BigInt(artifacts.policyCommitment)).to.not.throw();
      expect(() => BigInt(paramsCommitment)).to.not.throw();
    });

    it('should have Contracts available for deployment', function() {
      expect(PolicyPrivacy.Contracts).to.exist;

      // PolicyPrivacy contract for managing consents
      if (PolicyPrivacy.Contracts.PolicyPrivacy) {
        expect(PolicyPrivacy.Contracts.PolicyPrivacy.abi).to.be.an('array');
      }

      // Verifier contract for proof verification
      if (PolicyPrivacy.Contracts.Verifier) {
        expect(PolicyPrivacy.Contracts.Verifier.abi).to.be.an('array');
      }
    });
  });

  describe('Performance and Scalability', function() {
    it('should handle maximum policy depth efficiently', async function() {
      const longPolicy = Array(20).fill(0).map((_, i) => i % 10);
      const randomizer = BigInt('12345');

      const startTime = Date.now();
      const commitment = await PolicyPrivacy.calculatePolicyCommitment(longPolicy, randomizer, longPolicy.length);
      const endTime = Date.now();

      expect(commitment).to.be.a('string');
      expect(endTime - startTime).to.be.lessThan(5000); // Should complete in reasonable time
    });

    it('should handle multiple predicates efficiently', async function() {
      const startTime = Date.now();

      const commitment = await PolicyPrivacy.calculateParamsCommitment({
        merkleRoots: ['100', '200', '300', '400', '500'],
        credPublicKeys: ['1000', '2000', '3000', '4000', '5000'],
        rangeMin: ['0', '10', '20', '30', '40'],
        rangeMax: ['100', '200', '300', '400', '500'],
        ontologyPolicyIds: ['1', '2', '3', '4', '5'],
        ontologyEpochs: ['1000', '2000', '3000', '4000', '5000']
      });

      const endTime = Date.now();

      expect(commitment).to.be.a('string');
      expect(endTime - startTime).to.be.lessThan(5000);
    });
  });
});
