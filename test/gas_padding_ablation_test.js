'use strict';

const { expect } = require('chai');

const {
  PROTECTION_PROFILES,
  normalizeProtectionProfile
} = require('../experiments/core/data_generator');
const {
  selectPolicies,
  stableEntryIdentity
} = require('../experiments/ablation/gas_padding/prepare');
const {
  evaluateMultiseed
} = require('../experiments/core/multiseed_criterion');

function entry(policyIndex, overrides = {}) {
  return {
    policyIndex,
    policyId: `policy-${policyIndex}`,
    layer: 'layer',
    duoTerm: 0,
    duoTermCodes: ['GR'],
    logicStructure: 'and_only',
    predicateCombo: 'none',
    paramType: 'none',
    randomizer: `r-${policyIndex}`,
    structure: { policyHash: `h-${policyIndex}` },
    ...overrides
  };
}

describe('Gas padding ablation utilities', () => {
  it('defaults to B2 and accepts only declared protection profiles', () => {
    expect(normalizeProtectionProfile()).to.equal(PROTECTION_PROFILES.B2_PADDED);
    expect(normalizeProtectionProfile('b1_unpadded')).to.equal('b1_unpadded');
    expect(() => normalizeProtectionProfile('unknown')).to.throw('Unknown protection profile');
  });

  it('retains all 30-execution policies and deterministically fills label coverage', () => {
    const definitions = [];
    for (let i = 0; i < 30; i++) {
      definitions.push(entry(0));
    }
    for (let policyIndex = 1; policyIndex <= 8; policyIndex++) {
      definitions.push(entry(policyIndex, {
        duoTerm: 1,
        duoTermCodes: ['DS'],
        ontologyNamespace: 'ICD10',
        ontologyValue: 1,
        logicStructure: 'or_only',
        predicateCombo: 'single',
        paramType: 'small'
      }));
    }
    const options = { minRowsPerClass: 8, minPoliciesPerClass: 1 };
    const first = selectPolicies(definitions, options);
    const second = selectPolicies(definitions, options);
    expect(first.indices).to.deep.equal(second.indices);
    expect(first.indices.slice(0, 30)).to.deep.equal([...Array(30).keys()]);
    expect(first.highExecutionPolicies).to.equal(1);
    expect(first.coverage['duo:DS']).to.deep.equal({
      rows: 8,
      policies: 8,
      target: { rows: 8, policies: 1 },
      available: { rows: 8, policies: 8 }
    });
  });

  it('uses stable policy/label identity while ignoring chain-specific fields', () => {
    const base = entry(7);
    expect(stableEntryIdentity({ ...base, blockchainPolicyId: '1' }))
      .to.deep.equal(stableEntryIdentity({ ...base, blockchainPolicyId: '999' }));
  });

  it('optionally persists records in exact seed order', async () => {
    const verdict = await evaluateMultiseed(
      seedIndex => [{
        key: 'task',
        auc: 0.5 + seedIndex * 0.01,
        advantage: seedIndex * 0.01,
        permPValue: 0.5,
        n: 30
      }],
      { seeds: 3, includeSeedRecords: true }
    );
    expect(verdict.seedRecords.map(row => row.seedIndex)).to.deep.equal([0, 1, 2]);
    expect(verdict.seedRecords[2].records[0].auc).to.equal(0.52);
    expect(verdict.criterion).to.not.have.property('includeSeedRecords');
  });
});
