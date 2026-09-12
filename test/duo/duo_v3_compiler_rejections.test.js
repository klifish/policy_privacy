'use strict';

/**
 * DUO V3 compiler acceptance / rejection matrix. No circuit artefacts needed.
 * Run under hardhat so chai-as-promised is registered.
 */

const { expect } = require('chai');
const { generatePolicyArtifacts } = require('../../compiler/policy_generator');
const H = require('./helpers/duo_v3_harness');

const R = { randomizer: 1 };
const ROOT = '1';
const ds = (slot = 0, namespace = 'ICD10') => ({ slot, duo: 'DS', namespace, root: ROOT });
const rs = (slot = 1, namespace = 'OBI') => ({ slot, duo: 'RS', namespace, root: ROOT });
const us = (slot = 5, extra = {}) => ({ slot, duo: 'US', allowlistRoot: ROOT, ...extra });
const ps = (slot = 6, extra = {}) => ({ slot, duo: 'PS', scopeId: 9001, allowlistRoot: ROOT, ...extra });
const mor = (slot = 8, extra = {}) => ({ slot, duo: 'MOR', moratoriumUntilEpoch: 100, ...extra });
const ts = (slot = 9, extra = {}) => ({ slot, duo: 'TS', durationMonths: 1, ...extra });
const prof = (slot = 10, extra = {}) => ({ slot, duo: 'DUO_PROFILE', issuerKeyCommitment: '1', ...extra });

const compile = (logic, predicates = []) => generatePolicyArtifacts({ logic, predicates }, R);
const rejects = (logic, predicates, message) => expect(compile(logic, predicates)).to.be.rejectedWith(message);

