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
        const { providerAddress, policy, metadataURI = '', useGasPad = true } = req.body;

        if (!providerAddress || !ethers.isAddress(providerAddress)) {
            return res.status(400).json({ error: 'Valid providerAddress is required' });
        }
        if (!policy || typeof policy !== 'string') {
            return res.status(400).json({ error: 'policy (string expression) is required' });
        }

        // ── Stage 1a: compile policy → penc + randomizer ────────────────────
        // generatePolicyArtifacts requires config.logic + config.predicates
        // For simple Boolean-only policies (GR, CU) we supply a dummy predicate
        // slot for DS (the canonical ontology-linked attribute at slot 0).
        const artifacts = await generatePolicyArtifacts({
            logic: policy,
            predicates: [{ slot: 0, duo: 'DS', namespace: 'ICD10', root: null }]
        });
        // artifacts = { tokens, policy, randomizer (hex), policyCommitment (hex), numOperations, ... }

        const penc = artifacts.tokens;
        const randomizer = BigInt(artifacts.randomizer);
        const { numOperations } = artifacts;

        // Params commitment (all predicates zero for simple Boolean policies)
        const paramsCommitment = await calculateParamsCommitment({});

        // Policy commitment: h = Com(penc; r)  — hex string from compiler
        const commitment = artifacts.policyCommitment;

        // ── Stage 1b: commit policy on-chain ────────────────────────────────
        const signer = new ethers.Wallet(
            process.env.PROVIDER_PRIVATE_KEY || process.env.PRIVATE_KEY ||
            '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
            req.provider
        );
        const contractWithSigner = req.contract.connect(signer);

        let tx, receipt;
        if (useGasPad) {
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
            merkleRoots: ['0', '0', '0', '0', '0'],
            credPublicKeys: ['0', '0', '0', '0', '0'],
            rangeMin: ['0', '0', '0', '0', '0'],
            rangeMax: ['0', '0', '0', '0', '0'],
            ontologyPolicyIds: ['0', '0', '0', '0', '0'],
            ontologyEpochs: ['0', '0', '0', '0', '0'],
            numOperations
        };

        await provision(policyId, material);

        return res.status(201).json({
            policyId,
            resourceId,
            commitment: commitment.toString(),
            paramsCommitment: paramsCommitment.toString(),
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
