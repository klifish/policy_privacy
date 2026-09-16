const snarkjs = require('snarkjs');
const circomlibjs = require('circomlibjs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

// ── Native prover backend (rapidsnark) ─────────────────────────────────────
//
// snarkjs proves in WASM on the Node main thread; rapidsnark is the same
// Groth16 prover in C++ and is roughly an order of magnitude faster on the
// same zkey (4.6 s -> 0.46 s on the DUO V3 circuit, Apple M1). The two are
// interchangeable: rapidsnark consumes the snarkjs .zkey and .wtns formats
// and emits the same proof.json / public.json layout, so every consumer of
// generateProof (verify, calldata, on-chain submission) is unaffected.
//
// PROVER_BACKEND selects the backend: 'rapidsnark', 'snarkjs', or 'auto'
// (default), which uses rapidsnark when a binary is found and snarkjs
// otherwise. RAPIDSNARK_PROVER overrides the binary location; without it the
// in-repo build under build/rapidsnark/package*/bin/prover is used.
const NATIVE_PROVER_CANDIDATES = [
    'build/rapidsnark/package_macos_arm64/bin/prover',
    'build/rapidsnark/package_macos_x86_64/bin/prover',
    'build/rapidsnark/package_host/bin/prover',   // Linux (TARGET_PLATFORM=host)
    'build/rapidsnark/package/bin/prover'
];

let cachedNativeProver;   // undefined = not resolved yet; null = none available

function resolveNativeProver() {
    if (cachedNativeProver !== undefined) {
        return cachedNativeProver;
    }
    const explicit = process.env.RAPIDSNARK_PROVER;
    const candidates = explicit
        ? [explicit]
        : NATIVE_PROVER_CANDIDATES.map((p) => path.resolve(__dirname, '..', p));
    cachedNativeProver = null;
    for (const candidate of candidates) {
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            cachedNativeProver = candidate;
            break;
        } catch (_) {
            // not present / not executable — try the next one
        }
    }
    return cachedNativeProver;
}

function selectBackend() {
    const requested = (process.env.PROVER_BACKEND || 'auto').toLowerCase();
    if (requested === 'snarkjs') {
        return { backend: 'snarkjs', nativeProver: null };
    }
    const nativeProver = resolveNativeProver();
    if (nativeProver) {
        return { backend: 'rapidsnark', nativeProver };
    }
    const where = process.env.RAPIDSNARK_PROVER
        ? `RAPIDSNARK_PROVER=${process.env.RAPIDSNARK_PROVER} is not an executable`
        : 'no rapidsnark prover binary found under build/rapidsnark';
    if (requested === 'rapidsnark') {
        throw new Error(`PROVER_BACKEND=rapidsnark but ${where} ` +
            '(build it with `npm run build:rapidsnark` or set RAPIDSNARK_PROVER)');
    }
    if (process.env.RAPIDSNARK_PROVER && !selectBackend.warned) {
        selectBackend.warned = true;
        console.warn(`[prover] ${where}; falling back to snarkjs`);
    }
    return { backend: 'snarkjs', nativeProver: null };
}

/**
 * Prove with the rapidsnark CLI. The witness must already be on disk in
 * .wtns format; proof and public signals come back parsed from the JSON
 * files the binary writes. Temporary outputs are removed on every path.
 */
async function proveNative(nativeProver, zkeyPath, wtnsPath) {
    const tag = crypto.randomBytes(6).toString('hex');
    const proofPath = path.join(os.tmpdir(), `pp_proof_${tag}.json`);
    const publicPath = path.join(os.tmpdir(), `pp_public_${tag}.json`);
    try {
        await execFileAsync(nativeProver, [zkeyPath, wtnsPath, proofPath, publicPath], {
            maxBuffer: 16 * 1024 * 1024
        });
        const proof = JSON.parse(fs.readFileSync(proofPath, 'utf8'));
        const publicSignals = JSON.parse(fs.readFileSync(publicPath, 'utf8'));
        return { proof, publicSignals };
    } finally {
        for (const p of [proofPath, publicPath]) {
            try { fs.unlinkSync(p); } catch (_) { /* already gone */ }
        }
    }
}

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
    policyValidUntilEpoch = 0,
    moratoriumUntilEpoch = 0,
    timeLimitEpochs = 0
} = {}) {
    const poseidon = await initPoseidon();
    const F = poseidon.F;

    // DUO V3 always hashes exactly M=11 fixed semantic slots.  Variable-length
    // arrays would produce a different commitment than five canonical slots
    // and would make the policy semantics ambiguous.
    const fixed = (values, name, fallback) => {
        if (!Array.isArray(values)) throw new Error(`${name} must be an array`);
        if (values.length > 11) throw new Error(`${name} exceeds the 11 predicate slots`);
        return [...values, ...Array(11 - values.length).fill(fallback)];
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

    // Version 6 is the fixed-slot complete non-procedural DUO layout.
    const domainSeparator = normalizeFieldElement(6n, F);

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
        normalizeFieldElement(moratoriumUntilEpoch, F),
        normalizeFieldElement(timeLimitEpochs, F),
        domainSeparator
    ];

    for (const value of chainValues) {
        accumulator = F.toObject(poseidon([accumulator, value]));
    }

    return accumulator.toString();
}

