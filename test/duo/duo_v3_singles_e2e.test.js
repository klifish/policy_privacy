'use strict';

/**
 * DUO V3 single-term matrix: every non-procedural term, witness-level
 * grant/deny plus a Groth16 proof + on-chain decision for each.
 *
 * Tiers: DUO_E2E_WITNESS_ONLY=1 (no proofs), default (core), DUO_E2E_FULL=1.
 * Measured (94k-constraint build, Apple M1): core tier = 35 proofs, ~3 min.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const H = require('./helpers/duo_v3_harness');
const { SINGLES } = require('./helpers/duo_v3_cases');
const { generateProof } = require('../../tps/proofGenerator');
const { calculateContextHash } = require('../../lib/prover');

describe('DUO V3 single terms (witness + proof + chain)', function () {
  this.timeout(180_000);
  const env = {};

  before(async function () {
    if (!H.wasmAvailable() || (!H.WITNESS_ONLY && !H.circuitAvailable())) {
      console.log('Skipping DUO V3 single-term suite: circuit artefacts missing.');
      this.skip();
    }
    env.fixtures = await H.buildTermFixtures();
    if (!H.WITNESS_ONLY) env.stack = await H.deployStack(ethers);
  });

  after(H.summarizeTimings);

  const extras = {
    'S-NRES': ({ ctx, env }) => {
      it('witness: rejects non-zero profile claims on a policy without a profile slot', async function () {
        await H.expectWitnessRejected(() => H.witnessDecision(ctx(), H.resolveProfile({}), env.fixtures, {
          mutateInput: (input) => { input.duoProfileClaims = '75'; input.requesterAttrs = H.deriveAttrsFromClaims(75, H.BASE_REQUESTER.attrs); }
        }));
      });
      it('witness: rejects a holder secret on a policy without a holder-bound slot', async function () {
        await H.expectWitnessRejected(() => H.witnessDecision(ctx(), H.resolveProfile({}), env.fixtures, {
          mutateInput: (input) => { input.holderSecret = '101'; }
        }));
      });
    },

    'S-MOR': ({ ctx, env }) => {
      it('witness: MOR is accepted regardless of the request epoch (deadline is an accepted obligation)', async function () {
        await H.expectDecision(ctx(), H.resolveProfile({}), env.fixtures, 1n, { requestEpoch: 50 });
        await H.expectDecision(ctx(), H.resolveProfile({}), env.fixtures, 1n, { requestEpoch: 5_000_000 });
      });
      it('witness: a TS schema tag in the MOR slot evaluates to false', async function () {
        await H.expectDecision(ctx(), H.resolveProfile({}), env.fixtures, 0n, {
          mutateInput: async (input) => { input.predicateSchemaTags[H.OBLIGATION_TERMS.MOR] = 2004; await H.recomputeParamsCommitment(input); }
        });
      });
    },

    'S-TS': ({ ctx, env }) => {
      it('chain: the TS window is enforced half-open and a second requester gets its own window', async function () {
        if (!H.proofTier({ tier: 'core' })) this.skip();
        const { stack, fixtures } = env;
        const c = ctx();
        // A pure TS policy has no holder-bound slot, so the window is keyed by
        // the anonymous requester id the harness presents.
        const aliceId = H.requesterIdFor(c, H.resolveProfile({}), fixtures);
        const [start, expiry] = await stack.contract.getRequesterTimeLimit(c.policyId, aliceId);
        expect(expiry - start).to.equal(BigInt(H.TS_EPOCHS));

        // Move the chain to the expiry epoch. The expiry require precedes proof
        // verification, so a zero proof with a correct context digest suffices.
        await H.setChainEpoch(ethers, expiry);
        const nonce = H.nextNonce();
        const contextHash = await calculateContextHash(aliceId, c.resourceId, nonce);
        await expect(H.submitRaw(stack, {
          policyId: c.policyId, resourceId: c.resourceId, nonce, idReq: aliceId, requestEpoch: expiry,
          pubSignals: [1n, BigInt(c.artifacts.policyCommitment), BigInt(c.material.paramsCommitment), BigInt(contextHash), expiry]
        })).to.be.revertedWith('Time limit expired');

        if (H.FULL) {
          // Pure TS is not holder-bound, so a "second requester" is a different anonymous id.
          const bob = await H.proveAndSubmit(stack, c, H.resolveProfile({ overrides: { holder: 'bob', anonId: '222' } }), fixtures, { expect: 'grant', requestEpoch: expiry });
          expect(await stack.contract.getRequesterTimeLimit(c.policyId, bob.idReq)).to.deep.equal([expiry, expiry + BigInt(H.TS_EPOCHS)]);
        }
      });
    },

    'S-US': ({ ctx, env }) => {
      describe('on-chain negatives (one accepted proof, no re-proving)', function () {
        let c; let stack; let accepted; let nonce; let aliceId; let other;
        before(async function () {
          if (!H.proofTier({ tier: 'core' })) this.skip();
          c = ctx(); stack = env.stack;
          if (c.policyId === undefined) await H.commitAndRegister(stack, c);
          other = await H.compilePolicy('PS', env.fixtures);
          await H.commitAndRegister(stack, other, { uri: 'ipfs://other' });

          const requestEpoch = await H.freshRequestEpoch(ethers);
          nonce = H.nextNonce();
          const { evidence, idReq } = await H.evidenceFor(c, H.resolveProfile({}), env.fixtures, { resourceId: c.resourceId, requestEpoch });
          aliceId = idReq;
          accepted = await generateProof(c.material, evidence, {
            policyCommitment: c.artifacts.policyCommitment, idReq, idRes: c.resourceId, nonce, requestEpoch
          });
          accepted.requestEpoch = requestEpoch;
        });
        const submit = (over = {}) => H.submitRaw(stack, {
          policyId: c.policyId, resourceId: c.resourceId, nonce, idReq: aliceId, requestEpoch: accepted.requestEpoch,
          proof: [accepted.pA, accepted.pB, accepted.pC], pubSignals: accepted.pubSignals, ...over
        });
        it('rejects a proof submitted under another resource', async function () {
          await expect(submit({ resourceId: other.resourceId })).to.be.revertedWith('Resource/policy mismatch');
        });
        it('rejects a proof submitted under another policy (context digest is checked before the commitment)', async function () {
          await expect(submit({ policyId: other.policyId, resourceId: other.resourceId })).to.be.revertedWith('Context binding mismatch');
        });
        it('rejects a stale request epoch', async function () {
          await expect(submit({ requestEpoch: accepted.requestEpoch + 1n })).to.be.revertedWith('Stale request epoch');
        });
        it('rejects a proof presented for another requester', async function () {
          await expect(submit({ idReq: BigInt(env.fixtures.requesterIds.bob) })).to.be.revertedWith('Context binding mismatch');
        });
        it('accepts the proof once and rejects its replay', async function () {
          const receipt = await (await submit()).wait();
          expect(H.parseEvent(stack.contract, receipt, 'AccessGranted')).to.exist;
          await expect(submit()).to.be.revertedWith('Nonce already used');
        });
      });
    }
  };

  for (const c of SINGLES) H.registerCase({ ...c, extra: extras[c.id] }, env);
});
