'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const snarkjs = require('snarkjs');
const { ethers } = require('hardhat');
const { deployPoseidon3 } = require('../../lib/poseidon_contract');
const { generatePolicyArtifacts } = require('../../compiler/policy_generator');
const {
  calculateContextHash,
  calculateParamsCommitment,
  createCircuitInput
} = require('../../lib/prover');

const { WASM_PATH: WASM, VKEY_PATH } = require('../../tps/proofGenerator');
const ZEROES = Array(11).fill('0');
// Canonical attribute vector when the profile slot is disabled (claims = 0):
// [GRU, DS, RS, POA, GS, CC, HMB, NMDS, GSO, NPUNCU, NPOA, NPU, NCU]
const NO_PROFILE_ATTRS = [0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1];
const proof = [[0, 0], [[0, 0], [0, 0]], [0, 0]];

async function buildObligationInput({ requestEpoch = 500 } = {}) {
  const artifacts = await generatePolicyArtifacts({
    predicates: [
      { slot: 8, duo: 'MOR', moratoriumUntilEpoch: 100 },
      { slot: 9, duo: 'TS', durationMonths: 12 }
    ],
    logic: 'MOR AND TS'
  });
  const parameters = artifacts.predicates.scopeParameters;
  const paramsCommitment = await calculateParamsCommitment({
    predicateTypes: parameters.predicateTypes,
    predicateSchemaTags: parameters.predicateSchemaTags,
    scopeKinds: parameters.scopeKinds,
    approvedScopeIds: parameters.approvedScopeIds,
    merkleRoots: ZEROES,
    credPublicKeys: parameters.credPublicKeys,
    rangeMin: ZEROES,
    rangeMax: ZEROES,
    ontologyPolicyIds: ZEROES,
    ontologyEpochs: ZEROES,
    policyValidFromEpoch: 0,
    policyValidUntilEpoch: 4294967295,
    moratoriumUntilEpoch: parameters.moratoriumUntilEpoch,
    timeLimitEpochs: parameters.timeLimitEpochs,
    randomizer: artifacts.randomizer
  });
  const input = createCircuitInput(artifacts.policyCommitment, {
    policy: artifacts.policy,
    randomizer: BigInt(artifacts.randomizer),
    numOperations: artifacts.numOperations,
    requesterAttrs: NO_PROFILE_ATTRS,
    predicateTypes: parameters.predicateTypes,
    predicateSchemaTags: parameters.predicateSchemaTags,
    scopeKinds: parameters.scopeKinds,
    approvedScopeIds: parameters.approvedScopeIds,
    credPublicKeys: parameters.credPublicKeys,
    policyValidFromEpoch: 0,
    policyValidUntilEpoch: 4294967295,
    moratoriumUntilEpoch: parameters.moratoriumUntilEpoch,
    timeLimitEpochs: parameters.timeLimitEpochs,
    idReq: 7,
    idRes: 8,
    nonce: 9,
    requestEpoch,
    paramsCommitment,
    contextHash: await calculateContextHash(7, 8, 9)
  });
  return { artifacts, parameters, paramsCommitment, input };
}

async function mustReject(input) {
  let rejected = false;
  const originalError = console.error;
  console.error = () => { };
  try {
    await snarkjs.wtns.calculate(input, WASM, { type: 'mem' });
  } catch (_) {
    rejected = true;
  } finally {
    console.error = originalError;
  }
  expect(rejected).to.equal(true);
}

