const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { deployPoseidon3 } = require('../lib/poseidon_contract');

// Contract-level checks that need no proof: deployment state, policy
// commitment bookkeeping, revocation, and emergency controls. Proof-carrying
// access paths are covered by test/duo/*.test.js and the on-chain
// context-binding / V2 lifecycle suites against the frozen DUO V3 circuit.
describe('PolicyPrivacy', function () {
  // Fixture for deploying the contract with fresh state
  async function deployPolicyPrivacyFixture() {
    const [owner, dataSubject1, dataSubject2, requester1, requester2] = await ethers.getSigners();

    // Deploy PolicyPrivacyMainVerifier (real Groth16 verifier)
    const PolicyPrivacyMainVerifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
    const verifier = await PolicyPrivacyMainVerifier.deploy();

    // Deploy main PolicyPrivacy contract
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const contextHasher = await deployPoseidon3(ethers);
    const policyPrivacy = await PolicyPrivacy.deploy(
      verifier.target,
      await contextHasher.getAddress()
    );

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

  describe('Gas Usage and Performance', function () {
    it('Should have reasonable gas costs for policy commitment', async function () {
      const { policyPrivacy, dataSubject1 } = await loadFixture(deployPolicyPrivacyFixture);
      
      const tx = await policyPrivacy.connect(dataSubject1).commitPolicy(123456, 'test');
      const receipt = await tx.wait();
      
      console.log(`    Policy commitment gas used: ${receipt.gasUsed.toString()}`);
      
      // Should be under reasonable limit (adjust based on requirements)
      expect(receipt.gasUsed).to.be.below(200000);
    });
  });
});