describe('DUO V3 compiler: rejection matrix', function () {
  this.timeout(30_000);

  describe('negation', function () {
    const cases = [
      ['NOT DS', [ds()], 'NOT DS is unsupported'],
      ['!US', [us()], 'NOT US is unsupported'],
      ['NOT HMB', [prof()], 'NOT HMB is unsupported'],
      ['NOT MOR', [mor()], 'NOT MOR is unsupported'],
      ['NOT (US AND PS)', [us(), ps()], 'is unsupported for DUO terms'],
      ['NOT (DS OR HMB)', [ds(), prof()], 'is unsupported for DUO terms'],
      ['NOT NOT DS', [ds()], 'is unsupported for DUO terms'],
      ['DS AND NOT NOT HMB', [ds(), prof()], 'is unsupported for DUO terms'],
      ['NOT NRES', [], 'NRES must be the sole']
    ];
    for (const [logic, predicates, message] of cases) {
      it(`rejects ${logic}`, () => rejects(logic, predicates, message));
    }
  });

  describe('procedural terms', function () {
    for (const term of ['PUB', 'COL', 'IRB', 'RTN', 'DUO:0000019', 'DUO_0000020', 'DUO0000021', 'DUO:0000029']) {
      it(`rejects ${term}`, () => rejects(term, [], 'procedural'));
    }
    it('rejects a procedural term inside a conjunction', () => rejects('DS AND PUB', [ds()], 'procedural'));
  });

  describe('NRES exclusivity', function () {
    it('compiles NRES alone to a single TRUE token', async function () {
      const a = await compile('NRES');
      expect(a.tokens).to.deep.equal([H.TOK.TRUE]);
      expect(a.numOperations).to.equal(1);
      expect(a.predicates.scopeParameters.predicateTypes).to.deep.equal(Array(11).fill(4));
    });
    for (const [logic, predicates] of [['NRES AND HMB', [prof()]], ['NRES OR DS', [ds()]], ['NRES AND NRES', []], ['(NRES)  AND US', [us()]]]) {
      it(`rejects ${logic}`, () => rejects(logic, predicates, 'NRES must be the sole'));
    }
    it('rejects NRES declared as a predicate', () => rejects('DS', [{ slot: 0, duo: 'NRES' }], 'not an external predicate'));
  });

  describe('duplicate terms', function () {
    const cases = [
      ['DS AND DS', [ds()]],
      ['HMB OR HMB', [prof()]],
      ['GRU AND (HMB OR GRU)', [prof()]],
      ['US AND US', [us()]],
      ['MOR AND MOR', [mor()]],
      ['TS AND TS', [ts()]],
      ['P[ICD10] AND P[ICD10]', [ds()]],
      ['US AND P[US]', [us()]]
    ];
    for (const [logic, predicates] of cases) {
      it(`rejects ${logic}`, () => rejects(logic, predicates, 'may appear at most once'));
    }
  });

  describe('obligations under OR', function () {
    const bad = [
      ['HMB OR TS', [prof(), ts()]],
      ['DS OR MOR', [ds(), mor()]],
      ['(US OR TS) AND DS', [us(), ts(), ds()]],
      ['MOR OR TS', [mor(), ts()]],
      ['DS AND (HMB OR (US AND MOR))', [ds(), prof(), us(), mor()]]
    ];
    for (const [logic, predicates] of bad) {
      it(`rejects ${logic}`, () => rejects(logic, predicates, 'must not appear under OR'));
    }
    const good = [
      ['HMB AND TS', [prof(), ts()], [6, 23, 24, 22, 24]],
      ['(DS OR RS) AND MOR', [ds(), rs(), mor()], [1, 13, 24, 2, 14, 24, 25, 21, 24]],
      ['MOR AND TS', [mor(), ts()], [21, 22, 24]],
      ['(DS OR HMB) AND MOR AND TS', [ds(), prof(), mor(), ts()], [1, 13, 24, 6, 23, 24, 25, 21, 24, 22, 24]]
    ];
    for (const [logic, predicates, tokens] of good) {
      it(`accepts ${logic}`, async function () {
        expect((await compile(logic, predicates)).tokens).to.deep.equal(tokens);
      });
    }
  });

  describe('profile slot', function () {
    it('requires DUO_PROFILE for profile-backed terms', () => rejects('HMB', [], 'require a DUO_PROFILE predicate at slot 10'));
    it('requires DUO_PROFILE even when combined with other terms', () => rejects('DS AND GRU', [ds()], 'require a DUO_PROFILE predicate'));
    it('pins DUO_PROFILE to slot 10', () => rejects('HMB', [prof(9)], 'reserved predicate slot 10'));
    it('forbids DUO_PROFILE on non-profile policies', () => rejects('DS', [ds(), prof()], 'may only be configured'));
    it('forbids DUO_PROFILE on NRES', () => rejects('NRES', [prof()], 'may only be configured'));
    it('rejects a zero issuer key commitment', () => rejects('HMB', [prof(10, { issuerKeyCommitment: '0' })], 'non-zero BN254 issuerKeyCommitment'));
    it('rejects a namespace on DUO_PROFILE', () => rejects('HMB', [prof(10, { namespace: 'ICD10' })], 'must not declare namespace'));
    it('rejects two DUO_PROFILE predicates', () => rejects('HMB', [prof(), prof(10)], 'Duplicate predicate slot'));
  });

  describe('fixed slots', function () {
    it('rejects DS outside slot 0', () => rejects('DS', [ds(1)], 'must use reserved predicate slot 0'));
    it('rejects US outside slot 5', () => rejects('US', [us(0)], 'must use reserved predicate slot 5'));
    it('rejects PS outside slot 6', () => rejects('PS', [ps(5)], 'must use reserved predicate slot 6'));
    it('rejects MOR outside slot 8', () => rejects('MOR', [mor(0)], 'must use reserved predicate slot 8'));
    it('rejects TS outside slot 9', () => rejects('TS', [ts(8)], 'must use reserved predicate slot 9'));
    it('rejects a namespace that does not belong to the term', () => rejects('RS', [rs(1, 'ICD10')], 'namespace mismatch'));
    it('rejects duplicate slots', () => rejects('DS', [ds(), ds()], 'Duplicate predicate slot'));
    it('rejects unknown namespaces', () => rejects('DS', [ds(0, 'FOO')], 'Unknown ontology namespace'));
  });

  describe('scoped allowlists', function () {
    it('rejects US with a scope id', () => rejects('US', [us(5, { scopeId: 5 })], 'scopeId to be zero'));
    it('rejects PS with a zero scope id', () => rejects('PS', [ps(6, { scopeId: 0 })], 'non-zero numeric scopeId'));
    it('rejects a missing allowlist root', () => rejects('US', [{ slot: 5, duo: 'US' }], 'non-zero allowlistRoot'));
    it('rejects a zero allowlist root', () => rejects('US', [us(5, { allowlistRoot: '0' })], 'non-zero BN254 field allowlistRoot'));
    it('rejects a namespace on a scoped term', () => rejects('US', [us(5, { namespace: 'ICD10' })], 'must not declare an ontology namespace'));
    it('rejects the legacy signed-credential path', () => rejects('PS', [ps(6, { legacySignedCredential: true })], 'not supported by the DUO V3 production circuit'));
  });

  describe('obligation parameters', function () {
    it('rejects MOR with epoch 0', () => rejects('MOR', [mor(8, { moratoriumUntilEpoch: 0 })], 'positive uint32'));
    it('rejects MOR with epoch 2^32', () => rejects('MOR', [mor(8, { moratoriumUntilEpoch: 2 ** 32 })], 'positive uint32'));
    it('rejects TS with 0 months', () => rejects('TS', [ts(9, { durationMonths: 0 })], 'positive uint32'));
    it('rejects TS whose duration overflows uint32', () => rejects('TS', [ts(9, { durationMonths: 5_965_233 })], 'outside uint32'));
    it('rejects a namespace on an obligation', () => rejects('MOR', [mor(8, { namespace: 'ICD10' })], 'must not declare an ontology namespace'));
    it('converts TS months to 720-epoch units', async function () {
      const a = await compile('TS', [ts(9, { durationMonths: 12 })]);
      expect(a.predicates.scopeParameters.timeLimitEpochs).to.equal('8640');
    });
  });

  describe('undeclared predicates', function () {
    it('rejects DS without an ICD10 predicate', () => rejects('DS', [], 'No predicate slot declared for ICD10'));
    it('rejects US without an allowlist predicate', () => rejects('US', [ds()], 'No predicate slot declared for US'));
    it('rejects TS without an obligation predicate', () => rejects('DS AND TS', [ds()], 'No predicate slot declared for TS'));
  });

  describe('syntax', function () {
    const cases = [
      ['DS AND', [ds()], 'requires 2 operands'],
      ['(DS', [ds()], 'Mismatched parentheses'],
      ['DS )', [ds()], 'Mismatched parentheses'],
      ['TRUE', [], 'not supported in policy logic'],
      ['DS XOR RS', [ds(), rs()], 'Unknown attribute identifier'],
      ['P[]', [], 'Empty predicate identifier'],
      ['P[FOO]', [], 'Unknown ontology namespace'],
      ['P[ICD10', [ds()], 'Unterminated predicate token'],
      ['', [], 'logic string is required'],
      ['DS @ RS', [ds(), rs()], 'Unexpected token']
    ];
    for (const [logic, predicates, message] of cases) {
      it(`rejects ${JSON.stringify(logic)}`, () => rejects(logic, predicates, message));
    }
  });

  describe('compiled shapes', function () {
    it('DS binds its ICD10 predicate', async function () {
      const a = await compile('DS', [ds()]);
      expect(a.logic.rpn).to.deep.equal(['DS', 'P[ICD10]', 'AND']);
      expect(a.tokens).to.deep.equal([1, 13, 24]);
      expect(a.predicates.scopeParameters.predicateTypes).to.deep.equal([3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
      expect(a.numAttributes).to.equal(13);
      expect(a.numPredicates).to.equal(11);
    });
    it('an explicit P[ICD10] collapses into the auto-bound predicate', async function () {
      const a = await compile('DS & P[ICD10]', [ds()]);
      expect(a.tokens).to.deep.equal([1, 13, 24]);
    });
    it('a bare predicate without its attribute is accepted', async function () {
      const a = await compile('P[ICD10]', [ds()]);
      expect(a.tokens).to.deep.equal([13]);
    });
    for (const [duo, slot, scopeKind, scopeId, pred] of [['US', 5, 26, '0', us], ['PS', 6, 27, '9001', ps], ['IS', 7, 28, '9002', (s) => ({ slot: s, duo: 'IS', scopeId: 9002, allowlistRoot: ROOT })]]) {
      it(`${duo} compiles to a type-8 allowlist slot ${slot}`, async function () {
        const a = await compile(duo, [pred(slot)]);
        const p = a.predicates.scopeParameters;
        expect(a.tokens).to.deep.equal([13 + slot]);
        expect(p.predicateTypes[slot]).to.equal(8);
        expect(p.predicateSchemaTags[slot]).to.equal(2005);
        expect(p.scopeKinds[slot]).to.equal(scopeKind);
        expect(p.approvedScopeIds[slot]).to.equal(scopeId);
        expect(p.merkleRoots[slot]).to.equal(ROOT);
      });
    }
    it('MOR AND TS compiles to slots 8/9 with obligation schema tags', async function () {
      const a = await compile('MOR AND TS', [mor(), ts()]);
      const p = a.predicates.scopeParameters;
      expect(a.predicates.obligationToSlot).to.deep.equal({ MOR: 8, TS: 9 });
      expect(p.predicateTypes.slice(8, 10)).to.deep.equal([6, 7]);
      expect(p.predicateSchemaTags.slice(8, 10)).to.deep.equal([2003, 2004]);
      expect(p.moratoriumUntilEpoch).to.equal('100');
      expect(p.timeLimitEpochs).to.equal('720');
    });
    it('HMB compiles to a type-9 profile slot bound to the issuer key', async function () {
      const a = await compile('HMB', [prof(10, { issuerKeyCommitment: '12345' })]);
      const p = a.predicates.scopeParameters;
      expect(a.tokens).to.deep.equal([6, 23, 24]);
      expect(p.predicateTypes[10]).to.equal(9);
      expect(p.predicateSchemaTags[10]).to.equal(2006);
      expect(p.credPublicKeys[10]).to.equal('12345');
    });
    it('two profile terms share one credential slot', async function () {
      const a = await compile('HMB AND NMDS', [prof()]);
      expect(a.tokens).to.deep.equal([6, 23, 24, 7, 23, 24, 24]);
    });
    it('the all-terms conjunction fills every slot in 61 tokens', async function () {
      const logic = 'GRU AND DS AND RS AND POA AND GS AND CC AND HMB AND NMDS AND GSO AND NPUNCU AND NPOA AND NPU AND NCU AND US AND PS AND IS AND MOR AND TS';
      const predicates = [
        ds(), rs(), { slot: 2, duo: 'POA', namespace: 'HANCESTRO', root: ROOT }, { slot: 3, duo: 'GS', namespace: 'ISO3166', root: ROOT },
        { slot: 4, duo: 'CC', namespace: 'SNOMED', root: ROOT }, us(), ps(), { slot: 7, duo: 'IS', scopeId: 9002, allowlistRoot: ROOT }, mor(), ts(), prof()
      ];
      const a = await compile(logic, predicates);
      expect(a.numOperations).to.equal(61);
      expect(a.predicates.scopeParameters.predicateTypes).to.deep.equal([3, 3, 3, 3, 3, 8, 8, 8, 6, 7, 9]);
    });
    it('accepts every DUO identifier form', async function () {
      for (const id of ['DUO:0000007', 'DUO_0000007', 'DUO0000007', 'disease_specific_research']) {
        const a = await compile(id, [{ slot: 0, duo: id, namespace: 'ICD10', root: ROOT }]);
        expect(a.tokens).to.deep.equal([1, 13, 24]);
      }
      const scoped = await compile('DUO:0000026', [{ slot: 5, duo: 'DUO_0000026', allowlistRoot: ROOT }]);
      expect(scoped.tokens).to.deep.equal([18]);
      const obligation = await compile('publication_moratorium', [{ slot: 8, duo: 'DUO0000024', moratoriumUntilEpoch: 5 }]);
      expect(obligation.tokens).to.deep.equal([21]);
    });
    it('the harness compiles every single term with the expected token shape', async function () {
      const fixtures = await H.buildTermFixtures();
      for (const term of H.ALL_TERMS) {
        const { artifacts } = await H.compilePolicy(term, fixtures);
        if (term === 'NRES') expect(artifacts.tokens).to.deep.equal([H.TOK.TRUE]);
        else if (H.PROFILE_TERMS.includes(term)) expect(artifacts.tokens).to.deep.equal([H.TOK.attr(term), H.TOK.pred(H.PROFILE_SLOT), H.TOK.AND]);
        else if (H.ONTOLOGY_TERMS[term]) expect(artifacts.tokens).to.deep.equal([H.TOK.attr(term), H.TOK.pred(H.ONTOLOGY_TERMS[term][1]), H.TOK.AND]);
        else if (H.SCOPED_TERMS[term]) expect(artifacts.tokens).to.deep.equal([H.TOK.pred(H.SCOPED_TERMS[term].slot)]);
        else expect(artifacts.tokens).to.deep.equal([H.TOK.pred(H.OBLIGATION_TERMS[term])]);
      }
    });
  });
});
