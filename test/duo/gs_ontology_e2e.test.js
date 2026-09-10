'use strict';

const { expect } = require('chai');
const fs = require('fs');
const { ethers } = require('hardhat');

const { generatePolicyArtifacts, buildWhitelist } = require('../../lib/compiler');
const { calculateParamsCommitment } = require('../../lib/prover');
const { deployPoseidon3 } = require('../../lib/poseidon_contract');
const {
  generateProof,
  WASM_PATH,
  ZKEY_PATH,
  VKEY_PATH
} = require('../../tps/proofGenerator');

const N = 6;
const M = 5;
const MERKLE_LEVELS = 8;
const ONTOLOGY_POLICY_ID = 43;
const ONTOLOGY_EPOCH = 2026;
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

function buildEvidence(entry) {
  const merkleLeaves = zeros(M);
  const merklePathElements = zeroPaths();
  const merklePathIndices = zeroPathIndices();
  const ontologyCodes = zeros(M);
  merkleLeaves[0] = entry.leaf.toString();
  merklePathElements[0] = entry.pathElements.map(String);
  merklePathIndices[0] = entry.pathIndices.slice();
  ontologyCodes[0] = entry.packed.toString();
  return {
    // Production order: GR, DS, RS, POA, GS, CC.
    attributes: [0, 0, 0, 0, 1, 0],
    merkleLeaves,
    merklePathElements,
    merklePathIndices,
    ontologyCodes
  };
}

describe('GS / ISO3166 ontology end-to-end', function () {
  this.timeout(120_000);

  let provider;
  let requester;
  let tpsSigner;
  let contract;
  let policyId;
  let resourceId;
  let artifacts;
  let material;
  let allowedEntry;
  let nonMemberEntry;

  async function proveAndSubmit(entry, nonce) {
    const requesterId = BigInt(requester.address);
    const requestEpoch = BigInt(Math.floor(Number((await ethers.provider.getBlock('latest')).timestamp) / 3600));
    const result = await generateProof(material, buildEvidence(entry), {
      policyCommitment: artifacts.policyCommitment,
      idReq: requesterId,
      idRes: resourceId,
      nonce,
      requestEpoch
    });
    const receipt = await (await contract.connect(tpsSigner).requestAccessBound(
      policyId, resourceId, nonce, requesterId, requestEpoch,
      result.pA, result.pB, result.pC, result.pubSignals
    )).wait();
    return { result, receipt };
  }

  before(async function () {
    if (![WASM_PATH, ZKEY_PATH, VKEY_PATH].every(fs.existsSync)) this.skip();

    const whitelist = await buildWhitelist({
      merkleLevels: MERKLE_LEVELS,
      defaultNamespace: 'ISO3166',
      defaultEpoch: ONTOLOGY_EPOCH,
      terms: [{ termId: 'NL' }, { termId: 'DE' }, { termId: 'FR' }]
    });
    allowedEntry = whitelist.entries.find((entry) => entry.termId === 'NL');
    const nonMemberWhitelist = await buildWhitelist({
      merkleLevels: MERKLE_LEVELS,
      defaultNamespace: 'ISO3166',
      defaultEpoch: ONTOLOGY_EPOCH,
      terms: [{ termId: 'JP' }]
    });
    nonMemberEntry = nonMemberWhitelist.entries[0];

    artifacts = await generatePolicyArtifacts({
      attributes: { GS: true },
      predicates: [{ slot: 0, duo: 'GS', namespace: 'ISO3166', root: whitelist.metadata.rootHex }],
      logic: 'GS'
    });
    const parameterInputs = {
      predicateTypes: [3, 4, 4, 4, 4],
      predicateSchemaTags: [0, 0, 0, 0, 0],
      scopeKinds: [0, 0, 0, 0, 0],
      approvedScopeIds: zeros(M),
      merkleRoots: [whitelist.metadata.root.toString(), ...zeros(M - 1)],
      credPublicKeys: zeros(M),
      rangeMin: zeros(M),
      rangeMax: zeros(M),
      ontologyPolicyIds: [String(ONTOLOGY_POLICY_ID), ...zeros(M - 1)],
      ontologyEpochs: [String(ONTOLOGY_EPOCH), ...zeros(M - 1)],
      policyValidFromEpoch: 0,
      policyValidUntilEpoch: 4294967295,
      moratoriumUntilEpoch: 0,
      timeLimitEpochs: 0
    };
    material = {
      penc: artifacts.tokens,
      randomizer: BigInt(artifacts.randomizer).toString(),
      ...parameterInputs,
      paramsCommitment: await calculateParamsCommitment(parameterInputs),
      numOperations: artifacts.numOperations
    };

    [provider, requester, tpsSigner] = await ethers.getSigners();
    const verifier = await (await ethers.getContractFactory('PolicyPrivacyMainVerifier')).deploy();
    const contextHasher = await deployPoseidon3(ethers);
    contract = await (await ethers.getContractFactory('PolicyPrivacy')).deploy(verifier.target, contextHasher.target);
    policyId = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'].staticCall(
      BigInt(artifacts.policyCommitment), BigInt(material.paramsCommitment), 'ipfs://gs-iso3166-policy'
    );
    await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
      BigInt(artifacts.policyCommitment), BigInt(material.paramsCommitment), 'ipfs://gs-iso3166-policy'
    );
    resourceId = await contract.connect(provider).registerResource.staticCall(policyId);
    await contract.connect(provider).registerResource(policyId);
  });

  it('compiles GS into the geographical attribute and ISO3166 predicate operands', function () {
    expect(artifacts.attributes.order).to.deep.equal(['GR', 'DS', 'RS', 'POA', 'GS', 'CC']);
    expect(artifacts.logic.rpn).to.deep.equal(['GS', 'P[ISO3166]', 'AND']);
    expect(artifacts.tokens).to.deep.equal([4, N, N + M]);
    expect(artifacts.predicates.namespaceToSlot).to.deep.equal({ ISO3166: 0 });
  });

  it('grants access for an allowed ISO3166 geographical code', async function () {
    const { result, receipt } = await proveAndSubmit(allowedEntry, 1101n);
    expect(result.timings.verified).to.equal(true);
    expect(BigInt(result.pubSignals[0])).to.equal(1n);
    const event = parseEvent(contract, receipt, 'AccessGranted');
    expect(event).to.exist;
    expect(await contract.isAccessGranted(event.args.requestId)).to.equal(true);
  });

  it('denies access for an ISO3166 code absent from the committed set', async function () {
    // JP's packed code is paired with NL's path, yielding a valid proof of a
    // false policy result rather than a forged membership proof.
    const invalidEntry = {
      ...nonMemberEntry,
      pathElements: allowedEntry.pathElements,
      pathIndices: allowedEntry.pathIndices
    };
    const { result, receipt } = await proveAndSubmit(invalidEntry, 1102n);
    expect(result.timings.verified).to.equal(true);
    expect(BigInt(result.pubSignals[0])).to.equal(0n);
    expect(parseEvent(contract, receipt, 'AccessDenied')).to.exist;
  });
});
