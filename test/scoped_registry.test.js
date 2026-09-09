'use strict';

const { expect } = require('chai');
const {
  SCOPED_MEMBERSHIP_V1,
  SCOPE_KINDS,
  buildScopedRegistry,
  calculateScopedMembershipLeaf,
  verifyScopedMembershipProof
} = require('../utils/merkle/scoped_registry');
const { ONTOLOGY_TERM_V1, buildWhitelist } = require('../utils/merkle/ontology_whitelist');
const { generatePolicyArtifacts } = require('../compiler/policy_generator');
const { signGatewayAssertion, verifyGatewayAssertion } = require('../lib/gateway_assertion');

describe('US / PS / IS scoped registry', function () {
  this.timeout(30_000);

  it('builds and verifies depth-20 IS membership paths', async function () {
    const registry = await buildScopedRegistry({ records: [{
      scopeKind: 'IS', requesterId: '42', scopeId: '1001',
      validFromEpoch: 900, validUntilEpoch: 1100, recordVersion: 7
    }] });
    const entry = registry.entries[0];
    expect(registry.metadata.merkleLevels).to.equal(20);
    expect(entry.pathElements).to.have.length(20);
    expect(await verifyScopedMembershipProof(entry, registry.metadata.root)).to.equal(true);

    const altered = { ...entry, recordVersion: 8 };
    expect(await verifyScopedMembershipProof(altered, registry.metadata.root)).to.equal(false);
    let usError;
    try {
      await buildScopedRegistry({ records: [{
        scopeKind: 'US', requesterId: 42, scopeId: 43,
        validFromEpoch: 1, validUntilEpoch: 2, recordVersion: 1
      }] });
    } catch (err) { usError = err; }
    expect(usError.message).to.include('US scoped membership requires requesterId to equal scopeId');
  });

  it('uses a domain distinct from ontology terms', async function () {
    const scoped = await calculateScopedMembershipLeaf({
      scopeKind: SCOPE_KINDS.US, requesterId: 42, scopeId: 42,
      validFromEpoch: 1, validUntilEpoch: 2, recordVersion: 1
    });
    const ontology = await buildWhitelist({ merkleLevels: 8, terms: [{ namespace: 'ICD10', termId: 'A01', epoch: 1 }] });
    expect(SCOPED_MEMBERSHIP_V1).to.not.equal(ONTOLOGY_TERM_V1);
    expect(scoped.leaf).to.not.equal(ontology.entries[0].leaf);
  });

  it('compiles direct US / PS / IS logic into scoped type parameters', async function () {
    const artifacts = await generatePolicyArtifacts({
      predicates: [{ slot: 0, duo: 'US', scopeId: '77' }, { slot: 1, duo: 'IS', scopeId: '1001' }],
      logic: 'US AND IS'
    });
    expect(artifacts.predicates.scopeToSlot).to.deep.equal({ US: 0, IS: 1 });
    expect(artifacts.predicates.scopeParameters.scopeKinds).to.deep.equal([26, 28, 0, 0, 0]);
    expect(artifacts.predicates.scopeParameters.approvedScopeIds).to.deep.equal(['77', '1001', '0', '0', '0']);
  });

  it('rejects altered, expired, or malformed gateway assertions', function () {
    const secret = '0123456789abcdef0123456789abcdef';
    const token = signGatewayAssertion({ requesterId: '42', secret, now: 1_000, ttlMs: 1_000 });
    expect(verifyGatewayAssertion(token, { secret, now: 1_500 }).requesterId).to.equal('42');
    expect(() => verifyGatewayAssertion(`${token}x`, { secret, now: 1_500 })).to.throw('Invalid gateway identity assertion');
    expect(() => verifyGatewayAssertion(token, { secret, now: 2_000 })).to.throw('Expired or invalid gateway identity assertion');
  });
});
