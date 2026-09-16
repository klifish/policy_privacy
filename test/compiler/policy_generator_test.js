'use strict';

const { expect } = require('chai');

const { generatePolicyArtifacts } = require('../../compiler/policy_generator');
const { calculatePolicyCommitment } = require('../utils/proofGenerator');

function makeSampleConfig() {
  return {
    policy_id: 'policy-123',
    dataset_id: 'dataset-xyz',
    attributes: {
      DS: true,
      RS: true,
      POA: false,
      GS: false,
      CC: false
    },
    predicates: [
      {
        slot: 0,
        duo: 'DS',
        namespace: 'ICD10',
        root: '0xabc',
        description: 'ICD-10 whitelist for DS'
      },
      {
        slot: 1,
        duo: 'RS',
        namespace: 'OBI',
        root: '0xdef',
        description: 'OBI whitelist for RS'
      }
    ]
  };
}

async function expectRejected(promise, pattern) {
  try {
    await promise;
  } catch (error) {
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.match(pattern);
    return;
  }
  throw new Error(`Expected rejection matching ${pattern}`);
}

function expectProgramShape(artifacts, depth) {
  expect(artifacts.tokens.length).to.equal(artifacts.numOperations);
  expect(artifacts.policy).to.have.lengthOf(depth);
  expect(artifacts.policy.slice(0, artifacts.numOperations)).to.deep.equal(artifacts.tokens);
  expect(artifacts.policy.slice(artifacts.numOperations).every((token) => token === 0)).to.equal(true);
}

