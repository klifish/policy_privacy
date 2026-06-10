'use strict';

/**
 * Requester routes for TPS-ZKPI (Stages 3, 4, 5).
 *
 * Stage 3: Requester fetches resource metadata (policyId, commitment, pp).
 * Stage 4+5: Requester submits evidence to TPS; TPS generates proof and calls
 *   requestAccessBound() with its own chain account (submitOnChain=true),
 *   so the requester's address is never recorded on-chain.
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
 * POST /api/requester/request-access
 *
 * Stages 3-4-5 in one call.
 *
 * Body:
 *   requesterAddress : string   – Ethereum address of the requester
 *   resourceId       : string   – The protected resource ID
 *   evidence         : object   – Authorization evidence submitted to TPS:
 *     attributes       : number[]  – Boolean attribute vector (e.g. [1,0,0,0,0,0,0])
 *     predicateTypes   : number[]  – (optional) predicate type selectors
 *     merkleLeaves, merklePathElements, ... : (optional) predicate witnesses
 *   useGasPad        : boolean  – (optional, default true)
 *
 * Returns:
 *   { requestId, status, sessionId, transactionHash, gasUsed }
 */
router.post('/request-access', async (req, res, next) => {
    try {
        const {
            requesterAddress,
            resourceId,
            evidence,
            useGasPad = true
        } = req.body;

        if (!requesterAddress || !ethers.isAddress(requesterAddress)) {
            return res.status(400).json({ error: 'Valid requesterAddress is required' });
        }
        if (!resourceId) {
            return res.status(400).json({ error: 'resourceId is required' });
        }
        if (!evidence || !Array.isArray(evidence.attributes)) {
            return res.status(400).json({ error: 'evidence.attributes (array) is required' });
        }

        // ── Stage 3: fetch resource metadata from chain ─────────────────────
        let policyId, commitment, paramsCommitment;
        try {
            [policyId, , ] = await req.contract.getResource(BigInt(resourceId));
            [, commitment, paramsCommitment, ] = await req.contract.getPolicy(policyId);
        } catch (err) {
            return res.status(404).json({ error: `Resource or policy not found: ${err.message}` });
        }

        policyId = policyId.toString();
        const policyCommitment = commitment.toString();

        // ── Stage 4+5: TPS generates proof and submits on-chain ─────────────
        // submitOnChain=true: TPS calls requestAccessBound() with its own chain
        // account, so the requester's address never appears in on-chain events.
        const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();

        const tpsResult = await prove({
            policyId,
            resourceId: resourceId.toString(),
            nonce,
            policyCommitment,
            evidence: {
                ...evidence,
                requesterId: requesterAddress
            },
            submitOnChain: true
        });

        const { sessionId, chainResult } = tpsResult;

        return res.json({
            requestId: chainResult.requestId,
            status: chainResult.isGranted ? 'granted' : 'denied',
            sessionId,
            transactionHash: chainResult.transactionHash,
            gasUsed: chainResult.gasUsed
        });
    } catch (err) {
        if (err.message && err.message.includes('revert')) err.type = 'blockchain';
        next(err);
    }
});

module.exports = router;
