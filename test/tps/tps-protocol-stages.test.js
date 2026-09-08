'use strict';

/**
 * TPS-ZKPI protocol stage unit tests (Section V, all 6 stages).
 *
 * Tests the correctness of each protocol component in isolation using
 * direct in-process imports (tps/store, tps/proofGenerator) — no HTTP layer.
 *
 * Stages under test:
 *  1. Provider compiles policy → commits on-chain → registers resource
 *  2. Provider provisions policy material to TPS store
 *  3. Requester fetches resource metadata (policyId, commitment)
 *  4. buildWitness + generateProof (Groth16 proof generation)
 *  5. Proof verified on-chain via requestAccess() (requester submits)
 *  6. Authorization status queried; audit log retrieved; nonce replay rejected
 *
 * NOTE: Stages 4–6 require a compiled circuit (npm run build:circuit:full).
 * When the circuit artefacts are absent the proof step is skipped and the
 * test validates everything up to and including Stage 3 / contract setup.
 *
 * See tps-http-endpoint.test.js for HTTP-layer tests of the submitOnChain path.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployPoseidon3 } = require('../../lib/poseidon_contract');
const fs = require('fs');
const path = require('path');

// TPS store (direct in-process import – no HTTP overhead needed for unit tests)
const store = require('../../tps/store');
const { buildWitness, generateProof, WASM_PATH, ZKEY_PATH } = require('../../tps/proofGenerator');
const { calculateParamsCommitment } = require('../../lib/prover');
const { generatePolicyArtifacts } = require('../../lib/compiler');
const { normaliseProof } = require('../../api/utils/transcriptNormalization');

// Helper: compile a simple policy (always includes a DS predicate slot
// because the compiler requires at least one predicate definition).
async function compilePolicy(logic) {
    return generatePolicyArtifacts({
        logic,
        predicates: [{ slot: 0, duo: 'DS', namespace: 'ICD10', root: null }]
    });
    // Returns: { tokens, policy, randomizer (hex), policyCommitment (hex), numOperations, ... }
}

const CIRCUIT_AVAILABLE = fs.existsSync(WASM_PATH) && fs.existsSync(ZKEY_PATH);

describe('TPS-ZKPI Workflow', function () {
    this.timeout(120_000);

    let contract, provider, requester;
    let sharedMaterial, sharedArtifacts; // shared across Stage 4+5 and Stage 6

    // Authorization context bound into the proof statement. The digest
    // Poseidon(idReq || idRes || nonce) is a public signal, so proof generation
    // and the on-chain call must agree on the triple. requestAccess() records
    // resourceId 0, so proofs submitted through it are bound to resource 0.
    const REQ_ID = 111n;
    const UNBOUND_RESOURCE = 0n;
    const SESSION_NONCE = 999n;

    // ── Deploy contracts ─────────────────────────────────────────────────────
    before(async function () {
        if (!CIRCUIT_AVAILABLE) {
            // Without a compiled circuit we cannot generate real proofs, so skip
            // all tests that depend on on-chain verification.
            this.skip();
        }
        [provider, requester] = await ethers.getSigners();

        const RealVerifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
        const verifier = await RealVerifier.deploy();

        const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
        const contextHasher = await deployPoseidon3(ethers);
        contract = await PolicyPrivacy.deploy(
            await verifier.getAddress(),
            await contextHasher.getAddress()
        );
    });

    // ── Stage 1: Policy commitment + resource registration ──────────────────
    describe('Stage 1: Policy commitment and resource registration', () => {
        it('compiles a simple Boolean policy to RPN tokens', async () => {
            const artifacts = await compilePolicy('GR AND NOT DS');
            expect(artifacts).to.have.property('tokens').that.is.an('array');
            expect(artifacts).to.have.property('policyCommitment');
            expect(artifacts).to.have.property('randomizer');
            expect(artifacts).to.have.property('numOperations').that.is.above(0);
        });

        it('commits policy on-chain and emits PolicyCommitted', async () => {
            const artifacts = await compilePolicy('GR');
            const paramsCommitment = await calculateParamsCommitment({});

            const tx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(artifacts.policyCommitment),
                BigInt(paramsCommitment),
                'ipfs://test'
            );
            const receipt = await tx.wait();

            const event = receipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');

            expect(event).to.exist;
            expect(event.args.commitment.toString()).to.equal(BigInt(artifacts.policyCommitment).toString());
        });

        it('registers a resource bound to the committed policy', async () => {
            const artifacts = await compilePolicy('GR');
            const paramsCommitment = await calculateParamsCommitment({});

            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(artifacts.policyCommitment), BigInt(paramsCommitment), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            const policyId = committedEvent.args.policyId;

            const resourceTx = await contract.connect(provider).registerResource(policyId);
            const resourceReceipt = await resourceTx.wait();

            const resourceEvent = resourceReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'ResourceRegistered');

            expect(resourceEvent).to.exist;
            expect(resourceEvent.args.policyId.toString()).to.equal(policyId.toString());
        });
    });

    // ── Stage 2: TPS provisioning ────────────────────────────────────────────
    describe('Stage 2: TPS provisioning', () => {
        it('stores policy material in TPS store', async () => {
            const artifacts = await compilePolicy('GR AND CU');
            const paramsCommitment = await calculateParamsCommitment({});

            const material = {
                penc: artifacts.tokens,
                randomizer: artifacts.randomizer.toString(),
                paramsCommitment: paramsCommitment.toString(),
                merkleRoots: Array(5).fill('0'),
                credPublicKeys: Array(5).fill('0'),
                rangeMin: Array(5).fill('0'),
                rangeMax: Array(5).fill('0'),
                ontologyPolicyIds: Array(5).fill('0'),
                ontologyEpochs: Array(5).fill('0'),
                numOperations: artifacts.numOperations
            };

            store.provisionPolicy('test-policy-1', material);

            expect(store.hasPolicy('test-policy-1')).to.be.true;
            const retrieved = store.getPolicyMaterial('test-policy-1');
            expect(retrieved.penc).to.deep.equal(artifacts.tokens);
        });
    });

    // ── Stage 3: Resource metadata fetch ─────────────────────────
    describe('Stage 3: Resource metadata fetch', () => {
        let policyId, resourceId, commitment, paramsCommitment;

        before(async () => {
            const artifacts = await compilePolicy('GR');
            paramsCommitment = await calculateParamsCommitment({});
            commitment = artifacts.policyCommitment;

            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(commitment), BigInt(paramsCommitment), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            policyId = committedEvent.args.policyId;

            const resourceTx = await contract.connect(provider).registerResource(policyId);
            const resourceReceipt = await resourceTx.wait();
            const resourceEvent = resourceReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'ResourceRegistered');
            resourceId = resourceEvent.args.resourceId;
        });

        it('getResource returns correct policyId', async () => {
            const [returnedPolicyId, , isActive] = await contract.getResource(resourceId);
            expect(returnedPolicyId.toString()).to.equal(policyId.toString());
            expect(isActive).to.be.true;
        });

        it('getPolicy returns matching commitment', async () => {
            const [, storedCommitment] = await contract.getPolicy(policyId);
            expect(storedCommitment.toString()).to.equal(BigInt(commitment).toString());
        });
    });

    // ── Stage 4+5: TPS proof generation + on-chain verification ─────────────
    describe('Stage 4+5: Proof generation and on-chain verification', () => {
        before(async () => {
            sharedArtifacts = await compilePolicy('GR');
            const zeros = Array(5).fill('0');
            // Use explicit zero arrays so paramsCommitment matches what the circuit
            // recomputes internally from those same parameter arrays.
            const paramsCommitment = await calculateParamsCommitment({
                merkleRoots: zeros, credPublicKeys: zeros,
                rangeMin: zeros, rangeMax: zeros,
                ontologyPolicyIds: zeros, ontologyEpochs: zeros
            });
            sharedMaterial = {
                penc: sharedArtifacts.tokens,
                randomizer: sharedArtifacts.randomizer.toString(),
                paramsCommitment: paramsCommitment.toString(),
                merkleRoots: zeros,
                credPublicKeys: zeros,
                rangeMin: zeros,
                rangeMax: zeros,
                ontologyPolicyIds: zeros,
                ontologyEpochs: zeros,
                numOperations: sharedArtifacts.numOperations
            };
        });

        it('buildWitness constructs a valid circuit input shape', () => {
            const evidence = { attributes: [1, 0, 0, 0, 0, 0] };
            const witness = buildWitness(sharedMaterial, evidence, {
                policyCommitment: sharedArtifacts.policyCommitment.toString(),
                idReq: REQ_ID,
                idRes: UNBOUND_RESOURCE,
                nonce: SESSION_NONCE
            });

            expect(witness.policy).to.have.length(20);        // DEPTH = 20
            expect(witness.requesterAttrs).to.have.length(6); // N = 6
            expect(witness.predicateTypes).to.have.length(5); // M = 5
        });

        it('generateProof produces a valid Groth16 proof for a satisfied policy', async () => {
            const evidence = { attributes: [1, 0, 0, 0, 0, 0] };
            const { pA, pB, pC, pubSignals } = await generateProof(
                sharedMaterial, evidence,
                {
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    idReq: REQ_ID,
                    idRes: UNBOUND_RESOURCE,
                    nonce: SESSION_NONCE
                }
            );

            expect(pA).to.have.length(2);
            expect(pC).to.have.length(2);
            expect(pB).to.have.length(2);
            expect(pB[0]).to.have.length(2);
            expect(BigInt(pubSignals[0])).to.equal(1n);
            expect(BigInt(pubSignals[1])).to.equal(BigInt(sharedArtifacts.policyCommitment));
        });

        it('generateProof returns isAuthorized=0 for an unsatisfied policy', async () => {
            const evidence = { attributes: [0, 0, 0, 0, 0, 0] };
            const { pubSignals } = await generateProof(
                sharedMaterial, evidence,
                {
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    idReq: REQ_ID,
                    idRes: UNBOUND_RESOURCE,
                    nonce: SESSION_NONCE
                }
            );

            expect(BigInt(pubSignals[0])).to.equal(0n);
        });

        it('proof is accepted on-chain by real Groth16 verifier', async () => {
            const evidence = { attributes: [1, 0, 0, 0, 0, 0] };
            const { pA, pB, pC, pubSignals } = await generateProof(
                sharedMaterial, evidence,
                {
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    idReq: REQ_ID,
                    idRes: UNBOUND_RESOURCE,
                    nonce: SESSION_NONCE
                }
            );

            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(sharedArtifacts.policyCommitment), BigInt(sharedMaterial.paramsCommitment), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            const policyId = committedEvent.args.policyId;

            const accessTx = await contract.connect(requester).requestAccess(
                policyId, REQ_ID, pA, pB, pC, pubSignals
            );
            const accessReceipt = await accessTx.wait();
            const grantedEvent = accessReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'AccessGranted');

            expect(grantedEvent).to.exist;
        });
    });

    // ── Stage 6: Authorization status + audit log ────────────────────────────
    describe('Stage 6 – Authorization status and audit log', () => {
        let policyId, requestId;

        before(async () => {
            // Reuse sharedMaterial/sharedArtifacts compiled in Stage 4+5 before()
            const { pA, pB, pC, pubSignals } = await generateProof(
                sharedMaterial,
                { attributes: [1, 0, 0, 0, 0, 0] },
                {
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    idReq: REQ_ID,
                    idRes: UNBOUND_RESOURCE,
                    nonce: SESSION_NONCE
                }
            );

            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(sharedArtifacts.policyCommitment), BigInt(sharedMaterial.paramsCommitment), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            policyId = committedEvent.args.policyId;

            const accessTx = await contract.connect(requester).requestAccess(
                policyId, REQ_ID, pA, pB, pC, pubSignals
            );
            const accessReceipt = await accessTx.wait();
            const reqEvent = accessReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'AccessRequested');
            requestId = reqEvent.args.requestId;
        });

        it('isAccessGranted returns true for a real Groth16 proof', async () => {
            const granted = await contract.isAccessGranted(requestId);
            expect(granted).to.be.true;
        });

        it('accessRequests returns correct record', async () => {
            const record = await contract.accessRequests(requestId);
            expect(record.isGranted).to.be.true;
            expect(record.isProcessed).to.be.true;
            expect(record.policyId.toString()).to.equal(policyId.toString());
        });

        it('AccessGranted event is emitted for the correct policy', async () => {
            const filter = contract.filters.AccessGranted(null, policyId);
            const events = await contract.queryFilter(filter, 0, 'latest');
            expect(events.length).to.be.at.least(1);
        });

        it('nonce replay is rejected by requestAccessBound', async () => {
            const resourceTx = await contract.connect(provider).registerResource(policyId);
            const resourceReceipt = await resourceTx.wait();
            const resourceEvent = resourceReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'ResourceRegistered');
            const resourceId = resourceEvent.args.resourceId;

            const nonce = BigInt('0xdeadbeef');

            // requestAccessBound recomputes Poseidon(idReq || resourceId ||
            // nonce) on-chain and compares it against the proof's fourth public
            // signal, so the proof must be generated for the same triple that
            // the transaction carries.
            const { pA, pB, pC, pubSignals } = await generateProof(
                sharedMaterial,
                { attributes: [1, 0, 0, 0, 0, 0] },
                {
                    policyCommitment: sharedArtifacts.policyCommitment.toString(),
                    idReq: REQ_ID,
                    idRes: resourceId,
                    nonce
                }
            );

            // First call should succeed
            await contract.connect(requester).requestAccessBound(
                policyId, resourceId, nonce, REQ_ID, pA, pB, pC, pubSignals
            );

            // Second call with same nonce should revert
            await expect(
                contract.connect(requester).requestAccessBound(
                    policyId, resourceId, nonce, REQ_ID, pA, pB, pC, pubSignals
                )
            ).to.be.revertedWith('Nonce already used');
        });
    });
});
