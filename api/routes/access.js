'use strict';

/**
 * Access routes for TPS-ZKPI (Stage 6).
 *
 * Stage 6: Requester retrieves protected resource using the recorded
 *          authorization outcome. Authorization records are publicly auditable.
 *
 * GET /api/access/status/:requestId    – on-chain authorization status
 * GET /api/access/audit/:policyId      – audit log (on-chain events)
 */

const express = require('express');

const router = express.Router();

/**
 * GET /api/access/status/:requestId
 *
 * Returns the on-chain authorization status for a given request.
 */
router.get('/status/:requestId', async (req, res, next) => {
    try {
        const { requestId } = req.params;

        const isGranted = await req.contract.isAccessGranted(BigInt(requestId));

        // accessRequests mapping is public – read full record
        const record = await req.contract.accessRequests(BigInt(requestId));

        return res.json({
            requestId,
            isGranted,
            // The transaction submitter is the TPS; the requester is identified
            // by the pseudonym bound into the proof statement.
            submitter: record.submitter,
            requesterId: record.requesterId.toString(),
            resourceId: record.resourceId.toString(),
            contextHash: record.contextHash.toString(),
            scopeRegistryRoot: record.scopeRegistryRoot.toString(),
            policyId: record.policyId.toString(),
            timestamp: new Date(Number(record.timestamp) * 1000).toISOString(),
            isProcessed: record.isProcessed
        });
    } catch (err) {
        next(err);
    }
});

/**
 * GET /api/access/audit/:policyId
 *
 * Returns the on-chain audit log for a policy: all AccessGranted and
 * AccessDenied events. Supports ?fromBlock and ?toBlock query params.
 *
 * This implements the accountable traceability requirement (Section IV-E):
 * "Authorization outcomes should be recorded so that access events can be
 * audited, including which requester was granted access to which protected
 * resource under which committed policy decision."
 */
router.get('/audit/:policyId', async (req, res, next) => {
    try {
        const { policyId } = req.params;
        const fromBlock = req.query.fromBlock ? parseInt(req.query.fromBlock, 10) : 0;
        const toBlock = req.query.toBlock || 'latest';

        const grantedFilter = req.contract.filters.AccessGranted(null, BigInt(policyId));
        const deniedFilter = req.contract.filters.AccessDenied(null, BigInt(policyId));

        const [grantedEvents, deniedEvents] = await Promise.all([
            req.contract.queryFilter(grantedFilter, fromBlock, toBlock),
            req.contract.queryFilter(deniedFilter, fromBlock, toBlock)
        ]);

        const formatEvent = (ev, outcome) => ({
            outcome,
            requester: ev.args.requester,
            policyId: ev.args.policyId.toString(),
            requestId: ev.args.requestId.toString(),
            blockNumber: ev.blockNumber,
            transactionHash: ev.transactionHash
        });

        const auditLog = [
            ...grantedEvents.map(e => formatEvent(e, 'granted')),
            ...deniedEvents.map(e => formatEvent(e, 'denied'))
        ].sort((a, b) => a.blockNumber - b.blockNumber);

        return res.json({
            policyId,
            total: auditLog.length,
            granted: grantedEvents.length,
            denied: deniedEvents.length,
            events: auditLog
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
