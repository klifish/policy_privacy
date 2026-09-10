'use strict';

const { expect } = require('chai');
const fs = require('fs');
const { ethers } = require('hardhat');

const { generatePolicyArtifacts, buildRequesterAllowlist } = require('../../lib/compiler');
const {
  calculateParamsCommitment,
  calculateRequesterId
} = require('../../lib/prover');
const { calculateRequesterAllowlistLeaf } = require('../../utils/merkle/requester_allowlist');
const { deployPoseidon3 } = require('../../lib/poseidon_contract');
const {
  generateProof,
  WASM_PATH,
  ZKEY_PATH,
  VKEY_PATH
} = require('../../tps/proofGenerator');

const M = 5;
const MERKLE_LEVELS = 8;
const zeros = (length) => Array(length).fill('0');
const zeroPaths = () => Array.from({ length: M }, () => Array(MERKLE_LEVELS).fill('0'));
const zeroPathIndices = () => Array.from({ length: M }, () => Array(MERKLE_LEVELS).fill(0));

function parseEvent(contract, receipt, eventName) {
  return receipt.logs
    .map((log) => {
      try { return contract.interface.parseLog(log); } catch (_) { return null; }
    })
    .find((event) => event && event.name === eventName);
}

function buildEvidence(entry, holderSecret) {
  const merkleLeaves = zeros(M);
  const merklePathElements = zeroPaths();
  const merklePathIndices = zeroPathIndices();
  merkleLeaves[0] = entry.leaf.toString();
  merklePathElements[0] = entry.pathElements.map(String);
  merklePathIndices[0] = entry.pathIndices.slice();
  return {
    attributes: [0, 0, 0, 0, 0, 0],
    holderSecret: holderSecret.toString(),
    merkleLeaves,
    merklePathElements,
    merklePathIndices
  };
}

async function materialFor(artifacts) {
  const scope = artifacts.predicates.scopeParameters;
  const parameterInputs = {
    predicateTypes: scope.predicateTypes,
    predicateSchemaTags: scope.predicateSchemaTags,
    scopeKinds: scope.scopeKinds,
    approvedScopeIds: scope.approvedScopeIds,
    merkleRoots: scope.merkleRoots,
    credPublicKeys: scope.credPublicKeys,
    rangeMin: zeros(M),
    rangeMax: zeros(M),
    ontologyPolicyIds: zeros(M),
    ontologyEpochs: zeros(M),
    policyValidFromEpoch: 0,
    policyValidUntilEpoch: 4294967295,
    moratoriumUntilEpoch: 0,
    timeLimitEpochs: 0
  };
  return {
    penc: artifacts.tokens,
    randomizer: BigInt(artifacts.randomizer).toString(),
    ...parameterInputs,
    paramsCommitment: await calculateParamsCommitment(parameterInputs),
    numOperations: artifacts.numOperations
  };
}