const INSTITUTIONAL_APPROVAL_V1 = 1001n;
const SCOPED_AFFILIATION_CREDENTIAL_V1 = 2002n;
const DUO_PROFILE_CREDENTIAL_V1 = 2006n;

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

async function calculateDuoProfileCredentialDigest({
    policyCommitment, requesterId, resourceId, profileClaims,
    validFromEpoch, validUntilEpoch, credentialId,
    schemaTag = DUO_PROFILE_CREDENTIAL_V1
}) {
    const required = { policyCommitment, requesterId, resourceId, profileClaims, validFromEpoch, validUntilEpoch, credentialId };
    for (const [name, value] of Object.entries(required)) {
        if (value === undefined || value === null || value === '') throw new Error(`DUO profile credential requires ${name}`);
    }
    if (BigInt(schemaTag) !== DUO_PROFILE_CREDENTIAL_V1) throw new Error('DUO profile credential schemaTag must be 2006');
    const claims = BigInt(profileClaims);
    if (claims < 0n || claims > 127n) throw new Error('DUO profile claims must be a 7-bit integer');
    if (BigInt(requesterId) === 0n || BigInt(resourceId) === 0n || BigInt(credentialId) === 0n) throw new Error('requesterId, resourceId and credentialId must be non-zero');
    if (BigInt(validFromEpoch) > BigInt(validUntilEpoch)) throw new Error('validFromEpoch must not exceed validUntilEpoch');
    const poseidon = await initPoseidon();
    const values = [DUO_PROFILE_CREDENTIAL_V1, BigInt(policyCommitment), BigInt(requesterId), BigInt(resourceId)];
    for (let bit = 0n; bit < 7n; bit += 1n) values.push((claims >> bit) & 1n);
    values.push(BigInt(validFromEpoch), BigInt(validUntilEpoch), BigInt(credentialId));
    return poseidon.F.toObject(poseidon(values)).toString();
}

