'use strict';

/**
 * DUO V3 complex policies: 3-5 term conjunctions / disjunctions with
 * parentheses, operator precedence, the 61-token all-slots policy and bare
 * predicate tokens.
 * Measured (94k-constraint build, Apple M1): core tier = 4 proofs, ~30 s.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const H = require('./helpers/duo_v3_harness');
const { COMPLEX } = require('./helpers/duo_v3_cases');

describe('DUO V3 complex policies (witness + proof + chain)', function () {
  this.timeout(240_000);
  const env = {};

  before(async function () {
    if (!H.wasmAvailable() || (!H.WITNESS_ONLY && !H.circuitAvailable())) {
      console.log('Skipping DUO V3 complex suite: circuit artefacts missing.');
      this.skip();
    }
    env.fixtures = await H.buildTermFixtures();
    if (!H.WITNESS_ONLY) env.stack = await H.deployStack(ethers);
  });

  after(H.summarizeTimings);

  const extras = {
    'C6-max': ({ ctx }) => {
      it('enables all 11 predicate slots', function () {
        expect(ctx().material.predicateTypes).to.deep.equal([3, 3, 3, 3, 3, 8, 8, 8, 6, 7, 9]);
        expect(ctx().artifacts.tokens).to.have.length(61);
      });
    }
  };

  for (const c of COMPLEX) H.registerCase({ ...c, extra: extras[c.id] }, env);

  describe('C5: operator precedence (witness only)', function () {
    // AND binds tighter than OR: `DS OR RS AND HMB` == `DS OR (RS AND HMB)`.
    const profile = () => H.resolveProfile({ flip: ['RS', 'HMB'] }); // DS member, RS non-member, health=0
    it('DS OR RS AND HMB grants through the DS branch', async function () {
      const ctx = await H.compilePolicy('DS OR RS AND HMB', env.fixtures);
      expect(ctx.artifacts.tokens).to.deep.equal([1, 13, 24, 2, 14, 24, 6, 23, 24, 24, 25]);
      await H.expectDecision(ctx, profile(), env.fixtures, 1n);
    });
    it('(DS OR RS) AND HMB denies because HMB fails', async function () {
      const ctx = await H.compilePolicy('(DS OR RS) AND HMB', env.fixtures);
      expect(ctx.artifacts.tokens).to.deep.equal([1, 13, 24, 2, 14, 24, 25, 6, 23, 24, 24]);
      await H.expectDecision(ctx, profile(), env.fixtures, 0n);
    });
    it('symbol operators (&, |) and keyword operators compile identically', async function () {
      const a = await H.compilePolicy('(DS | RS) & HMB', env.fixtures);
      const b = await H.compilePolicy('(DS OR RS) AND HMB', env.fixtures);
      expect(a.artifacts.tokens).to.deep.equal(b.artifacts.tokens);
    });
  });

  describe('C7: bare predicate token (witness only)', function () {
    it('P[ICD10] AND HMB grants on membership alone, without the DS attribute', async function () {
      const ctx = await H.compilePolicy('P[ICD10] AND HMB', env.fixtures);
      expect(ctx.artifacts.tokens).to.deep.equal([13, 6, 23, 24, 24]);
      await H.expectDecision(ctx, H.resolveProfile({ flip: ['DS'], variant: 'attr' }), env.fixtures, 1n);
      await H.expectDecision(ctx, H.resolveProfile({ flip: ['DS'] }), env.fixtures, 0n);
    });
  });
});
