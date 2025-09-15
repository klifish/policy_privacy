const { expect } = require('chai');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { generateGroth16Proof, calculatePolicyCommitment, createCircuitInput } = require('./utils/proofGenerator');

describe('PolicyPrivacy - Real Groth16 Integration', function () {
  this.timeout(300000); // 5 minutes for proof generation

  // Fixture for deploying the contract with fresh state
  async function deployPolicyPrivacyFixture() {
    const [owner, dataSubject1, requester1] = await ethers.getSigners();

    // Deploy PolicyPrivacyMainVerifier (real Groth16 verifier)
    const PolicyPrivacyMainVerifier = await ethers.getContractFactory('Groth16Verifier');
    const verifier = await PolicyPrivacyMainVerifier.deploy();

    // Deploy main PolicyPrivacy contract
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const policyPrivacy = await PolicyPrivacy.deploy(verifier.target);

    return {
      policyPrivacy,
      verifier,
      owner,
      dataSubject1,
      requester1
    };
  }

  it('Should complete full flow: policy commitment -> snarkjs proof generation -> smart contract verification', async function () {
    const { policyPrivacy, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
    
    // Step 1: Create a policy and calculate proper commitment
    const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]; // attr0 AND attr1
    const randomizer = BigInt('12345');
    const policyCommitment = await calculatePolicyCommitment(policy, randomizer);
    
    console.log('Policy commitment:', policyCommitment);
    
    // Step 2: Data subject commits to policy
    await expect(policyPrivacy.connect(dataSubject1).commitPolicy(policyCommitment, 'ipfs://test-policy'))
      .to.emit(policyPrivacy, 'PolicyCommitted')
      .withArgs(dataSubject1.address, 1, policyCommitment);
    
    // Step 3: Data requester generates real Groth16 proof using snarkjs
    console.log('Generating Groth16 proof...');
    const requesterAttrs = [1, 1, 0]; // Attributes that satisfy the policy
    const input = createCircuitInput(policyCommitment, { 
      policy, 
      randomizer, 
      requesterAttrs 
    });
    
    const { pA, pB, pC, pubSignals } = await generateGroth16Proof(input);
    console.log('Proof generated successfully');
    
    // Verify the public signals
    expect(pubSignals[0]).to.equal('1'); // isAuthorized should be 1 (true)
    expect(pubSignals[1]).to.equal(policyCommitment); // policyCommitment should match
    
    // Step 4: Data requester submits proof to smart contract for verification
    await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
      .to.emit(policyPrivacy, 'AccessRequested')
      .withArgs(requester1.address, 1, 1)
      .and.to.emit(policyPrivacy, 'AccessGranted')
      .withArgs(requester1.address, 1, 1);
      
    // Verify access request was stored correctly
    const accessRequest = await policyPrivacy.accessRequests(1);
    expect(accessRequest.requester).to.equal(requester1.address);
    expect(accessRequest.policyId).to.equal(1);
    expect(accessRequest.isProcessed).to.equal(true);
    expect(accessRequest.isGranted).to.equal(true);
    
    console.log('✅ Full flow completed successfully!');
  });

  it('Should reject proof with mismatched policy commitment', async function () {
    const { policyPrivacy, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
    
    // Step 1: Create and commit a policy
    const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
    const randomizer = BigInt('12345');
    const policyCommitment = await calculatePolicyCommitment(policy, randomizer);
    
    await policyPrivacy.connect(dataSubject1).commitPolicy(policyCommitment, 'ipfs://test-policy');
    
    // Step 2: Generate proof for a DIFFERENT policy commitment
    const wrongRandomizer = BigInt('99999');
    const wrongCommitment = await calculatePolicyCommitment(policy, wrongRandomizer);
    
    const input = createCircuitInput(wrongCommitment, { 
      policy, 
      randomizer: wrongRandomizer, 
      requesterAttrs: [1, 1, 0] 
    });
    
    const { pA, pB, pC, pubSignals } = await generateGroth16Proof(input);
    
    // Step 3: Try to use the proof for the original policy - should fail
    await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
      .to.be.revertedWith('Policy commitment mismatch');
  });

  it('Should reject invalid proof', async function () {
    const { policyPrivacy, dataSubject1, requester1 } = await loadFixture(deployPolicyPrivacyFixture);
    
    // Step 1: Create and commit a policy
    const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0];
    const randomizer = BigInt('12345');
    const policyCommitment = await calculatePolicyCommitment(policy, randomizer);
    
    await policyPrivacy.connect(dataSubject1).commitPolicy(policyCommitment, 'ipfs://test-policy');
    
    // Step 2: Generate proof with attributes that DON'T satisfy the policy
    const badRequesterAttrs = [0, 1, 0]; // attr0=0, but policy requires attr0 AND attr1
    const input = createCircuitInput(policyCommitment, { 
      policy, 
      randomizer, 
      requesterAttrs: badRequesterAttrs 
    });
    
    // This should fail during proof generation because the circuit will output 0
    try {
      const { pA, pB, pC, pubSignals } = await generateGroth16Proof(input);
      
      // If proof generation succeeded (shouldn't happen), the verification should fail
      await expect(policyPrivacy.connect(requester1).requestAccess(1, pA, pB, pC, pubSignals))
        .to.emit(policyPrivacy, 'AccessDenied');
        
    } catch (error) {
      // Expected: proof generation should fail for invalid inputs
      console.log('✅ Proof generation correctly failed for invalid attributes');
      expect(error.message).to.include('Assert Failed');
    }
  });
});