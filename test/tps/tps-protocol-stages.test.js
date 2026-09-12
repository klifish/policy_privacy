'use strict';

/**
 * TPS protocol stages against the production DUO V3 circuit (N=13, M=11).
 * The test derives material and evidence from the DUO harness so its proof
 * inputs cannot regress to the retired 6x5 prototype layout.
 */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const store = require('../../tps/store');
const { buildWitness } = require('../../tps/proofGenerator');
const H = require('../duo/helpers/duo_v3_harness');

describe('TPS-ZKPI Workflow', function () {
  this.timeout(180_000);

  let fixtures;
  let ctx;
  let stack;

  before(async function () {
    if (!H.circuitAvailable() || !H.wasmAvailable()) this.skip();
    fixtures = await H.buildTermFixtures();
    ctx = await H.compilePolicy('DS', fixtures);
    stack = await H.deployStack(ethers);
  });

  it('Stage 1: compiles a production DUO policy with fixed 13x11 dimensions', () => {
    expect(ctx.artifacts.tokens).to.be.an('array').and.not.empty;
    expect(ctx.material.predicateTypes).to.have.length(H.M);
    expect(ctx.material.predicateTypes[0]).to.equal(3);
    expect(ctx.material.paramsCommitment).to.match(/^\d+$/);
  });

  it('Stage 2: persists policy-bound material without changing its commitment', () => {
    store.provisionPolicy('duo-v3-stage-test', ctx.material);
    const material = store.getPolicyMaterial('duo-v3-stage-test');
    expect(material.paramsCommitment).to.equal(ctx.material.paramsCommitment);
    expect(material.predicateTypes).to.deep.equal(ctx.material.predicateTypes);
  });

  it('Stage 4: constructs a witness with the production circuit shape', async () => {
    const epoch = await H.freshRequestEpoch(ethers);
    const { evidence, idReq } = await H.evidenceFor(ctx, H.BASE_REQUESTER, fixtures, {
      resourceId: 0,
      requestEpoch: epoch
    });
    const witness = buildWitness(ctx.material, evidence, {
      policyCommitment: ctx.artifacts.policyCommitment,
      idReq,
      idRes: 0,
      nonce: 1,
      requestEpoch: epoch
    });

    expect(witness.policy).to.have.length(H.DEPTH);
    expect(witness.requesterAttrs).to.have.length(H.N);
    expect(witness.predicateTypes).to.have.length(H.M);
  });

  it('Stages 3–6: commits, proves, submits, records, and rejects a replay', async () => {
    const submission = await H.proveAndSubmit(stack, ctx, H.BASE_REQUESTER, fixtures, {
      expect: 'grant'
    });
    expect(await stack.contract.isAccessGranted(submission.event.args.requestId)).to.equal(true);

    await expect(stack.contract.connect(stack.tpsSigner).requestAccessBound(
      ctx.policyId,
      ctx.resourceId,
      submission.nonce,
      submission.idReq,
      submission.requestEpoch,
      submission.result.pA,
      submission.result.pB,
      submission.result.pC,
      submission.result.pubSignals
    )).to.be.revertedWith('Nonce already used');
  });
});
