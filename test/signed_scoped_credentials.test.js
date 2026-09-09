'use strict';

const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const snarkjs = require('snarkjs');
const { generatePolicyArtifacts } = require('../compiler/policy_generator');
const {
  calculateParamsCommitment,
  calculateContextHash,
  calculateRequesterId,
  calculateScopedCredentialDigest,
  createCircuitInput,
  signScopedCredential
} = require('../lib/prover');

const WASM = path.resolve(__dirname, '../build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm');
const ISSUER_PRIVATE_KEY = new Uint8Array(32).fill(17);

async function scopedInput(duo, scopeKind) {
  const holderSecret = 987654321n;
  const requesterId = await calculateRequesterId(holderSecret);
  const scopeId = duo === 'US' ? requesterId : 1001n;
  const credentialId = 700n + BigInt(scopeKind);
  const signed = await signScopedCredential(ISSUER_PRIVATE_KEY, {
    scopeKind,
    requesterId,
    scopeId,
    validFromEpoch: 90,
    validUntilEpoch: 110,
    credentialId
  });
  const artifacts = await generatePolicyArtifacts({
    predicates: [{ slot: 0, duo, scopeId: scopeId.toString(), issuerKeyCommitment: signed.issuerKeyCommitment }],
    logic: duo
  });
  const scope = artifacts.predicates.scopeParameters;
  const zeros = Array(5).fill('0');
  const paramsCommitment = await calculateParamsCommitment({
    predicateTypes: scope.predicateTypes,
    predicateSchemaTags: scope.predicateSchemaTags,
    scopeKinds: scope.scopeKinds,
    approvedScopeIds: scope.approvedScopeIds,
    credPublicKeys: scope.credPublicKeys,
    merkleRoots: zeros,
    rangeMin: zeros,
    rangeMax: zeros,
    ontologyPolicyIds: zeros,
    ontologyEpochs: zeros,
    policyValidFromEpoch: 0,
    policyValidUntilEpoch: 4294967295
  });
  const input = createCircuitInput(artifacts.policyCommitment, {
    policy: artifacts.policy,
    randomizer: BigInt(artifacts.randomizer),
    numOperations: artifacts.numOperations,
    requesterAttrs: [0, 0, 0, 0, 0, 0],
    predicateTypes: scope.predicateTypes,
    predicateSchemaTags: scope.predicateSchemaTags,
    scopeKinds: scope.scopeKinds,
    approvedScopeIds: scope.approvedScopeIds,
    credPublicKeys: scope.credPublicKeys,
    credSignatures: [signed.S, '0', '0', '0', '0'],
    credSigR8x: [signed.R8x, '0', '0', '0', '0'],
    credSigR8y: [signed.R8y, '0', '0', '0', '0'],
    credIssuerAx: [signed.issuerAx, '0', '0', '0', '0'],
    credIssuerAy: [signed.issuerAy, '0', '0', '0', '0'],
    credValidFromEpochs: ['90', '0', '0', '0', '0'],
    credValidUntilEpochs: ['110', '0', '0', '0', '0'],
    credentialIds: [credentialId.toString(), '0', '0', '0', '0'],
    holderSecret,
    idReq: requesterId,
    idRes: 77,
    nonce: 88,
    requestEpoch: 100,
    paramsCommitment,
    contextHash: await calculateContextHash(requesterId, 77, 88)
  });
  return { input, requesterId, scopeId, signed };
}

describe('signed scoped credentials (US / PS / IS)', function () {
  this.timeout(120_000);

  before(function () {
    if (!fs.existsSync(WASM)) this.skip();
  });

  it('accepts issuer-signed, holder-bound US, PS and IS credentials', async function () {
    for (const [duo, scopeKind] of [['US', 26], ['PS', 27], ['IS', 28]]) {
      const { input } = await scopedInput(duo, scopeKind);
      await snarkjs.wtns.calculate(input, WASM, { type: 'mem' });
    }
  });

  it('rejects a wrong holder secret, signature, issuer key, scope kind or US scope ID', async function () {
    const { input, requesterId, signed } = await scopedInput('US', 26);
    const invalidInputs = [
      { ...input, holderSecret: '123' },
      { ...input, credSignatures: ['1', '0', '0', '0', '0'] },
      { ...input, credIssuerAx: ['1', '0', '0', '0', '0'] },
      { ...input, scopeKinds: [27, 0, 0, 0, 0] },
      { ...input, approvedScopeIds: [(BigInt(requesterId) + 1n).toString(), '0', '0', '0', '0'] }
    ];
    expect(signed.issuerKeyCommitment).to.not.equal('0');
    for (const candidate of invalidInputs) {
      let rejected = false;
      const originalError = console.error;
      console.error = () => {};
      try { await snarkjs.wtns.calculate(candidate, WASM, { type: 'mem' }); } catch (_) { rejected = true; }
      finally { console.error = originalError; }
      expect(rejected).to.equal(true);
    }
  });

  it('uses a separate domain and schema for scoped credentials', async function () {
    let rejected = false;
    try {
      await calculateScopedCredentialDigest({
        schemaTag: 1001,
        scopeKind: 28,
        requesterId: 1,
        scopeId: 1001,
        validFromEpoch: 1,
        validUntilEpoch: 2,
        credentialId: 3
      });
    } catch (err) {
      rejected = err.message.includes('schemaTag must be 2002');
    }
    expect(rejected).to.equal(true);
  });
});
