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
 *    Body: { policyId, resourceId, nonce, policyCommitment,
 *            evidence: { attributes, requesterId, ... } }
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
const {
    getAlreadyKnownTransactionHash,
    retryRpc,
    waitForTransactionReceipt,
    waitForTx
} = require('../lib/rpc-retry');

const router = express.Router();

// Access-path gas padding (defense-in-depth on top of the commitment-only
// public interface). When a positive base target is configured, the TPS submits
// via requestAccessBoundWithGasPad() so observable access gas is normalized to a
// randomized target independent of policy content. 0 (default) = no padding,
// i.e. plain requestAccessBound(), preserving backward compatibility.
// Base resolves from app.locals.accessGasPadTarget (runtime/injectable) first,
// then the TPS_ACCESS_GAS_PAD_TARGET env var.
const ACCESS_GAS_PAD_VARIANCE = 0.1; // ±10%

function resolveAccessGasPadBase(app) {
    const fromLocals = app && app.locals && app.locals.accessGasPadTarget;
    const raw = fromLocals != null ? fromLocals : process.env.TPS_ACCESS_GAS_PAD_TARGET;
    const n = parseInt(raw || '0', 10) || 0;
    return BigInt(n);
}

function randomizedAccessGasTarget(base) {
    if (base <= 0n) return 0n;
    const b = Number(base);
    const r = crypto.randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF; // [0,1]
    const factor = 1 + (r - 0.5) * 2 * ACCESS_GAS_PAD_VARIANCE;
    return BigInt(Math.floor(b * factor));
}

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
// Stage 5 (optional): if submitOnChain=true and a chain signer is configured,
//   TPS calls requestAccessBound() directly, hiding the requester's address.
router.post('/prove', async (req, res) => {
    try {
        const {
            policyId,
            resourceId,
            nonce,
            policyCommitment,
            evidence,
            submitOnChain = false
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
        // The requester pseudonym is bound into the proof statement, so it is
        // required rather than optional audit metadata.
        if (evidence.requesterId === undefined || evidence.requesterId === null
            || evidence.requesterId === '') {
            return res.status(400).json({
                error: 'evidence.requesterId is required (bound into the proof statement)'
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
            requesterId: evidence.requesterId,
            status: 'proving'
        });

        // Construct witness w = (penc, a, p, r, ω) and generate proof.
        // timings = { witnessMs, proveMs, verifyMs, verified } — server-side,
        // network-free proof costs, surfaced to the client below.
        const { pA, pB, pC, pubSignals, timings: proofTimings } = await generateProof(
            material,
            evidence,
            {
                policyCommitment,
                // Authorization context bound into the statement (Section V-E).
                idReq: evidence.requesterId,
                idRes: resourceId,
                nonce
            }
        );

        // Mark nonce consumed and session completed
        store.markNonceUsed(policyId, nonce);
        store.updateSession(sessionId, { status: 'proved' });

        // ── Stage 5 (optional): TPS submits proof on-chain ───────────────────
        // When submitOnChain=true, TPS calls requestAccessBound() with its own
        // chain account, so the requester's address never appears on-chain.
        let chainResult = null;
        if (submitOnChain) {
            const tpsContract = req.app.locals.tpsContract;
            if (!tpsContract) {
                return res.status(500).json({
                    error: 'TPS chain signer not configured – set TPS_PRIVATE_KEY and CONTRACT_ADDRESS'
                });
            }

            // Optional fee cap (gwei): on Polygon Amoy the RPC-suggested tip is
            // ~2x the enforced 25 gwei minimum; pinning the price halves cost.
            const overrides = {};
            const gasPriceGwei = parseInt(process.env.TPS_GAS_PRICE_GWEI || '', 10);
            if (Number.isFinite(gasPriceGwei) && gasPriceGwei > 0) {
                const price = BigInt(gasPriceGwei) * 1_000_000_000n;
                overrides.maxFeePerGas = price;
                overrides.maxPriorityFeePerGas = price;
            }

            const accessGasPadTarget = randomizedAccessGasTarget(resolveAccessGasPadBase(req.app));
            if (accessGasPadTarget > 0n) {
                console.log(`[TPS] access gas pad target = ${accessGasPadTarget}`);
            }
            // The padding loop burns gas up to the target, so the tx must be sent
            // with an explicit gasLimit above the target — otherwise ethers'
            // auto-estimated gasLimit caps the loop below the target and padding
            // silently under-shoots. CRITICAL: the gasLimit must ALSO clear the
            // real access work cost (~667k on Amoy), independent of the (possibly
            // lower) random target — otherwise a low target makes gasLimit too
            // small and the base requestAccessBound work runs out of gas and
            // reverts. So floor the gasLimit at a real-work ceiling. Headroom
            // (+80k) covers post-loop fixed costs.
            const ACCESS_WORK_GAS_CEILING = 700000n;
            const padGasLimit =
                (accessGasPadTarget > ACCESS_WORK_GAS_CEILING
                    ? accessGasPadTarget
                    : ACCESS_WORK_GAS_CEILING) + 80000n;
            const padOverrides = accessGasPadTarget > 0n
                ? { ...overrides, gasLimit: padGasLimit }
                : overrides;
            let txHash;
            let receipt;
            try {
                const tx = await retryRpc(
                    `TPS requestAccessBound send for policyId=${policyId}`,
                    () => accessGasPadTarget > 0n
                        ? tpsContract.requestAccessBoundWithGasPad(
                            BigInt(policyId),
                            BigInt(resourceId),
                            BigInt(nonce),
                            BigInt(evidence.requesterId),
                            pA, pB, pC, pubSignals,
                            accessGasPadTarget,
                            padOverrides
                        )
                        : tpsContract.requestAccessBound(
                            BigInt(policyId),
                            BigInt(resourceId),
                            BigInt(nonce),
                            BigInt(evidence.requesterId),
                            pA, pB, pC, pubSignals,
                            overrides
                        ),
                    { initialDelayMs: 5000, maxAttempts: 8 }
                );
                txHash = tx.hash;
                receipt = await waitForTx(tx, 1, { label: `TPS requestAccessBound tx ${tx.hash}` });
            } catch (error) {
                const knownTxHash = getAlreadyKnownTransactionHash(error);
                if (!knownTxHash) {
                    throw error;
                }

                txHash = knownTxHash;
                console.warn(`[TPS] requestAccessBound tx already known by RPC; waiting for ${txHash}`);
                receipt = await waitForTransactionReceipt(tpsContract.runner.provider, txHash, {
                    label: `TPS already-known requestAccessBound receipt ${txHash}`
                });
            }

            // Parse requestId and authorization outcome from events
            let requestId = null;
            let isGranted = false;
            for (const log of receipt.logs) {
                try {
                    const parsed = tpsContract.interface.parseLog(log);
                    if (parsed.name === 'AccessRequested') requestId = parsed.args.requestId.toString();
                    if (parsed.name === 'AccessGranted') isGranted = true;
                    if (parsed.name === 'AccessDenied') isGranted = false;
                } catch (_) { /* skip unparseable logs */ }
            }

            store.updateSession(sessionId, { status: isGranted ? 'granted' : 'denied', requestId });

            chainResult = {
                transactionHash: txHash,
                requestId,
                isGranted,
                gasUsed: receipt.gasUsed.toString()
            };
        }

        return res.json({ pA, pB, pC, pubSignals, sessionId, chainResult, proofTimings });
    } catch (err) {
        console.error('[TPS prove] error:', err.message);
        return res.status(500).json({ error: err.message });
    }
});

// ── GET /tps/health ───────────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({
    status: 'ok',
    submitOnChain: Boolean(req.app.locals.tpsContract),
    contractAddress: req.app.locals.contractAddress || null,
    tpsSignerAddress: req.app.locals.tpsSignerAddress || null,
    nodeUrl: req.app.locals.nodeUrl || null
}));

module.exports = router;
