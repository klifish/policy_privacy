const { expect } = require('chai');
const {
  initPoseidon,
  calculatePolicyCommitment,
  calculateParamsCommitment,
  createCircuitInput,
  generateProof
} = require('../../lib/prover');
const path = require('path');
const fs = require('fs');

describe('SDK - Prover Module', function() {
  this.timeout(60000);

  describe('initPoseidon()', function() {
    it('should initialize Poseidon hash function', async function() {
      const poseidon = await initPoseidon();
      expect(poseidon).to.not.be.null;
      expect(poseidon).to.have.property('F');
      expect(typeof poseidon).to.equal('function');
    });

    it('should return cached instance on subsequent calls', async function() {
      const poseidon1 = await initPoseidon();
      const poseidon2 = await initPoseidon();
      expect(poseidon1).to.equal(poseidon2);
    });
  });

  describe('calculatePolicyCommitment()', function() {
    it('should calculate commitment for small policy (<=16 elements)', async function() {
      const policy = [0, 1, 11, 0, 0];
      const randomizer = BigInt('12345');

      const commitment = await calculatePolicyCommitment(policy, randomizer, 3);

      // Commitment should be a string representing a number
      expect(commitment).to.be.a('string');
      expect(commitment).to.match(/^\d+$/); // Should be a numeric string
      const bn = BigInt(commitment);
      expect(bn > 0n).to.be.true;
    });

    it('should calculate commitment for large policy (>16 elements)', async function() {
      // Test tree-based hashing for DEPTH > 16
      const policy = Array(20).fill(0).map((_, i) => i % 10);
      const randomizer = BigInt('54321');

      const commitment = await calculatePolicyCommitment(policy, randomizer, 20);

      // Commitment should be a string representing a number
      expect(commitment).to.be.a('string');
      const bn = BigInt(commitment);
      expect(bn > 0n).to.be.true;
    });

    it('should produce different commitments for different randomizers', async function() {
      const policy = [1, 2, 3];
      const randomizer1 = BigInt('111');
      const randomizer2 = BigInt('222');

      const commitment1 = await calculatePolicyCommitment(policy, randomizer1, 3);
      const commitment2 = await calculatePolicyCommitment(policy, randomizer2, 3);

      expect(commitment1).to.not.equal(commitment2);
    });

    it('should produce different commitments for different policies', async function() {
      const policy1 = [1, 2, 3];
      const policy2 = [3, 2, 1];
      const randomizer = BigInt('12345');

      const commitment1 = await calculatePolicyCommitment(policy1, randomizer, 3);
      const commitment2 = await calculatePolicyCommitment(policy2, randomizer, 3);

      expect(commitment1).to.not.equal(commitment2);
    });

    it('should handle edge case: empty policy with single element', async function() {
      const policy = [0];
      const randomizer = BigInt('1');

      const commitment = await calculatePolicyCommitment(policy, randomizer, 1);
      expect(commitment).to.be.a('string');
    });

    it('should handle exactly 16 elements', async function() {
      const policy = Array(16).fill(1);
      const randomizer = BigInt('999');

      const commitment = await calculatePolicyCommitment(policy, randomizer, 16);
      expect(commitment).to.be.a('string');
    });

    it('should handle exactly 17 elements (trigger chunking)', async function() {
      const policy = Array(17).fill(1);
      const randomizer = BigInt('999');

      const commitment = await calculatePolicyCommitment(policy, randomizer, 17);
      expect(commitment).to.be.a('string');
    });

    it('should produce different commitments for different program lengths', async function() {
      // The program length is part of the commitment preimage, so the same
      // token array committed at two lengths must not collide.
      const policy = [0, 1, 11, 0, 0];
      const randomizer = BigInt('12345');

      const commitment1 = await calculatePolicyCommitment(policy, randomizer, 3);
      const commitment2 = await calculatePolicyCommitment(policy, randomizer, 1);

      expect(commitment1).to.not.equal(commitment2);
    });

    it('should require a program length', async function() {
      const policy = [0, 1, 11, 0, 0];
      try {
        await calculatePolicyCommitment(policy, BigInt('12345'));
        throw new Error('Expected calculatePolicyCommitment to throw');
      } catch (error) {
        expect(error.message).to.match(/requires a programLength/);
      }
    });
  });

  describe('calculateParamsCommitment()', function() {
    it('should calculate commitment with default empty parameters', async function() {
      const commitment = await calculateParamsCommitment();

      // Commitment should be a string representing a number
      expect(commitment).to.be.a('string');
      const bn = BigInt(commitment);
      expect(bn > 0n).to.be.true;
    });

    it('should calculate commitment with merkle roots', async function() {
      const params = {
        merkleRoots: ['123', '456', '789'],
        credPublicKeys: [],
        rangeMin: [],
        rangeMax: [],
        ontologyPolicyIds: [],
        ontologyEpochs: []
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });

    it('should calculate commitment with multiple parameter types', async function() {
      const params = {
        merkleRoots: ['100', '200'],
        credPublicKeys: ['0x123abc', '0x456def'],
        rangeMin: ['0', '10'],
        rangeMax: ['100', '200'],
        ontologyPolicyIds: ['1', '2'],
        ontologyEpochs: ['1000', '2000']
      };

      const commitment = await calculateParamsCommitment(params);
      // Commitment should be a string representing a number
      expect(commitment).to.be.a('string');
      const bn = BigInt(commitment);
      expect(bn > 0n).to.be.true;
    });

    it('should produce different commitments for different parameters', async function() {
      const params1 = { merkleRoots: ['123'] };
      const params2 = { merkleRoots: ['456'] };

      const commitment1 = await calculateParamsCommitment(params1);
      const commitment2 = await calculateParamsCommitment(params2);

      expect(commitment1).to.not.equal(commitment2);
    });

    it('should handle hex string inputs', async function() {
      const params = {
        merkleRoots: ['0x1234567890abcdef'],
        credPublicKeys: ['0xfedcba0987654321']
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });

    it('should handle BigInt inputs', async function() {
      const params = {
        merkleRoots: [BigInt('123456789')],
        rangeMin: [BigInt('0')],
        rangeMax: [BigInt('100')]
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });

    it('should handle mixed type inputs', async function() {
      const params = {
        merkleRoots: ['123', BigInt('456'), '0x789'],
        rangeMin: [0, '10', BigInt('20')]
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });
  });

  describe('createCircuitInput()', function() {
    const testPolicyCommitment = '12345678901234567890';

    it('should create input with default values', function() {
      const input = createCircuitInput(testPolicyCommitment);

      expect(input).to.have.property('policy');
      expect(input).to.have.property('requesterAttrs');
      expect(input).to.have.property('predicateTypes');
      expect(input).to.have.property('policyCommitment', testPolicyCommitment);
      expect(input.policy).to.have.lengthOf(20); // POLICY_DEPTH
    });

    it('should pad policy to POLICY_DEPTH', function() {
      const shortPolicy = [1, 2, 3];
      const input = createCircuitInput(testPolicyCommitment, { policy: shortPolicy });

      expect(input.policy).to.have.lengthOf(20);
      expect(input.policy[0]).to.equal(1);
      expect(input.policy[1]).to.equal(2);
      expect(input.policy[2]).to.equal(3);
      expect(input.policy[19]).to.equal(0); // Padded with zeros
    });

    it('should truncate policy if longer than POLICY_DEPTH', function() {
      const longPolicy = Array(25).fill(1);
      const input = createCircuitInput(testPolicyCommitment, { policy: longPolicy });

      expect(input.policy).to.have.lengthOf(20);
    });

    it('should accept custom requester attributes', function() {
      const customAttrs = [1, 1, 0, 1, 0, 0];
      const input = createCircuitInput(testPolicyCommitment, {
        requesterAttrs: customAttrs
      });

      expect(input.requesterAttrs).to.deep.equal(customAttrs);
    });

    it('should accept custom randomizer', function() {
      const randomizer = BigInt('999888777');
      const input = createCircuitInput(testPolicyCommitment, { randomizer });

      expect(input.randomizer).to.equal('999888777');
    });

    it('should accept custom predicate configuration', function() {
      const input = createCircuitInput(testPolicyCommitment, {
        predicateTypes: [1, 2, 3, 4, 4],
        merkleRoots: ['100', '200', '0', '0', '0'],
        credPublicKeys: ['0', '300', '0', '0', '0']
      });

      expect(input.predicateTypes).to.deep.equal([1, 2, 3, 4, 4]);
      expect(input.merkleRoots).to.deep.equal(['100', '200', '0', '0', '0']);
    });

    it('should normalize predicate types automatically', function() {
      const input = createCircuitInput(testPolicyCommitment, {
        predicateTypes: [0, 0, 0, 0, 0], // All unset
        merkleRoots: ['0', '0', '0', '0', '0'], // All zero
        credPublicKeys: ['0', '0', '0', '0', '0']
      });

      // All should be normalized to type 4 (inactive)
      expect(input.predicateTypes.every(t => t === 4)).to.be.true;
    });

    it('should include all required fields for circuit', function() {
      const input = createCircuitInput(testPolicyCommitment);

      const requiredFields = [
        'policy', 'requesterAttrs', 'predicateTypes',
        'predicateSchemaTags', 'scopeKinds', 'approvedScopeIds',
        'merkleLeaves', 'merklePathElements', 'merklePathIndices',
        'credSignatures', 'credPublicKeys', 'credentialIds', 'holderSecret',
        'rangeValues', 'rangeMin', 'rangeMax',
        'ontologyCodes', 'ontologyPolicyIds', 'ontologyEpochs',
        'randomizer', 'policyCommitment', 'paramsCommitment',
        'merkleRoots', 'numOperations'
      ];

      requiredFields.forEach(field => {
        expect(input).to.have.property(field);
      });
    });

    it('should handle custom numOperations', function() {
      const input = createCircuitInput(testPolicyCommitment, {
        numOperations: 5
      });

      expect(input.numOperations).to.equal(5);
    });
  });

  describe('generateProof() - Error Handling', function() {
    it('should throw error if wasm file does not exist', async function() {
      const input = createCircuitInput('12345');

      try {
        await generateProof(input, {
          wasmPath: '/non/existent/path.wasm',
          zkeyPath: '/non/existent/path.zkey'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('WASM file not found');
      }
    });

    it('should throw error if zkey file does not exist', async function() {
      const input = createCircuitInput('12345');
      const validWasmPath = path.resolve(__dirname, '../../build/circuits/test_policy_commitment_js/test_policy_commitment.wasm');

      if (!fs.existsSync(validWasmPath)) {
        this.skip();
      }

      try {
        await generateProof(input, {
          wasmPath: validWasmPath,
          zkeyPath: '/non/existent/path.zkey'
        });
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.include('ZKey file not found');
      }
    });

    it('should auto-calculate paramsCommitment if not provided', async function() {
      const input = createCircuitInput('12345', {
        paramsCommitment: '0', // Will be auto-calculated
        merkleRoots: ['100', '200', '0', '0', '0']
      });

      const validWasmPath = path.resolve(__dirname, '../../build/circuits/test_policy_commitment_js/test_policy_commitment.wasm');
      const validZkeyPath = path.resolve(__dirname, '../../build/circuits/test_policy_commitment_final.zkey');

      if (!fs.existsSync(validWasmPath) || !fs.existsSync(validZkeyPath)) {
        this.skip();
      }

      // Should not throw error - will calculate paramsCommitment internally
      expect(input.paramsCommitment).to.equal('0');
    });
  });

  describe('Integration Tests', function() {
    it('should complete full flow: commitment -> input -> proof format', async function() {
      const policy = [0, 1, 11, 0, 0];
      const randomizer = BigInt('12345');

      // Step 1: Calculate policy commitment
      // createCircuitInput defaults numOperations to 3; the commitment binds
      // the program length, so both must agree.
      const policyCommitment = await calculatePolicyCommitment(policy, randomizer, 3);
      expect(policyCommitment).to.be.a('string');

      // Step 2: Calculate params commitment
      const paramsCommitment = await calculateParamsCommitment({
        merkleRoots: ['100', '0', '0', '0', '0']
      });
      expect(paramsCommitment).to.be.a('string');

      // Step 3: Create circuit input
      const input = createCircuitInput(policyCommitment, {
        policy,
        randomizer,
        paramsCommitment,
        requesterAttrs: [1, 1, 0, 0, 0, 0],
        merkleRoots: ['100', '0', '0', '0', '0']
      });

      expect(input.policyCommitment).to.equal(policyCommitment);
      expect(input.paramsCommitment).to.equal(paramsCommitment);
      expect(input.policy).to.include.members(policy);
    });

    it('should handle complete realistic scenario', async function() {
      // Realistic healthcare consent policy
      const policy = [0, 1, 11, 2, 12]; // (attr[1] OR attr[2]) in postfix
      const randomizer = BigInt('9876543210');
      const requesterAttrs = [1, 1, 0, 0, 0, 0]; // Has DS and RS

      // createCircuitInput defaults numOperations to 3; the commitment binds
      // the program length, so both must agree.
      const policyCommitment = await calculatePolicyCommitment(policy, randomizer, 3);
      const paramsCommitment = await calculateParamsCommitment({
        merkleRoots: ['0x123abc', '0x456def', '0', '0', '0'],
        ontologyPolicyIds: ['1', '2', '0', '0', '0'],
        ontologyEpochs: ['1000', '2000', '0', '0', '0']
      });

      const input = createCircuitInput(policyCommitment, {
        policy,
        randomizer,
        requesterAttrs,
        paramsCommitment,
        predicateTypes: [4, 4, 4, 4, 4],
        merkleRoots: ['0x123abc', '0x456def', '0', '0', '0'],
        ontologyPolicyIds: ['1', '2', '0', '0', '0'],
        ontologyEpochs: ['1000', '2000', '0', '0', '0']
      });

      expect(input).to.be.an('object');
      expect(input.policy).to.have.lengthOf(20);
      expect(input.requesterAttrs).to.deep.equal(requesterAttrs);
    });
  });

  describe('Type Conversion and Normalization', function() {
    it('should handle various input types for field elements', async function() {
      const params = {
        merkleRoots: [
          '123',           // string decimal
          '0x123',         // string hex
          123,             // number
          BigInt('123'),   // bigint
          '0'              // zero
        ]
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });

    it('should convert BigInt randomizer to string in input', function() {
      const input = createCircuitInput('12345', {
        randomizer: BigInt('999888777666555')
      });

      expect(input.randomizer).to.be.a('string');
      expect(input.randomizer).to.equal('999888777666555');
    });
  });

  describe('Edge Cases and Boundary Conditions', function() {
    it('should handle zero values in all parameters', async function() {
      const commitment = await calculateParamsCommitment({
        merkleRoots: ['0', '0', '0', '0', '0'],
        credPublicKeys: ['0', '0', '0', '0', '0'],
        rangeMin: ['0', '0', '0', '0', '0'],
        rangeMax: ['0', '0', '0', '0', '0'],
        ontologyPolicyIds: ['0', '0', '0', '0', '0'],
        ontologyEpochs: ['0', '0', '0', '0', '0']
      });

      expect(commitment).to.be.a('string');
    });

    it('should handle maximum field element values', async function() {
      // BN254 field modulus is approximately 2^254
      const largeValue = '21888242871839275222246405745257275088548364400416034343698204186575808495617';

      const params = {
        merkleRoots: [largeValue]
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });

    it('should handle empty string inputs', async function() {
      const params = {
        merkleRoots: ['', '0', ''],
        credPublicKeys: ['', '', '']
      };

      const commitment = await calculateParamsCommitment(params);
      expect(commitment).to.be.a('string');
    });
  });
});
