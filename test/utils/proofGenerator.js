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

  normalizePredicateTypesInPlace(input);

  if (!input.paramsCommitment || input.paramsCommitment === '0') {
    input.paramsCommitment = await calculateParamsCommitment({
      merkleRoots: input.merkleRoots || [],
      credPublicKeys: input.credPublicKeys || [],
      rangeMin: input.rangeMin || [],
      rangeMax: input.rangeMax || [],
      ontologyPolicyIds: input.ontologyPolicyIds || [],
      ontologyEpochs: input.ontologyEpochs || []
    });
  }

  // Generate proof
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    circuitWasmPath,
    zkeyPath
  );

  // Format proof for Solidity with fixed-length encoding
  const pA = [toFixedHex(proof.pi_a[0]), toFixedHex(proof.pi_a[1])];
  const pB = [
    [toFixedHex(proof.pi_b[0][1]), toFixedHex(proof.pi_b[0][0])],
    [toFixedHex(proof.pi_b[1][1]), toFixedHex(proof.pi_b[1][0])]
  ];
  const pC = [toFixedHex(proof.pi_c[0]), toFixedHex(proof.pi_c[1])];
  const pubSignals = publicSignals.map((x) => toFixedHex(x));

  return { pA, pB, pC, pubSignals };
}

/**
 * Calculate policy commitment using Poseidon hash (compatible with circuit)
 * Supports policies up to any length using tree-based hashing for DEPTH > 16
 * @param {Array} policy - Array of policy tokens (RPN format)
 * @param {BigInt} randomizer - Random value for commitment
 * @returns {string} - Policy commitment as string
 */
/**
 * Compute the policy commitment h = Poseidon(Poseidon(P) || l || r).
 *
 * The program length l is part of the preimage so that the committed token
 * array cannot be re-interpreted at a shorter stack-consistent prefix.
 * Mirrors PolicyCommitmentVerifier in circuits/gadgets/policy_commitment.circom.
 */
function validateProgramLength(programLength, depth) {
  if (programLength === undefined || programLength === null) {
    throw new Error(
      'calculatePolicyCommitment requires a programLength (numOperations): ' +
      'the program length is bound into the commitment preimage.'
    );
  }
  const length = Number(programLength);
  if (!Number.isInteger(length) || length < 0 || length > depth) {
    throw new Error(
      `Invalid programLength ${programLength}: expected an integer in [0, ${depth}].`
    );
  }
  return length;
}

async function calculatePolicyCommitment(policy, randomizer, programLength) {
  const poseidon = await initPoseidon();

  const length = validateProgramLength(programLength, policy.length);

  let policyHash;

  // circomlib's Poseidon supports max 16 inputs
  if (policy.length <= 16) {
    // Direct hashing for small policies
    policyHash = poseidon(policy);
  } else {
    // Tree-based hashing for large policies (DEPTH > 16)
    // This matches the circuit's tree-based hashing in policy_commitment.circom
    const chunkSize = 16;
    const numChunks = Math.ceil(policy.length / chunkSize);
    const chunkHashes = [];

    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, policy.length);
      const chunk = policy.slice(start, end);
      const chunkHash = poseidon(chunk);
      chunkHashes.push(chunkHash);
    }

    // Hash all chunk hashes together
    policyHash = poseidon(chunkHashes);
  }

  // Then create commitment: Com(P, l; r) = Poseidon(Poseidon(P), l, r)
  const commitment = poseidon([policyHash, length, randomizer]);
  return poseidon.F.toObject(commitment).toString();
}

function normalizeFieldElement(value, F) {
  if (typeof value === 'bigint') {
    return F.toObject(F.e(value));
  }
  if (typeof value === 'number') {
    return F.toObject(F.e(BigInt(value)));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      return F.toObject(F.e(BigInt(trimmed)));
    }
    if (trimmed.length === 0) {
      return 0n;
    }
    return F.toObject(F.e(BigInt(trimmed)));
  }
  throw new Error(`Unsupported field element type: ${typeof value}`);
}

