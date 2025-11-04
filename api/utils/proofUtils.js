/**
 * Proof utilities for PolicyPrivacy API
 * Handles proof validation and formatting
 */

const { ethers } = require('hardhat');

class ProofUtils {
  /**
   * Validate proof format
   * @param {Object} proof - The proof object
   * @throws {Error} If proof format is invalid
   */
  static validateProofFormat(proof) {
    if (!proof || typeof proof !== 'object') {
      throw new Error('Proof must be an object');
    }

    const { pA, pB, pC, pubSignals } = proof;

    // Validate pA
    if (!Array.isArray(pA) || pA.length !== 2) {
      throw new Error('pA must be an array of 2 elements');
    }

    // Validate pB
    if (!Array.isArray(pB) || pB.length !== 2) {
      throw new Error('pB must be an array of 2 elements');
    }
    
    if (!Array.isArray(pB[0]) || pB[0].length !== 2 ||
        !Array.isArray(pB[1]) || pB[1].length !== 2) {
      throw new Error('pB must be a 2x2 array');
    }

    // Validate pC
    if (!Array.isArray(pC) || pC.length !== 2) {
      throw new Error('pC must be an array of 2 elements');
    }

    // Validate pubSignals
    if (!Array.isArray(pubSignals) || pubSignals.length !== 33) {
      throw new Error('pubSignals must be an array of 33 elements');
    }

    // Validate that all elements are valid numbers
    try {
      pA.forEach(x => BigInt(x));
      pB.forEach(row => row.forEach(x => BigInt(x)));
      pC.forEach(x => BigInt(x));
      pubSignals.forEach(x => BigInt(x));
    } catch (e) {
      throw new Error('All proof elements must be valid numbers');
    }
  }

  /**
   * Format proof for smart contract interaction
   * @param {Object} proof - The proof object
   * @returns {Object} Formatted proof
   */
  static formatProofForContract(proof) {
    this.validateProofFormat(proof);

    return {
      pA: proof.pA.map(x => BigInt(x).toString()),
      pB: proof.pB.map(row => row.map(x => BigInt(x).toString())),
      pC: proof.pC.map(x => BigInt(x).toString()),
      pubSignals: proof.pubSignals.map(x => BigInt(x).toString())
    };
  }

  /**
   * Extract key information from public signals
   * @param {Array} pubSignals - Array of public signals
   * @returns {Object} Extracted information
   */
  static extractPublicSignals(pubSignals) {
    if (!Array.isArray(pubSignals) || pubSignals.length !== 33) {
      throw new Error('Invalid public signals format');
    }

    return {
      isAuthorized: pubSignals[0] === '1' || pubSignals[0] === 1,
      policyCommitment: BigInt(pubSignals[1]).toString(),
      paramsCommitment: BigInt(pubSignals[2]).toString(),
      merkleRoots: pubSignals.slice(3, 8).map(x => BigInt(x).toString()),
      credPublicKeys: pubSignals.slice(8, 13).map(x => BigInt(x).toString()),
      rangeMin: pubSignals.slice(13, 18).map(x => BigInt(x).toString()),
      rangeMax: pubSignals.slice(18, 23).map(x => BigInt(x).toString()),
      ontologyPolicyIds: pubSignals.slice(23, 28).map(x => BigInt(x).toString()),
      ontologyEpochs: pubSignals.slice(28, 33).map(x => BigInt(x).toString())
    };
  }

  /**
   * Verify proof structure without cryptographic verification
   * @param {Object} proof - The proof object
   * @returns {Object} Validation result
   */
  static validateProofStructure(proof) {
    const result = {
      isValid: true,
      errors: []
    };

    try {
      this.validateProofFormat(proof);
    } catch (error) {
      result.isValid = false;
      result.errors.push(error.message);
    }

    return result;
  }

  /**
   * Convert proof to hex format
   * @param {Object} proof - The proof object
   * @returns {Object} Proof in hex format
   */
  static toHexFormat(proof) {
    this.validateProofFormat(proof);

    return {
      pA: proof.pA.map(x => '0x' + BigInt(x).toString(16)),
      pB: proof.pB.map(row => row.map(x => '0x' + BigInt(x).toString(16))),
      pC: proof.pC.map(x => '0x' + BigInt(x).toString(16)),
      pubSignals: proof.pubSignals.map(x => '0x' + BigInt(x).toString(16))
    };
  }

  /**
   * Convert proof from hex format
   * @param {Object} hexProof - The proof object in hex format
   * @returns {Object} Proof in decimal format
   */
  static fromHexFormat(hexProof) {
    return {
      pA: hexProof.pA.map(x => BigInt(x).toString()),
      pB: hexProof.pB.map(row => row.map(x => BigInt(x).toString())),
      pC: hexProof.pC.map(x => BigInt(x).toString()),
      pubSignals: hexProof.pubSignals.map(x => BigInt(x).toString())
    };
  }
}

module.exports = ProofUtils;
