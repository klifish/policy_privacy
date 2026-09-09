const snarkjs = require('snarkjs');
const circomlibjs = require('circomlibjs');
const path = require('path');
const fs = require('fs');

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
    predicateTypes = [],
    predicateSchemaTags = [],
    merkleRoots = [],
    credPublicKeys = [],
    rangeMin = [],
    rangeMax = [],
    ontologyPolicyIds = [],
    ontologyEpochs = [],
    scopeKinds = [],
    approvedScopeIds = [],
    policyValidFromEpoch = 0,
    policyValidUntilEpoch = 0
} = {}) {
    const poseidon = await initPoseidon();
    const F = poseidon.F;

    // The production circuit always hashes exactly M=5 slots.  Variable-length
    // arrays would produce a different commitment than five canonical slots
    // and would make the policy semantics ambiguous.
    const fixed = (values, name, fallback) => {
        if (!Array.isArray(values)) throw new Error(`${name} must be an array`);
        if (values.length > 5) throw new Error(`${name} exceeds the 5 predicate slots`);
        return [...values, ...Array(5 - values.length).fill(fallback)];
    };
    predicateTypes = fixed(predicateTypes, 'predicateTypes', 4);
    predicateSchemaTags = fixed(predicateSchemaTags, 'predicateSchemaTags', 0);
    merkleRoots = fixed(merkleRoots, 'merkleRoots', 0);
    credPublicKeys = fixed(credPublicKeys, 'credPublicKeys', 0);
    rangeMin = fixed(rangeMin, 'rangeMin', 0);
    rangeMax = fixed(rangeMax, 'rangeMax', 0);
    ontologyPolicyIds = fixed(ontologyPolicyIds, 'ontologyPolicyIds', 0);
    ontologyEpochs = fixed(ontologyEpochs, 'ontologyEpochs', 0);
    scopeKinds = fixed(scopeKinds, 'scopeKinds', 0);
    approvedScopeIds = fixed(approvedScopeIds, 'approvedScopeIds', 0);

    const hashArray = (values) => {
        let accumulator = F.toObject(F.e(0n));
        for (const item of values) {
            const normalized = normalizeFieldElement(item, F);
            accumulator = F.toObject(poseidon([accumulator, normalized]));
        }
        return accumulator;
    };

    const predicateTypeHash = hashArray(predicateTypes);
    const predicateSchemaTagHash = hashArray(predicateSchemaTags);
    const merkleHash = hashArray(merkleRoots);
    const credHash = hashArray(credPublicKeys);
    const rangeMinHash = hashArray(rangeMin);
    const rangeMaxHash = hashArray(rangeMax);
    const ontologyPolicyIdHash = hashArray(ontologyPolicyIds);
    const ontologyEpochHash = hashArray(ontologyEpochs);
    const scopeKindHash = hashArray(scopeKinds);
    const approvedScopeIdHash = hashArray(approvedScopeIds);

    // Version 4 changes type 5 from a Merkle affiliation record to a signed
    // scoped credential. Do not permit parameter commitments to cross formats.
    const domainSeparator = normalizeFieldElement(4n, F);

    let accumulator = F.toObject(F.e(0n));
    const chainValues = [
        predicateTypeHash,
        predicateSchemaTagHash,
        merkleHash,
        credHash,
        rangeMinHash,
        rangeMaxHash,
        ontologyPolicyIdHash,
        ontologyEpochHash,
        scopeKindHash,
        approvedScopeIdHash,
        normalizeFieldElement(policyValidFromEpoch, F),
        normalizeFieldElement(policyValidUntilEpoch, F),
        domainSeparator
    ];

    for (const value of chainValues) {
        accumulator = F.toObject(poseidon([accumulator, value]));
    }

    return accumulator.toString();
}

const INSTITUTIONAL_APPROVAL_V1 = 1001n;
const SCOPED_AFFILIATION_CREDENTIAL_V1 = 2002n;

async function calculateRequesterId(holderSecret) {
    if (holderSecret === undefined || holderSecret === null || holderSecret === '') {
        throw new Error('holderSecret is required');
    }
    const secret = BigInt(holderSecret);
    if (secret <= 0n) throw new Error('holderSecret must be non-zero');
    const poseidon = await initPoseidon();
    return poseidon.F.toObject(poseidon([secret])).toString();
}

