const { expect } = require('chai');
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');
const { calculatePolicyCommitment, calculateParamsCommitment, calculateContextHash, calculateInstitutionalApprovalDigest } = require('../lib/prover');
const { deriveIssuerKey, signCredential } = require('./utils/proofGenerator');

const WASM = path.resolve(__dirname, '../build/circuits/policy_privacy_main_instance_js/policy_privacy_main_instance.wasm');
const PRIVATE_KEY = Buffer.from('0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20', 'hex');

describe('V2 typed institutional approval', function () {
  it('binds issuer approval to requester, resource, purpose, policy, and epoch', async function () {
    if (!fs.existsSync(WASM)) this.skip();
    const idReq = 7n, idRes = 8n, nonce = 9n, purposeCode = 77n, approvalId = 42n;
    const requestEpoch = BigInt(Math.floor(Date.now() / 3_600_000));
    const policy = [6, ...Array(19).fill(0)]; // first external predicate slot
    const policyCommitment = await calculatePolicyCommitment(policy, 123n, 1);
    const issuer = await deriveIssuerKey(PRIVATE_KEY);
    const digest = await calculateInstitutionalApprovalDigest({
      policyCommitment, requesterId: idReq, resourceId: idRes, purposeCode,
      validFromEpoch: requestEpoch - 1n, validUntilEpoch: requestEpoch + 1n, approvalId
    });
    const signature = await signCredential(PRIVATE_KEY, digest);
    const paramsCommitment = await calculateParamsCommitment({
      predicateTypes: [1, 4, 4, 4, 4], predicateSchemaTags: [1001, 0, 0, 0, 0],
      credPublicKeys: [issuer.committed, 0, 0, 0, 0],
      policyValidFromEpoch: 0, policyValidUntilEpoch: 4294967295
    });
    const input = {
      policy, requesterAttrs: [0, 0, 0, 0, 0, 0], predicateTypes: [1, 4, 4, 4, 4],
      predicateSchemaTags: [1001, 0, 0, 0, 0], merkleLeaves: [0, 0, 0, 0, 0],
      merklePathElements: Array.from({ length: 5 }, () => Array(8).fill(0)),
      merklePathIndices: Array.from({ length: 5 }, () => Array(8).fill(0)),
      credSignatures: [signature.S, 0, 0, 0, 0], credSigR8x: [signature.R8x, 0, 0, 0, 0],
      credSigR8y: [signature.R8y, 0, 0, 0, 0], credIssuerAx: [issuer.Ax, 0, 0, 0, 0],
      credIssuerAy: [issuer.Ay, 0, 0, 0, 0], rangeValues: [0, 0, 0, 0, 0], ontologyCodes: [0, 0, 0, 0, 0],
      purposeCode, credValidFromEpochs: [requestEpoch - 1n, 0, 0, 0, 0],
      credValidUntilEpochs: [requestEpoch + 1n, 0, 0, 0, 0], approvalIds: [approvalId, 0, 0, 0, 0],
      randomizer: 123n, numOperations: 1, idReq, idRes, nonce, policyCommitment, paramsCommitment,
      contextHash: await calculateContextHash(idReq, idRes, nonce), requestEpoch,
      merkleRoots: [0, 0, 0, 0, 0], credPublicKeys: [issuer.committed, 0, 0, 0, 0],
      rangeMin: [0, 0, 0, 0, 0], rangeMax: [0, 0, 0, 0, 0], ontologyPolicyIds: [0, 0, 0, 0, 0], ontologyEpochs: [0, 0, 0, 0, 0],
      policyValidFromEpoch: 0, policyValidUntilEpoch: 4294967295
    };
    await snarkjs.wtns.calculate(input, WASM, { type: 'mem' });
    for (const tampered of [
      { ...input, purposeCode: purposeCode + 1n },
      { ...input, predicateSchemaTags: [1002, 0, 0, 0, 0] },
      { ...input, predicateTypes: [0, 4, 4, 4, 4] }
    ]) {
      let rejected = false;
      const originalError = console.error;
      console.error = () => {};
      try { await snarkjs.wtns.calculate(tampered, WASM, { type: 'mem' }); } catch (_) { rejected = true; }
      finally { console.error = originalError; }
      expect(rejected).to.equal(true);
    }
  });
});
