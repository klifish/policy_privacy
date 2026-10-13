'use strict';

/**
 * Canonical non-procedural DUO V3 circuit layout.
 *
 * Keep protocol dimensions, fixed semantic slots, and the profile-claim to
 * attribute mapping here so the compiler, experiment generator, and E2E
 * harness cannot silently drift apart.
 */
const DUO_V3_ATTRIBUTE_DEFINITIONS = Object.freeze([
  Object.freeze({ code: 'GRU', label: 'General research use', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'DS', label: 'Disease-specific research', namespace: 'ICD10', requiresPredicate: true }),
  Object.freeze({ code: 'RS', label: 'Research-specific restrictions', namespace: 'OBI', requiresPredicate: true }),
  Object.freeze({ code: 'POA', label: 'Population origins/ancestry', namespace: 'HANCESTRO', requiresPredicate: true }),
  Object.freeze({ code: 'GS', label: 'Geographical restriction', namespace: 'ISO3166', requiresPredicate: true }),
  Object.freeze({ code: 'CC', label: 'Clinical care use', namespace: 'SNOMED', requiresPredicate: true }),
  Object.freeze({ code: 'HMB', label: 'Health/medical/biomedical research', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'NMDS', label: 'No methods development research', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'GSO', label: 'Genetic studies only', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'NPUNCU', label: 'Not-for-profit, non-commercial use only', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'NPOA', label: 'Population origins/ancestry prohibited', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'NPU', label: 'Not-for-profit organisation use only', namespace: null, requiresProfile: true }),
  Object.freeze({ code: 'NCU', label: 'Non-commercial use only', namespace: null, requiresProfile: true })
]);

const DUO_V3_ATTRIBUTE_ORDER = Object.freeze(
  DUO_V3_ATTRIBUTE_DEFINITIONS.map(({ code }) => code)
);
const DUO_V3_PROTOCOL_VERSION = '3.0.0-rc2';
const DUO_V3_PUBLIC_SIGNAL_ORDER = Object.freeze([
  'isAuthorized',
  'policyCommitment',
  'paramsCommitment',
  'contextHash',
  'requestEpoch'
]);
const DUO_V3_N = 13;
const DUO_V3_M = 11;
const DUO_V3_DEPTH = 64;
const DUO_PROFILE_CREDENTIAL_V1 = 2006;
const DUO_V3_PROFILE_SLOT = 10;
const DUO_V3_FIXED_SLOTS = Object.freeze({
  DS: 0,
  RS: 1,
  POA: 2,
  GS: 3,
  CC: 4,
  US: 5,
  PS: 6,
  IS: 7,
  MOR: 8,
  TS: 9,
  DUO_PROFILE: DUO_V3_PROFILE_SLOT
});
const DUO_V3_PROFILE_TERMS = Object.freeze([
  'GRU',
  'HMB',
  'NMDS',
  'GSO',
  'NPUNCU',
  'NPOA',
  'NPU',
  'NCU'
]);
const DUO_V3_CLAIM_BITS = Object.freeze({
  research: 0,
  health: 1,
  methods: 2,
  genetic: 3,
  ancestry: 4,
  commercial: 5,
  nonprofit: 6
});

function encodeDuoV3ProfileClaims(claims = {}) {
  let value = 0;
  for (const [name, bit] of Object.entries(DUO_V3_CLAIM_BITS)) {
    if (claims[name]) value |= 1 << bit;
  }
  return value;
}

function normalizeProfileClaims(profileClaims) {
  const value = Number(profileClaims);
  if (!Number.isInteger(value) || value < 0 || value > 127) {
    throw new Error('DUO V3 profile claims must be a 7-bit integer in [0, 127]');
  }
  return value;
}

function deriveDuoV3RequesterAttrs(profileClaims, ontologyAttrs = {}) {
  const claims = normalizeProfileClaims(profileClaims);
  const bit = (index) => (claims >> index) & 1;
  return [
    bit(DUO_V3_CLAIM_BITS.research),
    ontologyAttrs.DS ? 1 : 0,
    ontologyAttrs.RS ? 1 : 0,
    ontologyAttrs.POA ? 1 : 0,
    ontologyAttrs.GS ? 1 : 0,
    ontologyAttrs.CC ? 1 : 0,
    bit(DUO_V3_CLAIM_BITS.health) * (1 - bit(DUO_V3_CLAIM_BITS.ancestry)),
    1 - bit(DUO_V3_CLAIM_BITS.methods),
    bit(DUO_V3_CLAIM_BITS.genetic),
    bit(DUO_V3_CLAIM_BITS.nonprofit) * (1 - bit(DUO_V3_CLAIM_BITS.commercial)),
    1 - bit(DUO_V3_CLAIM_BITS.ancestry),
    bit(DUO_V3_CLAIM_BITS.nonprofit),
    1 - bit(DUO_V3_CLAIM_BITS.commercial)
  ];
}

module.exports = {
  DUO_V3_PROTOCOL_VERSION,
  DUO_V3_PUBLIC_SIGNAL_ORDER,
  DUO_V3_ATTRIBUTE_DEFINITIONS,
  DUO_V3_ATTRIBUTE_ORDER,
  DUO_V3_N,
  DUO_V3_M,
  DUO_V3_DEPTH,
  DUO_PROFILE_CREDENTIAL_V1,
  DUO_V3_PROFILE_SLOT,
  DUO_V3_FIXED_SLOTS,
  DUO_V3_PROFILE_TERMS,
  DUO_V3_CLAIM_BITS,
  encodeDuoV3ProfileClaims,
  deriveDuoV3RequesterAttrs
};