async function calculateScopedCredentialDigest({
    schemaTag = SCOPED_AFFILIATION_CREDENTIAL_V1,
    scopeKind,
    requesterId,
    scopeId,
    validFromEpoch,
    validUntilEpoch,
    credentialId
}) {
    const required = { scopeKind, requesterId, scopeId, validFromEpoch, validUntilEpoch, credentialId };
    for (const [name, value] of Object.entries(required)) {
        if (value === undefined || value === null || value === '') {
            throw new Error(`Scoped credential requires ${name}`);
        }
    }
    if (![26n, 27n, 28n].includes(BigInt(scopeKind))) {
        throw new Error('scopeKind must be 26 (US), 27 (PS), or 28 (IS)');
    }
    if (BigInt(schemaTag) !== SCOPED_AFFILIATION_CREDENTIAL_V1) {
        throw new Error('Scoped credential schemaTag must be 2002');
    }
    if (BigInt(requesterId) === 0n || BigInt(scopeId) === 0n || BigInt(credentialId) === 0n) {
        throw new Error('requesterId, scopeId, and credentialId must be non-zero');
    }
    if (BigInt(validFromEpoch) > BigInt(validUntilEpoch)) {
        throw new Error('validFromEpoch must not exceed validUntilEpoch');
    }
    const poseidon = await initPoseidon();
    return poseidon.F.toObject(poseidon([
        SCOPED_AFFILIATION_CREDENTIAL_V1,
        BigInt(scopeKind), BigInt(requesterId), BigInt(scopeId),
        BigInt(validFromEpoch), BigInt(validUntilEpoch), BigInt(credentialId)
    ])).toString();
}

async function signScopedCredential(issuerPrivateKey, fields) {
    if (!(issuerPrivateKey instanceof Uint8Array) || issuerPrivateKey.length === 0) {
        throw new Error('issuerPrivateKey must be a non-empty Uint8Array');
    }
    const digest = await calculateScopedCredentialDigest(fields);
    const eddsa = await circomlibjs.buildEddsa();
    const signature = eddsa.signPoseidon(issuerPrivateKey, eddsa.babyJub.F.e(BigInt(digest)));
    const F = eddsa.babyJub.F;
    const issuer = eddsa.prv2pub(issuerPrivateKey);
    const poseidon = await initPoseidon();
    const issuerAx = F.toObject(issuer[0]).toString();
    const issuerAy = F.toObject(issuer[1]).toString();
    return {
        digest,
        S: signature.S.toString(),
        R8x: F.toObject(signature.R8[0]).toString(),
        R8y: F.toObject(signature.R8[1]).toString(),
        issuerAx,
        issuerAy,
        issuerKeyCommitment: poseidon.F.toObject(poseidon([BigInt(issuerAx), BigInt(issuerAy)])).toString()
    };
}

/**
 * Build the only credential message accepted by a signature predicate in V2.
 * Every field is a field element and stays private in the Groth16 witness.
 */
async function calculateInstitutionalApprovalDigest({
    policyCommitment,
    schemaTag = INSTITUTIONAL_APPROVAL_V1,
    requesterId,
    resourceId,
    purposeCode,
    validFromEpoch,
    validUntilEpoch,
    approvalId
}) {
    const required = {
        policyCommitment, requesterId, resourceId, purposeCode,
        validFromEpoch, validUntilEpoch, approvalId
    };
    for (const [name, value] of Object.entries(required)) {
        if (value === undefined || value === null || value === '') {
            throw new Error(`Institutional approval requires ${name}`);
        }
    }
    const poseidon = await initPoseidon();
    const digest = poseidon([
        BigInt(schemaTag),
        BigInt(policyCommitment), BigInt(requesterId), BigInt(resourceId),
        BigInt(purposeCode), BigInt(validFromEpoch), BigInt(validUntilEpoch),
        BigInt(approvalId)
    ]);
    return poseidon.F.toObject(digest).toString();
}

