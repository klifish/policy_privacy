'use strict';

/**
 * TPS HTTP service (Section V-B, V-D).
 *
 * Exposes two endpoints on port TPS_PORT (default 3001):
 *
 *  POST /tps/provision
 *    Provider pushes policy-bound proving material to the TPS (Stage 2).
 *    Body: { policyId, material: { penc, randomizer, paramsCommitment, ... } }
 *
 *  POST /tps/prove
 *    Requester submits authorization evidence; TPS constructs witness and
 *    generates a Groth16 proof (Stage 4).
 *    Body: { policyId, resourceId, nonce, policyCommitment, evidence: { ... } }
 *    Returns: { pA, pB, pC, pubSignals, sessionId }
 *
 * Security note: in a real deployment these endpoints would be mutually-TLS
 * authenticated – the provision endpoint is provider-only, the prove endpoint
 * is requester-facing. Here we rely on the caller to set the correct role.
 */

const express = require('express');
const crypto = require('crypto');
const store = require('./store');
const { generateProof } = require('./proofGenerator');

const router = express.Router();

// ── POST /tps/provision ───────────────────────────────────────────────────────
// Stage 2: Provider provisions policy-bound proving material.
router.post('/provision', async (req, res) => {
    try {
        const { policyId, material } = req.body;

        if (!policyId) {
            return res.status(400).json({ error: 'policyId is required' });
        }
        if (!material || !material.penc || !material.randomizer) {
            return res.status(400).json({
                error: 'material must include penc and randomizer'
            });
        }

        store.provisionPolicy(policyId, material);

        return res.json({
            ok: true,
            policyId,
            provisionedAt: Date.now()
        });
    } catch (err) {
        console.error('[TPS provision] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── POST /tps/prove ───────────────────────────────────────────────────────────
// Stage 4: Requester submits evidence → TPS builds witness → generates proof.
router.post('/prove', async (req, res) => {
    try {
        const {
            policyId,
            resourceId,
            nonce,
            policyCommitment,
            evidence
        } = req.body;

        if (!policyId || !resourceId || !nonce || !policyCommitment) {
            return res.status(400).json({
                error: 'policyId, resourceId, nonce, and policyCommitment are required'
            });
        }
        if (!evidence || !evidence.attributes) {
            return res.status(400).json({
                error: 'evidence.attributes is required'
            });
        }

        // Replay prevention: each (policyId, nonce) may only be used once
        if (store.isNonceUsed(policyId, nonce)) {
            return res.status(409).json({ error: 'Nonce already used (replay rejected)' });
        }

        const material = store.getPolicyMaterial(policyId);
        if (!material) {
            return res.status(404).json({
                error: `Policy material not provisioned for policyId=${policyId}`
            });
        }

        // Create session record for audit trail
        const sessionId = crypto.randomUUID();
        store.createSession(sessionId, {
            policyId,
            resourceId,
            nonce,
            requesterId: evidence.requesterId || null,
            status: 'proving'
        });

        // Construct witness w = (penc, a, p, r, ω) and generate proof
        const { pA, pB, pC, pubSignals } = await generateProof(
            material,
            evidence,
            { policyCommitment }
        );

        // Mark nonce consumed and session completed
        store.markNonceUsed(policyId, nonce);
        store.updateSession(sessionId, { status: 'proved' });

        return res.json({ pA, pB, pC, pubSignals, sessionId });
    } catch (err) {
        console.error('[TPS prove] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /tps/health ───────────────────────────────────────────────────────────
router.get('/health', (_req, res) => res.json({ status: 'ok' }));

module.exports = router;
