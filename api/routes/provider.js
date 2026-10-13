'use strict';

/**
 * Provider routes for TPS-ZKPI (Stages 1 & 2).
 *
 * Stage 1: Provider compiles policy → computes commitment → commits on-chain
 *          → registers protected resource.
 * Stage 2: Provider provisions policy-bound proving material to the TPS
 *          (called automatically inside register-resource).
 *
 * POST /api/provider/register-resource
 */

const express = require('express');
const { ethers } = require('hardhat');
const { generatePolicyArtifacts } = require('../../lib/compiler');
const { calculateParamsCommitment, calculatePolicyCommitment } = require('../../lib/prover');
const { provision } = require('../../lib/tps-client');
const { gasPadTarget } = require('../utils/transcriptNormalization');

const router = express.Router();

/**
 * POST /api/provider/register-resource
 *
 * Body:
 *   providerAddress : string  – Ethereum address of the provider
 *   policy          : string  – Boolean policy expression, e.g. "GR AND NOT DS"
 *   metadataURI     : string  – (optional) IPFS / HTTP URI
 *   useGasPad       : boolean – (optional, default true) pad gas for privacy
 *
 * Returns:
 *   { policyId, resourceId, commitment, paramsCommitment, transactionHash }
 */
router.post('/register-resource', async (req, res, next) => {
    try {
        const { providerAddress, policy, predicates, metadataURI = '', useGasPad = true, policyParameters = {} } = req.body;

        if (!providerAddress || !ethers.isAddress(providerAddress)) {
            return res.status(400).json({ error: 'Valid providerAddress is required' });
        }
        if (!policy || typeof policy !== 'string') {
            return res.status(400).json({ error: 'policy (string expression) is required' });
        }

        // ── Stage 1a: compile policy → penc + randomizer ────────────────────
        // DUO V3 accepts predicate-free NRES policies. Profile-backed terms
        // must explicitly carry their reserved DUO_PROFILE predicate.
        const artifacts = await generatePolicyArtifacts({
            logic: policy,
            predicates: predicates || []
        });
        // artifacts = { tokens, policy, randomizer (hex), policyCommitment (hex), numOperations, ... }

        const penc = artifacts.tokens;
        const randomizer = BigInt(artifacts.randomizer);
        const { numOperations } = artifacts;

        const slots = (value, name, fallback) => {
            const actual = value ?? Array(11).fill(fallback);
            if (!Array.isArray(actual) || actual.length !== 11) {
                throw new Error(`policyParameters.${name} must contain exactly 11 entries`);
            }
            return actual;
        };
        const scoped = artifacts.predicates.scopeParameters;
        const bindPolicyBound = (name, fallback) => {
            const generated = scoped[name] ?? Array(11).fill(fallback);
            const supplied = policyParameters[name]
                ? slots(policyParameters[name], name, fallback)
                : generated.slice();
            for (const predicate of artifacts.predicates.slots) {
                if ((predicate.kind === 'scoped' || predicate.kind === 'requester-allowlist') &&
                    String(supplied[predicate.slot]) !== String(generated[predicate.slot])) {
                    throw new Error(`policyParameters.${name}[${predicate.slot}] must match the compiled policy predicate`);
                }
            }
            return supplied;
        };
        const bindObligation = (name) => {
            const generated = scoped[name] ?? '0';
            const supplied = policyParameters[name] ?? generated;
            if (String(supplied) !== String(generated)) {
                throw new Error(`policyParameters.${name} must match the compiled obligation predicate`);
            }
            return generated;
        };
        const v2Params = {
            predicateTypes: bindPolicyBound('predicateTypes', 4),
            predicateSchemaTags: bindPolicyBound('predicateSchemaTags', 0),
            scopeKinds: bindPolicyBound('scopeKinds', 0),
            approvedScopeIds: bindPolicyBound('approvedScopeIds', '0'),
            merkleRoots: bindPolicyBound('merkleRoots', '0'),
            credPublicKeys: bindPolicyBound('credPublicKeys', '0'),
            rangeMin: slots(policyParameters.rangeMin, 'rangeMin', '0'),
            rangeMax: slots(policyParameters.rangeMax, 'rangeMax', '0'),
            ontologyPolicyIds: slots(policyParameters.ontologyPolicyIds, 'ontologyPolicyIds', '0'),
            ontologyEpochs: slots(policyParameters.ontologyEpochs, 'ontologyEpochs', '0'),
            policyValidFromEpoch: policyParameters.policyValidFromEpoch ?? Math.floor(Date.now() / 3_600_000),
            policyValidUntilEpoch: policyParameters.policyValidUntilEpoch ?? 4294967295,
            moratoriumUntilEpoch: bindObligation('moratoriumUntilEpoch'),
            timeLimitEpochs: bindObligation('timeLimitEpochs')
        };
        const paramsCommitment = await calculateParamsCommitment({ ...v2Params, randomizer });

        // Policy commitment: h = Com(penc, numOperations; r) — hex string from compiler
        const commitment = artifacts.policyCommitment;

        // ── Stage 1b: commit policy on-chain ────────────────────────────────
        const signer = new ethers.Wallet(
            process.env.PROVIDER_PRIVATE_KEY || process.env.PRIVATE_KEY ||
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            req.provider
        );
        const contractWithSigner = req.contract.connect(signer);

        let tx, receipt;
        const hasTimeLimit = BigInt(v2Params.timeLimitEpochs) > 0n;
        if (hasTimeLimit && useGasPad) {
            tx = await contractWithSigner.commitPolicyWithTimeLimitAndGasPad(
                BigInt(commitment),
                BigInt(paramsCommitment),
                metadataURI,
                BigInt(v2Params.timeLimitEpochs),
                gasPadTarget()
            );
        } else if (hasTimeLimit) {
            tx = await contractWithSigner.commitPolicyWithTimeLimit(
                BigInt(commitment),
                BigInt(paramsCommitment),
                metadataURI,
                BigInt(v2Params.timeLimitEpochs)
            );
        } else if (useGasPad) {
            tx = await contractWithSigner.commitPolicyWithGasPad(
                BigInt(commitment),
                BigInt(paramsCommitment),
                metadataURI,
                gasPadTarget()
            );
        } else {
            tx = await contractWithSigner.commitPolicy(
                BigInt(commitment),
                BigInt(paramsCommitment),
                metadataURI
            );
        }
        receipt = await tx.wait();

        // Extract policyId from PolicyCommitted event
        let policyId;
        for (const log of receipt.logs) {
            try {
                const parsed = req.contract.interface.parseLog(log);
                if (parsed.name === 'PolicyCommitted') {
                    policyId = parsed.args.policyId.toString();
                    break;
                }
            } catch (_) { /* skip unparseable logs */ }
        }
        if (!policyId) {
            throw new Error('PolicyCommitted event not found in receipt');
        }

        // ── Stage 1c: register protected resource ────────────────────────────
        const resourceTx = await contractWithSigner.registerResource(BigInt(policyId));
        const resourceReceipt = await resourceTx.wait();

        let resourceId;
        for (const log of resourceReceipt.logs) {
            try {
                const parsed = req.contract.interface.parseLog(log);
                if (parsed.name === 'ResourceRegistered') {
                    resourceId = parsed.args.resourceId.toString();
                    break;
                }
            } catch (_) { /* skip */ }
        }
        if (!resourceId) {
            throw new Error('ResourceRegistered event not found in receipt');
        }

        // ── Stage 2: provision policy material to TPS ────────────────────────
        const material = {
            penc,
            randomizer: randomizer.toString(),
            paramsCommitment: paramsCommitment.toString(),
            ...v2Params,
            numOperations
        };

        await provision(policyId, material);

        return res.status(201).json({
            policyId,
            resourceId,
            commitment: commitment.toString(),
            paramsCommitment: paramsCommitment.toString(),
            // TS is intentionally public because the ACM enforces it.  MOR
            // stays only inside paramsCommitment and is never returned here.
            timeLimitEpochs: v2Params.timeLimitEpochs,
            transactionHash: tx.hash,
            resourceTransactionHash: resourceTx.hash,
            gasUsed: receipt.gasUsed.toString()
        });
    } catch (err) {
        if (err.message && err.message.includes('revert')) err.type = 'blockchain';
        next(err);
    }
});

module.exports = router;
