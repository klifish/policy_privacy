'use strict';

/**
 * Declarative DUO V3 case matrix consumed by registerCase() in duo_v3_harness.
 *
 * Case: { id, logic, tier:'core'|'full', grant, deny:[spec], orGrants:[spec],
 *         expectTokens, expectNumOps, extra(fn) }
 * Spec: { flip:[terms], variant, overrides:{holder|claims|attrs|ontology|allowlists|credential} }
 */

const H = require('./duo_v3_harness');
const { TOK, PROFILE_SLOT, ONTOLOGY_TERMS, SCOPED_TERMS, OBLIGATION_TERMS } = H;

const profileTokens = (t) => [TOK.attr(t), TOK.pred(PROFILE_SLOT), TOK.AND];
const ontologyTokens = (t) => [TOK.attr(t), TOK.pred(ONTOLOGY_TERMS[t][1]), TOK.AND];

// ---------------------------------------------------------------------------
// Singles (19)
// ---------------------------------------------------------------------------
const SINGLES = [
  { id: 'S-NRES', logic: 'NRES', tier: 'core', grant: {}, deny: [], expectTokens: [TOK.TRUE], expectNumOps: 1 },

  { id: 'S-GRU', logic: 'GRU', tier: 'core', grant: {}, deny: [{ flip: ['GRU'] }], expectTokens: profileTokens('GRU') },
  { id: 'S-HMB', logic: 'HMB', tier: 'core', grant: {}, deny: [{ flip: ['HMB'] }, { flip: ['HMB'], variant: 'ancestry' }], expectTokens: profileTokens('HMB') },
  { id: 'S-NMDS', logic: 'NMDS', tier: 'core', grant: {}, deny: [{ flip: ['NMDS'] }], expectTokens: profileTokens('NMDS') },
  { id: 'S-GSO', logic: 'GSO', tier: 'core', grant: {}, deny: [{ flip: ['GSO'] }], expectTokens: profileTokens('GSO') },
  { id: 'S-NPUNCU', logic: 'NPUNCU', tier: 'core', grant: {}, deny: [{ flip: ['NPUNCU'] }, { flip: ['NPUNCU'], variant: 'nonprofit' }], expectTokens: profileTokens('NPUNCU') },
  { id: 'S-NPOA', logic: 'NPOA', tier: 'core', grant: {}, deny: [{ flip: ['NPOA'] }], expectTokens: profileTokens('NPOA') },
  { id: 'S-NPU', logic: 'NPU', tier: 'core', grant: {}, deny: [{ flip: ['NPU'] }], expectTokens: profileTokens('NPU') },
  { id: 'S-NCU', logic: 'NCU', tier: 'core', grant: {}, deny: [{ flip: ['NCU'] }], expectTokens: profileTokens('NCU') },

  ...['DS', 'RS', 'POA', 'GS', 'CC'].map((t) => ({
    id: `S-${t}`, logic: t, tier: 'core', grant: {},
    deny: [{ flip: [t] }, { flip: [t], variant: 'attr' }],
    expectTokens: ontologyTokens(t)
  })),

  ...['US', 'PS', 'IS'].map((t) => ({
    id: `S-${t}`, logic: t, tier: 'core', grant: {},
    orGrants: [{ overrides: { holder: 'bob' } }],
    deny: [{ flip: [t] }],
    expectTokens: [TOK.pred(SCOPED_TERMS[t].slot)]
  })),

  { id: 'S-MOR', logic: 'MOR', tier: 'core', grant: {}, deny: [], expectTokens: [TOK.pred(OBLIGATION_TERMS.MOR)] },
  { id: 'S-TS', logic: 'TS', tier: 'core', grant: {}, deny: [], expectTokens: [TOK.pred(OBLIGATION_TERMS.TS)] }
];