/**
 * Validate a program length against the padded token-array size.
 * Throws rather than defaulting, so a caller that forgets the length cannot
 * silently produce a commitment the circuit will reject.
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

/**
 * Compute the policy commitment h = Poseidon(Poseidon(P) || l || r).
 *
 * The program length l is part of the preimage. Without it, a prover holding
 * the opening of h could evaluate any stack-consistent prefix of the committed
 * token array under the same commitment (reading "A AND B" as just "A"), so
 * omitting it is a soundness bug rather than a cosmetic one.
 *
 * @param {Array<number|bigint|string>} policy Fixed-length RPN token array.
 * @param {bigint} randomizer Commitment randomness r.
 * @param {number} programLength Program length l; must satisfy 0 <= l <= policy.length.
 */
async function calculatePolicyCommitment(policy, randomizer, programLength) {
    const poseidon = await initPoseidon();
    const length = validateProgramLength(programLength, policy.length);

    // circomlib's Poseidon supports max 16 inputs
    if (policy.length <= 16) {
        // Direct hashing for small policies
        return poseidon.F.toObject(poseidon([poseidon(policy), length, randomizer])).toString();
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
    // Commit to policyHash + programLength + randomizer
    const commitment = poseidon([policyHash, length, randomizer]);
    return poseidon.F.toObject(commitment).toString();
}


/**
 * Compute the authorization-context digest ctx = Poseidon(id_req || id_res || nonce).
 *
 * The three context values stay private witness inputs; only this digest is a
 * public signal. That binds a proof to one (requester, resource, session)
 * triple — making it non-transferable — without publishing the requester
 * pseudonym on-chain, and it costs a single extra public input rather than
 * three.
 *
 * The ACM recomputes the same digest from the transaction parameters and
 * rejects a proof whose public signal does not match.
 *
 * @param {bigint|string|number} idReq Requester pseudonym.
 * @param {bigint|string|number} idRes Protected resource identifier.
 * @param {bigint|string|number} nonce Fresh per-session nonce.
 * @returns {Promise<string>} Digest as a decimal string.
 */
async function calculateContextHash(idReq, idRes, nonce) {
    const poseidon = await initPoseidon();
    const values = { idReq, idRes, nonce };
    for (const [name, value] of Object.entries(values)) {
        if (value === undefined || value === null || value === '') {
            throw new Error(
                `calculateContextHash requires ${name}: the authorization context ` +
                `is bound into the proof statement.`
            );
        }
    }
    const digest = poseidon([BigInt(idReq), BigInt(idRes), BigInt(nonce)]);
    return poseidon.F.toObject(digest).toString();
}


function createCircuitInput(policyCommitment, options = {}) {
    const {
        policy = [0, 1, 11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        requesterAttrs = [1, 1, 0, 0, 0, 0],
        randomizer = BigInt('12345'),
        predicateTypes = [4, 4, 4, 4, 4],
        predicateSchemaTags = [0, 0, 0, 0, 0],
        scopeKinds = [0, 0, 0, 0, 0],
        approvedScopeIds = [0, 0, 0, 0, 0],
        merkleRoots = ['0', '0', '0', '0', '0'],
        credPublicKeys = ['0', '0', '0', '0', '0'],
        // Typed approval credential witness. The message is calculated in the
        // circuit, so callers provide only signature/key material and fields.
        credSignatures = ['0', '0', '0', '0', '0'],
        credSigR8x = ['0', '0', '0', '0', '0'],
        credSigR8y = ['0', '0', '0', '0', '0'],
        credIssuerAx = ['0', '0', '0', '0', '0'],
        credIssuerAy = ['0', '0', '0', '0', '0'],
        rangeMin = ['0', '0', '0', '0', '0'],
        rangeMax = ['0', '0', '0', '0', '0'],
        ontologyPolicyIds = ['0', '0', '0', '0', '0'],
        ontologyEpochs = ['0', '0', '0', '0', '0'],
        policyValidFromEpoch = 0,
        policyValidUntilEpoch = 4294967295,
        purposeCode = 0,
        credValidFromEpochs = ['0', '0', '0', '0', '0'],
        credValidUntilEpochs = ['0', '0', '0', '0', '0'],
        credentialIds = ['0', '0', '0', '0', '0'],
        holderSecret = '0',
        numOperations = 3,
        paramsCommitment = '0',
        idReq = '0',
        idRes = '0',
        nonce = '0',
        contextHash = null,
        requestEpoch = 0
    } = options;

    const POLICY_DEPTH = 20;
    const paddedPolicy = policy.length >= POLICY_DEPTH
        ? policy.slice(0, POLICY_DEPTH)
        : [...policy, ...Array(POLICY_DEPTH - policy.length).fill(0)];

    const input = {
        policy: paddedPolicy,
        requesterAttrs: requesterAttrs,
        predicateTypes: predicateTypes,
        predicateSchemaTags: predicateSchemaTags,
        scopeKinds: scopeKinds,
        approvedScopeIds: approvedScopeIds,
        merkleLeaves: ['0', '0', '0', '0', '0'],
        merklePathElements: Array.from({ length: 5 }, () => Array(8).fill('0')),
        merklePathIndices: Array.from({ length: 5 }, () => Array(8).fill(0)),
        credSignatures: credSignatures,
        credSigR8x: credSigR8x,
        credSigR8y: credSigR8y,
        credIssuerAx: credIssuerAx,
        credIssuerAy: credIssuerAy,
        rangeValues: [0, 0, 0, 0, 0],
        ontologyCodes: [0, 0, 0, 0, 0],
        purposeCode: purposeCode.toString(),
        credValidFromEpochs: credValidFromEpochs,
        credValidUntilEpochs: credValidUntilEpochs,
        credentialIds: credentialIds,
        holderSecret: holderSecret.toString(),
        randomizer: randomizer.toString(),
        policyCommitment: policyCommitment,
        paramsCommitment: paramsCommitment,
        merkleRoots: merkleRoots,
        credPublicKeys: credPublicKeys,
        rangeMin: rangeMin,
        rangeMax: rangeMax,
        ontologyPolicyIds: ontologyPolicyIds,
        ontologyEpochs: ontologyEpochs,
        policyValidFromEpoch: policyValidFromEpoch.toString(),
        policyValidUntilEpoch: policyValidUntilEpoch.toString(),
        numOperations: numOperations,
        idReq: idReq.toString(),
        idRes: idRes.toString(),
        nonce: nonce.toString(),
        // Filled in by the caller (or by generateProof) when not supplied; the
        // circuit enforces contextHash === Poseidon(idReq, idRes, nonce).
        contextHash: contextHash,
        requestEpoch: requestEpoch.toString()
    };

    normalizePredicateTypesInPlace(input);
    return input;
}


// Cached verification key, loaded once on first verify-timed proof.
let cachedVerificationKey = null;
let cachedVerificationKeyPath = null;

function loadVerificationKey(vkeyPath) {
    if (cachedVerificationKey && cachedVerificationKeyPath === vkeyPath) {
        return cachedVerificationKey;
    }
    if (!vkeyPath || !fs.existsSync(vkeyPath)) {
        return null;
    }
    cachedVerificationKey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
    cachedVerificationKeyPath = vkeyPath;
    return cachedVerificationKey;
}

/**
 * Generate a Groth16 proof and record server-side, network-free timings.
 *
 * Witness calculation and proving are split (snarkjs.wtns.calculate +
 * groth16.prove) so the two costs can be reported separately. Verification is
 * timed by default (cheap, local) and doubles as a proof-validity self-check;
 * set PROOF_VERIFY_TIMING=0 to skip it. If the split path throws (e.g. a
 * snarkjs API change), we fall back to the combined groth16.fullProve so proof
 * generation never breaks — timings are a side-metric, the proof is not.
 *
 * @returns {Promise<{pA, pB, pC, pubSignals, timings}>} where timings =
 *   { witnessMs, proveMs, verifyMs, verified }. witnessMs is null when the
 *   fallback path was used; verifyMs/verified are null when verification is
 *   disabled or the vkey is unavailable.
 */
async function generateProof(input, config = {}) {
    const { wasmPath, zkeyPath, vkeyPath } = config;

    if (!wasmPath || !fs.existsSync(wasmPath)) {
        throw new Error(`Circuit WASM file not found at: ${wasmPath}`);
    }

    if (!zkeyPath || !fs.existsSync(zkeyPath)) {
        throw new Error(`ZKey file not found at: ${zkeyPath}`);
    }

    normalizePredicateTypesInPlace(input);

    if (!input.paramsCommitment || input.paramsCommitment === '0') {
        input.paramsCommitment = await calculateParamsCommitment({
            predicateTypes: input.predicateTypes || [],
            predicateSchemaTags: input.predicateSchemaTags || [],
            merkleRoots: input.merkleRoots || [],
            credPublicKeys: input.credPublicKeys || [],
            rangeMin: input.rangeMin || [],
            rangeMax: input.rangeMax || [],
            ontologyPolicyIds: input.ontologyPolicyIds || [],
            ontologyEpochs: input.ontologyEpochs || [],
            scopeKinds: input.scopeKinds || [],
            approvedScopeIds: input.approvedScopeIds || [],
            policyValidFromEpoch: input.policyValidFromEpoch || 0,
            policyValidUntilEpoch: input.policyValidUntilEpoch || 0
        });
    }

    // Derive the context digest when the caller supplied the raw triple but not
    // the digest. The circuit constrains it as a hard equality, so a wrong or
    // missing value fails witness generation rather than yielding isAuthorized=0.
    if (input.contextHash === undefined || input.contextHash === null) {
        input.contextHash = await calculateContextHash(
            input.idReq ?? '0',
            input.idRes ?? '0',
            input.nonce ?? '0'
        );
    }

    let proof;
    let publicSignals;
    let witnessMs = null;
    let proveMs = null;
    try {
        // Split path: time witness generation and proving separately.
        const witness = { type: 'mem' };
        const witnessStart = Date.now();
        await snarkjs.wtns.calculate(input, wasmPath, witness);
        witnessMs = Date.now() - witnessStart;

        const proveStart = Date.now();
        ({ proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, witness));
        proveMs = Date.now() - proveStart;
    } catch (splitError) {
        // Fallback: combined call. witnessMs stays null; proveMs covers both.
        console.warn(`[prover] split witness/prove failed (${splitError.message}); falling back to fullProve`);
        witnessMs = null;
        const fullStart = Date.now();
        ({ proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath));
        proveMs = Date.now() - fullStart;
    }

    // Optional verify timing (default on; doubles as a validity self-check).
    let verifyMs = null;
    let verified = null;
    if (process.env.PROOF_VERIFY_TIMING !== '0') {
        const vKey = loadVerificationKey(
            vkeyPath || zkeyPath.replace(/_final\.zkey$/, '_vk.json')
        );
        if (vKey) {
            const verifyStart = Date.now();
            verified = await snarkjs.groth16.verify(vKey, publicSignals, proof);
            verifyMs = Date.now() - verifyStart;
        }
    }

    const pA = [toFixedHex(proof.pi_a[0]), toFixedHex(proof.pi_a[1])];
    const pB = [
        [toFixedHex(proof.pi_b[0][1]), toFixedHex(proof.pi_b[0][0])],
        [toFixedHex(proof.pi_b[1][1]), toFixedHex(proof.pi_b[1][0])]
    ];
    const pC = [toFixedHex(proof.pi_c[0]), toFixedHex(proof.pi_c[1])];
    const pubSignals = publicSignals.map((x) => toFixedHex(x));

    return { pA, pB, pC, pubSignals, timings: { witnessMs, proveMs, verifyMs, verified } };
}

module.exports = {
    initPoseidon,
    calculatePolicyCommitment,
    calculateParamsCommitment,
    calculateInstitutionalApprovalDigest,
    INSTITUTIONAL_APPROVAL_V1,
    SCOPED_AFFILIATION_CREDENTIAL_V1,
    calculateRequesterId,
    calculateScopedCredentialDigest,
    signScopedCredential,
    calculateContextHash,
    createCircuitInput,
    generateProof,
    normalizePredicateTypesInPlace
};