async function signDuoProfileCredential(issuerPrivateKey, fields) {
    if (!(issuerPrivateKey instanceof Uint8Array) || issuerPrivateKey.length === 0) throw new Error('issuerPrivateKey must be a non-empty Uint8Array');
    const digest = await calculateDuoProfileCredentialDigest(fields);
    const eddsa = await circomlibjs.buildEddsa();
    const signature = eddsa.signPoseidon(issuerPrivateKey, eddsa.babyJub.F.e(BigInt(digest)));
    const F = eddsa.babyJub.F;
    const issuer = eddsa.prv2pub(issuerPrivateKey);
    const poseidon = await initPoseidon();
    const issuerAx = F.toObject(issuer[0]).toString();
    const issuerAy = F.toObject(issuer[1]).toString();
    return { digest, S: signature.S.toString(), R8x: F.toObject(signature.R8[0]).toString(), R8y: F.toObject(signature.R8[1]).toString(), issuerAx, issuerAy, issuerKeyCommitment: poseidon.F.toObject(poseidon([BigInt(issuerAx), BigInt(issuerAy)])).toString() };
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
 * The three context values are private circuit inputs; only this digest is a
 * Groth16 public signal. The bound ACM call still supplies the preimage values
 * as public transaction calldata so the contract can recompute the digest.
 * This binds a proof to one (requester, resource, session) triple and costs one
 * public proof input rather than three.
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
        policy = Array(64).fill(0),
        requesterAttrs = Array(13).fill(0),
        randomizer = BigInt('12345'),
        predicateTypes = Array(11).fill(4),
        predicateSchemaTags = Array(11).fill(0),
        scopeKinds = Array(11).fill(0),
        approvedScopeIds = Array(11).fill(0),
        merkleRoots = Array(11).fill('0'),
        credPublicKeys = Array(11).fill('0'),
        // Typed approval credential witness. The message is calculated in the
        // circuit, so callers provide only signature/key material and fields.
        credSignatures = Array(11).fill('0'), credSigR8x = Array(11).fill('0'), credSigR8y = Array(11).fill('0'),
        credIssuerAx = Array(11).fill('0'), credIssuerAy = Array(11).fill('0'),
        rangeMin = Array(11).fill('0'), rangeMax = Array(11).fill('0'),
        ontologyPolicyIds = Array(11).fill('0'), ontologyEpochs = Array(11).fill('0'),
        policyValidFromEpoch = 0,
        policyValidUntilEpoch = 4294967295,
        moratoriumUntilEpoch = 0,
        timeLimitEpochs = 0,
        purposeCode = 0,
        duoProfileClaims = 0,
        credValidFromEpochs = Array(11).fill('0'), credValidUntilEpochs = Array(11).fill('0'), credentialIds = Array(11).fill('0'),
        holderSecret = '0',
        numOperations = 3,
        paramsCommitment = '0',
        idReq = '0',
        idRes = '0',
        nonce = '0',
        contextHash = null,
        requestEpoch = 0
    } = options;

    const POLICY_DEPTH = 64;
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
        merkleLeaves: Array(11).fill('0'),
        merklePathElements: Array.from({ length: 11 }, () => Array(8).fill('0')),
        merklePathIndices: Array.from({ length: 11 }, () => Array(8).fill(0)),
        credSignatures: credSignatures,
        credSigR8x: credSigR8x,
        credSigR8y: credSigR8y,
        credIssuerAx: credIssuerAx,
        credIssuerAy: credIssuerAy,
        rangeValues: Array(11).fill(0),
        ontologyCodes: Array(11).fill(0),
        purposeCode: purposeCode.toString(),
        duoProfileClaims: duoProfileClaims.toString(),
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
        moratoriumUntilEpoch: moratoriumUntilEpoch.toString(),
        timeLimitEpochs: timeLimitEpochs.toString(),
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
 * groth16.prove) so the two costs can be reported separately. Proving runs
 * on rapidsnark when a binary is available (see selectBackend) and on snarkjs
 * otherwise; a rapidsnark failure falls back to snarkjs on the same witness.
 * Verification is timed by default (cheap, local) and doubles as a
 * proof-validity self-check; set PROOF_VERIFY_TIMING=0 to skip it. If the
 * split path throws (e.g. a snarkjs API change), we fall back to the combined
 * groth16.fullProve so proof generation never breaks — timings are a
 * side-metric, the proof is not.
 *
 * @returns {Promise<{pA, pB, pC, pubSignals, timings}>} where timings =
 *   { witnessMs, proveMs, verifyMs, verified, backend }. backend is
 *   'rapidsnark' or 'snarkjs' (whichever produced the proof). witnessMs is
 *   null when the fallback path was used; verifyMs/verified are null when
 *   verification is disabled or the vkey is unavailable.
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
            policyValidUntilEpoch: input.policyValidUntilEpoch || 0,
            moratoriumUntilEpoch: input.moratoriumUntilEpoch || 0,
            timeLimitEpochs: input.timeLimitEpochs || 0
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
    let { backend, nativeProver } = selectBackend();
    // rapidsnark reads the witness from a file; snarkjs can take it in memory.
    const wtnsPath = nativeProver
        ? path.join(os.tmpdir(), `pp_wtns_${crypto.randomBytes(6).toString('hex')}.wtns`)
        : null;
    try {
        // Split path: time witness generation and proving separately.
        const witness = wtnsPath || { type: 'mem' };
        const witnessStart = Date.now();
        await snarkjs.wtns.calculate(input, wasmPath, witness);
        witnessMs = Date.now() - witnessStart;

        const proveStart = Date.now();
        if (nativeProver) {
            try {
                ({ proof, publicSignals } = await proveNative(nativeProver, zkeyPath, wtnsPath));
            } catch (nativeError) {
                // A native failure (crash, bad exit, unreadable output) must not
                // take proof generation down: reuse the same witness file with
                // snarkjs. Only PROVER_BACKEND=rapidsnark treats this as fatal.
                if ((process.env.PROVER_BACKEND || 'auto').toLowerCase() === 'rapidsnark') {
                    nativeError.proverFatal = true;   // outer catch must not swallow this
                    throw nativeError;
                }
                console.warn(`[prover] rapidsnark failed (${nativeError.message}); falling back to snarkjs`);
                backend = 'snarkjs';
                ({ proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, wtnsPath));
            }
        } else {
            ({ proof, publicSignals } = await snarkjs.groth16.prove(zkeyPath, witness));
        }
        proveMs = Date.now() - proveStart;
    } catch (splitError) {
        if (splitError.proverFatal) {
            throw splitError;
        }
        // Fallback: combined call. witnessMs stays null; proveMs covers both.
        console.warn(`[prover] split witness/prove failed (${splitError.message}); falling back to fullProve`);
        backend = 'snarkjs';
        witnessMs = null;
        const fullStart = Date.now();
        ({ proof, publicSignals } = await snarkjs.groth16.fullProve(input, wasmPath, zkeyPath));
        proveMs = Date.now() - fullStart;
    } finally {
        if (wtnsPath) {
            try { fs.unlinkSync(wtnsPath); } catch (_) { /* never written or already gone */ }
        }
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

    return { pA, pB, pC, pubSignals, timings: { witnessMs, proveMs, verifyMs, verified, backend } };
}

module.exports = {
    initPoseidon,
    calculatePolicyCommitment,
    calculateParamsCommitment,
    calculateInstitutionalApprovalDigest,
    INSTITUTIONAL_APPROVAL_V1,
    SCOPED_AFFILIATION_CREDENTIAL_V1,
    DUO_PROFILE_CREDENTIAL_V1,
    calculateRequesterId,
    calculateScopedCredentialDigest,
    signScopedCredential,
    calculateDuoProfileCredentialDigest,
    signDuoProfileCredential,
    calculateContextHash,
    createCircuitInput,
    generateProof,
    normalizePredicateTypesInPlace
};
