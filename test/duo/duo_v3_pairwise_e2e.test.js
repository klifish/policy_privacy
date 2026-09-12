'use strict';

/**
 * DUO V3 pairwise combinations: cross-category (profile x ontology x scoped x
 * obligation) and within-category pairs under AND / OR.
 * Obligation-under-OR is a compiler rejection (duo_v3_compiler_rejections).
 * Measured (94k-constraint build, Apple M1): core tier = 25 proofs, ~2.2 min.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const H = require('./helpers/duo_v3_harness');
const { PAIRWISE } = require('./helpers/duo_v3_cases');

describe('DUO V3 pairwise combinations (witness + proof + chain)', function () {
  this.timeout(180_000);
  const env = {};

  before(async function () {
    if (!H.wasmAvailable() || (!H.WITNESS_ONLY && !H.circuitAvailable())) {
      console.log('Skipping DUO V3 pairwise suite: circuit artefacts missing.');
      this.skip();
    }
    env.fixtures = await H.buildTermFixtures();
    if (!H.WITNESS_ONLY) env.stack = await H.deployStack(ethers);
  });

  after(H.summarizeTimings);

  const extras = {
    'P-HMB-AND-NMDS': ({ ctx }) => {
      it('compiles both profile terms against the single credential slot', function () {
        const types = ctx().material.predicateTypes;
        expect(types.filter((t) => t === 9)).to.have.length(1);
        expect(types[H.PROFILE_SLOT]).to.equal(9);
      });
    },
    'P-US-AND-PS': ({ ctx }) => {
      it('enables two allowlist slots sharing one holder secret', function () {
        const types = ctx().material.predicateTypes;
        expect(types[5]).to.equal(8);
        expect(types[6]).to.equal(8);
        expect(ctx().material.scopeKinds.slice(5, 7)).to.deep.equal([26, 27]);
      });
    },
    'P-MOR-AND-TS': ({ ctx, env }) => {
      it('chain: grant starts the TS window and MOR remains an accepted obligation', async function () {
        if (!H.proofTier({ tier: 'core' })) this.skip();
        const c = ctx();
        const idReq = H.requesterIdFor(c, H.resolveProfile({}), env.fixtures);
        const [start, expiry] = await env.stack.contract.getRequesterTimeLimit(c.policyId, idReq);
        expect(expiry - start).to.equal(BigInt(H.TS_EPOCHS));
        expect(await env.stack.contract.getPolicyTimeLimit(c.policyId)).to.equal(BigInt(H.TS_EPOCHS));
      });
    }
  };

  for (const c of PAIRWISE) H.registerCase({ ...c, extra: extras[c.id] }, env);
});