describe('MOR / TS access-time obligations', function () {
  this.timeout(120_000);

  describe('compiler and circuit', function () {
    it('compiles MOR and TS into private parameter-bound slots', async function () {
      const { artifacts, parameters, paramsCommitment } = await buildObligationInput();
      expect(artifacts.predicates.obligationToSlot).to.deep.equal({ MOR: 8, TS: 9 });
      expect(parameters.predicateTypes).to.deep.equal([4, 4, 4, 4, 4, 4, 4, 4, 6, 7, 4]);
      expect(parameters.predicateSchemaTags.slice(8, 10)).to.deep.equal([2003, 2004]);
      expect(parameters.scopeKinds).to.deep.equal(Array(11).fill(0));
      expect(parameters.approvedScopeIds).to.deep.equal(ZEROES);
      expect(parameters.moratoriumUntilEpoch).to.equal('100');
      expect(parameters.timeLimitEpochs).to.equal('8640');

      const alteredDeadlineCommitment = await calculateParamsCommitment({
        predicateTypes: parameters.predicateTypes,
        predicateSchemaTags: parameters.predicateSchemaTags,
        scopeKinds: parameters.scopeKinds,
        approvedScopeIds: parameters.approvedScopeIds,
        merkleRoots: ZEROES,
        credPublicKeys: parameters.credPublicKeys,
        rangeMin: ZEROES,
        rangeMax: ZEROES,
        ontologyPolicyIds: ZEROES,
        ontologyEpochs: ZEROES,
        policyValidFromEpoch: 0,
        policyValidUntilEpoch: 4294967295,
        moratoriumUntilEpoch: 101,
        timeLimitEpochs: parameters.timeLimitEpochs,
        // Same randomizer, so only the altered deadline can change pp.
        randomizer: artifacts.randomizer
      });
      expect(alteredDeadlineCommitment).to.not.equal(paramsCommitment);

      const verificationKeyPath = VKEY_PATH;
      if (fs.existsSync(verificationKeyPath)) {
        expect(JSON.parse(fs.readFileSync(verificationKeyPath, 'utf8')).nPublic).to.equal(5);
      }

      await expect(generatePolicyArtifacts({
        predicates: [
          { slot: 8, duo: 'MOR', moratoriumUntilEpoch: 10 },
          { slot: 8, duo: 'MOR', moratoriumUntilEpoch: 11 }
        ], logic: 'MOR'
      })).to.be.rejectedWith('Duplicate predicate slot');

      await expect(generatePolicyArtifacts({
        predicates: [{ slot: 0, duo: 'MOR', moratoriumUntilEpoch: 10 }], logic: 'MOR'
      })).to.be.rejectedWith('must use reserved predicate slot 8');

      await expect(generatePolicyArtifacts({
        predicates: [{ slot: 9, duo: 'TS', durationMonths: 0 }], logic: 'TS'
      })).to.be.rejectedWith('positive uint32');
    });

    it('accepts MOR after its deadline but rejects malformed MOR/TS slots', async function () {
      if (!fs.existsSync(WASM)) this.skip();
      const { input } = await buildObligationInput({ requestEpoch: 500 }); // deadline is 100
      await snarkjs.wtns.calculate(input, WASM, { type: 'mem' });

      // Swapped schema tags no longer match the committed parameters.
      await mustReject({ ...input, predicateSchemaTags: input.predicateSchemaTags.map((t, i) => (i === 8 ? 2004 : t)) });
      await mustReject({ ...input, scopeKinds: input.scopeKinds.map((k, i) => (i === 8 ? 1 : k)) });
      await mustReject({ ...input, moratoriumUntilEpoch: '0' });
      await mustReject({ ...input, timeLimitEpochs: '0' });
    });
  });

  describe('contract-enforced TS windows', function () {
    let provider;
    let other;
    let verifier;
    let contract;
    let paramsCommitment;

    async function setEpoch(value) {
      await ethers.provider.send('evm_setNextBlockTimestamp', [Number(value * 3600n)]);
    }

    async function commitTimeLimited(commitment = 111n, duration = 2n) {
      const policyId = await contract.connect(provider).commitPolicyWithTimeLimit.staticCall(
        commitment, paramsCommitment, '', duration
      );
      await contract.connect(provider).commitPolicyWithTimeLimit(commitment, paramsCommitment, '', duration);
      return policyId;
    }

    async function register(policyId) {
      const resourceId = await contract.connect(provider).registerResource.staticCall(policyId);
      await contract.connect(provider).registerResource(policyId);
      return resourceId;
    }

    async function submit(policyId, resourceId, nonce, requesterId, requestEpoch, commitment = 111n) {
      const contextHash = await calculateContextHash(requesterId, resourceId, nonce);
      return contract.connect(provider).requestAccessBound(
        policyId, resourceId, nonce, requesterId, requestEpoch,
        proof[0], proof[1], proof[2],
        [1n, commitment, paramsCommitment, BigInt(contextHash), requestEpoch]
      );
    }

    beforeEach(async function () {
      [provider, other] = await ethers.getSigners();
      paramsCommitment = BigInt(await calculateParamsCommitment({
        predicateTypes: [4, 4, 4, 4, 4, 4, 4, 4, 4, 7, 4],
        predicateSchemaTags: [0, 0, 0, 0, 0, 0, 0, 0, 0, 2004, 0],
        policyValidFromEpoch: 0,
        policyValidUntilEpoch: 4294967295,
        moratoriumUntilEpoch: 0,
        timeLimitEpochs: 2,
        randomizer: 12345
      }));
      verifier = await (await ethers.getContractFactory('MockVerifier')).deploy();
      const hasher = await deployPoseidon3(ethers);
      contract = await (await ethers.getContractFactory('PolicyPrivacy')).deploy(verifier.target, hasher.target);
    });

    it('starts only after success, is policy-wide, and expires half-open', async function () {
      const start = 500_000n;
      await setEpoch(start);
      const policyId = await commitTimeLimited();
      const resourceA = await register(policyId);
      const resourceB = await register(policyId);

      await verifier.setResult(false);
      await submit(policyId, resourceA, 1n, 7n, start);
      expect(await contract.getRequesterTimeLimit(policyId, 7n)).to.deep.equal([0n, 0n]);

      await verifier.setResult(true);
      await submit(policyId, resourceA, 2n, 7n, start);
      expect(await contract.getRequesterTimeLimit(policyId, 7n)).to.deep.equal([start, start + 2n]);
      expect(await contract.policyTimeLimitEpochs(policyId)).to.equal(2n);
      expect(await contract.getPolicyTimeLimit(policyId)).to.equal(2n);

      await setEpoch(start + 1n);
      await submit(policyId, resourceB, 3n, 7n, start + 1n);

      await setEpoch(start + 2n);
      await expect(submit(policyId, resourceA, 4n, 7n, start + 2n)).to.be.revertedWith('Time limit expired');
      await submit(policyId, resourceA, 5n, 8n, start + 2n);
      expect(await contract.getRequesterTimeLimit(policyId, 8n)).to.deep.equal([start + 2n, start + 4n]);
    });

    it('gives a rebound time-limited policy a fresh requester window', async function () {
      const start = 510_000n;
      await setEpoch(start);
      const oldPolicy = await commitTimeLimited(111n, 2n);
      const resource = await register(oldPolicy);
      await submit(oldPolicy, resource, 1n, 7n, start);

      const newPolicy = await contract.connect(provider).commitPolicyVersionWithTimeLimit.staticCall(
        222n, paramsCommitment, '', oldPolicy, 3n
      );
      await contract.connect(provider).commitPolicyVersionWithTimeLimit(222n, paramsCommitment, '', oldPolicy, 3n);
      await contract.connect(provider).rebindResourcePolicy(resource, newPolicy);
      await setEpoch(start + 1n);
      await submit(newPolicy, resource, 2n, 7n, start + 1n, 222n);
      expect(await contract.getRequesterTimeLimit(newPolicy, 7n)).to.deep.equal([start + 1n, start + 4n]);
    });
  });
});
