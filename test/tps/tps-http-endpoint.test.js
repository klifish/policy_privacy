'use strict';

/** HTTP integration coverage for production DUO V3 TPS provisioning/proving. */

const { expect } = require('chai');
const { ethers } = require('hardhat');
const express = require('express');
const request = require('supertest');
const tpsRouter = require('../../tps/server');
const store = require('../../tps/store');
const H = require('../duo/helpers/duo_v3_harness');
const { calculateContextHash } = require('../../lib/prover');

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
    const { evidence } = await H.evidenceFor(ctx, H.BASE_REQUESTER, fixtures, {
      resourceId,
      requestEpoch: epoch
    });
    // The TPS derives the pseudonym from the holder secret for every policy.
    return { ...evidence, holderSecret: fixtures.holders[H.BASE_REQUESTER.holder].toString() };
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
    // Unpadded submissions carry a fixed gasLimit rather than an estimate, so
    // the public gasLimit does not copy the access gas.
    expect(tx.gasLimit).to.equal(980000n);
  });

  it('re-proves when the hour boundary is crossed between the pre-check and mining', async () => {
    // Advance the chain into the next hour only when the access tx is sent,
    // i.e. after the server's epoch pre-check has already passed. The ACM then
    // rejects the proof's stale bucket and the server must re-prove for the
    // hour the chain is now in instead of failing the request.
    const real = stack.contract.connect(stack.tpsSigner);
    const sends = [];
    const contract = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'requestAccessBound' || prop === 'requestAccessBoundWithGasPad') {
          return async (...args) => {
            sends.push(args[4]);   // requestEpoch argument
            if (sends.length === 1) {
              await ethers.provider.send('evm_increaseTime', [3600]);
              await ethers.provider.send('evm_mine', []);
            }
            return target[prop](...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    const before = BigInt(Math.floor(Date.now() / 3_600_000));
    const res = await request(buildTestApp(contract))
      .post('/tps/prove')
      .send(proveBody(await validEvidence(), { submitOnChain: true }));
    expect(res.status).to.equal(200);
    expect(res.body.chainResult.isGranted).to.equal(true);
    expect(sends).to.have.length(2);
    expect(BigInt(sends[1])).to.equal(BigInt(sends[0]) + 1n);
    expect(BigInt(res.body.requestEpoch)).to.be.at.least(before + 1n);
    expect(BigInt(res.body.pubSignals[4])).to.equal(BigInt(res.body.requestEpoch));
  });

  it('re-proves when the failed access tx itself is the first block of the next hour', async () => {
    // The pre-check sees the last block of an hour; the access tx is then
    // mined as the first block of the next hour and reverts. The server must
    // take the new hour from the block that mined the failed tx, since the
    // latest-block read can still report the old hour.
    const real = stack.contract.connect(stack.tpsSigner);
    const sends = [];
    const contract = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'requestAccessBound' || prop === 'requestAccessBoundWithGasPad') {
          return async (...args) => {
            sends.push(args[4]);   // requestEpoch argument
            if (sends.length === 1) {
              const nextHour = (Number(args[4]) + 1) * 3600;
              await ethers.provider.send('evm_setNextBlockTimestamp', [nextHour]);
            }
            return target[prop](...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      }
    });
    const res = await request(buildTestApp(contract))
      .post('/tps/prove')
      .send(proveBody(await validEvidence(), { submitOnChain: true }));
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).to.equal(200);
    expect(res.body.chainResult.isGranted).to.equal(true);
    expect(sends).to.have.length(2);
    expect(BigInt(sends[1])).to.equal(BigInt(sends[0]) + 1n);
  });

  it('rejects a replay before generating another proof', async () => {
    const app = buildTestApp();
    const body = proveBody(await validEvidence());
    expect((await request(app).post('/tps/prove').send(body)).status).to.equal(200);
    const replay = await request(app).post('/tps/prove').send(body);
    expect(replay.status).to.equal(409);
    expect(replay.body.error).to.include('replay rejected');
  });

  it('derives the requester pseudonym from the holder secret and ignores a supplied one', async () => {
    const evidence = { ...(await validEvidence()), requesterId: '111' };
    const res = await request(buildTestApp()).post('/tps/prove').send(proveBody(evidence));
    expect(res.status).to.equal(200);
    const expected = await calculateContextHash(
      BigInt(fixtures.requesterIds[H.BASE_REQUESTER.holder]), BigInt(resourceId), BigInt(nonce)
    );
    expect(BigInt(res.body.pubSignals[3])).to.equal(expected);

    const { holderSecret, ...withoutSecret } = await validEvidence();
    const missing = await request(buildTestApp()).post('/tps/prove').send(proveBody(withoutSecret));
    expect(missing.status).to.equal(400);
    expect(missing.body.error).to.include('holderSecret');
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
