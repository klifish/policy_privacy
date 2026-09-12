'use strict';

/** HTTP integration coverage for production DUO V3 TPS provisioning/proving. */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const express = require('express');
const request = require('supertest');
const tpsRouter = require('../../tps/server');
const store = require('../../tps/store');
const H = require('../duo/helpers/duo_v3_harness');

function buildTestApp(tpsContract) {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/tps', tpsRouter);
  if (tpsContract) app.locals.tpsContract = tpsContract;
  return app;
}

function buildProvisionMaterial({ slot = 5, scopeKind = 26, scopeId = 0 } = {}) {
  const size = 11;
  const material = {
    penc: [0], randomizer: '1', paramsCommitment: '1', numOperations: 1,
    predicateTypes: Array(size).fill(4), predicateSchemaTags: Array(size).fill(0),
    scopeKinds: Array(size).fill(0), approvedScopeIds: Array(size).fill('0'),
    merkleRoots: Array(size).fill('0'), credPublicKeys: Array(size).fill('0'),
    rangeMin: Array(size).fill('0'), rangeMax: Array(size).fill('0'),
    ontologyPolicyIds: Array(size).fill('0'), ontologyEpochs: Array(size).fill('0'),
    policyValidFromEpoch: 0, policyValidUntilEpoch: 4294967295,
    moratoriumUntilEpoch: 0, timeLimitEpochs: 0
  };
  material.predicateTypes[slot] = 8;
  material.predicateSchemaTags[slot] = 2005;
  material.scopeKinds[slot] = scopeKind;
  material.approvedScopeIds[slot] = String(scopeId);
  material.merkleRoots[slot] = '1';
  return material;
}

describe('TPS HTTP endpoints', function () {
  this.timeout(180_000);

  let fixtures;
  let ctx;
  let stack;
  let policyId;
  let resourceId;
  let nonce = 50_000n;

  const nextNonce = () => String(++nonce);

  before(async function () {
    if (!H.circuitAvailable() || !H.wasmAvailable()) this.skip();
    fixtures = await H.buildTermFixtures();
    ctx = await H.compilePolicy('DS', fixtures);
    stack = await H.deployStack(ethers);
    ({ policyId, resourceId } = await H.commitAndRegister(stack, ctx));
    store.provisionPolicy(policyId.toString(), ctx.material);
  });

  async function validEvidence() {
    const epoch = BigInt(Math.floor(Date.now() / 3_600_000));
    const { evidence, idReq } = await H.evidenceFor(ctx, H.BASE_REQUESTER, fixtures, {
      resourceId,
      requestEpoch: epoch
    });
    return { ...evidence, requesterId: idReq.toString() };
  }

  function proveBody(evidence, extra = {}) {
    return {
      policyId: policyId.toString(), resourceId: resourceId.toString(), nonce: nextNonce(),
      policyCommitment: ctx.artifacts.policyCommitment.toString(), evidence, ...extra
    };
  }

  describe('DUO V3 provisioning validation', () => {
    it('accepts US requester-allowlist metadata only in the US slot', async () => {
      const res = await request(buildTestApp()).post('/tps/provision').send({
        policyId: 'scope-slot-valid', material: buildProvisionMaterial()
      });
      expect(res.status).to.equal(200);
      expect(res.body.ok).to.equal(true);
    });

    it('rejects PS metadata provisioned in the US slot', async () => {
      const res = await request(buildTestApp()).post('/tps/provision').send({
        policyId: 'scope-slot-mismatch', material: buildProvisionMaterial({ scopeKind: 27, scopeId: 9001 })
      });
      expect(res.status).to.equal(400);
      expect(res.body.error).to.include('requester allowlist metadata is invalid at slot 5');
    });
  });

  it('returns a proof but no chain result in proof-oracle mode', async () => {
    const res = await request(buildTestApp()).post('/tps/prove').send(proveBody(await validEvidence()));
    expect(res.status).to.equal(200);
    expect(res.body.pA).to.have.length(2);
    expect(res.body.pubSignals).to.have.length(5);
    expect(res.body.chainResult).to.equal(null);
  });

  it('submits a valid proof on-chain using the TPS signer', async () => {
    const res = await request(buildTestApp(stack.contract.connect(stack.tpsSigner)))
      .post('/tps/prove')
      .send(proveBody(await validEvidence(), { submitOnChain: true }));
    expect(res.status).to.equal(200);
    expect(res.body.chainResult.isGranted).to.equal(true);
    const tx = await ethers.provider.getTransaction(res.body.chainResult.transactionHash);
    expect(tx.from.toLowerCase()).to.equal(stack.tpsSigner.address.toLowerCase());
  });

  it('rejects a replay before generating another proof', async () => {
    const app = buildTestApp();
    const body = proveBody(await validEvidence());
    expect((await request(app).post('/tps/prove').send(body)).status).to.equal(200);
    const replay = await request(app).post('/tps/prove').send(body);
    expect(replay.status).to.equal(409);
    expect(replay.body.error).to.include('replay rejected');
  });

  it('requires material and complete proof context', async () => {
    const app = buildTestApp();
    expect((await request(app).post('/tps/prove').send({})).status).to.equal(400);
    const body = proveBody(await validEvidence());
    body.policyId = 'unprovisioned-policy';
    const missing = await request(app).post('/tps/prove').send(body);
    expect(missing.status).to.equal(404);
  });
});
