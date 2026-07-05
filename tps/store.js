'use strict';

/**
 * TPS in-memory store.
 *
 * Simulates the off-chain secure storage boundary described in the paper
 * (Section V-B: TPS provisioning). In production this would be an
 * encrypted, access-controlled database visible only to the TPS.
 *
 * policyMaterial: provider-provisioned policy artifacts keyed by policyId
 * resources:      resource metadata registered by providers (policyId binding)
 * sessions:       per-request session context (nonce, status, audit trail)
 * usedNonces:     set of (policyId, nonce) pairs consumed to prevent replay
 */

const policyMaterial = new Map();
const resources = new Map();
const sessions = new Map();
const usedNonces = new Set();

// ── Policy material ──────────────────────────────────────────────────────────

function provisionPolicy(policyId, material) {
    // material = { penc, randomizer, paramsCommitment,
    //              merkleRoots, credPublicKeys, rangeMin, rangeMax,
    //              ontologyPolicyIds, ontologyEpochs,
    //              numOperations }
    policyMaterial.set(String(policyId), { ...material, provisionedAt: Date.now() });
}

function getPolicyMaterial(policyId) {
    return policyMaterial.get(String(policyId)) || null;
}

function hasPolicy(policyId) {
    return policyMaterial.has(String(policyId));
}

// ── Resources ────────────────────────────────────────────────────────────────

function registerResource(resourceId, record) {
    // record = { policyId, provider, commitment, paramsCommitment, metadataURI }
    resources.set(String(resourceId), { ...record, registeredAt: Date.now() });
}

function getResource(resourceId) {
    return resources.get(String(resourceId)) || null;
}

// ── Sessions ─────────────────────────────────────────────────────────────────

function createSession(sessionId, data) {
    // data = { policyId, resourceId, requesterId, nonce, status }
    sessions.set(sessionId, { ...data, createdAt: Date.now(), status: 'pending' });
}

function getSession(sessionId) {
    return sessions.get(sessionId) || null;
}

function updateSession(sessionId, patch) {
    const session = sessions.get(sessionId);
    if (!session) throw new Error(`Session not found: ${sessionId}`);
    sessions.set(sessionId, { ...session, ...patch, updatedAt: Date.now() });
}

// ── Nonce replay prevention ──────────────────────────────────────────────────

function markNonceUsed(policyId, nonce) {
    usedNonces.add(`${policyId}:${nonce}`);
}

function isNonceUsed(policyId, nonce) {
    return usedNonces.has(`${policyId}:${nonce}`);
}

module.exports = {
    provisionPolicy,
    getPolicyMaterial,
    hasPolicy,
    registerResource,
    getResource,
    createSession,
    getSession,
    updateSession,
    markNonceUsed,
    isNonceUsed
};