function toFixedHex(value, pad = 64) {
  let bn;
  if (typeof value === 'bigint') {
    bn = value;
  } else if (typeof value === 'number') {
    bn = BigInt(value);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    bn = trimmed.startsWith('0x') || trimmed.startsWith('0X') ? BigInt(trimmed) : BigInt(trimmed);
  } else {
    throw new Error(`Unsupported value type for toFixedHex: ${typeof value}`);
  }

  if (bn < 0n) {
    throw new Error('Negative values are not supported for field encoding');
  }

  return `0x${bn.toString(16).padStart(pad, '0')}`;
}

function hasNonZeroValue(value) {
  if (Array.isArray(value)) {
    return value.some(hasNonZeroValue);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return !(trimmed === '0' || trimmed === '0x0' || trimmed === '');
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'bigint') {
    return value !== 0n;
  }
  if (value === null || value === undefined) {
    return false;
  }
  return Boolean(value);
}

function normalizePredicateTypesInPlace(input) {
  if (!input || !Array.isArray(input.predicateTypes)) {
    return;
  }

  const types = input.predicateTypes;
  const merkleRoots = input.merkleRoots || [];
  const merkleLeaves = input.merkleLeaves || [];
  const merklePathElements = input.merklePathElements || [];
  const merklePathIndices = input.merklePathIndices || [];
  const credMessages = input.credMessages || [];
  const credSignatures = input.credSignatures || [];
  const credPublicKeys = input.credPublicKeys || [];
  const rangeValues = input.rangeValues || [];
  const rangeMin = input.rangeMin || [];
  const rangeMax = input.rangeMax || [];
  const ontologyCodes = input.ontologyCodes || [];
  const ontologyPolicyIds = input.ontologyPolicyIds || [];
  const ontologyEpochs = input.ontologyEpochs || [];

  for (let i = 0; i < types.length; i += 1) {
    const currentType = types[i];
    if (currentType !== 0 && currentType !== undefined && currentType !== null) {
      continue;
    }

    const hasMerkle = hasNonZeroValue(merkleRoots[i]) || hasNonZeroValue(merkleLeaves[i]) || hasNonZeroValue(merklePathElements[i]) || hasNonZeroValue(merklePathIndices[i]);
    const hasCredential = hasNonZeroValue(credMessages[i]) || hasNonZeroValue(credSignatures[i]) || hasNonZeroValue(credPublicKeys[i]);
    const hasRange = hasNonZeroValue(rangeValues[i]) || hasNonZeroValue(rangeMin[i]) || hasNonZeroValue(rangeMax[i]);
    const hasOntology = hasNonZeroValue(ontologyCodes[i]) || hasNonZeroValue(ontologyPolicyIds[i]) || hasNonZeroValue(ontologyEpochs[i]);

    const isInactive = !(hasMerkle || hasCredential || hasRange || hasOntology);

    if (isInactive) {
      types[i] = 4;
    }
  }
}

async function calculateParamsCommitment({
  merkleRoots,
  credPublicKeys,
  rangeMin,
  rangeMax,
  ontologyPolicyIds,
  ontologyEpochs
}) {
  const poseidon = await initPoseidon();
  const F = poseidon.F;

  const hashArray = (values) => {
    let accumulator = F.toObject(F.e(0n));
    for (const item of values) {
      const normalized = normalizeFieldElement(item, F);
      accumulator = F.toObject(poseidon([accumulator, normalized]));
    }
    return accumulator;
  };

  const merkleHash = hashArray(merkleRoots);
  const credHash = hashArray(credPublicKeys);
  const rangeMinHash = hashArray(rangeMin);
  const rangeMaxHash = hashArray(rangeMax);
  const ontologyPolicyIdHash = hashArray(ontologyPolicyIds);
  const ontologyEpochHash = hashArray(ontologyEpochs);

  const domainSeparator = normalizeFieldElement(1n, F);

  let accumulator = F.toObject(F.e(0n));
  const chainValues = [
    merkleHash,
    credHash,
    rangeMinHash,
    rangeMaxHash,
    ontologyPolicyIdHash,
    ontologyEpochHash,
    domainSeparator
  ];

  for (const value of chainValues) {
    accumulator = F.toObject(poseidon([accumulator, value]));
  }

  return accumulator.toString();
}

/**
 * Create valid circuit input for testing
 * @param {string} policyCommitment - Policy commitment value
 * @param {object} options - Additional options
 * @returns {object} - Circuit input
 */
