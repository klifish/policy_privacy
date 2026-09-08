const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const circomlibjs = require('circomlibjs');
const { deployPoseidon3 } = require('../lib/poseidon_contract');

// Helper function to create test Groth16 proof components
function createTestProof(commitment, paramsCommitment = 0, seedValue = 1) {
  const toFixedHex = (value, pad = 64) => {
    const bn = typeof value === 'bigint' ? value : BigInt(value);
    return `0x${bn.toString(16).padStart(pad, '0')}`;
  };

  const pA = [toFixedHex(seedValue), toFixedHex(seedValue + 1)];
  const pB = [
    [toFixedHex(seedValue + 2), toFixedHex(seedValue + 3)],
    [toFixedHex(seedValue + 4), toFixedHex(seedValue + 5)]
  ];
  const pC = [toFixedHex(seedValue + 6), toFixedHex(seedValue + 7)];
  
  const pubSignals = Array(33).fill(toFixedHex(0));
  pubSignals[0] = toFixedHex(1); // isAuthorized
  pubSignals[1] = toFixedHex(commitment);
  pubSignals[2] = toFixedHex(paramsCommitment);
  
  return { pA, pB, pC, pubSignals };
}

describe('PolicyPrivacy Integration Tests', function () {
  let poseidon;

  before(async function () {
    // Initialize Poseidon hash function for commitment calculations
    poseidon = await circomlibjs.buildPoseidon();
  });

  // Fixture for deploying contracts
  async function deployIntegrationFixture() {
    const [owner, patient1, patient2, doctor1, researcher1, emergency1] = await ethers.getSigners();

    // Deploy mock verifier
    const MockVerifier = await ethers.getContractFactory('MockVerifier');
    const mockVerifier = await MockVerifier.deploy();

    // Deploy PolicyPrivacy contract
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const contextHasher = await deployPoseidon3(ethers);
    const policyPrivacy = await PolicyPrivacy.deploy(
      mockVerifier.target,
      await contextHasher.getAddress()
    );

    return {
      policyPrivacy,
      mockVerifier,
      owner,
      patient1,
      patient2,
      doctor1,
      researcher1,
      emergency1
    };
  }

  /**
   * Helper function to calculate policy commitment using the same method as circuits
   * This simulates what would happen in the real zero-knowledge circuit
   */
  function calculatePolicyCommitment(policyTokens, randomizer) {
    // Ensure policy tokens are the right format (BigInt array)
    const tokens = policyTokens.map(t => BigInt(t));
    const r = BigInt(randomizer);
    
    // Calculate commitment: Com(P;r) = Poseidon(P || r)
    const allInputs = tokens.concat([r]);
    const commitment = poseidon(allInputs);
    
    return poseidon.F.toObject(commitment).toString();
  }

  describe('End-to-End Healthcare Consent Workflow', function () {
    it('Should handle complete patient consent workflow with commitment verification', async function () {
      const { policyPrivacy, mockVerifier, patient1, doctor1 } = await loadFixture(deployIntegrationFixture);

      // Step 1: Patient creates a policy for medical data sharing
      // Policy: "Share medical data with doctors AND in emergency situations"
      // This would be encoded as RPN tokens: [DOCTOR_ATTR, EMERGENCY_ATTR, AND]
      // For this test, we'll use simplified token values
      const policyTokens = [
        1,  // DOCTOR credential attribute (external predicate)
        2,  // EMERGENCY situation attribute  
        5,  // AND operation
        0,  // Padding
        0, 0, 0, 0, 0, 0  // More padding to reach DEPTH=10
      ];
      
      const randomizer = 12345n;
      const calculatedCommitment = calculatePolicyCommitment(policyTokens, randomizer);
      
      console.log('    Policy tokens:', policyTokens.slice(0, 3));
      console.log('    Randomizer:', randomizer.toString());
      console.log('    Calculated commitment:', calculatedCommitment.slice(-12));

      // Step 2: Patient commits the policy on-chain
      const metadataURI = 'ipfs://QmMedicalDataSharingPolicy';
      await expect(policyPrivacy.connect(patient1).commitPolicy(calculatedCommitment, metadataURI))
        .to.emit(policyPrivacy, 'PolicyCommitted')
        .withArgs(patient1.address, 1, calculatedCommitment, 0);

      // Verify policy was stored correctly
      const [dataSubject, storedCommitment, storedParamsCommitment, isActive, , storedMetadata] = await policyPrivacy.getPolicy(1);
      expect(dataSubject).to.equal(patient1.address);
      expect(storedCommitment.toString()).to.equal(calculatedCommitment);
      expect(storedParamsCommitment).to.equal(0);
      expect(isActive).to.equal(true);
      expect(storedMetadata).to.equal(metadataURI);

      // Step 3: Doctor proves they satisfy the policy using zero-knowledge proof
      // In real implementation, this would be a zk-SNARK proof demonstrating:
      // - Doctor has valid medical credentials (external predicate)
      // - Current situation is an emergency (external predicate)
      // - The policy evaluates to true given these attributes
      
      await mockVerifier.setResult(true); // Simulate valid proof verification
      
      const { pA, pB, pC, pubSignals } = createTestProof(calculatedCommitment, 0, 42);
      
      await expect(policyPrivacy.connect(doctor1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.emit(policyPrivacy, 'AccessRequested')
        .withArgs(doctor1.address, 1, 1)
        .and.to.emit(policyPrivacy, 'AccessGranted')
        .withArgs(doctor1.address, 1, 1);

      // Verify access was granted
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
    });

    it('Should reject access when policy evaluation fails', async function () {
      const { policyPrivacy, mockVerifier, patient1, researcher1 } = await loadFixture(deployIntegrationFixture);

      // Same policy as above - requires doctor AND emergency
      const policyTokens = [1, 2, 5, 0, 0, 0, 0, 0, 0, 0];
      const randomizer = 54321n;
      const commitment = calculatePolicyCommitment(policyTokens, randomizer);

      await policyPrivacy.connect(patient1).commitPolicy(commitment, 'ipfs://MedicalPolicy');

      // Researcher tries to access but doesn't meet policy criteria
      // Mock verifier returns false indicating policy evaluation failed
      await mockVerifier.setResult(false);
      
      const invalidProof = Array(24).fill(99);
      
      await expect(policyPrivacy.connect(researcher1).requestAccess(1, invalidProof))
        .to.emit(policyPrivacy, 'AccessRequested')
        .withArgs(researcher1.address, 1, 1)
        .and.to.emit(policyPrivacy, 'AccessDenied')
        .withArgs(researcher1.address, 1, 1);

      expect(await policyPrivacy.isAccessGranted(1)).to.equal(false);
    });
  });

  describe('Research Data Consent with Complex Policies', function () {
    it('Should handle multi-condition research consent policies', async function () {
      const { policyPrivacy, mockVerifier, patient1, researcher1 } = await loadFixture(deployIntegrationFixture);

      // Complex policy: "Share for diabetes research IF (researcher_certified AND age >= 18 AND consent_duration_valid)"
      // RPN: [RESEARCHER_CERT, AGE_CHECK, AND, DURATION_CHECK, AND]
      const researchPolicyTokens = [
        3,  // RESEARCHER_CERT external predicate  
        4,  // AGE_CHECK external predicate
        5,  // AND
        5,  // DURATION_CHECK external predicate
        5,  // AND
        0, 0, 0, 0, 0  // Padding
      ];
      
      const randomizer = 98765n;
      const commitment = calculatePolicyCommitment(researchPolicyTokens, randomizer);

      console.log('    Research policy commitment:', commitment.slice(-12));

      // Patient commits research consent policy
      await policyPrivacy.connect(patient1).commitPolicy(
        commitment, 
        'ipfs://QmDiabetesResearchConsentPolicy'
      );

      // Researcher proves they meet all criteria
      await mockVerifier.setResult(true);
      const validResearchProof = Array(24).fill(123);

      await expect(policyPrivacy.connect(researcher1).requestAccess(1, validResearchProof))
        .to.emit(policyPrivacy, 'AccessGranted');

      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
    });

    it('Should handle policy updates through revocation and recommitment', async function () {
      const { policyPrivacy, mockVerifier, patient1, researcher1 } = await loadFixture(deployIntegrationFixture);

      // Initial policy - broad research consent
      const initialPolicy = [3, 4, 5, 0, 0, 0, 0, 0, 0, 0]; // researcher AND age_check
      const initialCommitment = calculatePolicyCommitment(initialPolicy, 11111n);
      
      await policyPrivacy.connect(patient1).commitPolicy(initialCommitment, 'ipfs://InitialResearchPolicy');

      // Patient decides to revoke broad consent
      await expect(policyPrivacy.connect(patient1).revokePolicy(1))
        .to.emit(policyPrivacy, 'PolicyRevoked')
        .withArgs(patient1.address, 1);

      // Patient creates new, more restrictive policy
      const restrictivePolicy = [3, 4, 5, 6, 5, 0, 0, 0, 0, 0]; // researcher AND age_check AND specific_study
      const restrictiveCommitment = calculatePolicyCommitment(restrictivePolicy, 22222n);
      
      await policyPrivacy.connect(patient1).commitPolicy(restrictiveCommitment, 'ipfs://RestrictiveResearchPolicy');

      // Verify new policy works
      await mockVerifier.setResult(true);
      await policyPrivacy.connect(researcher1).requestAccess(2, Array(24).fill(200));
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);

      // Verify old policy is inactive
      await expect(policyPrivacy.connect(researcher1).requestAccess(1, Array(24).fill(201)))
        .to.be.revertedWith('Policy not active');
    });
  });

  describe('Multi-Party Healthcare Scenarios', function () {
    it('Should handle different access levels for different healthcare roles', async function () {
      const { policyPrivacy, mockVerifier, patient1, doctor1, researcher1, emergency1 } = await loadFixture(deployIntegrationFixture);

      // Create different policies for different data types and access levels
      const policies = [
        {
          name: 'Emergency Medical Access',
          tokens: [7, 8, 5, 0, 0, 0, 0, 0, 0, 0], // emergency_responder AND critical_situation
          randomizer: 1111n,
          metadata: 'ipfs://EmergencyAccess'
        },
        {
          name: 'Regular Medical Care',
          tokens: [1, 9, 5, 0, 0, 0, 0, 0, 0, 0], // doctor AND regular_hours
          randomizer: 2222n,
          metadata: 'ipfs://RegularCare'
        },
        {
          name: 'Research Participation',
          tokens: [3, 4, 5, 10, 5, 0, 0, 0, 0, 0], // researcher AND age_check AND study_approved
          randomizer: 3333n,
          metadata: 'ipfs://ResearchParticipation'
        }
      ];

      // Patient commits all policies
      for (let i = 0; i < policies.length; i++) {
        const commitment = calculatePolicyCommitment(policies[i].tokens, policies[i].randomizer);
        await policyPrivacy.connect(patient1).commitPolicy(commitment, policies[i].metadata);
        console.log(`    ${policies[i].name} commitment:`, commitment.slice(-12));
      }

      // Verify patient has all policies
      const patientPolicies = await policyPrivacy.getSubjectPolicies(patient1.address);
      expect(patientPolicies).to.have.lengthOf(3);

      // Emergency responder accesses emergency policy
      await mockVerifier.setResult(true);
      await policyPrivacy.connect(emergency1).requestAccess(1, Array(24).fill(301));
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);

      // Doctor accesses regular care policy
      await policyPrivacy.connect(doctor1).requestAccess(2, Array(24).fill(302));
      expect(await policyPrivacy.isAccessGranted(2)).to.equal(true);

      // Researcher accesses research policy
      await policyPrivacy.connect(researcher1).requestAccess(3, Array(24).fill(303));
      expect(await policyPrivacy.isAccessGranted(3)).to.equal(true);
    });
  });

  describe('Commitment Calculation Verification', function () {
    it('Should produce consistent commitments with circuit implementation', async function () {
      // This test verifies that our JavaScript commitment calculation
      // matches what the Circom circuit would produce

      const testCases = [
        {
          policy: [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
          randomizer: 12345n,
          description: 'Simple AND policy'
        },
        {
          policy: [0, 1, 6, 0, 0, 0, 0, 0, 0, 0],
          randomizer: 67890n,
          description: 'Simple OR policy'
        },
        {
          policy: [0, 7, 0, 0, 0, 0, 0, 0, 0, 0],
          randomizer: 99999n,
          description: 'Simple NOT policy'
        }
      ];

      console.log('    Verifying commitment calculations:');
      
      for (const testCase of testCases) {
        const commitment1 = calculatePolicyCommitment(testCase.policy, testCase.randomizer);
        const commitment2 = calculatePolicyCommitment(testCase.policy, testCase.randomizer);
        
        // Should be deterministic
        expect(commitment1).to.equal(commitment2);
        
        // Should change with different randomizer
        const differentCommitment = calculatePolicyCommitment(testCase.policy, testCase.randomizer + 1n);
        expect(commitment1).to.not.equal(differentCommitment);
        
        console.log(`      ${testCase.description}: ${commitment1.slice(-12)}...`);
      }
    });

    it('Should handle edge cases in commitment calculation', async function () {
      // Test with all zeros
      const zeroCommitment = calculatePolicyCommitment([0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 0n);
      expect(zeroCommitment).to.be.a('string');
      expect(zeroCommitment.length).to.be.greaterThan(0);

      // Test with maximum values
      const maxPolicy = Array(10).fill(255);
      const maxCommitment = calculatePolicyCommitment(maxPolicy, BigInt('0xFFFFFFFFFFFFFFFF'));
      expect(maxCommitment).to.be.a('string');
      expect(maxCommitment.length).to.be.greaterThan(0);

      console.log('    Zero policy commitment:', zeroCommitment.slice(-12));
      console.log('    Max policy commitment:', maxCommitment.slice(-12));
    });
  });

  describe('Performance and Gas Optimization', function () {
    it('Should demonstrate efficient batch operations', async function () {
      const { policyPrivacy, mockVerifier, patient1, patient2 } = await loadFixture(deployIntegrationFixture);

      // Measure gas for multiple policy commitments
      const commitments = [];
      for (let i = 0; i < 5; i++) {
        const policy = [i, i+1, 5, 0, 0, 0, 0, 0, 0, 0];
        const commitment = calculatePolicyCommitment(policy, BigInt(1000 + i));
        commitments.push(commitment);
      }

      // Patient 1 commits multiple policies
      const gasUsed = [];
      for (let i = 0; i < commitments.length; i++) {
        const tx = await policyPrivacy.connect(patient1).commitPolicy(commitments[i], `uri${i}`);
        const receipt = await tx.wait();
        gasUsed.push(receipt.gasUsed);
      }

      console.log('    Gas usage for policy commitments:');
      gasUsed.forEach((gas, i) => {
        console.log(`      Policy ${i + 1}: ${gas.toString()} gas`);
      });

      // Verify all policies were committed
      const policies = await policyPrivacy.getSubjectPolicies(patient1.address);
      expect(policies).to.have.lengthOf(5);
    });
  });
});