// ---------------------------------------------------------------------------
// Pairwise. Representatives: profile=HMB, ontology=DS, scoped=US, obligation=TS
// ---------------------------------------------------------------------------
const PAIRWISE = [
  // cross-category AND
  { id: 'P-HMB-AND-DS', logic: 'HMB AND DS', tier: 'core', grant: {}, deny: [{ flip: ['HMB'] }, { flip: ['DS'] }] },
  { id: 'P-HMB-AND-US', logic: 'HMB AND US', tier: 'core', grant: {}, deny: [{ flip: ['HMB'] }, { flip: ['US'] }] },
  { id: 'P-HMB-AND-TS', logic: 'HMB AND TS', tier: 'core', grant: {}, deny: [{ flip: ['HMB'] }] },
  { id: 'P-DS-AND-US', logic: 'DS AND US', tier: 'core', grant: {}, deny: [{ flip: ['DS'] }, { flip: ['US'] }] },
  { id: 'P-DS-AND-TS', logic: 'DS AND TS', tier: 'core', grant: {}, deny: [{ flip: ['DS'] }] },
  { id: 'P-US-AND-TS', logic: 'US AND TS', tier: 'core', grant: {}, deny: [{ flip: ['US'] }] },

  // cross-category OR (obligation OR is a compiler rejection, see duo_v3_compiler_rejections)
  { id: 'P-HMB-OR-DS', logic: 'HMB OR DS', tier: 'core', grant: {}, orGrants: [{ flip: ['DS'] }, { flip: ['HMB'] }], deny: [{ flip: ['HMB', 'DS'] }] },
  { id: 'P-HMB-OR-US', logic: 'HMB OR US', tier: 'core', grant: {}, orGrants: [{ flip: ['US'] }, { flip: ['HMB'] }], deny: [{ flip: ['HMB', 'US'] }] },
  { id: 'P-DS-OR-US', logic: 'DS OR US', tier: 'core', grant: {}, orGrants: [{ flip: ['US'] }, { flip: ['DS'] }], deny: [{ flip: ['DS', 'US'] }] },

  // within-category
  { id: 'P-HMB-AND-NMDS', logic: 'HMB AND NMDS', tier: 'core', grant: {}, deny: [{ flip: ['HMB'] }, { flip: ['NMDS'] }], expectTokens: [6, 23, 24, 7, 23, 24, 24] },
  { id: 'P-GSO-OR-NPOA', logic: 'GSO OR NPOA', tier: 'full', grant: {}, orGrants: [{ flip: ['GSO'] }, { flip: ['NPOA'] }], deny: [{ flip: ['GSO', 'NPOA'] }] },
  { id: 'P-DS-AND-RS', logic: 'DS AND RS', tier: 'core', grant: {}, deny: [{ flip: ['DS'] }, { flip: ['RS'] }] },
  { id: 'P-GS-OR-CC', logic: 'GS OR CC', tier: 'full', grant: {}, orGrants: [{ flip: ['GS'] }, { flip: ['CC'] }], deny: [{ flip: ['GS', 'CC'] }] },
  { id: 'P-US-AND-PS', logic: 'US AND PS', tier: 'core', grant: {}, deny: [{ flip: ['US', 'PS'] }, { flip: ['PS'], variant: 'keep-holder' }, { flip: ['US'], variant: 'keep-holder' }] },
  { id: 'P-PS-OR-IS', logic: 'PS OR IS', tier: 'full', grant: {}, orGrants: [{ flip: ['PS'], variant: 'keep-holder' }, { flip: ['IS'], variant: 'keep-holder' }], deny: [{ flip: ['PS', 'IS'] }] },
  { id: 'P-US-AND-PS-AND-IS', logic: 'US AND PS AND IS', tier: 'full', grant: {}, deny: [{ flip: ['US', 'PS', 'IS'] }, { flip: ['IS'], variant: 'keep-holder' }] },
  { id: 'P-MOR-AND-TS', logic: 'MOR AND TS', tier: 'core', grant: {}, deny: [], expectTokens: [21, 22, 24] }
];

// ---------------------------------------------------------------------------
// Complex
// ---------------------------------------------------------------------------
const ALL_AND = 'GRU AND DS AND RS AND POA AND GS AND CC AND HMB AND NMDS AND GSO AND NPUNCU AND NPOA AND NPU AND NCU AND US AND PS AND IS AND MOR AND TS';
const DENIABLE = ['GRU', 'DS', 'RS', 'POA', 'GS', 'CC', 'HMB', 'NMDS', 'GSO', 'NPUNCU', 'NPOA', 'NPU', 'NCU', 'US', 'PS', 'IS'];

const COMPLEX = [
  {
    id: 'C1', logic: '(DS OR RS) AND HMB AND US AND TS', tier: 'core',
    grant: { flip: ['RS'] },
    orGrants: [{ flip: ['DS'] }],
    deny: [{ flip: ['DS', 'RS'] }, { flip: ['HMB'] }, { flip: ['US'] }]
  },
  {
    id: 'C2', logic: 'GRU AND NPUNCU AND GS', tier: 'full',
    grant: {},
    deny: [{ flip: ['NPUNCU'] }, { flip: ['GRU'] }, { flip: ['NPUNCU'], variant: 'nonprofit' }, { flip: ['GS'] }]
  },
  {
    id: 'C3', logic: '(US OR PS) AND (DS OR CC) AND MOR', tier: 'full',
    grant: {},
    orGrants: [{ flip: ['US'], variant: 'keep-holder' }, { flip: ['PS'], variant: 'keep-holder' }, { flip: ['DS'] }, { flip: ['CC'] }],
    deny: [{ flip: ['US', 'PS'] }, { flip: ['DS', 'CC'] }]
  },
  {
    id: 'C4', logic: 'HMB AND NMDS AND GSO AND NPOA AND NCU', tier: 'full',
    grant: {},
    deny: ['HMB', 'NMDS', 'GSO', 'NPOA', 'NCU'].map((t) => ({ flip: [t] })),
    expectNumOps: 19
  },
  {
    id: 'C6-max', logic: ALL_AND, tier: 'core',
    grant: {},
    deny: [{ flip: ['NCU'] }, ...DENIABLE.filter((t) => t !== 'NCU').map((t) => ({ flip: [t] }))],
    expectNumOps: 61
  }
];

module.exports = { SINGLES, PAIRWISE, COMPLEX, ALL_AND, DENIABLE };
