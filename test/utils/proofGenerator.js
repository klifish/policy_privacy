const snarkjs = require('snarkjs');
const path = require('path');
const fs = require('fs');

// Initialize poseidon hash function
let poseidonHash = null;

async function initPoseidon() {
  if (!poseidonHash) {
    const circomlibjs = require('circomlibjs');
    poseidonHash = await circomlibjs.buildPoseidon();
  }
  return poseidonHash;
}

/**
 * Generate real Groth16 proof using snarkjs
 * @param {object} input - Circuit input
 * @returns {Promise<object>} - Proof components {pA, pB, pC, pubSignals}
 */
async function generateGroth16Proof(input) {
  const circuitWasmPath = path.join(__dirname, '../../build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm');
  const zkeyPath = path.join(__dirname, '../../build/circuits/policy_privacy_main_final.zkey');
  
  // Check if required files exist
  if (!fs.existsSync(circuitWasmPath)) {
    throw new Error(`Circuit WASM file not found: ${circuitWasmPath}`);
  }
  
  if (!fs.existsSync(zkeyPath)) {
    throw new Error(`ZKey file not found: ${zkeyPath}`);
  }
  
  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    circuitWasmPath,
    zkeyPath
  );
  
  // Format proof for Solidity
  const pA = [proof.pi_a[0], proof.pi_a[1]];
  const pB = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]];
  const pC = [proof.pi_c[0], proof.pi_c[1]];
  const pubSignals = publicSignals.map(x => x.toString());
  
  return { pA, pB, pC, pubSignals };
}

/**
 * Calculate policy commitment using Poseidon hash (compatible with circuit)
 * @param {Array} policy - Array of policy tokens (RPN format)
 * @param {BigInt} randomizer - Random value for commitment
 * @returns {string} - Policy commitment as string
 */
async function calculatePolicyCommitment(policy, randomizer) {
  const poseidon = await initPoseidon();
  // Hash the policy first
  const policyHash = poseidon(policy);
  // Then create commitment: Com(P;r) = Poseidon(Poseidon(P), r)
  const commitment = poseidon([policyHash, randomizer]);
  return poseidon.F.toObject(commitment).toString();
}

/**
 * Create valid circuit input for testing
 * @param {string} policyCommitment - Policy commitment value
 * @param {object} options - Additional options
 * @returns {object} - Circuit input
 */
function createCircuitInput(policyCommitment, options = {}) {
  const {
    // Default policy: attr0 AND attr1
    // RPN encoding: [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]
    // Translation: attr0 attr1 AND
    // where: 0=attr0, 1=attr1, 5=AND(N+M+0) = AND(3+2+0) = 5
    policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0],
    requesterAttrs = [1, 1, 0], // attr0=1, attr1=1, attr2=0 => should pass
    randomizer = BigInt('12345'),
    predicateTypes = [0, 0], // All predicates disabled for simple test
    merkleRoots = [0, 0],
    credPublicKeys = [0, 0],
    rangeMin = [0, 0],
    rangeMax = [100, 100],
    ontologyPolicyIds = [0, 0],
    ontologyEpochs = [0, 0],
    numOperations = 3
  } = options;
  
  return {
    // Private inputs
    policy: policy,
    requesterAttrs: requesterAttrs,
    predicateTypes: predicateTypes,
    merkleLeaves: ['0', '0'],
    merklePathElements: [['0', '0', '0', '0', '0', '0', '0', '0'], ['0', '0', '0', '0', '0', '0', '0', '0']],
    merklePathIndices: [[0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]],
    credMessages: ['0', '0'],
    credSignatures: ['0', '0'],
    rangeValues: [0, 0],
    ontologyCodes: [0, 0],
    randomizer: randomizer.toString(),
    
    // Public inputs
    policyCommitment: policyCommitment,
    merkleRoots: merkleRoots.map(x => x.toString()),
    credPublicKeys: credPublicKeys.map(x => x.toString()),
    rangeMin: rangeMin,
    rangeMax: rangeMax,
    ontologyPolicyIds: ontologyPolicyIds,
    ontologyEpochs: ontologyEpochs,
    numOperations: numOperations
  };
}

module.exports = {
  generateGroth16Proof,
  calculatePolicyCommitment,
  createCircuitInput
};