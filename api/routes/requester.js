'use strict';

/**
 * Requester routes for TPS-ZKPI.
 *
 * Stage 3: Requester fetches resource metadata (policyId, commitment, pp).
 * Stage 4/5: requester submits private evidence to the trusted proving
 * service, which returns or submits the authorization decision proof.
 *
 * POST /api/requester/request-access
 * GET  /api/requester/resource/:resourceId  (Stage 3 resource metadata)
 */

const express = require('express');
const crypto = require('crypto');
const { prove } = require('../../lib/tps-client');

const router = express.Router();

/**
 * GET /api/requester/resource/:resourceId
 *
 * Stage 3: retrieve public metadata that the requester needs before submitting
 * authorization evidence to the TPS.
 *
 * Returns: { resourceId, policyId, commitment, paramsCommitment, isActive }
 */
router.get('/resource/:resourceId', async (req, res, next) => {
    try {
        const { resourceId } = req.params;

        const [policyId, , isActive] = await req.contract.getResource(BigInt(resourceId));

        if (!isActive) {
            return res.status(404).json({ error: 'Resource not active' });
        }

        const [, commitment, paramsCommitment, policyActive] =
            await req.contract.getPolicy(policyId);

        if (!policyActive) {
            return res.status(404).json({ error: 'Policy not active' });
        }

        return res.json({
            resourceId,
            policyId: policyId.toString(),
            commitment: commitment.toString(),
            paramsCommitment: paramsCommitment.toString(),
            isActive: true
        });
    } catch (err) {
        next(err);
    }
});

/**
 * Submit a request to the TPS. `holderSecret` is required private evidence for
 * every policy: the TPS derives requesterId from it and ignores any
 * caller-supplied requesterId. This endpoint performs authorization only; it
 * never delivers protected data.
 */
router.post('/request-access', async (req, res, next) => {
    try {
        // The authorization context is a Poseidon field tuple, so the nonce
        // must be a decimal field element rather than a UUID string.
        const generatedNonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`).toString();
        const { resourceId, evidence, nonce = generatedNonce, submitOnChain = true } = req.body;
        if (resourceId === undefined || resourceId === null || resourceId === '') {
            return res.status(400).json({ error: 'resourceId is required' });
        }
        if (!evidence || typeof evidence !== 'object') {
            return res.status(400).json({ error: 'evidence is required' });
        }

        const [policyId, , resourceActive] = await req.contract.getResource(BigInt(resourceId));
        if (!resourceActive) return res.status(404).json({ error: 'Resource not active' });
        const [, policyCommitment, , policyActive] = await req.contract.getPolicy(policyId);
        if (!policyActive) return res.status(404).json({ error: 'Policy not active' });

        const proofResult = await prove({
            policyId: policyId.toString(),
            resourceId: String(resourceId),
            nonce: String(nonce),
            policyCommitment: policyCommitment.toString(),
            evidence,
            submitOnChain: Boolean(submitOnChain)
        });
        return res.status(201).json(proofResult);
    } catch (err) {
        if (err.status) return res.status(err.status).json(err.body || { error: err.message });
        next(err);
    }
});

module.exports = router;
