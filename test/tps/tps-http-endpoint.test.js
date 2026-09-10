'use strict';

/**
 * TPS HTTP endpoint integration tests.
 *
 * Tests the /tps/prove endpoint behaviour via supertest (HTTP layer),
 * focusing on the submitOnChain=true path where TPS calls requestAccessBound()
 * with its own chain account instead of returning the proof to the requester.
 *
 * Coverage:
 *   - submitOnChain=false (default): proof returned, chainResult=null
 *   - submitOnChain=true, tpsContract not configured: HTTP 500
 *   - submitOnChain=true, TPS signer wired: granted/denied, address hiding, nonce replay
 *   - Input validation: missing required fields → HTTP 400/404
 *   - Contract-level guards: resource/policy mismatch, revoked policy, wrong commitment
 *
 * Test strategy: mount tps/server router onto a fresh express app (not tps/index.js,
 * to avoid port conflicts) and inject app.locals.tpsContract manually.
 *
 * See tps-protocol-stages.test.js for in-process unit tests of each protocol stage.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoseidon3 } = require('../../lib/poseidon_contract');
const fs = require('fs');
const express = require('express');
const request = require('supertest');

const store = require('../../tps/store');
const { generateProof, WASM_PATH, ZKEY_PATH } = require('../../tps/proofGenerator');
const { calculateParamsCommitment } = require('../../lib/prover');
const { generatePolicyArtifacts } = require('../../lib/compiler');
const tpsRouter = require('../../tps/server');

const CIRCUIT_AVAILABLE = fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH);

// ── Helpers ──────────────────────────────────────────────────────────────────

let nonceCounter = 1000;
function freshNonce() {
    // Must be a decimal string convertible to BigInt
    nonceCounter += 1;
    return String(Date.now() * 1000 + nonceCounter);
}

function buildTestApp(tpsContract, accessGasPadTarget) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/tps', tpsRouter);
    if (tpsContract) app.locals.tpsContract = tpsContract;
    if (accessGasPadTarget != null) app.locals.accessGasPadTarget = accessGasPadTarget;
    return app;
}

async function compilePolicy(logic) {
    return generatePolicyArtifacts({
        logic,
        predicates: [{ slot: 0, duo: 'DS', namespace: 'ICD10', root: null }]
    });
}

function buildMaterial(artifacts, paramsCommitment) {
    const zeros = Array(5).fill('0');
    return {
        penc: artifacts.tokens,
        randomizer: artifacts.randomizer.toString(),
        paramsCommitment: paramsCommitment.toString(),
        predicateTypes: Array(5).fill(4),
        predicateSchemaTags: Array(5).fill(0),
        scopeKinds: Array(5).fill(0),
        approvedScopeIds: zeros,
        merkleRoots: zeros,
        credPublicKeys: zeros,
        rangeMin: zeros,
        rangeMax: zeros,
        ontologyPolicyIds: zeros,
        ontologyEpochs: zeros,
        policyValidFromEpoch: 0,
        policyValidUntilEpoch: 4294967295,
        moratoriumUntilEpoch: 0,
        timeLimitEpochs: 0,
        numOperations: artifacts.numOperations
    };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('TPS Chain Submission', function () {
    this.timeout(120_000);

    let contract, provider, requester, tpsSigner;
    let sharedPolicyId, sharedResourceId, sharedArtifacts, sharedParamsCommitment;

    before(async function () {
        if (!CIRCUIT_AVAILABLE) {
            this.skip();
        }

        [provider, requester, tpsSigner] = await ethers.getSigners();

        const RealVerifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
        const verifier = await RealVerifier.deploy();

        const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
        const contextHasher = await deployPoseidon3(ethers);
        contract = await PolicyPrivacy.deploy(
            await verifier.getAddress(),
            await contextHasher.getAddress()
        );

        // Compile a simple GR policy and commit on-chain.
        // Use explicit zero arrays so paramsCommitment matches what the circuit
        // recomputes internally from those same parameter arrays.
        sharedArtifacts = await compilePolicy('GR');
        const material = buildMaterial(sharedArtifacts, '0');
        sharedParamsCommitment = await calculateParamsCommitment(material);

        const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
            BigInt(sharedArtifacts.policyCommitment),
            BigInt(sharedParamsCommitment),
            ''
        );
        const commitReceipt = await commitTx.wait();
        const committedEvent = commitReceipt.logs
            .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
            .find(e => e && e.name === 'PolicyCommitted');
        sharedPolicyId = committedEvent.args.policyId;

        // Register resource
        const resourceTx = await contract.connect(provider).registerResource(sharedPolicyId);
        const resourceReceipt = await resourceTx.wait();
        const resourceEvent = resourceReceipt.logs
            .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
            .find(e => e && e.name === 'ResourceRegistered');
        sharedResourceId = resourceEvent.args.resourceId;

        // Provision policy material to TPS store
        store.provisionPolicy(
            sharedPolicyId.toString(),
            buildMaterial(sharedArtifacts, sharedParamsCommitment)
        );
    });

    // ── submitOnChain=false (default / backward-compatible mode) ─────────────
    describe('submitOnChain=false (default)', () => {
        let app;
        before(() => {
            // No tpsContract injected – pure proof-oracle mode
            app = buildTestApp(null);
        });

        it('returns proof components and chainResult=null', async () => {
            const nonce = freshNonce();
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address }
                    // submitOnChain omitted → defaults to false
                });

            expect(res.status).to.equal(200);
            expect(res.body).to.have.property('pA').that.is.an('array');
            expect(res.body).to.have.property('pB').that.is.an('array');
            expect(res.body).to.have.property('pC').that.is.an('array');
            expect(res.body).to.have.property('pubSignals').that.is.an('array');
            expect(res.body.chainResult).to.be.null;
        });
    });

    // ── submitOnChain=true, no tpsContract configured ────────────────────────
    describe('submitOnChain=true, tpsContract not configured', () => {
        let app;
        before(() => {
            app = buildTestApp(null); // no tpsContract
        });

        it('returns HTTP 500 with a descriptive error', async () => {
            const nonce = freshNonce();
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });

            expect(res.status).to.equal(500);
            expect(res.body.error).to.include('TPS chain signer not configured');
        });
    });

    // ── submitOnChain=true, TPS signer wired up ───────────────────────────────
    describe('submitOnChain=true (TPS submits on-chain)', () => {
        let app;

        before(() => {
            // Inject tpsSigner's contract view – TPS uses signers[2]
            app = buildTestApp(contract.connect(tpsSigner));
        });

        it('returns chainResult.isGranted=true when attributes satisfy policy', async () => {
            const nonce = freshNonce();
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address }, // GR=1 satisfies "GR"
                    submitOnChain: true
                });

            expect(res.status).to.equal(200);
            expect(res.body.chainResult).to.exist;
            expect(res.body.chainResult.isGranted).to.be.true;
            expect(res.body.chainResult.requestId).to.be.a('string');
            expect(res.body.chainResult.transactionHash).to.match(/^0x/);
        });

        it('on-chain AccessGranted records TPS address, not requester address', async () => {
            const nonce = freshNonce();
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });

            expect(res.status).to.equal(200);
            const { transactionHash } = res.body.chainResult;

            // Verify the transaction was sent by the TPS signer
            const tx = await ethers.provider.getTransaction(transactionHash);
            expect(tx.from.toLowerCase()).to.equal(tpsSigner.address.toLowerCase());
            expect(tx.from.toLowerCase()).to.not.equal(requester.address.toLowerCase());

            // Verify the AccessGranted event records TPS address as requester
            const receipt = await ethers.provider.getTransactionReceipt(transactionHash);
            const grantedEvent = receipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'AccessGranted');
            expect(grantedEvent).to.exist;
            expect(grantedEvent.args.requester.toLowerCase()).to.equal(tpsSigner.address.toLowerCase());
        });

        it('contract.isAccessGranted returns true for the returned requestId', async () => {
            const nonce = freshNonce();
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });

            expect(res.status).to.equal(200);
            const { requestId } = res.body.chainResult;
            const granted = await contract.isAccessGranted(BigInt(requestId));
            expect(granted).to.be.true;
        });

        it('uses the unpadded requestAccessBound entry point when pad target is zero', async () => {
            const unpaddedApp = buildTestApp(contract.connect(tpsSigner), 0);
            const nonce = freshNonce();
            const res = await request(unpaddedApp)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });

            expect(res.status).to.equal(200);
            const tx = await ethers.provider.getTransaction(res.body.chainResult.transactionHash);
            const parsed = contract.interface.parseTransaction({ data: tx.data, value: tx.value });
            expect(parsed.name).to.equal('requestAccessBound');
        });

        it('access gas padding pins observable gas to the configured target', async () => {
            const PAD_TARGET = 600000;
            const padApp = buildTestApp(contract.connect(tpsSigner), PAD_TARGET);
            const nonce = freshNonce();
            const res = await request(padApp)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });

            expect(res.status).to.equal(200);
            const receipt = await ethers.provider.getTransactionReceipt(
                res.body.chainResult.transactionHash
            );
            const gasUsed = Number(receipt.gasUsed);
            // Padded to a ±10% randomized target; gas should land at/above the
            // low end of that band and not blow far past it.
            expect(gasUsed).to.be.greaterThan(PAD_TARGET * 0.9 - 5000);
            expect(gasUsed).to.be.lessThan(PAD_TARGET * 1.1 + 30000);
        });

        it('returns chainResult.isGranted=false when attributes do not satisfy policy', async () => {
            const nonce = freshNonce();
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [0, 0, 0, 0, 0, 0], requesterId: requester.address }, // GR=0 fails "GR"
                    submitOnChain: true
                });

            expect(res.status).to.equal(200);
            expect(res.body.chainResult.isGranted).to.be.false;

            // Verify AccessDenied event records TPS address
            const receipt = await ethers.provider.getTransactionReceipt(
                res.body.chainResult.transactionHash
            );
            const deniedEvent = receipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'AccessDenied');
            expect(deniedEvent).to.exist;
            expect(deniedEvent.args.requester.toLowerCase()).to.equal(tpsSigner.address.toLowerCase());
        });

        it('rejects duplicate nonce with HTTP 409', async () => {
            const nonce = freshNonce();

            // First request should succeed
            const first = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });
            expect(first.status).to.equal(200);

            // Second request with same nonce must be rejected
            const second = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce,
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });
            expect(second.status).to.equal(409);
            expect(second.body.error).to.include('Nonce already used');
        });
    });

    // ── Input validation (HTTP 400) ───────────────────────────────────────────
    describe('input validation', () => {
        let app;
        before(() => { app = buildTestApp(null); });

        const baseBody = () => ({
            policyId: '1',
            resourceId: '1',
            nonce: freshNonce(),
            policyCommitment: '12345',
            evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address }
        });

        it('returns 400 when policyId is missing', async () => {
            const body = baseBody();
            delete body.policyId;
            const res = await request(app).post('/tps/prove').send(body);
            expect(res.status).to.equal(400);
        });

        it('returns 400 when resourceId is missing', async () => {
            const body = baseBody();
            delete body.resourceId;
            const res = await request(app).post('/tps/prove').send(body);
            expect(res.status).to.equal(400);
        });

        it('returns 400 when nonce is missing', async () => {
            const body = baseBody();
            delete body.nonce;
            const res = await request(app).post('/tps/prove').send(body);
            expect(res.status).to.equal(400);
        });

        it('returns 400 when policyCommitment is missing', async () => {
            const body = baseBody();
            delete body.policyCommitment;
            const res = await request(app).post('/tps/prove').send(body);
            expect(res.status).to.equal(400);
        });

        it('returns 400 when evidence.attributes is missing', async () => {
            const body = baseBody();
            body.evidence = {};
            const res = await request(app).post('/tps/prove').send(body);
            expect(res.status).to.equal(400);
        });

        it('returns 404 when policy material is not provisioned', async () => {
            const body = baseBody();
            body.policyId = '99999'; // never provisioned
            const res = await request(app).post('/tps/prove').send(body);
            expect(res.status).to.equal(404);
            expect(res.body.error).to.include('Policy material not provisioned');
        });
    });

    // ── Contract-level guards ─────────────────────────────────────────────────
    describe('contract-level guards (submitOnChain=true)', () => {
        let app;
        let otherPolicyId, otherResourceId;

        before(async function () {
            if (!CIRCUIT_AVAILABLE) this.skip();
            app = buildTestApp(contract.connect(tpsSigner));

            // Register a second policy + resource to test cross-policy mismatch
            const artifacts2 = await compilePolicy('GR');
            const zeros = Array(5).fill('0');
            const paramsCommitment2 = await calculateParamsCommitment({
                merkleRoots: zeros, credPublicKeys: zeros,
                rangeMin: zeros, rangeMax: zeros,
                ontologyPolicyIds: zeros, ontologyEpochs: zeros
            });
            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(artifacts2.policyCommitment), BigInt(paramsCommitment2), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            otherPolicyId = committedEvent.args.policyId;

            const resourceTx = await contract.connect(provider).registerResource(otherPolicyId);
            const resourceReceipt = await resourceTx.wait();
            const resourceEvent = resourceReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'ResourceRegistered');
            otherResourceId = resourceEvent.args.resourceId;

            store.provisionPolicy(otherPolicyId.toString(), buildMaterial(artifacts2, paramsCommitment2));
        });

        it('returns 500 when resourceId belongs to a different policy (Resource/policy mismatch)', async () => {
            // Pass sharedPolicyId but otherResourceId – cross-policy mismatch
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: otherResourceId.toString(),  // wrong resource
                    nonce: freshNonce(),
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });
            expect(res.status).to.equal(500);
            expect(res.body.error).to.include('Resource/policy mismatch');
        });

        it('returns 500 when policy has been revoked (Policy not active)', async () => {
            // Commit a fresh policy, then revoke it before requesting access
            const artifacts3 = await compilePolicy('GR');
            const zeros = Array(5).fill('0');
            const paramsCommitment3 = await calculateParamsCommitment({
                merkleRoots: zeros, credPublicKeys: zeros,
                rangeMin: zeros, rangeMax: zeros,
                ontologyPolicyIds: zeros, ontologyEpochs: zeros
            });
            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(artifacts3.policyCommitment), BigInt(paramsCommitment3), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            const revokedPolicyId = committedEvent.args.policyId;

            const resourceTx = await contract.connect(provider).registerResource(revokedPolicyId);
            const resourceReceipt = await resourceTx.wait();
            const resourceEvent = resourceReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'ResourceRegistered');
            const revokedResourceId = resourceEvent.args.resourceId;

            store.provisionPolicy(revokedPolicyId.toString(), buildMaterial(artifacts3, paramsCommitment3));

            // Revoke the policy (only data subject = provider can revoke)
            await contract.connect(provider).revokePolicy(revokedPolicyId);

            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: revokedPolicyId.toString(),
                    resourceId: revokedResourceId.toString(),
                    nonce: freshNonce(),
                    policyCommitment: artifacts3.policyCommitment.toString(),
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });
            expect(res.status).to.equal(500);
            expect(res.body.error).to.include('Policy not active');
        });

        it('returns 500 when policyCommitment does not match on-chain value', async () => {
            const res = await request(app)
                .post('/tps/prove')
                .send({
                    policyId: sharedPolicyId.toString(),
                    resourceId: sharedResourceId.toString(),
                    nonce: freshNonce(),
                    policyCommitment: '9999999999', // wrong commitment
                    evidence: { attributes: [1, 0, 0, 0, 0, 0], requesterId: requester.address },
                    submitOnChain: true
                });
            expect(res.status).to.equal(500);
            expect(res.body.error).to.include('Policy commitment mismatch');
        });
    });
});
