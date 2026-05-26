'use strict';

/**
 * Requester routes for TPS-ZKPI (Stages 3, 4, 5).
 *
 * Stage 3: Requester fetches resource metadata (policyId, commitment, pp).
 * Stage 4: Requester submits authorization evidence to TPS → TPS generates proof.
 * Stage 5: API submits proof to on-chain ACM → authorization recorded.
 *
 * POST /api/requester/request-access
 * GET  /api/requester/resource/:resourceId  (Stage 3 resource metadata)
 */

const express = require('express');
const { ethers } = require('hardhat');
const crypto = require('crypto');
const { prove } = require('../../lib/tps-client');
const { gasPadTarget, normaliseProof } = require('../utils/transcriptNormalization');

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

        // ── Stage 4: submit evidence to TPS → proof ─────────────────────────
        // Fresh nonce per session (prevents proof reuse)
        const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();

        const tpsResult = await prove({
            policyId,
            resourceId: resourceId.toString(),
            nonce,
            policyCommitment,
            evidence: {
                ...evidence,
                requesterId: requesterAddress
            }
        });

        const { pA, pB, pC, pubSignals, sessionId } = tpsResult;

        // Normalise proof components to fixed-width hex (transcript normalisation)
        const normProof = normaliseProof({ pA, pB, pC, pubSignals });

        // ── Stage 5: submit proof to on-chain ACM ────────────────────────────
        const signer = new ethers.Wallet(
            process.env.REQUESTER_PRIVATE_KEY || process.env.PRIVATE_KEY ||
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            req.provider
        );
        const contractWithSigner = req.contract.connect(signer);

        let tx, receipt;
        if (useGasPad) {
            tx = await contractWithSigner.requestAccessWithGasPad(
                BigInt(policyId),
                normProof.pA,
                normProof.pB,
                normProof.pC,
                normProof.pubSignals,
                gasPadTarget()
            );
        } else {
            tx = await contractWithSigner.requestAccessBound(
                BigInt(policyId),
                BigInt(resourceId),
                BigInt(nonce),
                normProof.pA,
                normProof.pB,
                normProof.pC,
                normProof.pubSignals
            );
        }
        receipt = await tx.wait();

        // Extract requestId and authorization outcome from events
        let requestId, isGranted;
        for (const log of receipt.logs) {
            try {
                const parsed = req.contract.interface.parseLog(log);
                if (parsed.name === 'AccessRequested') {
                    requestId = parsed.args.requestId.toString();
                }
                if (parsed.name === 'AccessGranted') isGranted = true;
                if (parsed.name === 'AccessDenied') isGranted = false;
            } catch (_) { /* skip */ }
        }

        return res.json({
            requestId,
            status: isGranted ? 'granted' : 'denied',
            sessionId,
            transactionHash: tx.hash,
            gasUsed: receipt.gasUsed.toString()
        });
    } catch (err) {
        if (err.message && err.message.includes('revert')) err.type = 'blockchain';
        next(err);
    }
});

module.exports = router;
