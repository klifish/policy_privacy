'use strict';

const { expect } = require('chai');
const circomlibjs = require('circomlibjs');
const {
  calculateDuoProfileCredentialDigest,
  signDuoProfileCredential
} = require('../../lib/prover');

describe('DUO_PROFILE credential helpers', function () {
  this.timeout(30_000);

  const fields = Object.freeze({
    policyCommitment: 101,
    requesterId: 202,
    resourceId: 303,
    profileClaims: 3,
    validFromEpoch: 10,
    validUntilEpoch: 20,
    credentialId: 404
  });

  it('binds profile claims to policy, resource and requester', async function () {
    const digest = await calculateDuoProfileCredentialDigest(fields);
    for (const change of [{ policyCommitment: 102 }, { resourceId: 304 }, { requesterId: 203 }, { profileClaims: 1 }]) {
      expect(await calculateDuoProfileCredentialDigest({ ...fields, ...change })).to.not.equal(digest);
    }
  });

  it('signs a verifiable seven-bit profile and rejects malformed claims', async function () {
    const issuer = new Uint8Array(32);
    issuer[0] = 9;
    const signed = await signDuoProfileCredential(issuer, fields);
    const eddsa = await circomlibjs.buildEddsa();
    const valid = eddsa.verifyPoseidon(
      eddsa.babyJub.F.e(BigInt(signed.digest)),
      { R8: [eddsa.babyJub.F.e(BigInt(signed.R8x)), eddsa.babyJub.F.e(BigInt(signed.R8y))], S: BigInt(signed.S) },
      [eddsa.babyJub.F.e(BigInt(signed.issuerAx)), eddsa.babyJub.F.e(BigInt(signed.issuerAy))]
    );
    expect(valid).to.equal(true);
    await expect(calculateDuoProfileCredentialDigest({ ...fields, profileClaims: 128 })).to.be.rejectedWith('7-bit');
  });
});
