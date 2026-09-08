/**
 * On-chain enforcement of the authorization-context binding
 * =========================================================
 *
 * Companion to test/context_binding_test.js, which covers the in-circuit half
 * of the binding. This file covers the ACM's half: the contract recomputes
 *
 *     ctx = Poseidon(id_req || id_res || nonce)
 *
 * from the transaction parameters and requires it to equal the proof's fourth
 * public signal.
 *
 * The circuit constraint alone already makes a proof non-transferable -- a
 * proof verifies only for the context it was generated for. What the on-chain
 * recomputation adds is that a recorded request cannot CITE a statement proved
 * for a different context: without it, a submitter could pair a genuine proof
 * with unrelated transaction parameters and write a misleading authorization
 * record, which the contract would have no way to notice.
 *
 * The hasher is deployed from circomlib's generated EVM bytecode, so the
 * on-chain digest is bit-identical to the circuit's; the first test pins that
 * agreement, since everything else here depends on it.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');

const { deployPoseidon3 } = require('../lib/poseidon_contract');
const { calculateContextHash } = require('../lib/prover');

// A syntactically valid but cryptographically meaningless proof. These tests
// exercise the context check, which runs BEFORE proof verification, so the
// proof itself never needs to be valid: a context mismatch must revert, while
// a context match must proceed to verification and record a denial.
const MOCK_PROOF = {
  pA: [1n, 2n],
  pB: [[3n, 4n], [5n, 6n]],
  pC: [7n, 8n]
};

const POLICY_COMMITMENT = 424242n;
const PARAMS_COMMITMENT = 0n;

const ALICE = 111n;
const BOB = 222n;
const SESSION_1 = 999n;
const SESSION_2 = 1000n;

describe('On-chain authorization-context binding', function () {
  async function deployFixture() {
    const [provider, tps] = await ethers.getSigners();

    const Verifier = await ethers.getContractFactory('PolicyPrivacyMainVerifier');
    const verifier = await Verifier.deploy();

    const contextHasher = await deployPoseidon3(ethers);

    const PolicyPrivacy = await ethers.getContractFactory('PolicyPrivacy');
    const contract = await PolicyPrivacy.deploy(
      await verifier.getAddress(),
      await contextHasher.getAddress()
    );

    await contract
      .connect(provider)
      ['commitPolicy(uint256,uint256,string)'](
        POLICY_COMMITMENT,
        PARAMS_COMMITMENT,
        'test-uri'
      );
    await contract.connect(provider).registerResource(1);

    return { contract, contextHasher, provider, tps };
  }

  function pubSignals(contextHash) {
    return [1n, POLICY_COMMITMENT, PARAMS_COMMITMENT, BigInt(contextHash)];
  }

  it('computes the same digest on-chain as the circuit does off-chain', async function () {
    const { contextHasher } = await loadFixture(deployFixture);

    for (const triple of [[ALICE, 1n, SESSION_1], [BOB, 1n, SESSION_2], [0n, 0n, 0n]]) {
      const onchain = await contextHasher['poseidon(uint256[3])'](triple);
      const offchain = await calculateContextHash(...triple);
      expect(onchain.toString()).to.equal(
        offchain,
        `on-chain and circuit digests must agree for ${triple}`
      );
    }
  });

  it('accepts a request whose parameters match the proved context', async function () {
    const { contract, tps } = await loadFixture(deployFixture);
    const ctx = await calculateContextHash(ALICE, 1n, SESSION_1);

    // The mock proof fails verification, so the request is recorded as a
    // denial -- but it is recorded, which is what matters here: the context
    // check passed rather than reverting.
    await expect(
      contract.connect(tps).requestAccessBound(
        1, 1, SESSION_1, ALICE,
        MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctx)
      )
    ).to.emit(contract, 'AccessRequested');

    const record = await contract.accessRequests(1);
    expect(record.requesterId).to.equal(ALICE);
    expect(record.contextHash.toString()).to.equal(ctx);
  });

  it('rejects a request citing a proof bound to a different requester', async function () {
    const { contract, tps } = await loadFixture(deployFixture);
    // Digest proved for Alice, request submitted naming Bob.
    const ctx = await calculateContextHash(ALICE, 1n, SESSION_1);

    await expect(
      contract.connect(tps).requestAccessBound(
        1, 1, SESSION_1, BOB,
        MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctx)
      )
    ).to.be.revertedWith('Context binding mismatch');
  });

  it('rejects a request citing a proof bound to a different session', async function () {
    const { contract, tps } = await loadFixture(deployFixture);
    const ctx = await calculateContextHash(ALICE, 1n, SESSION_1);

    // This is the replay the nonce check cannot catch on its own: the nonce is
    // fresh, so usedNonces sees no repeat.
    await expect(
      contract.connect(tps).requestAccessBound(
        1, 1, SESSION_2, ALICE,
        MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctx)
      )
    ).to.be.revertedWith('Context binding mismatch');
  });

  it('rejects a request citing a proof bound to a different resource', async function () {
    const { contract, provider, tps } = await loadFixture(deployFixture);
    await contract.connect(provider).registerResource(1); // resourceId 2

    const ctx = await calculateContextHash(ALICE, 1n, SESSION_1);

    await expect(
      contract.connect(tps).requestAccessBound(
        1, 2, SESSION_1, ALICE,
        MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctx)
      )
    ).to.be.revertedWith('Context binding mismatch');
  });

  it('scopes nonce single-use per requester', async function () {
    const { contract, tps } = await loadFixture(deployFixture);

    const ctxAlice = await calculateContextHash(ALICE, 1n, SESSION_1);
    await contract.connect(tps).requestAccessBound(
      1, 1, SESSION_1, ALICE,
      MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctxAlice)
    );

    // Same nonce, same resource, different requester: allowed, because the
    // replay key includes the requester and the proof is bound to it.
    const ctxBob = await calculateContextHash(BOB, 1n, SESSION_1);
    await expect(
      contract.connect(tps).requestAccessBound(
        1, 1, SESSION_1, BOB,
        MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctxBob)
      )
    ).to.emit(contract, 'AccessRequested');

    // Replaying Alice's exact tuple is still rejected.
    await expect(
      contract.connect(tps).requestAccessBound(
        1, 1, SESSION_1, ALICE,
        MOCK_PROOF.pA, MOCK_PROOF.pB, MOCK_PROOF.pC, pubSignals(ctxAlice)
      )
    ).to.be.revertedWith('Nonce already used');
  });
});