describe('US / PS / IS requester Merkle allowlist end-to-end', function () {
  this.timeout(240_000);

  let provider;
  let tpsSigner;
  let contract;
  let policyId;
  let resourceId;
  let artifacts;
  let material;
  let members;

  async function proofFor(holderSecret, entry, nonce) {
    const requesterId = await calculateRequesterId(holderSecret);
    const requestEpoch = BigInt(
      Math.floor(Number((await ethers.provider.getBlock('latest')).timestamp) / 3600)
    );
    const result = await generateProof(material, buildEvidence(entry, holderSecret), {
      policyCommitment: artifacts.policyCommitment,
      idReq: requesterId,
      idRes: resourceId,
      nonce,
      requestEpoch
    });
    return { requesterId, requestEpoch, result };
  }

  before(async function () {
    if (![WASM_PATH, ZKEY_PATH, VKEY_PATH].every(fs.existsSync)) this.skip();

    const holderSecrets = [101n, 202n, 303n];
    const requesterIds = await Promise.all(holderSecrets.map(calculateRequesterId));
    const allowlist = await buildRequesterAllowlist({ requesterIds });
    members = holderSecrets.map((holderSecret, index) => ({
      holderSecret,
      entry: allowlist.entries.find((entry) => entry.requesterId === BigInt(requesterIds[index]))
    }));

    artifacts = await generatePolicyArtifacts({
      predicates: [{ slot: 0, duo: 'US', allowlistRoot: allowlist.root.toString() }],
      logic: 'US'
    });
    material = await materialFor(artifacts);

    [provider, tpsSigner] = await ethers.getSigners();
    const verifier = await (await ethers.getContractFactory('PolicyPrivacyMainVerifier')).deploy();
    const contextHasher = await deployPoseidon3(ethers);
    contract = await (await ethers.getContractFactory('PolicyPrivacy')).deploy(verifier.target, contextHasher.target);

    policyId = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'].staticCall(
      BigInt(artifacts.policyCommitment), BigInt(material.paramsCommitment), 'ipfs://us-allowlist-policy'
    );
    await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
      BigInt(artifacts.policyCommitment), BigInt(material.paramsCommitment), 'ipfs://us-allowlist-policy'
    );
    resourceId = await contract.connect(provider).registerResource.staticCall(policyId);
    await contract.connect(provider).registerResource(policyId);
  });

  it('compiles US to the provider-committed, domain-separated allowlist slot', async function () {
    expect(material.predicateTypes).to.deep.equal([8, 4, 4, 4, 4]);
    expect(material.predicateSchemaTags).to.deep.equal([2005, 0, 0, 0, 0]);
    expect(material.scopeKinds).to.deep.equal([26, 0, 0, 0, 0]);
    expect(material.merkleRoots[0]).to.not.equal('0');
    for (const [duo, scopeKind, scopeId] of [['US', 26, 0], ['PS', 27, 9001], ['IS', 28, 9002]]) {
      const compiled = await generatePolicyArtifacts({
        predicates: [{ slot: 0, duo, scopeId, allowlistRoot: material.merkleRoots[0] }], logic: duo
      });
      expect(compiled.predicates.scopeParameters.predicateTypes).to.deep.equal([8, 4, 4, 4, 4]);
      expect(compiled.predicates.scopeParameters.scopeKinds).to.deep.equal([scopeKind, 0, 0, 0, 0]);
      expect(compiled.predicates.scopeParameters.approvedScopeIds).to.deep.equal([String(scopeId), '0', '0', '0', '0']);
      await expect(generatePolicyArtifacts({
        predicates: [{ slot: 0, duo, scopeId, allowlistRoot: material.merkleRoots[0] }], logic: `NOT ${duo}`
      })).to.be.rejectedWith(`NOT ${duo} is unsupported`);
    }
    await expect(generatePolicyArtifacts({
      predicates: [
        { slot: 0, duo: 'US', allowlistRoot: material.merkleRoots[0] },
        { slot: 1, duo: 'PS', scopeId: 9001, allowlistRoot: material.merkleRoots[0] }
      ], logic: 'NOT (US AND PS)'
    })).to.be.rejectedWith('NOT US is unsupported');
  });

  for (const [duo, scopeKind, scopeId] of [['PS', 27, 9001], ['IS', 28, 9002]]) {
    it(`uses the same membership mechanism for ${duo}`, async function () {
      const requesterIds = await Promise.all(members.map(({ holderSecret }) => calculateRequesterId(holderSecret)));
      const scopedAllowlist = await buildRequesterAllowlist({ requesterIds, scopeKind, scopeId });
      const scopedArtifacts = await generatePolicyArtifacts({
        predicates: [{ slot: 0, duo, scopeId, allowlistRoot: scopedAllowlist.root.toString() }], logic: duo
      });
      const scopedMaterial = await materialFor(scopedArtifacts);
      const member = members[0];
      const entry = scopedAllowlist.entries.find((candidate) => candidate.requesterId === BigInt(requesterIds[0]));
      const requesterId = requesterIds[0];
      const requestEpoch = BigInt(Math.floor(Number((await ethers.provider.getBlock('latest')).timestamp) / 3600));
      const result = await generateProof(scopedMaterial, buildEvidence(entry, member.holderSecret), {
        policyCommitment: scopedArtifacts.policyCommitment,
        idReq: requesterId,
        idRes: resourceId,
        nonce: 8900n + BigInt(scopeKind),
        requestEpoch
      });
      expect(result.timings.verified).to.equal(true);
      expect(BigInt(result.pubSignals[0])).to.equal(1n);
    });
  }

  for (const [index, name] of ['Alice', 'Bob', 'Carol'].entries()) {
    it(`grants ${name} access using ${name}'s private membership proof`, async function () {
      const member = members[index];
      const nonce = 9000n + BigInt(index);
      const { requesterId, requestEpoch, result } = await proofFor(member.holderSecret, member.entry, nonce);
      expect(result.timings.verified).to.equal(true);
      expect(BigInt(result.pubSignals[0])).to.equal(1n);

      const receipt = await (await contract.connect(tpsSigner).requestAccessBound(
        policyId, resourceId, nonce, requesterId, requestEpoch,
        result.pA, result.pB, result.pC, result.pubSignals
      )).wait();
      const event = parseEvent(contract, receipt, 'AccessGranted');
      expect(event).to.exist;
      expect(await contract.isAccessGranted(event.args.requestId)).to.equal(true);
    });
  }

  it('denies an unlisted requester using an unrelated allowlist path', async function () {
    const outsiderSecret = 404n;
    const outsiderId = await calculateRequesterId(outsiderSecret);
    const outsiderEntry = {
      leaf: await calculateRequesterAllowlistLeaf(outsiderId),
      pathElements: members[0].entry.pathElements,
      pathIndices: members[0].entry.pathIndices
    };
    const nonce = 9010n;
    const denied = await proofFor(outsiderSecret, outsiderEntry, nonce);
    expect(denied.result.timings.verified).to.equal(true);
    expect(BigInt(denied.result.pubSignals[0])).to.equal(0n);
    const deniedReceipt = await (await contract.connect(tpsSigner).requestAccessBound(
      policyId, resourceId, nonce, denied.requesterId, denied.requestEpoch,
      denied.result.pA, denied.result.pB, denied.result.pC, denied.result.pubSignals
    )).wait();
    expect(parseEvent(contract, deniedReceipt, 'AccessDenied')).to.exist;
  });

  it('rejects replay of an accepted membership proof', async function () {
    const accepted = await proofFor(members[0].holderSecret, members[0].entry, 9020n);
    await contract.connect(tpsSigner).requestAccessBound(
      policyId, resourceId, 9020n, accepted.requesterId, accepted.requestEpoch,
      accepted.result.pA, accepted.result.pB, accepted.result.pC, accepted.result.pubSignals
    );
    await expect(contract.connect(tpsSigner).requestAccessBound(
      policyId, resourceId, 9020n, accepted.requesterId, accepted.requestEpoch,
      accepted.result.pA, accepted.result.pB, accepted.result.pC, accepted.result.pubSignals
    )).to.be.revertedWith('Nonce already used');
  });
});
