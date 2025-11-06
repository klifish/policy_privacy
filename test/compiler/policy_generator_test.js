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
    expect(artifacts.numAttributes).to.equal(5);
    expect(artifacts.numPredicates).to.equal(2);
    expect(artifacts.numOperations).to.equal(7);
    expect(artifacts.tokens).to.deep.equal([0, 5, 7, 1, 6, 7, 8]);
    expect(artifacts.policy.slice(0, 7)).to.deep.equal([0, 5, 7, 1, 6, 7, 8]);
    expect(new Set(artifacts.policy.slice(7))).to.deep.equal(new Set([0]));

    expect(artifacts.attributes.order).to.deep.equal(['DS', 'RS', 'POA', 'GS', 'CC']);
    expect(artifacts.attributes.bitmap).to.deep.equal([1, 1, 0, 0, 0]);

    expect(artifacts.predicates.slots.map((p) => p.namespace)).to.deep.equal(['ICD10', 'OBI']);
    expect(artifacts.predicates.namespaceToSlot).to.deep.equal({ ICD10: 0, OBI: 1 });

    expect(artifacts.logic.normalized).to.equal('((DS & P[ICD10]) | (RS & P[OBI]))');
    expect(artifacts.logic.rpn).to.deep.equal(['DS', 'P[ICD10]', 'AND', 'RS', 'P[OBI]', 'AND', 'OR']);

    expect(artifacts.operators).to.deep.equal({ AND: 7, OR: 8, NOT: 9 });

    expect(artifacts.randomizer).to.equal(randomizerHex.toLowerCase());
    expect(artifacts.policyCommitment).to.match(/^0x[0-9a-f]+$/);
    expect(artifacts.policyHash).to.match(/^0x[0-9a-f]+$/);

    const commitmentDecimal = await calculatePolicyCommitment(artifacts.policy, BigInt(randomizerHex));
    const expectedCommitmentHex = '0x' + BigInt(commitmentDecimal).toString(16);
    expect(artifacts.policyCommitment).to.equal(expectedCommitmentHex);
  });

  // it('auto-binds attributes to predicates when logic omits P[...]', async function () {
  //   const config = {
  //     ...makeSampleConfig(),
  //     logic: 'DS | RS'
  //   };
  //   const artifacts = await generatePolicyArtifacts(config, {
  //     depth: 10,
  //     randomizer: '0x1',
  //     attributeOrder: ['DS', 'RS', 'POA', 'GS', 'CC']
  //   });

  //   expect(artifacts.tokens).to.deep.equal([0, 5, 7, 1, 6, 7, 8]);
  //   expect(artifacts.logic.normalized).to.equal('((DS & P[ICD10]) | (RS & P[OBI]))');
  // });

  // it('throws when a required predicate slot is missing', async function () {
  //   const config = {
  //     policy_id: 'no-predicate',
  //     attributes: { DS: true },
  //     predicates: [
  //       {
  //         slot: 0,
  //         duo: 'RS',
  //         namespace: 'OBI'
  //       }
  //     ],
  //     logic: 'DS'
  //   };

  //   try {
  //     await generatePolicyArtifacts(config, { depth: 10, randomizer: '0x2' });
  //     throw new Error('Expected generatePolicyArtifacts to throw');
  //   } catch (err) {
  //     expect(err).to.be.instanceOf(Error);
  //     expect(err.message).to.match(/No predicate slot declared for namespace ICD10/);
  //   }
  // });

  // it('supports custom attribute order with non-ontology attributes', async function () {
  //   const config = {
  //     policy_id: 'general-research',
  //     attributes: { GR: true, DS: false, RS: false },
  //     predicates: [
  //       { slot: 0, duo: 'DS', namespace: 'ICD10' },
  //       { slot: 1, duo: 'RS', namespace: 'OBI' }
  //     ],
  //     logic: 'GR'
  //   };

  //   const artifacts = await generatePolicyArtifacts(config, {
  //     depth: 6,
  //     randomizer: '0x10',
  //     attributeOrder: ['GR', 'DS', 'RS']
  //   });

  //   expect(artifacts.numAttributes).to.equal(3);
  //   expect(artifacts.numPredicates).to.equal(2);
  //   expect(artifacts.tokens.slice(0, 1)).to.deep.equal([0]);
  //   expect(artifacts.attributes.requiresPredicateByCode.GR).to.equal(false);
  //   expect(artifacts.logic.normalized).to.equal('GR');
  // });
});
