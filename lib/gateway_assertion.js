'use strict';

// Short-lived, authenticated assertion sent only from the controlled-delivery
// gateway to the TPS. It prevents a browser from selecting its own requester
// pseudonym when it asks the TPS to submit an on-chain request.
const crypto = require('crypto');

function requireSecret(secret) {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('GATEWAY_TPS_SHARED_SECRET must be configured (at least 32 characters)');
  }
  return secret;
}

function signGatewayAssertion({ requesterId, ttlMs = 60_000, secret, now = Date.now() }) {
  const payload = { requesterId: String(requesterId), exp: now + ttlMs, nonce: crypto.randomUUID() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', requireSecret(secret)).update(encoded).digest('base64url');
  return `${encoded}.${mac}`;
}

function verifyGatewayAssertion(token, { secret, now = Date.now() } = {}) {
  if (typeof token !== 'string') throw new Error('Gateway identity assertion is required');
  const [encoded, suppliedMac, extra] = token.split('.');
  if (!encoded || !suppliedMac || extra) throw new Error('Malformed gateway identity assertion');
  const expectedMac = crypto.createHmac('sha256', requireSecret(secret)).update(encoded).digest('base64url');
  const supplied = Buffer.from(suppliedMac);
  const expected = Buffer.from(expectedMac);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    throw new Error('Invalid gateway identity assertion');
  }
  let payload;
  try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch (_) {
    throw new Error('Malformed gateway identity assertion');
  }
  if (!payload || !/^\d+$/.test(String(payload.requesterId)) || !Number.isSafeInteger(payload.exp) || payload.exp <= now) {
    throw new Error('Expired or invalid gateway identity assertion');
  }
  return { requesterId: String(payload.requesterId), nonce: String(payload.nonce || '') };
}

module.exports = { signGatewayAssertion, verifyGatewayAssertion };
