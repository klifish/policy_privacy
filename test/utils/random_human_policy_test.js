'use strict';

const { expect } = require('chai');

const {
  generateRandomHumanPolicy,
  generateRandomPolicyArtifacts
} = require('../../utils/policy/random_human_policy');

describe('random_human_policy generator', function () {
  this.timeout(10000);

  it('produces a valid author-facing policy JSON object', function () {
    const policy = generateRandomHumanPolicy({ seed: 42, attributeOrder: ['GR', 'DS', 'RS', 'POA'] });

    expect(policy).to.have.property('policy_id').that.is.a('string');
    expect(policy).to.have.property('attributes').that.is.an('object');
    expect(policy).to.have.property('predicates').that.is.an('array');
    expect(policy).to.have.property('logic').that.is.a('string');
    expect(policy).to.have.property('attribute_order').that.is.an('array');

    const activeAttributes = Object.entries(policy.attributes)
      .filter(([, value]) => Boolean(value))
      .map(([code]) => code);

    expect(activeAttributes.length).to.be.greaterThan(0);

    policy.predicates.forEach((predicate, idx) => {
      expect(predicate).to.have.property('slot').that.equals(idx);
      expect(activeAttributes).to.include(predicate.duo);
      expect(predicate).to.have.property('namespace').that.is.a('string');
      expect(predicate).to.have.property('root').that.matches(/^0x[0-9a-f]+$/i);
    });

    const logicTokens = policy.logic.match(/[A-Z]{2,}/g) || [];
    logicTokens.forEach((token) => {
      expect(policy.attributes).to.have.property(token);
    });
  });

  it('produces compilable artifacts', async function () {
    const { authorPolicy, artifacts } = await generateRandomPolicyArtifacts({
      seed: 'policy-seed',
      attributeOrder: ['GR', 'DS', 'RS', 'POA'],
      depth: 10
    });


    expect(artifacts.tokens.length).to.equal(artifacts.numOperations);
    expect(artifacts.policy).to.be.an('array').with.lengthOf(10);
    expect(artifacts.policyCommitment).to.match(/^0x[0-9a-f]+$/i);

    const activeAttributes = Object.entries(authorPolicy.attributes)
      .filter(([, value]) => Boolean(value))
      .map(([code]) => code);

    authorPolicy.predicates.forEach((predicate) => {
      expect(activeAttributes).to.include(predicate.duo);
    });
  });
});
