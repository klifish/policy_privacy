'use strict';

/**
 * Requester metadata routes for TPS-ZKPI.
 *
 * Stage 3: Requester fetches resource metadata (policyId, commitment, pp).
 * Authorization and controlled release are handled by /api/gateway, whose
 * wallet challenge binds a server-owned requester pseudonym.
 *
 * POST /api/requester/request-access (retired: use /api/gateway/request-access)
 * GET  /api/requester/resource/:resourceId  (Stage 3 resource metadata)
 */

const express = require('express');

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
 * This pre-gateway route is intentionally retired in V2. It accepted a
 * browser-controlled requesterAddress and therefore could not represent a
 * server-authenticated wallet-to-requesterId binding.
 */
router.post('/request-access', (_req, res) => {
    return res.status(410).json({
        error: 'Requester submission route retired',
        message: 'Authenticate with /api/gateway/challenge and use /api/gateway/request-access'
    });
});

module.exports = router;
