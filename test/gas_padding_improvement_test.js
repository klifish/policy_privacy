const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Gas Padding Improvement', function () {
  let policyPrivacy;
  let mockVerifier;
  let owner, addr1;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();

    // Deploy mock verifier that always returns true
    const MockVerifier = await ethers.getContractFactory('MockVerifier');
    mockVerifier = await MockVerifier.deploy();
    await mockVerifier.waitForDeployment();

    // Deploy PolicyPrivacy
    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    policyPrivacy = await PolicyPrivacy.deploy(await mockVerifier.getAddress());
    await policyPrivacy.waitForDeployment();
  });

  describe('Improved Gas Padding', function () {
    it('should calculate calldata costs dynamically', async function () {
      const commitment1 = ethers.toBigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      const commitment2 = ethers.toBigInt('0x0000000000000000000000000000000000000000000000000000000000000001');
      const paramsCommitment = 0;
      const metadataURI = 'ipfs://test';
      const targetGas = 500000;

      // Commit two policies with different calldata (different zero byte counts)
      // Use explicit function signature to avoid ambiguity
      const tx1 = await policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
        commitment1,
        paramsCommitment,
        metadataURI,
        targetGas
      );
      const receipt1 = await tx1.wait();

      const tx2 = await policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
        commitment2,
        paramsCommitment,
        metadataURI,
        targetGas
      );
      const receipt2 = await tx2.wait();

      // With improved gas padding, both should consume similar total gas
      const gas1 = Number(receipt1.gasUsed);
      const gas2 = Number(receipt2.gasUsed);
      const gasDiff = Math.abs(gas1 - gas2);

      console.log(`Gas used for commitment 1: ${gas1}`);
      console.log(`Gas used for commitment 2: ${gas2}`);
      console.log(`Gas difference: ${gasDiff}`);

      // The gas difference should be small (allow some variation due to storage/state differences)
      // Previous implementation had larger differences (360+ gas)
      // Improved implementation should have smaller differences (<200 gas)
      expect(gasDiff).to.be.lessThan(200, 'Gas consumption difference should be minimal');
    });

    it('should pad gas accurately for different policy types', async function () {
      const targetGas = 600000;
      const paramsCommitment = 0;
      const metadataURI = 'ipfs://test';

      // Test with various commitment values that result in different calldata
      const commitments = [
        ethers.toBigInt('0x1111111111111111111111111111111111111111111111111111111111111111'),
        ethers.toBigInt('0x0000000000000000111111111111111111111111111111111111111111111111'),
        ethers.toBigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'),
        ethers.toBigInt('0x0000000000000000000000000000000000000000000000000000000000000001'),
      ];

      const gasUsages = [];

      for (const commitment of commitments) {
        const tx = await policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
          commitment,
          paramsCommitment,
          metadataURI,
          targetGas
        );
        const receipt = await tx.wait();
        gasUsages.push(Number(receipt.gasUsed));
      }

      console.log('Gas usages for different commitments:', gasUsages);

      // Calculate variance
      const avg = gasUsages.reduce((a, b) => a + b, 0) / gasUsages.length;
      const maxDiff = Math.max(...gasUsages) - Math.min(...gasUsages);

      console.log(`Average gas: ${avg}`);
      console.log(`Max difference: ${maxDiff}`);

      // With improved padding, max difference should be small
      expect(maxDiff).to.be.lessThan(200, 'Gas consumption should be consistent across different policies');
    });

    it('should handle edge cases gracefully', async function () {
      const commitment = ethers.toBigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      const paramsCommitment = 0;
      const metadataURI = 'ipfs://test';

      // Test with very low target (should skip padding)
      const tx1 = await policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
        commitment,
        paramsCommitment,
        metadataURI,
        50000 // Very low target
      );
      const receipt1 = await tx1.wait();
      expect(receipt1.gasUsed).to.be.greaterThan(0);

      // Test with zero target (should skip padding)
      const tx2 = await policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
        commitment,
        paramsCommitment,
        metadataURI,
        0 // Zero target
      );
      const receipt2 = await tx2.wait();
      expect(receipt2.gasUsed).to.be.greaterThan(0);

      // Test with reasonable target
      const tx3 = await policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
        commitment,
        paramsCommitment,
        metadataURI,
        500000 // Reasonable target
      );
      const receipt3 = await tx3.wait();
      expect(receipt3.gasUsed).to.be.greaterThan(0);
    });

    it('should not exceed maximum gas pad target', async function () {
      const commitment = ethers.toBigInt('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
      const paramsCommitment = 0;
      const metadataURI = 'ipfs://test';
      const excessiveTarget = 10000000; // Exceeds MAX_GAS_PAD_TARGET_GAS

      // Should revert with "Gas pad target too large"
      await expect(
        policyPrivacy['commitPolicyWithGasPad(uint256,uint256,string,uint256)'](
          commitment,
          paramsCommitment,
          metadataURI,
          excessiveTarget
        )
      ).to.be.revertedWith('Gas pad target too large');
    });
  });
});

// Deploy a simple mock verifier for testing
// This mock verifier always returns true for any proof
const MockVerifierSource = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

contract MockVerifier {
    function verifyProof(
        uint[2] calldata,
        uint[2][2] calldata,
        uint[2] calldata,
        uint[33] calldata
    ) external pure returns (bool) {
        return true;
    }
}
`;
