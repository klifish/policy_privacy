const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

describe('PolicyPrivacy', function () {
  // Fixture for deploying the contract with fresh state
  async function deployPolicyPrivacyFixture() {
    const [owner, dataSubject1, dataSubject2, requester1, requester2] = await ethers.getSigners();

    // Deploy mock verifier first
    const MockVerifier = await ethers.getContractFactory('MockVerifier');
    const mockVerifier = await MockVerifier.deploy();

    // Deploy main PolicyPrivacy contract
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const policyPrivacy = await PolicyPrivacy.deploy(mockVerifier.target);

    return {
      policyPrivacy,
      mockVerifier,
      owner,
      dataSubject1,
      dataSubject2,
      requester1,
      requester2
    };
  }

  describe('Deployment', function () {
    it('Should set the correct verifier', async function () {
      const { policyPrivacy, mockVerifier } = await loadFixture(deployPolicyPrivacyFixture);
      expect(await policyPrivacy.verifier()).to.equal(mockVerifier.target);
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
        .withArgs(dataSubject1.address, 1, commitment);
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
      
      const [dataSubject, storedCommitment, isActive, timestamp, storedMetadataURI] = 
        await policyPrivacy.getPolicy(1);
      
      expect(dataSubject).to.equal(dataSubject1.address);
      expect(storedCommitment).to.equal(commitment);
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

    it('Should allow access requests with valid proofs', async function () {
      const { policyPrivacy, mockVerifier, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      await policyPrivacy.connect(requester1).commitPolicy(424242, 'test-uri');
      
      // Set verifier to return true
      await mockVerifier.setResult(true);
      
      const proof = Array(24).fill(1);
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, proof))
        .to.emit(policyPrivacy, 'AccessRequested')
        .withArgs(requester1.address, 1, 1)
        .and.to.emit(policyPrivacy, 'AccessGranted')
        .withArgs(requester1.address, 1, 1);
    });

    it('Should deny access requests with invalid proofs', async function () {
      const { policyPrivacy, mockVerifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy  
      await policyPrivacy.connect(dataSubject1).commitPolicy(424242, 'test-uri');
      
      // Set verifier to return false
      await mockVerifier.setResult(false);
      
      const proof = Array(24).fill(0);
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, proof))
        .to.emit(policyPrivacy, 'AccessRequested')
        .withArgs(requester1.address, 1, 1)
        .and.to.emit(policyPrivacy, 'AccessDenied')
        .withArgs(requester1.address, 1, 1);
    });

    it('Should track access requests correctly', async function () {
      const { policyPrivacy, mockVerifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      await policyPrivacy.connect(dataSubject1).commitPolicy(424242, 'test-uri');
      
      // Set verifier to return true
      await mockVerifier.setResult(true);
      
      const proof = Array(24).fill(2);
      await policyPrivacy.connect(requester1).requestAccess(1, proof);
      
      const requests = await policyPrivacy.getRequesterRequests(requester1.address);
      expect(requests).to.have.lengthOf(1);
      expect(requests[0]).to.equal(1);
      
      const request = await policyPrivacy.accessRequests(1);
      expect(request.requester).to.equal(requester1.address);
      expect(request.policyId).to.equal(1);
      expect(request.isProcessed).to.equal(true);
      expect(request.isGranted).to.equal(true);
    });

    it('Should revert access requests for inactive policies', async function () {
      const { policyPrivacy, mockVerifier, requester1, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy and revoke it
      await policyPrivacy.connect(dataSubject1).commitPolicy(424242, 'test-uri');
      await policyPrivacy.connect(dataSubject1).revokePolicy(1);
      
      const proof = Array(24).fill(3);
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, proof))
        .to.be.revertedWith('Policy not active');
    });

    it('Should increment request IDs correctly', async function () {
      const { policyPrivacy, mockVerifier, requester1, requester2, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      await policyPrivacy.connect(dataSubject1).commitPolicy(424242, 'test-uri');
      
      await mockVerifier.setResult(true);
      
      const proof = Array(24).fill(4);
      
      // First request
      await policyPrivacy.connect(requester1).requestAccess(1, proof);
      expect(await policyPrivacy.nextRequestId()).to.equal(2);
      
      // Second request
      await policyPrivacy.connect(requester2).requestAccess(1, proof);
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
      
      const [, , isActive] = await policyPrivacy.getPolicy(1);
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
      const { policyPrivacy, mockVerifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup test data
      await policyPrivacy.connect(dataSubject1).commitPolicy(777777, 'view-test');
      await mockVerifier.setResult(true);
      await policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(7));
    });

    it('Should return correct access status', async function () {
      const { policyPrivacy } = await loadFixture(deployPolicyPrivacyFixture);
      const { mockVerifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup test data
      await policyPrivacy.connect(dataSubject1).commitPolicy(777777, 'view-test');
      await mockVerifier.setResult(true);
      await policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(7));
      
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
    });

    it('Should verify proofs manually', async function () {
      const { policyPrivacy, mockVerifier } = await loadFixture(deployPolicyPrivacyFixture);
      
      await mockVerifier.setResult(true);
      expect(await policyPrivacy.verifyProof(Array(24).fill(8), 888888)).to.equal(true);
      
      await mockVerifier.setResult(false);
      expect(await policyPrivacy.verifyProof(Array(24).fill(9), 999999)).to.equal(false);
    });
  });

  describe('Healthcare Consent Scenarios', function () {
    it('Should handle patient consent for medical data sharing', async function () {
      const { policyPrivacy, mockVerifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient commits a policy: "Share with doctors AND emergency contacts"
      // This would be encoded as a commitment to policy tokens
      const medicalDataPolicyCommitment = 999888777;
      const metadataURI = 'ipfs://QmMedicalDataPolicy';
      
      // Patient commits the policy
      await expect(policyPrivacy.connect(dataSubject1).commitPolicy(medicalDataPolicyCommitment, metadataURI))
        .to.emit(policyPrivacy, 'PolicyCommitted')
        .withArgs(dataSubject1.address, 1, medicalDataPolicyCommitment);
      
      // Healthcare provider proves they satisfy the policy (doctor + emergency)
      await mockVerifier.setResult(true);
      const proof = Array(24).fill(42); // ZK proof that they're a doctor in emergency situation
      
      await expect(policyPrivacy.connect(requester1).requestAccess(1, proof))
        .to.emit(policyPrivacy, 'AccessGranted')
        .withArgs(requester1.address, 1, 1);
      
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
    });

    it('Should handle research data consent with multiple conditions', async function () {
      const { policyPrivacy, mockVerifier, dataSubject1, requester1, requester2 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient commits a research policy with complex conditions:
      // "Share with researchers IF (age > 18 AND location = EU AND purpose = diabetes_research)"
      const researchPolicyCommitment = 111222333;
      
      await policyPrivacy.connect(dataSubject1).commitPolicy(researchPolicyCommitment, 'ipfs://QmResearchPolicy');
      
      // Valid researcher request
      await mockVerifier.setResult(true);
      await policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(100));
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
      
      // Invalid researcher request (doesn't meet criteria)
      await mockVerifier.setResult(false);
      await policyPrivacy.connect(requester2).requestAccess(1, Array(24).fill(200));
      expect(await policyPrivacy.isAccessGranted(2)).to.equal(false);
    });

    it('Should handle consent revocation scenarios', async function () {
      const { policyPrivacy, mockVerifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient initially gives consent
      await policyPrivacy.connect(dataSubject1).commitPolicy(444555666, 'ipfs://QmInitialConsent');
      
      // Provider successfully accesses data
      await mockVerifier.setResult(true);
      await policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(150));
      expect(await policyPrivacy.isAccessGranted(1)).to.equal(true);
      
      // Patient revokes consent
      await expect(policyPrivacy.connect(dataSubject1).revokePolicy(1))
        .to.emit(policyPrivacy, 'PolicyRevoked')
        .withArgs(dataSubject1.address, 1);
      
      // Future access attempts should fail
      await expect(policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(160)))
        .to.be.revertedWith('Policy not active');
    });

    it('Should handle multiple policies per patient', async function () {
      const { policyPrivacy, mockVerifier, dataSubject1, requester1, requester2 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Patient creates different policies for different data types
      await policyPrivacy.connect(dataSubject1).commitPolicy(1001, 'ipfs://QmMedicalRecords');    // Medical records
      await policyPrivacy.connect(dataSubject1).commitPolicy(1002, 'ipfs://QmLabResults');       // Lab results  
      await policyPrivacy.connect(dataSubject1).commitPolicy(1003, 'ipfs://QmGenomicData');      // Genomic data
      
      const policies = await policyPrivacy.getSubjectPolicies(dataSubject1.address);
      expect(policies).to.have.lengthOf(3);
      
      // Different requesters can access different data types based on their credentials
      await mockVerifier.setResult(true);
      
      // Doctor accesses medical records
      await policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(201));
      
      // Researcher accesses genomic data  
      await policyPrivacy.connect(requester2).requestAccess(3, Array(24).fill(203));
      
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
      const { policyPrivacy, mockVerifier, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      // Setup policy
      await policyPrivacy.connect(dataSubject1).commitPolicy(789012, 'test');
      await mockVerifier.setResult(true);
      
      const tx = await policyPrivacy.connect(requester1).requestAccess(1, Array(24).fill(50));
      const receipt = await tx.wait();
      
      console.log(`    Access request gas used: ${receipt.gasUsed.toString()}`);
      
      // Should be under reasonable limit (adjust based on requirements)
      expect(receipt.gasUsed).to.be.below(300000);
    });
  });
});