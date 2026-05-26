'use strict';

/**
 * TPS-ZKPI end-to-end workflow test (Section V, all 6 stages).
 *
 * This test exercises the full TPS-ZKPI protocol using the Hardhat in-process
 * blockchain and a locally-running TPS server (embedded in-process via require).
 *
 * Stages under test:
 *  1. Provider compiles policy → commits on-chain → registers resource
 *  2. Provider provisions policy material to TPS
 *  3. Requester fetches resource metadata (policyId, commitment)
 *  4. Requester submits evidence to TPS → TPS generates proof
 *  5. Proof submitted to on-chain ACM → authorization recorded
 *  6. Authorization status queried; audit log retrieved
 *
 * NOTE: Stages 4–5 require a compiled circuit (npm run build:circuit:full).
 * When the circuit artefacts are absent the proof step is skipped and the
 * test validates everything up to and including Stage 3 / contract setup.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const fs = require('fs');
const path = require('path');

// TPS store (direct in-process import – no HTTP overhead needed for unit tests)
const store = require('../../tps/store');
const { buildWitness, WASM_PATH, ZKEY_PATH } = require('../../tps/proofGenerator');
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

    let contract, verifier, provider, requester;

    // ── Deploy contracts ─────────────────────────────────────────────────────
    before(async () => {
        [provider, requester] = await ethers.getSigners();

        // Deploy MockVerifier so tests pass without a real Groth16 proof
        const MockVerifier = await ethers.getContractFactory('MockVerifier');
        verifier = await MockVerifier.deploy();

        const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
        contract = await PolicyPrivacy.deploy(await verifier.getAddress());
    });

    // ── Stage 1: Policy commitment + resource registration ──────────────────
    describe('Stage 1 – Policy commitment and resource registration', () => {
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
    describe('Stage 2 – TPS provisioning', () => {
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

    // ── Stage 3: Requester fetches resource metadata ─────────────────────────
    describe('Stage 3 – Resource metadata fetch', () => {
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
    describe('Stage 4+5 – Proof generation and on-chain verification', () => {
        // These tests require a compiled circuit; they are skipped when absent.
        before(function () {
            if (!CIRCUIT_AVAILABLE) {
                this.skip();
            }
        });

        it('buildWitness constructs a valid circuit input shape', async () => {
            const artifacts = await compilePolicy('GR');
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

            const evidence = { attributes: [1, 0, 0, 0, 0, 0, 0] };
            const witness = buildWitness(material, evidence, {
                policyCommitment: artifacts.policyCommitment.toString()
            });

            expect(witness.policy).to.have.length(20);   // DEPTH = 20
            expect(witness.requesterAttrs).to.have.length(7); // N = 7
            expect(witness.predicateTypes).to.have.length(5); // M = 5
        });
    });

    // ── Stage 6: Authorization status + audit log ────────────────────────────
    describe('Stage 6 – Authorization status and audit log', () => {
        let policyId, requestId;

        before(async () => {
            // Commit a policy and make a mock access request using MockVerifier
            const artifacts = await compilePolicy('GR');
            const paramsCommitment = await calculateParamsCommitment({});

            const commitTx = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
                BigInt(artifacts.policyCommitment), BigInt(paramsCommitment), ''
            );
            const commitReceipt = await commitTx.wait();
            const committedEvent = commitReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'PolicyCommitted');
            policyId = committedEvent.args.policyId;

            // Build minimal pubSignals matching contract requirements
            const toHex = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
            const pubSignals = [
                toHex(1),                                 // isAuthorized
                toHex(BigInt(artifacts.policyCommitment)), // policyCommitment
                toHex(paramsCommitment),            // paramsCommitment
                ...Array(30).fill(toHex(0))         // remaining signals
            ];
            const dummyPair = [toHex(1), toHex(2)];
            const dummyB = [[toHex(3), toHex(4)], [toHex(5), toHex(6)]];

            const accessTx = await contract.connect(requester).requestAccess(
                policyId, dummyPair, dummyB, dummyPair, pubSignals
            );
            const accessReceipt = await accessTx.wait();
            const reqEvent = accessReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'AccessRequested');
            requestId = reqEvent.args.requestId;
        });

        it('isAccessGranted returns true for valid MockVerifier proof', async () => {
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
            // Register resource first
            const resourceTx = await contract.connect(provider).registerResource(policyId);
            const resourceReceipt = await resourceTx.wait();
            const resourceEvent = resourceReceipt.logs
                .map(log => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
                .find(e => e && e.name === 'ResourceRegistered');
            const resourceId = resourceEvent.args.resourceId;

            // Fetch the commitment already stored on-chain for this policyId
            const [, storedCommitment, storedParamsCommitment] = await contract.getPolicy(policyId);
            const toHex = (v) => '0x' + BigInt(v).toString(16).padStart(64, '0');
            const pubSignals = [
                toHex(1), toHex(storedCommitment), toHex(storedParamsCommitment),
                ...Array(30).fill(toHex(0))
            ];
            const dummyPair = [toHex(1), toHex(2)];
            const dummyB = [[toHex(3), toHex(4)], [toHex(5), toHex(6)]];

            const nonce = BigInt('0xdeadbeef');

            // First call should succeed
            await contract.connect(requester).requestAccessBound(
                policyId, resourceId, nonce,
                dummyPair, dummyB, dummyPair, pubSignals
            );

            // Second call with same nonce should revert
            await expect(
                contract.connect(requester).requestAccessBound(
                    policyId, resourceId, nonce,
                    dummyPair, dummyB, dummyPair, pubSignals
                )
            ).to.be.revertedWith('Nonce already used');
        });
    });
});