// Poseidon(0, 0, 0) — the context digest for the all-zero triple. Tests that
// do not exercise context binding leave idReq/idRes/nonce at 0, and the circuit
// enforces the digest as a hard equality, so the default must be the real hash
// rather than a placeholder.
const DEFAULT_CONTEXT_HASH =
  '5317387130258456662214331362918410991734007599705406860481038345552731150762';

/**
 * ctx = Poseidon(id_req || id_res || nonce), the authorization-context digest
 * bound into the proof statement. Mirrors lib/prover.calculateContextHash.
 */
async function calculateContextHash(idReq, idRes, nonce) {
  const poseidon = await initPoseidon();
  const digest = poseidon([BigInt(idReq), BigInt(idRes), BigInt(nonce)]);
  return poseidon.F.toObject(digest).toString();
}

function createCircuitInput(policyCommitment, options = {}) {
  const {
    // Default policy: attr0 AND attr1
    // RPN encoding: [0, 1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    // Translation: attr0 attr1 AND
    // where: 0=attr0, 1=attr1, 11=AND(N+M+0) = AND(6+5+0) = 11
    // Padded to DEPTH=20 to match circuit parameter
    policy = [0, 1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    requesterAttrs = [1, 1, 0, 0, 0, 0], // attr0=1, attr1=1, others 0 => should pass
    randomizer = BigInt('12345'),
    predicateTypes = [4, 4, 4, 4, 4], // All predicates disabled by default
    merkleRoots = ['0', '0', '0', '0', '0'], // Ensure M=5 array elements as strings
    credPublicKeys = ['0', '0', '0', '0', '0'], // Ensure M=5 array elements as strings
    rangeMin = ['0', '0', '0', '0', '0'],
    rangeMax = ['0', '0', '0', '0', '0'],
    ontologyPolicyIds = ['0', '0', '0', '0', '0'],
    ontologyEpochs = ['0', '0', '0', '0', '0'],
    numOperations = 3,
    paramsCommitment = '0',
    // Authorization context. Private witness values; the circuit enforces
    // contextHash === Poseidon(idReq, idRes, nonce) as a hard equality, so a
    // caller must pass a digest consistent with the triple.
    idReq = '0',
    idRes = '0',
    nonce = '0',
    contextHash = null
  } = options;

  // Circuit is compiled with DEPTH=20, so policy array must be exactly 20 elements
  // Pad the policy array to 20 elements if needed
  const POLICY_DEPTH = 20;
  const paddedPolicy = policy.length >= POLICY_DEPTH
    ? policy.slice(0, POLICY_DEPTH)
    : [...policy, ...Array(POLICY_DEPTH - policy.length).fill(0)];

  const input = {
    // Private inputs
    policy: paddedPolicy,
    requesterAttrs: requesterAttrs,
    predicateTypes: predicateTypes,
    merkleLeaves: ['0', '0', '0', '0', '0'],
    merklePathElements: Array.from({ length: 5 }, () => Array(8).fill('0')),
    merklePathIndices: Array.from({ length: 5 }, () => Array(8).fill(0)),
    credMessages: ['0', '0', '0', '0', '0'],
    credSignatures: ['0', '0', '0', '0', '0'],
    rangeValues: [0, 0, 0, 0, 0],
    ontologyCodes: [0, 0, 0, 0, 0],
    randomizer: randomizer.toString(),

    // Public inputs
    policyCommitment: policyCommitment,
    paramsCommitment: paramsCommitment,
    merkleRoots: merkleRoots,
    credPublicKeys: credPublicKeys,
    rangeMin: rangeMin,
    rangeMax: rangeMax,
    ontologyPolicyIds: ontologyPolicyIds,
    ontologyEpochs: ontologyEpochs,
    numOperations: numOperations,
    idReq: idReq.toString(),
    idRes: idRes.toString(),
    nonce: nonce.toString(),
    contextHash: contextHash === null ? DEFAULT_CONTEXT_HASH : contextHash
  };

  normalizePredicateTypesInPlace(input);
  return input;
}

module.exports = {
  generateGroth16Proof,
  calculatePolicyCommitment,
  calculateParamsCommitment,
  calculateContextHash,
  createCircuitInput
};