describe('policy_generator', function () {
  this.timeout(20000);

  it('produces expected tokens and metadata for explicit predicate logic', async function () {
    const config = {
      ...makeSampleConfig(),
      logic: '(DS & P[ICD10]) | (RS & P[OBI])'
    };

    const randomizerHex = '0x12345';
    const artifacts = await generatePolicyArtifacts(config, {
      depth: 10,
      randomizer: randomizerHex,
      attributeOrder: ['DS', 'RS', 'POA', 'GS', 'CC']
    });

    expect(artifacts.policyId).to.equal('policy-123');
    expect(artifacts.datasetId).to.equal('dataset-xyz');
    expect(artifacts.depth).to.equal(10);
    expect(artifacts.numAttributes).to.equal(13);
    expect(artifacts.numPredicates).to.equal(11);
    expect(artifacts.numOperations).to.equal(7);
    expect(artifacts.tokens).to.deep.equal([1, 13, 24, 2, 14, 24, 25]);
    expect(artifacts.policy.slice(0, 7)).to.deep.equal([1, 13, 24, 2, 14, 24, 25]);
    expect(new Set(artifacts.policy.slice(7))).to.deep.equal(new Set([0]));

    expect(artifacts.attributes.order).to.deep.equal(['DS', 'RS', 'POA', 'GS', 'CC']);
    expect(artifacts.attributes.bitmap).to.deep.equal([1, 1, 0, 0, 0]);

    expect(artifacts.predicates.slots.map((p) => p.namespace)).to.deep.equal(['ICD10', 'OBI']);
    expect(artifacts.predicates.namespaceToSlot).to.deep.equal({ ICD10: 0, OBI: 1 });

    expect(artifacts.logic.normalized).to.equal('((DS & P[ICD10]) | (RS & P[OBI]))');
    expect(artifacts.logic.rpn).to.deep.equal(['DS', 'P[ICD10]', 'AND', 'RS', 'P[OBI]', 'AND', 'OR']);

    expect(artifacts.operators).to.deep.equal({ AND: 24, OR: 25, NOT: 26, TRUE: 27 });

    expectProgramShape(artifacts, 10);

    expect(artifacts.randomizer).to.equal(randomizerHex.toLowerCase());
    expect(artifacts.policyCommitment).to.match(/^0x[0-9a-f]+$/);
    expect(artifacts.policyHash).to.match(/^0x[0-9a-f]+$/);

    // numOperations is part of the commitment preimage, so the independent
    // recomputation must use the same program length the generator recorded.
    const commitmentDecimal = await calculatePolicyCommitment(
      artifacts.policy,
      BigInt(randomizerHex),
      artifacts.numOperations
    );
    const expectedCommitmentHex = '0x' + BigInt(commitmentDecimal).toString(16);
    expect(artifacts.policyCommitment).to.equal(expectedCommitmentHex);
  });

  it('auto-binds ontology predicates when logic omits P[...]', async function () {
    const artifacts = await generatePolicyArtifacts(
      { ...makeSampleConfig(), logic: 'DS | RS' },
      { depth: 10, randomizer: '0x1' }
    );

    expect(artifacts.tokens).to.deep.equal([1, 13, 24, 2, 14, 24, 25]);
    expect(artifacts.logic.normalized).to.equal('((DS & P[ICD10]) | (RS & P[OBI]))');
    expect(artifacts.logic.rpn).to.deep.equal([
      'DS', 'P[ICD10]', 'AND', 'RS', 'P[OBI]', 'AND', 'OR'
    ]);
    expectProgramShape(artifacts, 10);
  });

  it('preserves AND-before-OR precedence and explicit parentheses', async function () {
    const predicates = [
      ...makeSampleConfig().predicates,
      { slot: 2, duo: 'POA', namespace: 'HANCESTRO', root: '0x123' }
    ];

    const defaultPrecedence = await generatePolicyArtifacts(
      { predicates, logic: 'DS | RS & POA' },
      { depth: 16, randomizer: 1 }
    );
    const parenthesized = await generatePolicyArtifacts(
      { predicates, logic: '(DS | RS) & POA' },
      { depth: 16, randomizer: 1 }
    );

    expect(defaultPrecedence.tokens).to.deep.equal([
      1, 13, 24, 2, 14, 24, 3, 15, 24, 24, 25
    ]);
    expect(parenthesized.tokens).to.deep.equal([
      1, 13, 24, 2, 14, 24, 25, 3, 15, 24, 24
    ]);
    expect(defaultPrecedence.tokens).to.not.deep.equal(parenthesized.tokens);
    expect(defaultPrecedence.policyCommitment).to.not.equal(parenthesized.policyCommitment);
  });

  it('keeps production token indexes stable under a custom presentation order', async function () {
    const artifacts = await generatePolicyArtifacts({
      attributes: { DS: true, RS: false },
      predicates: [{ slot: 0, duo: 'DS', namespace: 'ICD10', root: '1' }],
      logic: 'DS'
    }, {
      depth: 6,
      randomizer: '0x10',
      attributeOrder: ['RS', 'DS']
    });

    expect(artifacts.numAttributes).to.equal(13);
    expect(artifacts.numPredicates).to.equal(11);
    expect(artifacts.attributes.order).to.deep.equal(['RS', 'DS']);
    expect(artifacts.attributes.bitmap).to.deep.equal([0, 1]);
    expect(artifacts.tokens).to.deep.equal([1, 13, 24]);
    expectProgramShape(artifacts, 6);
  });

  it('is deterministic for the same policy, depth and randomizer', async function () {
    const config = { ...makeSampleConfig(), logic: 'DS | RS' };
    const options = { depth: 10, randomizer: '0x12345' };

    const first = await generatePolicyArtifacts(config, options);
    const second = await generatePolicyArtifacts(config, options);

    expect(second.tokens).to.deep.equal(first.tokens);
    expect(second.policyHash).to.equal(first.policyHash);
    expect(second.policyCommitment).to.equal(first.policyCommitment);
    expect(second.randomizer).to.equal(first.randomizer);
  });

  it('changes the commitment when the randomizer changes', async function () {
    const config = { ...makeSampleConfig(), logic: 'DS | RS' };
    const first = await generatePolicyArtifacts(config, { depth: 10, randomizer: 1 });
    const second = await generatePolicyArtifacts(config, { depth: 10, randomizer: 2 });

    expect(second.policyHash).to.equal(first.policyHash);
    expect(second.policyCommitment).to.not.equal(first.policyCommitment);
  });

  it('rejects a missing required ontology predicate', async function () {
    await expectRejected(
      generatePolicyArtifacts({ logic: 'DS', predicates: [] }, { depth: 10, randomizer: 2 }),
      /No predicate slot declared for ICD10/
    );
  });

  it('rejects a predicate namespace that does not match its DUO term', async function () {
    await expectRejected(
      generatePolicyArtifacts({
        logic: 'RS',
        predicates: [{ slot: 1, duo: 'RS', namespace: 'ICD10', root: '1' }]
      }, { depth: 10, randomizer: 2 }),
      /namespace mismatch/
    );
  });

  it('rejects invalid and insufficient depths', async function () {
    const config = { ...makeSampleConfig(), logic: 'DS | RS' };

    for (const depth of [0, -1, 1.5]) {
      await expectRejected(
        generatePolicyArtifacts(config, { depth, randomizer: 1 }),
        /depth must be a positive integer/
      );
    }
    await expectRejected(
      generatePolicyArtifacts(config, { depth: 6, randomizer: 1 }),
      /Token sequence length 7 exceeds depth 6/
    );
  });

  it('rejects malformed logic and duplicate terms', async function () {
    await expectRejected(
      generatePolicyArtifacts({ ...makeSampleConfig(), logic: '(DS | RS' }, { randomizer: 1 }),
      /Mismatched parentheses/
    );
    await expectRejected(
      generatePolicyArtifacts({ ...makeSampleConfig(), logic: 'DS & DS' }, { randomizer: 1 }),
      /DUO term DS may appear at most once/
    );
  });

  it('rejects invalid randomizer encodings', async function () {
    const config = { ...makeSampleConfig(), logic: 'DS | RS' };

    await expectRejected(
      generatePolicyArtifacts(config, { randomizer: 'not-a-number' }),
      /Invalid randomizer format/
    );
    await expectRejected(
      generatePolicyArtifacts(config, { randomizer: -1 }),
      /randomizer must be a non-negative finite number/
    );
  });
});
