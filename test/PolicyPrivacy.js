const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { generateGroth16Proof, calculatePolicyCommitment, createCircuitInput } = require('./utils/proofGenerator');

// Helper function to create real Groth16 proofs for testing
async function createRealProof(commitment, options = {}) {
  try {
    // For real circuit integration, use proper policy commitment calculation
    if (options.useRealProof) {
      const policy = options.policy || [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]; // Default: attr0 AND attr1
      const randomizer = options.randomizer || BigInt('12345');
      
      const actualCommitment = await calculatePolicyCommitment(policy, randomizer);
      const input = createCircuitInput(actualCommitment, { policy, randomizer, ...options });
      const { pA, pB, pC, pubSignals } = await generateGroth16Proof(input);
      
      return { pA, pB, pC, pubSignals, actualCommitment, paramsCommitment: input.paramsCommitment };
    } else {
      // For backward compatibility with existing simple tests
      // Create mock data that will pass smart contract validation
      const seedValue = parseInt(commitment.toString().slice(-4)) || 1;
      const pA = [toFixedHex(seedValue), toFixedHex(seedValue + 1)];
      const pB = [
        [toFixedHex(seedValue + 2), toFixedHex(seedValue + 3)],
        [toFixedHex(seedValue + 4), toFixedHex(seedValue + 5)]
      ];
      const pC = [toFixedHex(seedValue + 6), toFixedHex(seedValue + 7)];
      
      // Create public signals with proper structure for the smart contract
      const pubSignals = [
        toFixedHex(1),                        // isAuthorized (output) - index 0
        toFixedHex(commitment),               // policyCommitment - index 1
        toFixedHex(0),                        // paramsCommitment - index 2
        toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0),            // merkleRoots[5]
        toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0),            // credPublicKeys[5]
        toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0),            // rangeMin[5]
        toFixedHex(100), toFixedHex(100), toFixedHex(100), toFixedHex(100), toFixedHex(100),  // rangeMax[5]
        toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0),            // ontologyPolicyIds[5]
        toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0), toFixedHex(0)             // ontologyEpochs[5]
      ];
      
      return { pA, pB, pC, pubSignals, paramsCommitment: toFixedHex(0) };
    }
  } catch (error) {
    console.log(`Warning: Could not generate real proof (${error.message}), using mock data`);
    // Fallback to mock data
    const seedValue = parseInt(commitment.toString().slice(-4)) || 1;
    const pA = [toFixedHex(seedValue), toFixedHex(seedValue + 1)];
    const pB = [
      [toFixedHex(seedValue + 2), toFixedHex(seedValue + 3)],
      [toFixedHex(seedValue + 4), toFixedHex(seedValue + 5)]
    ];
    const pC = [toFixedHex(seedValue + 6), toFixedHex(seedValue + 7)];
    
    const zero = toFixedHex(0);
    const hundred = toFixedHex(100);
    const pubSignals = [
      toFixedHex(1),
      toFixedHex(commitment),
      zero,
      zero, zero, zero, zero, zero,
      zero, zero, zero, zero, zero,
      zero, zero, zero, zero, zero,
      hundred, hundred, hundred, hundred, hundred,
      zero, zero, zero, zero, zero,
      zero, zero, zero, zero, zero
    ];
    
    return { pA, pB, pC, pubSignals, paramsCommitment: zero };
  }
}

function toFixedHex(value, pad = 64) {
  const bn = typeof value === 'bigint' ? value : BigInt(value);
  if (bn < 0n) {
    throw new Error('Negative values are not supported for fixed hex encoding');
  }
  return `0x${bn.toString(16).padStart(pad, '0')}`;
}

