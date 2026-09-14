'use strict';

const { expect } = require('chai');
const { generatePolicyArtifacts } = require('../../compiler/policy_generator');

const PROFILE_TERMS = new Set(['GRU', 'HMB', 'NMDS', 'GSO', 'NPUNCU', 'NPOA', 'NPU', 'NCU']);
const ONTOLOGY = { DS: ['ICD10', 0], RS: ['OBI', 1], POA: ['HANCESTRO', 2], GS: ['ISO3166', 3], CC: ['SNOMED', 4] };
const SCOPED = { US: [5, 0], PS: [6, 9], IS: [7, 10] };

async function expectRejected(promise, message) {
  try {
    await promise;
    expect.fail(`expected rejection containing: ${message}`);
  } catch (error) {
    expect(error.message).to.include(message);
  }
}

function configFor(term) {
  if (term === 'NRES') return { logic: term, predicates: [] };
  if (PROFILE_TERMS.has(term)) return { logic: term, predicates: [{ slot: 10, duo: 'DUO_PROFILE', issuerKeyCommitment: '1' }] };
  if (ONTOLOGY[term]) {
    const [namespace, slot] = ONTOLOGY[term];
    return { logic: term, predicates: [{ slot, duo: term, namespace, root: '1' }] };
  }
  if (SCOPED[term]) {
    const [slot, scopeId] = SCOPED[term];
    return { logic: term, predicates: [{ slot, duo: term, scopeId, allowlistRoot: '1' }] };
  }
  if (term === 'MOR') return { logic: term, predicates: [{ slot: 8, duo: term, moratoriumUntilEpoch: 1 }] };
  if (term === 'TS') return { logic: term, predicates: [{ slot: 9, duo: term, durationMonths: 1 }] };
  throw new Error(`No fixture for ${term}`);
}

describe('DUO V3 compiler vocabulary', function () {
  this.timeout(30_000);

  it('compiles every non-procedural DUO term', async function () {
    const terms = ['NRES', 'GRU', 'HMB', 'DS', 'POA', 'RS', 'NMDS', 'GSO', 'NPUNCU', 'GS', 'MOR', 'TS', 'US', 'PS', 'IS', 'CC', 'NPOA', 'NPU', 'NCU'];
    for (const term of terms) {
      const artifacts = await generatePolicyArtifacts(configFor(term), { randomizer: 1 });
      expect(artifacts.numAttributes).to.equal(13);
      expect(artifacts.numPredicates).to.equal(11);
      expect(artifacts.numOperations).to.be.greaterThan(0);
    }
  });

  it('accepts all standard DUO ID forms and rejects procedural terms', async function () {
    const ds = await generatePolicyArtifacts({ logic: 'DUO:0000007', predicates: [{ slot: 0, duo: 'DUO_0000007', namespace: 'ICD10', root: '1' }] }, { randomizer: 1 });
    expect(ds.logic.rpn).to.deep.equal(['DS', 'P[ICD10]', 'AND']);
    for (const term of ['PUB', 'COL', 'RTN', 'IRB']) {
      await expectRejected(generatePolicyArtifacts({ logic: term, predicates: [] }, { randomizer: 1 }), 'procedural');
    }
  });

  it('requires a profile predicate and keeps NRES exclusive', async function () {
    await expectRejected(generatePolicyArtifacts({ logic: 'HMB', predicates: [] }, { randomizer: 1 }), 'DUO_PROFILE');
    await expectRejected(generatePolicyArtifacts({ logic: 'NRES AND HMB', predicates: [] }, { randomizer: 1 }), 'NRES must be the sole');
    await expectRejected(generatePolicyArtifacts({ logic: 'NOT DS', predicates: [{ slot: 0, duo: 'DS', namespace: 'ICD10', root: '1' }] }, { randomizer: 1 }), 'NOT DS is unsupported');
  });
});
