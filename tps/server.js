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
const { calculateRequesterId } = require('../lib/prover');
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
const MAX_UINT32 = 4_294_967_295n;
const MOR_SCHEMA_TAG = 2003;
const TS_SCHEMA_TAG = 2004;
const USER_ALLOWLIST_SCHEMA_TAG = 2005;
const DUO_PROFILE_SCHEMA_TAG = 2006;
const DUO_PROFILE_SLOT = 10;
const V3_PREDICATE_SLOTS = 11;
const V3_ALLOWLIST_SCOPE_BY_SLOT = [null, null, null, null, null, 26n, 27n, 28n, null, null, null];

function resolveAccessGasPadBase(app) {
    const fromLocals = app && app.locals && app.locals.accessGasPadTarget;
    const raw = fromLocals != null ? fromLocals : process.env.TPS_ACCESS_GAS_PAD_TARGET;
    const n = parseInt(raw || '0', 10) || 0;
    return BigInt(n);
}

// A failed access submission that can be explained by the ACM's strict hour
// bucket: the revert reason where the RPC surfaces it (automine chains), or a
// mined-but-reverted receipt (public chains, where the tx carries an explicit
// gasLimit and is not simulated before sending).
function isStaleEpochFailure(error) {
    const text = [
        error && error.message,
        error && error.shortMessage,
        error && error.reason,
        error && error.error && error.error.message
    ].filter(Boolean).join(' ');
    if (/Stale request epoch/i.test(text)) {
        return true;
    }
    const receipt = error && error.receipt;
    return error && error.code === 'CALL_EXCEPTION' && !!receipt && Number(receipt.status) === 0;
}

// Hour of the block that mined a failed access submission: from the receipt
// (public chains) or from the tx hash an automine node reports with the revert.
async function failedSubmissionEpoch(provider, error) {
    let blockNumber = error && error.receipt ? error.receipt.blockNumber : null;
    if (blockNumber === null || blockNumber === undefined) {
        const text = [error && error.message, JSON.stringify(error && error.error ? error.error : null)].join(' ');
        const match = /"txHash":\s*"(0x[0-9a-fA-F]{64})"/.exec(text);
        if (!match) return null;
        const receipt = await provider.getTransactionReceipt(match[1]).catch(() => null);
        if (!receipt) return null;
        blockNumber = receipt.blockNumber;
    }
    const block = await provider.send('eth_getBlockByNumber', ['0x' + BigInt(blockNumber).toString(16), false]);
    return block ? Math.floor(Number(BigInt(block.timestamp)) / 3600) : null;
}

async function pendingEpoch(provider) {
    const block = await provider.send('eth_getBlockByNumber', ['pending', false]).catch(() => null);
    return block && block.timestamp ? Math.floor(Number(BigInt(block.timestamp)) / 3600) : null;
}

function randomizedAccessGasTarget(base) {
    if (base <= 0n) return 0n;
    const b = Number(base);
    const r = crypto.randomBytes(4).readUInt32BE(0) / 0xFFFFFFFF; // [0,1]
    const factor = 1 + (r - 0.5) * 2 * ACCESS_GAS_PAD_VARIANCE;
    return BigInt(Math.floor(b * factor));
}

