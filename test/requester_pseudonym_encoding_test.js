'use strict';

// The requester pseudonym travels in access-transaction calldata. If its
// encoding depended on whether the policy uses a profile credential, a
// public-chain observer could read that bit from the bytes, and gas padding
// would only hide its calldata-pricing side effect. The generator must
// therefore derive every pseudonym as Poseidon(holderSecret).

const { expect } = require('chai');

const { buildDuoV3RequesterEvidence } = require('../experiments/core/data_generator');
const { DUO_V3_M, DUO_V3_PROFILE_SLOT } = require('../lib/duo_v3');
const { calculateRequesterId } = require('../lib/prover');

const SAMPLES = 16;

function policyData(usesProfile) {
  const predicateTypes = Array(DUO_V3_M).fill(0);
  if (usesProfile) predicateTypes[DUO_V3_PROFILE_SLOT] = 9;
  return {
    predicateParameters: { predicateTypes },
    predicateEvidenceBySlot: {},
    requesterAttrs: [],
    duoProfileClaims: usesProfile ? 75 : 0
  };
}

async function pseudonyms(usesProfile) {
  const out = [];
  for (let i = 0; i < SAMPLES; i++) {
    const evidence = await buildDuoV3RequesterEvidence(policyData(usesProfile), {
      resourceId: 1n,
      policyCommitment: 1n
    });
    out.push(evidence);
  }
  return out;
}

describe('Requester pseudonym encoding', function () {
  this.timeout(120000);

  it('uses full-width field elements for policies with and without a profile credential', async () => {
    for (const usesProfile of [false, true]) {
      for (const evidence of await pseudonyms(usesProfile)) {
        // A 128-bit pseudonym leaves 16 zero bytes in its 32-byte word.
        // Poseidon outputs fall below 2^200 with probability about 2^-54.
        expect(BigInt(evidence.requesterId) >= (1n << 200n), `usesProfile=${usesProfile}`).to.equal(true);
      }
    }
  });

  it('sends the TPS the secret the pseudonym is derived from, for every policy', async () => {
    // The TPS rejects a zero secret and derives the pseudonym itself; it zeroes
    // the witness secret for policies without a holder-bound slot.
    for (const usesProfile of [false, true]) {
      for (const evidence of await pseudonyms(usesProfile)) {
        expect(evidence.holderSecret).to.not.equal('0');
        expect(await calculateRequesterId(evidence.holderSecret)).to.equal(evidence.requesterId);
      }
    }
  });
});
