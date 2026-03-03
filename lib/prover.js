const snarkjs = require('snarkjs');
const circomlibjs = require('circomlibjs');

const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

let poseidonHash = null;

async function initPoseidon() {
    if (!poseidonHash) {
        poseidonHash = await circomlibjs.buildPoseidon();
    }
    return poseidonHash;
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
    const credSigR8x = input.credSigR8x || [];
    const credSigR8y = input.credSigR8y || [];
    const credSigS = input.credSigS || [];
    const credPubKeyAx = input.credPubKeyAx || [];
    const credPubKeyAy = input.credPubKeyAy || [];
    const duoTokens = input.duoTokens || [];
    const credExpiries = input.credExpiries || [];
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
        const hasCredential = hasNonZeroValue(credSigR8x[i]) || hasNonZeroValue(credSigR8y[i]) || hasNonZeroValue(credSigS[i]) || hasNonZeroValue(credPubKeyAx[i]) || hasNonZeroValue(credPubKeyAy[i]) || hasNonZeroValue(duoTokens[i]) || hasNonZeroValue(credExpiries[i]);
        const hasRange = hasNonZeroValue(rangeValues[i]) || hasNonZeroValue(rangeMin[i]) || hasNonZeroValue(rangeMax[i]);
        const hasOntology = hasNonZeroValue(ontologyCodes[i]) || hasNonZeroValue(ontologyPolicyIds[i]) || hasNonZeroValue(ontologyEpochs[i]);

        const isInactive = !(hasMerkle || hasCredential || hasRange || hasOntology);

        if (isInactive) {
            types[i] = 4;
        }
    }
}

async function calculateParamsCommitment({
    merkleRoots = [],
    credPubKeyAx = [],
    credPubKeyAy = [],
    rangeMin = [],
    rangeMax = [],
    ontologyPolicyIds = [],
    ontologyEpochs = []
} = {}) {
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
    const credPkAxHash = hashArray(credPubKeyAx);
    const credPkAyHash = hashArray(credPubKeyAy);
    const rangeMinHash = hashArray(rangeMin);
    const rangeMaxHash = hashArray(rangeMax);
    const ontologyPolicyIdHash = hashArray(ontologyPolicyIds);
    const ontologyEpochHash = hashArray(ontologyEpochs);

    const domainSeparator = normalizeFieldElement(1n, F);

    let accumulator = F.toObject(F.e(0n));
    const chainValues = [
        merkleHash,
        credPkAxHash,
        credPkAyHash,
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

async function calculatePolicyCommitment(policy, randomizer) {
    const poseidon = await initPoseidon();

    // circomlib's Poseidon supports max 16 inputs
    if (policy.length <= 16) {
        // Direct hashing for small policies
        return poseidon.F.toObject(poseidon([poseidon(policy), randomizer])).toString();
    }

    // Tree-based hashing for large policies (DEPTH > 16)
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

    const policyHash = poseidon(chunkHashes);
    // Commit to policyHash + randomizer
    const commitment = poseidon([policyHash, randomizer]);
    return poseidon.F.toObject(commitment).toString();
}


function createCircuitInput(policyCommitment, options = {}) {
    const {
        policy = [0, 1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        requesterAttrs = [1, 1, 0, 0, 0, 0],
        skReq = '0',
        randomizer = BigInt('12345'),
        predicateTypes = [4, 4, 4, 4, 4],
        merkleRoots = ['0', '0', '0', '0', '0'],
        credPubKeyAx = ['0', '0', '0', '0', '0'],
        credPubKeyAy = ['0', '0', '0', '0', '0'],
        rangeMin = ['0', '0', '0', '0', '0'],
        rangeMax = ['0', '0', '0', '0', '0'],
        ontologyPolicyIds = ['0', '0', '0', '0', '0'],
        ontologyEpochs = ['0', '0', '0', '0', '0'],
        scopeHash = '0',
        currentTimestamp = '0',
        numOperations = 3,
        paramsCommitment = '0'
    } = options;

    const POLICY_DEPTH = 20;
    const paddedPolicy = policy.length >= POLICY_DEPTH
        ? policy.slice(0, POLICY_DEPTH)
        : [...policy, ...Array(POLICY_DEPTH - policy.length).fill(0)];

    const input = {
        policy: paddedPolicy,
        requesterAttrs: requesterAttrs,
        skReq: skReq,
        predicateTypes: predicateTypes,
        merkleLeaves: ['0', '0', '0', '0', '0'],
        merklePathElements: Array.from({ length: 5 }, () => Array(8).fill('0')),
        merklePathIndices: Array.from({ length: 5 }, () => Array(8).fill(0)),
        credSigR8x: ['0', '0', '0', '0', '0'],
        credSigR8y: ['0', '0', '0', '0', '0'],
        credSigS: ['0', '0', '0', '0', '0'],
        duoTokens: ['0', '0', '0', '0', '0'],
        credExpiries: ['0', '0', '0', '0', '0'],
        rangeValues: [0, 0, 0, 0, 0],
        ontologyCodes: [0, 0, 0, 0, 0],
        randomizer: randomizer.toString(),
        policyCommitment: policyCommitment,
        paramsCommitment: paramsCommitment,
        merkleRoots: merkleRoots,
        credPubKeyAx: credPubKeyAx,
        credPubKeyAy: credPubKeyAy,
        rangeMin: rangeMin,
        rangeMax: rangeMax,
        ontologyPolicyIds: ontologyPolicyIds,
        ontologyEpochs: ontologyEpochs,
        scopeHash: scopeHash,
        currentTimestamp: currentTimestamp,
        numOperations: numOperations
    };

    normalizePredicateTypesInPlace(input);
    return input;
}


async function generateProof(input, config = {}) {
    const { wasmPath, zkeyPath } = config;

    if (!wasmPath) {
        throw new Error('wasmPath is required');
    }
    if (!zkeyPath) {
        throw new Error('zkeyPath is required');
    }

    // In Node.js, validate files exist on disk
    if (!isBrowser) {
        const fs = require('fs');
        if (!fs.existsSync(wasmPath)) {
            throw new Error(`Circuit WASM file not found at: ${wasmPath}`);
        }
        if (!fs.existsSync(zkeyPath)) {
            throw new Error(`ZKey file not found at: ${zkeyPath}`);
        }
    }

    normalizePredicateTypesInPlace(input);

    if (!input.paramsCommitment || input.paramsCommitment === '0') {
        input.paramsCommitment = await calculateParamsCommitment({
            merkleRoots: input.merkleRoots || [],
            credPubKeyAx: input.credPubKeyAx || [],
            credPubKeyAy: input.credPubKeyAy || [],
            rangeMin: input.rangeMin || [],
            rangeMax: input.rangeMax || [],
            ontologyPolicyIds: input.ontologyPolicyIds || [],
            ontologyEpochs: input.ontologyEpochs || []
        });
    }

    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        wasmPath,
        zkeyPath
    );

    const pA = [toFixedHex(proof.pi_a[0]), toFixedHex(proof.pi_a[1])];
    const pB = [
        [toFixedHex(proof.pi_b[0][1]), toFixedHex(proof.pi_b[0][0])],
        [toFixedHex(proof.pi_b[1][1]), toFixedHex(proof.pi_b[1][0])]
    ];
    const pC = [toFixedHex(proof.pi_c[0]), toFixedHex(proof.pi_c[1])];
    const pubSignals = publicSignals.map((x) => toFixedHex(x));

    return { pA, pB, pC, pubSignals };
}

module.exports = {
    initPoseidon,
    calculatePolicyCommitment,
    calculateParamsCommitment,
    createCircuitInput,
    generateProof
};
