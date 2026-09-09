'use strict';

// Local controlled-delivery gateway used by the scoped-restriction prototype.
// It deliberately does not rely on the application's demo auth middleware:
// access requires a fresh wallet-signature challenge mapped to a server-owned
// requester pseudonym.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const { prove } = require('../../lib/tps-client');
const { signGatewayAssertion } = require('../../lib/gateway_assertion');

function createGatewayRouter(options = {}) {
  const router = express.Router();
  const challenges = new Map();
  const sessions = new Map();
  const challengeTtlMs = options.challengeTtlMs ?? 5 * 60 * 1000;
  const sessionTtlMs = options.sessionTtlMs ?? 15 * 60 * 1000;
  const identities = new Map(Object.entries(options.identities || {}).map(([wallet, requesterId]) => [
    wallet.toLowerCase(), String(requesterId)
  ]));
  const auditPath = options.auditPath || path.resolve(process.cwd(), 'runtime', 'gateway-audit.jsonl');
  const tpsSharedSecret = options.tpsSharedSecret || process.env.GATEWAY_TPS_SHARED_SECRET;

  function audit(event, fields = {}) {
    fs.mkdirSync(path.dirname(auditPath), { recursive: true });
    fs.appendFileSync(auditPath, `${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`);
  }

  function sessionFromRequest(req) {
    const value = req.headers.authorization;
    if (!value || !value.startsWith('Bearer ')) return null;
    const session = sessions.get(value.slice(7));
    if (!session || session.expiresAt <= Date.now()) return null;
    return session;
  }

  router.post('/challenge', (req, res) => {
    const wallet = String(req.body.wallet || '').toLowerCase();
    if (!ethers.isAddress(wallet) || !identities.has(wallet)) {
      return res.status(401).json({ error: 'Wallet is not registered with the gateway' });
    }
    const challengeId = crypto.randomUUID();
    const nonce = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + challengeTtlMs;
    const message = `TPS-ZKPI Gateway Authentication v1\nchallenge=${challengeId}\nnonce=${nonce}\nexpiresAt=${expiresAt}`;
    challenges.set(challengeId, { wallet, message, expiresAt });
    res.json({ challengeId, message, expiresAt });
  });

  router.post('/verify', (req, res) => {
    const { challengeId, signature } = req.body;
    const challenge = challenges.get(challengeId);
    challenges.delete(challengeId); // one-time, including failed attempts
    if (!challenge || challenge.expiresAt <= Date.now() || typeof signature !== 'string') {
      audit('authentication_denied', { reason: 'invalid_or_expired_challenge' });
      return res.status(401).json({ error: 'Invalid or expired challenge' });
    }
    let recovered;
    try { recovered = ethers.verifyMessage(challenge.message, signature).toLowerCase(); } catch (_) {
      audit('authentication_denied', { reason: 'invalid_signature' });
      return res.status(401).json({ error: 'Invalid signature' });
    }
    if (recovered !== challenge.wallet) {
      audit('authentication_denied', { reason: 'wallet_mismatch' });
      return res.status(401).json({ error: 'Signature does not match challenged wallet' });
    }
    const token = crypto.randomBytes(32).toString('hex');
    const session = { wallet: recovered, requesterId: identities.get(recovered), expiresAt: Date.now() + sessionTtlMs };
    sessions.set(token, session);
    audit('authentication_granted', { requesterId: session.requesterId });
    return res.json({ token, expiresAt: session.expiresAt, requesterId: session.requesterId });
  });

  router.post('/release', async (req, res, next) => {
    try {
      const session = sessionFromRequest(req);
      const requestId = req.body.requestId;
      if (!session) {
        audit('release_denied', { reason: 'missing_or_expired_session' });
        return res.status(401).json({ error: 'Gateway authentication is required' });
      }
      if (requestId === undefined || requestId === null) return res.status(400).json({ error: 'requestId is required' });
      const record = await req.contract.accessRequests(BigInt(requestId));
      const current = await req.contract.isAuthorizationCurrent(BigInt(requestId));
      if (!current || record.requesterId.toString() !== session.requesterId) {
        audit('release_denied', { requestId: String(requestId), requesterId: session.requesterId, reason: 'authorization_not_current_or_identity_mismatch' });
        return res.status(403).json({ error: 'Current authorization for this authenticated requester is required' });
      }
      audit('release_granted', { requestId: String(requestId), requesterId: session.requesterId });
      return res.json({ requestId: String(requestId), data: { kind: 'simulated-controlled-resource', deliveredAt: new Date().toISOString() } });
    } catch (err) { next(err); }
  });

  // The browser-facing authorization route. requesterId is owned by the
  // authenticated wallet session and cannot be supplied by a client.
  router.post('/request-access', async (req, res, next) => {
    try {
      const session = sessionFromRequest(req);
      const { resourceId, evidence, useGasPad = true } = req.body;
      if (!session) return res.status(401).json({ error: 'Gateway authentication is required' });
      if (resourceId === undefined || resourceId === null || !evidence || !Array.isArray(evidence.attributes)) {
        return res.status(400).json({ error: 'resourceId and evidence.attributes are required' });
      }
      const [policyId] = await req.contract.getResource(BigInt(resourceId));
      const [, policyCommitment] = await req.contract.getPolicy(policyId);
      const nonce = BigInt(`0x${crypto.randomBytes(16).toString('hex')}`).toString();
      const gatewayAssertion = signGatewayAssertion({ requesterId: session.requesterId, secret: tpsSharedSecret });
      const tpsResult = await prove({
        policyId: policyId.toString(), resourceId: String(resourceId), nonce,
        policyCommitment: policyCommitment.toString(),
        evidence: { ...evidence, requesterId: session.requesterId },
        gatewayAssertion, submitOnChain: true, useGasPad
      });
      const { chainResult } = tpsResult;
      audit(chainResult && chainResult.isGranted ? 'authorization_granted' : 'authorization_denied', {
        requesterId: session.requesterId,
        resourceId: String(resourceId),
        requestId: chainResult && chainResult.requestId
      });
      return res.json({
        requestId: chainResult && chainResult.requestId,
        status: chainResult && chainResult.isGranted ? 'granted' : 'denied',
        sessionId: tpsResult.sessionId,
        transactionHash: chainResult && chainResult.transactionHash,
        gasUsed: chainResult && chainResult.gasUsed
      });
    } catch (err) { next(err); }
  });

  router.get('/audit', (req, res) => {
    if (!fs.existsSync(auditPath)) return res.json({ events: [] });
    const events = fs.readFileSync(auditPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    return res.json({ events });
  });

  return router;
}

module.exports = { createGatewayRouter };