function validateObligationMaterial(material) {
    const morSlots = [];
    const tsSlots = [];
    for (let slot = 0; slot < material.predicateTypes.length; slot += 1) {
        const type = Number(material.predicateTypes[slot]);
        if (type === 6) morSlots.push(slot);
        if (type === 7) tsSlots.push(slot);
    }
    if (morSlots.length > 1 || tsSlots.length > 1) {
        throw new Error('material may contain at most one MOR and one TS predicate');
    }

    const deadline = BigInt(material.moratoriumUntilEpoch);
    const duration = BigInt(material.timeLimitEpochs);
    if (deadline < 0n || deadline > MAX_UINT32 || duration < 0n || duration > MAX_UINT32) {
        throw new Error('material MOR/TS policy parameters must be uint32 integers');
    }
    if ((morSlots.length === 1 && deadline === 0n) || (morSlots.length === 0 && deadline !== 0n)) {
        throw new Error('material MOR deadline must be non-zero exactly when a MOR slot is present');
    }
    if ((tsSlots.length === 1 && duration === 0n) || (tsSlots.length === 0 && duration !== 0n)) {
        throw new Error('material TS duration must be non-zero exactly when a TS slot is present');
    }
    for (const slot of [...morSlots, ...tsSlots]) {
        const expectedSchema = material.predicateTypes[slot] == 6 ? MOR_SCHEMA_TAG : TS_SCHEMA_TAG;
        if (Number(material.predicateSchemaTags[slot]) !== expectedSchema) {
            throw new Error(`material obligation schema is invalid at slot ${slot}`);
        }
        if (BigInt(material.scopeKinds[slot]) !== 0n || BigInt(material.approvedScopeIds[slot]) !== 0n) {
            throw new Error(`material obligation scope fields must be zero at slot ${slot}`);
        }
    }
}

function validateUserAllowlistMaterial(material) {
    const userSlots = [];
    for (let slot = 0; slot < material.predicateTypes.length; slot += 1) {
        if (Number(material.predicateTypes[slot]) === 8) userSlots.push(slot);
    }
    for (const slot of userSlots) {
        if (Number(material.predicateSchemaTags[slot]) !== USER_ALLOWLIST_SCHEMA_TAG) {
            throw new Error(`material requester allowlist schema is invalid at slot ${slot}`);
        }
        if (BigInt(material.merkleRoots[slot]) === 0n) {
            throw new Error(`material requester allowlist root must be non-zero at slot ${slot}`);
        }
        const scopeKind = BigInt(material.scopeKinds[slot]);
        const scopeId = BigInt(material.approvedScopeIds[slot]);
        const expectedV3ScopeKind = material.predicateTypes.length === V3_PREDICATE_SLOTS
            ? V3_ALLOWLIST_SCOPE_BY_SLOT[slot]
            : null;
        if (![26n, 27n, 28n].includes(scopeKind) ||
            (material.predicateTypes.length === V3_PREDICATE_SLOTS && scopeKind !== expectedV3ScopeKind) ||
            (scopeKind === 26n && scopeId !== 0n) ||
            (scopeKind !== 26n && scopeId <= 0n) ||
            BigInt(material.credPublicKeys[slot]) !== 0n) {
            throw new Error(`material requester allowlist metadata is invalid at slot ${slot}`);
        }
    }
}

function validateUserAllowlistEvidence(material, evidence) {
    const userSlots = material.predicateTypes
        .map((type, slot) => (Number(type) === 8 ? slot : -1))
        .filter((slot) => slot >= 0);
    for (const slot of userSlots) {
        const elements = evidence.merklePathElements?.[slot];
        const indices = evidence.merklePathIndices?.[slot];
        if (!Array.isArray(elements) || elements.length !== 8 ||
            !Array.isArray(indices) || indices.length !== 8) {
            throw new Error(`evidence requires an 8-level Merkle path for requester allowlist slot ${slot}`);
        }
        if (indices.some((index) => Number(index) !== 0 && Number(index) !== 1)) {
            throw new Error(`evidence requester allowlist path indices must be bits at slot ${slot}`);
        }
    }
}

function validateDuoProfileMaterial(material) {
    const type = Number(material.predicateTypes[DUO_PROFILE_SLOT]);
    if (type !== 4 && type !== 9) throw new Error('DUO_PROFILE is reserved for predicate slot 10');
    if (type === 9 && (Number(material.predicateSchemaTags[DUO_PROFILE_SLOT]) !== DUO_PROFILE_SCHEMA_TAG || BigInt(material.credPublicKeys[DUO_PROFILE_SLOT]) === 0n)) {
        throw new Error('DUO_PROFILE requires schema tag 2006 and a non-zero issuer key commitment');
    }
}

