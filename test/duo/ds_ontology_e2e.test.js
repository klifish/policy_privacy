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
const ONTOLOGY_POLICY_ID = 42;
const ONTOLOGY_EPOCH = 2026;

const zeros = (length) => Array(length).fill('0');
const zeroPaths = () => Array.from(
  { length: M },
  () => Array(MERKLE_LEVELS).fill('0')
);
const zeroPathIndices = () => Array.from(
  { length: M },
  () => Array(MERKLE_LEVELS).fill(0)
);

function parseEvent(contract, receipt, eventName) {
  return receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch (_) {
        return null;
      }
    })
    .find((event) => event && event.name === eventName);
}

function buildEvidence(entry) {
  const merkleLeaves = zeros(M);
  const merklePathElements = zeroPaths();
  const merklePathIndices = zeroPathIndices();
  const ontologyCodes = zeros(M);

  // OntologyLinkedTermsVerifier hashes Poseidon(2000, packed) before checking
  // the path. entry.leaf is that domain-separated hash; entry.packed is the
  // private ontologyCode input from which the circuit reconstructs it.
  merkleLeaves[0] = entry.leaf.toString();
  merklePathElements[0] = entry.pathElements.map(String);
  merklePathIndices[0] = entry.pathIndices.slice();
  ontologyCodes[0] = entry.packed.toString();

  return {
    attributes: [0, 1, 0, 0, 0, 0], // production order: GR, DS, RS, POA, GS, CC
    merkleLeaves,
    merklePathElements,
    merklePathIndices,
    ontologyCodes
  };
}

describe('DS / ICD10 ontology end-to-end', function () {
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

  before(async function () {
    if (![WASM_PATH, ZKEY_PATH, VKEY_PATH].every(fs.existsSync)) {
      this.skip();
    }

    const whitelist = await buildWhitelist({
      merkleLevels: MERKLE_LEVELS,
      defaultNamespace: 'ICD10',
      defaultEpoch: ONTOLOGY_EPOCH,
      terms: [
        { termId: 'C34.9' },
        { termId: 'C50.9' },
        { termId: 'E11.9' }
      ]
    });
    allowedEntry = whitelist.entries.find((entry) => entry.termId === 'E11.9');

    // Only the packed representation is used from this separate tree. Reusing
    // the allowed entry's path with this value produces a valid Groth16 proof
    // whose policy result is false, because the code is not in the committed set.
    const nonMemberWhitelist = await buildWhitelist({
      merkleLevels: MERKLE_LEVELS,
      defaultNamespace: 'ICD10',
      defaultEpoch: ONTOLOGY_EPOCH,
      terms: [{ termId: 'Z99.9' }]
    });
    nonMemberEntry = nonMemberWhitelist.entries[0];

    artifacts = await generatePolicyArtifacts({
      attributes: { DS: true },
      predicates: [{
        slot: 0,
        duo: 'DS',
        namespace: 'ICD10',
        root: whitelist.metadata.rootHex
      }],
      logic: 'DS'
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
    const verifier = await (
      await ethers.getContractFactory('PolicyPrivacyMainVerifier')
    ).deploy();
    const contextHasher = await deployPoseidon3(ethers);
    contract = await (
      await ethers.getContractFactory('PolicyPrivacy')
    ).deploy(verifier.target, contextHasher.target);

    policyId = await contract.connect(provider)[
      'commitPolicy(uint256,uint256,string)'
    ].staticCall(
      BigInt(artifacts.policyCommitment),
      BigInt(material.paramsCommitment),
      'ipfs://ds-icd10-policy'
    );
    await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](
      BigInt(artifacts.policyCommitment),
      BigInt(material.paramsCommitment),
      'ipfs://ds-icd10-policy'
    );

    resourceId = await contract.connect(provider).registerResource.staticCall(policyId);
    await contract.connect(provider).registerResource(policyId);
  });

  it('compiles DS into the production attribute and ICD10 predicate operands', function () {
    expect(artifacts.attributes.order).to.deep.equal(['GR', 'DS', 'RS', 'POA', 'GS', 'CC']);
    expect(artifacts.logic.rpn).to.deep.equal(['DS', 'P[ICD10]', 'AND']);
    expect(artifacts.tokens).to.deep.equal([1, N, N + M]);
    expect(artifacts.predicates.namespaceToSlot).to.deep.equal({ ICD10: 0 });
    expect(material.predicateTypes).to.deep.equal([3, 4, 4, 4, 4]);
  });

  it('grants access for a DS requester presenting an allowed ICD10 code', async function () {
    const requestEpoch = BigInt(
      Math.floor(Number((await ethers.provider.getBlock('latest')).timestamp) / 3600)
    );
    const requesterId = BigInt(requester.address);
    const nonce = 1001n;
    const result = await generateProof(
      material,
      buildEvidence(allowedEntry),
      {
        policyCommitment: artifacts.policyCommitment,
        idReq: requesterId,
        idRes: resourceId,
        nonce,
        requestEpoch
      }
    );

    expect(result.timings.verified).to.equal(true);
    expect(BigInt(result.pubSignals[0])).to.equal(1n);
    expect(BigInt(result.pubSignals[1])).to.equal(BigInt(artifacts.policyCommitment));
    expect(BigInt(result.pubSignals[2])).to.equal(BigInt(material.paramsCommitment));

    const tx = await contract.connect(tpsSigner).requestAccessBound(
      policyId,
      resourceId,
      nonce,
      requesterId,
      requestEpoch,
      result.pA,
      result.pB,
      result.pC,
      result.pubSignals
    );
    const receipt = await tx.wait();
    const event = parseEvent(contract, receipt, 'AccessGranted');

    expect(event).to.exist;
    expect(event.args.requester).to.equal(tpsSigner.address);
    expect(event.args.policyId).to.equal(policyId);
    expect(await contract.isAccessGranted(event.args.requestId)).to.equal(true);
  });

  it('denies access when the ICD10 code is not in the committed allowed set', async function () {
    const requestEpoch = BigInt(
      Math.floor(Number((await ethers.provider.getBlock('latest')).timestamp) / 3600)
    );
    const requesterId = BigInt(requester.address);
    const nonce = 1002n;
    const invalidEvidence = buildEvidence(allowedEntry);
    invalidEvidence.merkleLeaves[0] = nonMemberEntry.leaf.toString();
    invalidEvidence.ontologyCodes[0] = nonMemberEntry.packed.toString();

    const result = await generateProof(
      material,
      invalidEvidence,
      {
        policyCommitment: artifacts.policyCommitment,
        idReq: requesterId,
        idRes: resourceId,
        nonce,
        requestEpoch
      }
    );

    expect(result.timings.verified).to.equal(true);
    expect(BigInt(result.pubSignals[0])).to.equal(0n);

    const tx = await contract.connect(tpsSigner).requestAccessBound(
      policyId,
      resourceId,
      nonce,
      requesterId,
      requestEpoch,
      result.pA,
      result.pB,
      result.pC,
      result.pubSignals
    );
    const receipt = await tx.wait();
    const event = parseEvent(contract, receipt, 'AccessDenied');

    expect(event).to.exist;
    expect(event.args.requester).to.equal(tpsSigner.address);
    expect(event.args.policyId).to.equal(policyId);
    expect(await contract.isAccessGranted(event.args.requestId)).to.equal(false);
  });
});