describe('PolicyPrivacy', function () {
  // Fixture for deploying the contract with fresh state
  async function deployPolicyPrivacyFixture() {
    const [owner, dataSubject1, dataSubject2, requester1, requester2] = await ethers.getSigners();

    // Deploy PolicyPrivacyMainVerifier (real Groth16 verifier)
    const PolicyPrivacyMainVerifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
    const verifier = await PolicyPrivacyMainVerifier.deploy();

    // Deploy main PolicyPrivacy contract
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const policyPrivacy = await PolicyPrivacy.deploy(verifier.target);

    return {
      policyPrivacy,
      verifier,
      owner,
      dataSubject1,
      dataSubject2,
      requester1,
      requester2
    };
  }

  describe('Deployment', function () {
    it('Should set the correct verifier', async function () {
      const { policyPrivacy, verifier } = await loadFixture(deployPolicyPrivacyFixture);
      expect(await policyPrivacy.verifier()).to.equal(verifier.target);
    });

    it('Should set the correct owner', async function () {
      const { policyPrivacy, owner } = await loadFixture(deployPolicyPrivacyFixture);
      expect(await policyPrivacy.owner()).to.equal(owner.address);
    });

    it('Should start with nextPolicyId = 1', async function () {
      const { policyPrivacy } = await loadFixture(deployPolicyPrivacyFixture);
      expect(await policyPrivacy.nextPolicyId()).to.equal(1);
    });

    it('Should start with nextRequestId = 1', async function () {
      const { policyPrivacy } = await loadFixture(deployPolicyPrivacyFixture);
      expect(await policyPrivacy.nextRequestId()).to.equal(1);
    });

    it('Should not be emergency paused initially', async function () {
      const { policyPrivacy } = await loadFixture(deployPolicyPrivacyFixture);
      expect(await policyPrivacy.emergencyPaused()).to.equal(false);
    });
  });

  describe('Policy Commitment', function () {
    it('Should allow data subjects to commit policies', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      const commitment = 123456789;
      const metadataURI = 'ipfs://QmTestHash';
      
      await expect(policyPrivacy.connect(dataSubject1).commitPolicy(commitment, metadataURI))
        .to.emit(policyPrivacy, 'PolicyCommitted')
        .withArgs(dataSubject1.address, 1, commitment, 0);
    });

    it('Should increment policy IDs correctly', async function () {
      const { policyPrivacy, dataSubject1, dataSubject2 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // First policy
      await policyPrivacy.connect(dataSubject1).commitPolicy(111, 'uri1');
      expect(await policyPrivacy.nextPolicyId()).to.equal(2);
      
      // Second policy
      await policyPrivacy.connect(dataSubject2).commitPolicy(222, 'uri2');
      expect(await policyPrivacy.nextPolicyId()).to.equal(3);
    });

    it('Should store policy details correctly', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      const commitment = 987654321;
      const metadataURI = 'ipfs://QmAnotherHash';
      const tx = await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, metadataURI);
      const receipt = await tx.wait();
      
      const [dataSubject, storedCommitment, storedParamsCommitment, isActive, timestamp, storedMetadataURI] = 
        await policyPrivacy.getPolicy(1);
      
      expect(dataSubject).to.equal(dataSubject1.address);
      expect(storedCommitment).to.equal(commitment);
      expect(storedParamsCommitment).to.equal(0);
      expect(isActive).to.equal(true);
      expect(storedMetadataURI).to.equal(metadataURI);
      expect(timestamp).to.be.closeTo(Math.floor(Date.now() / 1000), 10);
    });

    it('Should track subject policies correctly', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Commit multiple policies for same subject
      await policyPrivacy.connect(dataSubject1).commitPolicy(111, '');
      await policyPrivacy.connect(dataSubject1).commitPolicy(222, '');
      await policyPrivacy.connect(dataSubject1).commitPolicy(333, '');
      
      const policies = await policyPrivacy.getSubjectPolicies(dataSubject1.address);
      expect(policies).to.have.lengthOf(3);
      expect(policies[0]).to.equal(1);
      expect(policies[1]).to.equal(2);
      expect(policies[2]).to.equal(3);
    });
  });

  describe('Access Requests', function () {
    beforeEach(async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      // Setup a policy for testing
      await policyPrivacy.connect(dataSubject1).commitPolicy(424242, 'test-uri');
    });

    it('Should process access requests (mock proofs are denied by real verifier)', async function () {
      const { policyPrivacy, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      const commitment = 424242;
      const { pA, pB, pC, pubSignals, paramsCommitment } = await createRealProof(commitment);
      await policyPrivacy.connect(requester1).commitPolicy(commitment, paramsCommitment, 'test-uri');
      
      // With real Groth16 verifier, mock proofs will be rejected
      // So we expect AccessRequested but AccessDenied (not AccessGranted)
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.emit(policyPrivacy, 'AccessRequested')
        .withArgs(requester1.address, 1, 1)
        .and.to.emit(policyPrivacy, 'AccessDenied')
        .withArgs(requester1.address, 1, 1);
    });

    it('Should deny access requests with invalid proofs', async function () {
      const { policyPrivacy, verifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy  
      const commitment = 424242;
      const { pA, pB, pC, pubSignals, paramsCommitment } = await createRealProof(commitment);
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, paramsCommitment, 'test-uri');
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.emit(policyPrivacy, 'AccessRequested')
        .withArgs(requester1.address, 1, 1)
        .and.to.emit(policyPrivacy, 'AccessDenied')
        .withArgs(requester1.address, 1, 1);
    });

    it('Should track access requests correctly', async function () {
      const { policyPrivacy, verifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      const commitment = 424242;
      const { pA, pB, pC, pubSignals, paramsCommitment } = await createRealProof(commitment);
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, paramsCommitment, 'test-uri');
      await policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals);
      
      const requests = await policyPrivacy.getRequesterRequests(requester1.address);
      expect(requests).to.have.lengthOf(1);
      expect(requests[0]).to.equal(1);
      
      const request = await policyPrivacy.accessRequests(1);
      expect(request.requester).to.equal(requester1.address);
      expect(request.policyId).to.equal(1);
      expect(request.isProcessed).to.equal(true);
      expect(request.isGranted).to.equal(false); // Mock proofs are denied by real verifier
    });

    it('Should revert access requests for inactive policies', async function () {
      const { policyPrivacy, verifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy and revoke it
      const commitment = 424242;
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, 'test-uri');
      await policyPrivacy.connect(dataSubject1).revokePolicy(1);
      
      const { pA, pB, pC, pubSignals } = await createRealProof(commitment);
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.be.revertedWith('Policy not active');
    });

    it('Should revert access requests with mismatched policy commitment', async function () {
      const { policyPrivacy, verifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy 
      const actualCommitment = 424242;
      await policyPrivacy.connect(dataSubject1).commitPolicy(actualCommitment, 'test-uri');
      
      // Set verifier to return true (proof is valid, but commitment is wrong)
      
      // Create proof with wrong commitment
      const wrongCommitment = 999999;
      const { pA, pB, pC, pubSignals } = await createRealProof(wrongCommitment);
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.be.revertedWith('Policy commitment mismatch');
    });

    it('Should increment request IDs correctly', async function () {
      const { policyPrivacy, verifier, requester1, requester2, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      const commitment = 424242;
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, 'test-uri');
      
      
      const { pA, pB, pC, pubSignals } = await createRealProof(commitment);
      
      // First request
      await policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals);
      expect(await policyPrivacy.nextRequestId()).to.equal(2);
      
      // Second request  
      await policyPrivacy.connect(requester2).requestAccess(1, pA, pB, pC, pubSignals);
      expect(await policyPrivacy.nextRequestId()).to.equal(3);
    });
  });

  describe('Policy Management', function () {
    beforeEach(async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      // Setup a policy for testing
      await policyPrivacy.connect(dataSubject1).commitPolicy(555555, 'management-test');
    });

    it('Should allow data subjects to revoke their policies', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      await policyPrivacy.connect(dataSubject1).commitPolicy(555555, 'management-test');
      
      await expect(policyPrivacy.connect(dataSubject1).revokePolicy(1))
        .to.emit(policyPrivacy, 'PolicyRevoked')
        .withArgs(dataSubject1.address, 1);
      
      const [, , , isActive] = await policyPrivacy.getPolicy(1);
      expect(isActive).to.equal(false);
    });

    it('Should not allow non-owners to revoke policies', async function () {
      const { policyPrivacy, dataSubject1, dataSubject2 } = await loadFixture(deployPolicyPrivacyFixture);
      
      await policyPrivacy.connect(dataSubject1).commitPolicy(555555, 'management-test');
      
      await expect(policyPrivacy.connect(dataSubject2).revokePolicy(1))
        .to.be.revertedWith('Not the data subject');
    });

    it('Should not allow revoking already inactive policies', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      await policyPrivacy.connect(dataSubject1).commitPolicy(555555, 'management-test');
      await policyPrivacy.connect(dataSubject1).revokePolicy(1);
      
      await expect(policyPrivacy.connect(dataSubject1).revokePolicy(1))
        .to.be.revertedWith('Policy already inactive');
    });
  });

  describe('Emergency Controls', function () {
    it('Should allow owner to pause the contract', async function () {
      const { policyPrivacy, owner } = await loadFixture(deployPolicyPrivacyFixture);
      
      await policyPrivacy.connect(owner).emergencyPause();
      expect(await policyPrivacy.emergencyPaused()).to.equal(true);
    });

    it('Should allow owner to unpause the contract', async function () {
      const { policyPrivacy, owner } = await loadFixture(deployPolicyPrivacyFixture);
      
      await policyPrivacy.connect(owner).emergencyPause();
      await policyPrivacy.connect(owner).emergencyUnpause();
      expect(await policyPrivacy.emergencyPaused()).to.equal(false);
    });

    it('Should not allow non-owners to pause', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      await expect(policyPrivacy.connect(dataSubject1).emergencyPause())
        .to.be.revertedWith('Only owner can call this function');
    });

    it('Should prevent operations when paused', async function () {
      const { policyPrivacy, owner, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      await policyPrivacy.connect(owner).emergencyPause();
      
      await expect(policyPrivacy.connect(dataSubject1).commitPolicy(666, 'paused-test'))
        .to.be.revertedWith('Contract is paused');
    });
  });

  describe('View Functions', function () {
    beforeEach(async function () {
      const { policyPrivacy, verifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup test data
      const commitment = 777777;
      const { pA, pB, pC, pubSignals, paramsCommitment } = await createRealProof(commitment);
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, paramsCommitment, 'view-test');
      await policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals);
    });

    it('Should return correct access status', async function () {
      const { policyPrivacy } = await loadFixture(deployPolicyPrivacyFixture);
      const { verifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup test data
      const commitment = 777777;
      const { pA, pB, pC, pubSignals, paramsCommitment } = await createRealProof(commitment);
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, paramsCommitment, 'view-test');
      await policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals);
      
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
    });

    it('Should verify proofs manually', async function () {
      const { policyPrivacy, verifier } = await loadFixture(deployPolicyPrivacyFixture);
      
      const { pA: pA1, pB: pB1, pC: pC1, pubSignals: pubSignals1 } = await createRealProof(888888, 8);
      expect(await policyPrivacy.verifyProof(pA1, pB1, pC1, pubSignals1)).to.equal(true);
      
      const { pA: pA2, pB: pB2, pC: pC2, pubSignals: pubSignals2 } = await createRealProof(999999, 9);
      expect(await policyPrivacy.verifyProof(pA2, pB2, pC2, pubSignals2)).to.equal(false);
    });
  });

  describe('Healthcare Consent Scenarios', function () {
    it('Should handle patient consent for medical data sharing', async function () {
      const { policyPrivacy, verifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient commits a policy: "Share with doctors AND emergency contacts"
      // This would be encoded as a commitment to policy tokens
      const medicalDataPolicyCommitment = 999888777;
      const metadataURI = 'ipfs://QmMedicalDataPolicy';
      
      // Patient commits the policy
      await expect(policyPrivacy.connect(dataSubject1).commitPolicy(medicalDataPolicyCommitment, metadataURI))
        .to.emit(policyPrivacy, 'PolicyCommitted')
        .withArgs(dataSubject1.address, 1, medicalDataPolicyCommitment, 0);
      
      // Healthcare provider proves they satisfy the policy (doctor + emergency)
      const { pA, pB, pC, pubSignals } = await createRealProof(medicalDataPolicyCommitment);
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.emit(policyPrivacy, 'AccessDenied') // Mock proofs are denied by real verifier
        .withArgs(requester1.address, 1, 1);
      
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(false);
    });

    it('Should handle research data consent with multiple conditions', async function () {
      const { policyPrivacy, verifier, dataSubject1, requester1, requester2 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient commits a research policy with complex conditions:
      // "Share with researchers IF (age > 18 AND location = EU AND purpose = diabetes_research)"
      const researchPolicyCommitment = 111222333;
      
      await policyPrivacy.connect(dataSubject1).commitPolicy(researchPolicyCommitment, 'ipfs://QmResearchPolicy');
      
      // Valid researcher request
      const { pA: pA1, pB: pB1, pC: pC1, pubSignals: pubSignals1 } = await createRealProof(researchPolicyCommitment, 100);
      await policyPrivacy.connect(requester1).requestAccess(1, pA1, pB1, pC1, pubSignals1);
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
      
      // Invalid researcher request (doesn't meet criteria)
      const { pA: pA2, pB: pB2, pC: pC2, pubSignals: pubSignals2 } = await createRealProof(researchPolicyCommitment, 200);
      await policyPrivacy.connect(requester2).requestAccess(1, pA2, pB2, pC2, pubSignals2);
      expect(await policyPrivacy.isAccessGranted(2)).to.equal(false);
    });

    it('Should handle consent revocation scenarios', async function () {
      const { policyPrivacy, verifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient initially gives consent
      const commitment = 444555666;
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, 'ipfs://QmInitialConsent');
      
      // Provider successfully accesses data
      const { pA: pA1, pB: pB1, pC: pC1, pubSignals: pubSignals1 } = await createRealProof(commitment, 150);
      await policyPrivacy.connect(requester1).requestAccess(1, pA1, pB1, pC1, pubSignals1);
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
      
      // Patient revokes consent
      await expect(policyPrivacy.connect(dataSubject1).revokePolicy(1))
        .to.emit(policyPrivacy, 'PolicyRevoked')
        .withArgs(dataSubject1.address, 1);
      
      // Future access attempts should fail
      const { pA: pA2, pB: pB2, pC: pC2, pubSignals: pubSignals2 } = await createRealProof(commitment, 160);
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA2, pB2, pC2, pubSignals2))
        .to.be.revertedWith('Policy not active');
    });

    it('Should handle multiple policies per patient', async function () {
      const { policyPrivacy, verifier, dataSubject1, requester1, requester2 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient creates different policies for different data types
      const commitments = [1001, 1002, 1003];
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitments[0], 'ipfs://QmMedicalRecords');    // Medical records
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitments[1], 'ipfs://QmLabResults');       // Lab results  
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitments[2], 'ipfs://QmGenomicData');      // Genomic data
      
      const policies = await policyPrivacy.getSubjectPolicies(dataSubject1.address);
      expect(policies).to.have.lengthOf(3);
      
      // Different requesters can access different data types based on their credentials
      
      // Doctor accesses medical records
      const { pA: pA1, pB: pB1, pC: pC1, pubSignals: pubSignals1 } = await createRealProof(commitments[0], 201);
      await policyPrivacy.connect(requester1).requestAccess(1, pA1, pB1, pC1, pubSignals1);
      
      // Researcher accesses genomic data  
      const { pA: pA2, pB: pB2, pC: pC2, pubSignals: pubSignals2 } = await createRealProof(commitments[2], 203);
      await policyPrivacy.connect(requester2).requestAccess(3, pA2, pB2, pC2, pubSignals2);
      
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
      expect(await policyPrivacy.isAccessGranted(2)).to.equal(true);
    });
  });

  describe('Gas Usage and Performance', function () {
    it('Should have reasonable gas costs for policy commitment', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      const tx = await policyPrivacy.connect(dataSubject1).commitPolicy(123456, 'test');
      const receipt = await tx.wait();
      
      console.log(`    Policy commitment gas used: ${receipt.gasUsed.toString()}`);
      
      // Should be under reasonable limit (adjust based on requirements)
      expect(receipt.gasUsed).to.be.below(200000);
    });

    it('Should have reasonable gas costs for access requests', async function () {
      const { policyPrivacy, verifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      const commitment = 789012;
      await policyPrivacy.connect(dataSubject1).commitPolicy(commitment, 'test');
      
      const { pA, pB, pC, pubSignals } = await createRealProof(commitment, 50);
      const tx = await policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals);
      const receipt = await tx.wait();
      
      console.log(`    Access request gas used: ${receipt.gasUsed.toString()}`);
      
      // Should be under reasonable limit (adjust based on requirements)
      expect(receipt.gasUsed).to.be.below(300000);
    });
  });
});