function validateFixedSlotTypes(material) {
    const expected = [3, 3, 3, 3, 3, 8, 8, 8, 6, 7, 9];
    for (let slot = 0; slot < expected.length; slot += 1) {
        const type = Number(material.predicateTypes[slot]);
        if (type !== 4 && type !== expected[slot]) {
            throw new Error(`predicate type ${type} is invalid for fixed DUO V3 slot ${slot}`);
        }
    }
}

// ── POST /tps/provision ───────────────────────────────────────────────────────
// Stage 2: Provider provisions policy-bound proving material.
router.post('/provision', async (req, res) => {
    try {
        const { policyId, material } = req.body;

        if (!policyId) {
            return res.status(400).json({ error: 'policyId is required' });
        }
        if (!material || !material.penc || !material.randomizer || !material.paramsCommitment) {
            return res.status(400).json({
                error: 'material must include penc, randomizer, and paramsCommitment'
            });
        }
        for (const name of ['predicateTypes', 'predicateSchemaTags', 'scopeKinds', 'approvedScopeIds', 'merkleRoots', 'credPublicKeys', 'rangeMin', 'rangeMax', 'ontologyPolicyIds', 'ontologyEpochs']) {
            if (!Array.isArray(material[name]) || material[name].length !== V3_PREDICATE_SLOTS) {
                return res.status(400).json({ error: `material.${name} must contain exactly ${V3_PREDICATE_SLOTS} entries` });
            }
        }
        if (material.policyValidFromEpoch === undefined || material.policyValidUntilEpoch === undefined) {
            return res.status(400).json({ error: 'material policy validity epochs are required' });
        }
        if (material.moratoriumUntilEpoch === undefined || material.timeLimitEpochs === undefined) {
            return res.status(400).json({ error: 'material MOR/TS policy parameters are required' });
        }
        try {
            validateObligationMaterial(material);
            validateUserAllowlistMaterial(material);
            validateDuoProfileMaterial(material);
            validateFixedSlotTypes(material);
        } catch (err) {
            return res.status(400).json({ error: err.message });
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
        // V2 uses a strict EVM-hour bucket.  The same value is public in the
        // proof statement and is checked by the ACM at submission time.
        let requestEpoch = Math.floor(Date.now() / 3_600_000);

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

        // A time-limited policy is only authoritative once the ACM performs
        // its first-use/expiry state transition. Proof-oracle mode cannot make
        // that decision independently.
        if (BigInt(material.timeLimitEpochs || 0) > 0n && !submitOnChain) {
            return res.status(400).json({
                error: 'TS policies require submitOnChain=true for contract-enforced time limits'
            });
        }

        // Purpose is only part of the type-1 institutional-approval message.
        // A scoped credential is bound to its holder, scope and epoch instead.
        const usesInstitutionalApproval = material.predicateTypes.some((type) => Number(type) === 1);
        if (usesInstitutionalApproval && (evidence.purposeCode === undefined || evidence.purposeCode === null
            || evidence.purposeCode === '')) {
            return res.status(400).json({
                error: 'evidence.purposeCode is required for institutional approval'
            });
        }

        // The TPS derives every requester pseudonym as Poseidon(holderSecret)
        // and never trusts a supplied requesterId: a requester-chosen
        // pseudonym would appear in calldata with an encoding that can reveal
        // whether the policy is holder-bound. Signed scoped credentials (type 9)
        // and requester allowlists (type 8) also enforce the derivation in the
        // circuit; type 8 then proves that pseudonym is in the
        // provider-committed US, PS, or IS requester allowlist. For other
        // policies the circuit requires a zero secret in the witness.
        const usesHolderBoundProof = material.predicateTypes.some((type) => {
            const predicateType = Number(type);
            return predicateType === 8 || predicateType === 9;
        });
        if (evidence.holderSecret === undefined || evidence.holderSecret === null || evidence.holderSecret === '') {
            return res.status(400).json({ error: 'evidence.holderSecret is required (the TPS derives the requester pseudonym from it)' });
        }
        try {
            evidence.requesterId = await calculateRequesterId(evidence.holderSecret);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }
        if (!usesHolderBoundProof) evidence.holderSecret = '0';
        if (Number(material.predicateTypes[DUO_PROFILE_SLOT]) === 9 &&
            (!Number.isInteger(Number(evidence.duoProfileClaims)) || Number(evidence.duoProfileClaims) < 0 || Number(evidence.duoProfileClaims) > 127)) {
            return res.status(400).json({ error: 'evidence.duoProfileClaims must be a 7-bit integer for DUO_PROFILE policies' });
        }
        try {
            validateUserAllowlistEvidence(material, evidence);
        } catch (err) {
            return res.status(400).json({ error: err.message });
        }

        // Create session record for audit trail
        const sessionId = crypto.randomUUID();
        store.createSession(sessionId, {
            policyId,
            resourceId,
            nonce,
            requesterId: evidence.requesterId,
            purposeCode: evidence.purposeCode,
            credentialIds: evidence.credentialIds || [],
            requestEpoch,
            status: 'proving'
        });

        // Construct witness w = (penc, a, p, r, ω) and generate proof.
        // timings = { witnessMs, proveMs, verifyMs, verified } — server-side,
        // network-free proof costs, surfaced to the client below.
        let proofResult = await generateProof(
            material,
            evidence,
            {
                policyCommitment,
                // Authorization context bound into the statement (Section V-E).
                idReq: evidence.requesterId,
                idRes: resourceId,
                nonce,
                requestEpoch
            }
        );
        let { pA, pB, pC, pubSignals, timings: proofTimings } = proofResult;

        // Keep private audit fields in TPS storage only; they are never added
        // to the transaction or public signals.
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

            // The ACM checks the proof's hour bucket against block.timestamp of
            // the block that mines the tx. The hour that block will carry is
            // best predicted by the later of the chain's latest block and the
            // wall clock: on an automine chain the latest block can sit in the
            // previous hour until the next tx, and on a public chain the wall
            // clock runs a few seconds ahead of the latest block.
            const provider = tpsContract.runner.provider;
            // A raw request: ethers caches identical provider calls for 250 ms,
            // so getBlock('latest') right after a revert on an automine chain
            // can return the block before the one that mined the reverted tx.
            const currentEpoch = async () => {
                const latestBlock = await provider.send('eth_getBlockByNumber', ['latest', false]);
                return Math.max(
                    Math.floor(Number(BigInt(latestBlock.timestamp)) / 3600),
                    Math.floor(Date.now() / 3_600_000)
                );
            };
            // Re-prove against `epoch`; proofTimings then describe the proof
            // that is actually submitted.
            const reproveFor = async (epoch) => {
                requestEpoch = epoch;
                proofResult = await generateProof(material, evidence, {
                    policyCommitment,
                    idReq: evidence.requesterId,
                    idRes: resourceId,
                    nonce,
                    requestEpoch
                });
                ({ pA, pB, pC, pubSignals, timings: proofTimings } = proofResult);
                store.updateSession(sessionId, { requestEpoch, status: 'reproved' });
            };

            // Avoid knowingly submitting a proof generated in the preceding
            // hour.
            const chainEpoch = await currentEpoch();
            if (chainEpoch !== requestEpoch) {
                await reproveFor(chainEpoch);
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
            // real access work cost (~881k on Amoy for the padded entry point,
            // 2026-09-17 measurement; see experiments/capture/run.js),
            // independent of the (possibly lower) random target — otherwise a
            // low target makes gasLimit too small and the base
            // requestAccessBound work runs out of gas and reverts. So floor the
            // gasLimit at a real-work ceiling. Headroom (+80k) covers post-loop
            // fixed costs.
            const ACCESS_WORK_GAS_CEILING = 900000n;
            const padGasLimit =
                (accessGasPadTarget > ACCESS_WORK_GAS_CEILING
                    ? accessGasPadTarget
                    : ACCESS_WORK_GAS_CEILING) + 80000n;
            // Unpadded submissions also carry a fixed gasLimit: an estimateGas
            // round trip would copy the access gas into the public gasLimit,
            // and a simulation that crosses the hour fails before any tx exists.
            const padOverrides = { ...overrides, gasLimit: padGasLimit };
            const submitAccess = async () => {
                try {
                    const tx = await retryRpc(
                        `TPS requestAccessBound send for policyId=${policyId}`,
                        () => accessGasPadTarget > 0n
                            ? tpsContract.requestAccessBoundWithGasPad(
                                BigInt(policyId),
                                BigInt(resourceId),
                                BigInt(nonce),
                                BigInt(evidence.requesterId),
                                BigInt(requestEpoch),
                                pA, pB, pC, pubSignals,
                                accessGasPadTarget,
                                padOverrides
                            )
                            : tpsContract.requestAccessBound(
                                BigInt(policyId),
                                BigInt(resourceId),
                                BigInt(nonce),
                                BigInt(evidence.requesterId),
                                BigInt(requestEpoch),
                                pA, pB, pC, pubSignals,
                                padOverrides
                            ),
                        { initialDelayMs: 5000, maxAttempts: 8 }
                    );
                    const receipt = await waitForTx(tx, 1, { label: `TPS requestAccessBound tx ${tx.hash}` });
                    return { txHash: tx.hash, receipt };
                } catch (error) {
                    const knownTxHash = getAlreadyKnownTransactionHash(error);
                    if (!knownTxHash) {
                        throw error;
                    }

                    console.warn(`[TPS] requestAccessBound tx already known by RPC; waiting for ${knownTxHash}`);
                    const receipt = await waitForTransactionReceipt(provider, knownTxHash, {
                        label: `TPS already-known requestAccessBound receipt ${knownTxHash}`
                    });
                    return { txHash: knownTxHash, receipt };
                }
            };

            let txHash;
            let receipt;
            try {
                ({ txHash, receipt } = await submitAccess());
            } catch (error) {
                // Hour boundary crossed between the pre-check and mining: the
                // ACM rejects the stale bucket (a revert at send time on an
                // automine chain, a status-0 receipt on a public one). The
                // nonce is still unconsumed on-chain, so re-prove once for the
                // hour the chain is now in and resubmit.
                if (!isStaleEpochFailure(error)) {
                    throw error;
                }
                // The authoritative hour is that of the block that executed the
                // failed tx; without one, the pending block's, then the latest
                // block's or the wall clock's.
                let epochNow = await failedSubmissionEpoch(provider, error);
                if (epochNow === null || epochNow === requestEpoch) epochNow = await pendingEpoch(provider);
                if (epochNow === null || epochNow === requestEpoch) epochNow = await currentEpoch();
                if (epochNow === requestEpoch) {
                    throw error;
                }
                console.warn(`[TPS] requestAccessBound for policyId=${policyId} hit the hour boundary ` +
                    `(epoch ${requestEpoch} -> ${epochNow}); re-proving and resubmitting`);
                await reproveFor(epochNow);
                ({ txHash, receipt } = await submitAccess());
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

        // The contract independently prevents reuse.  Record the TPS-side
        // nonce only after the proof has either been returned (oracle mode) or
        // submitted, so a rejected hour-boundary attempt can be retried.
        store.markNonceUsed(policyId, nonce);

        return res.json({ pA, pB, pC, pubSignals, requestEpoch, sessionId, chainResult, proofTimings });
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
module.exports.failedSubmissionEpoch = failedSubmissionEpoch;
module.exports.isStaleEpochFailure = isStaleEpochFailure;
module.exports.pendingEpoch = pendingEpoch;
