/**
 * Data Generator for Policy Content Hiding Evaluation
 * 
 * Generates a dataset of policies with DUO terms and ICD-10 codes,
 * executes them multiple times, and collects observable features
 * from blockchain transactions.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const { id, getBytes } = require('ethers');
const { generatePolicyArtifacts } = require('../../compiler/policy_generator');
const { buildWhitelist } = require('../../utils/merkle/ontology_whitelist');
const {
  calculatePolicyCommitment,
  calculateParamsCommitment,
  calculateRequesterId,
  signDuoProfileCredential
} = require('../../lib/prover');
const {
  DUO_V3_ATTRIBUTE_ORDER,
  DUO_V3_M,
  DUO_V3_DEPTH,
  DUO_V3_PROFILE_SLOT,
  DUO_V3_PROFILE_TERMS,
  deriveDuoV3RequesterAttrs
} = require('../../lib/duo_v3');
const tpsClient = require('../../lib/tps-client');
const { retryRpc, waitForTx, waitForTransactionReceipt } = require('../../lib/rpc-retry');
const { getExperimentSigner } = require('./blockchain');

const EVENT_SIGNATURES = {
  POLICY_COMMITTED: id('PolicyCommitted(address,uint256,uint256,uint256)'),
  ACCESS_REQUESTED: id('AccessRequested(address,uint256,uint256)'),
  ACCESS_GRANTED: id('AccessGranted(address,uint256,uint256)'),
  ACCESS_DENIED: id('AccessDenied(address,uint256,uint256)')
};

const ACCESS_EVENT_TOPICS = new Set([
  EVENT_SIGNATURES.ACCESS_REQUESTED,
  EVENT_SIGNATURES.ACCESS_GRANTED,
  EVENT_SIGNATURES.ACCESS_DENIED
]);

const LOG_ADDRESS_BYTES = 20;

function computeLogPayloadSizeBytes(log) {
  if (!log) {
    return 0;
  }
  const topicsBytes = log.topics.length * 32;
  const dataBytes = getBytes(log.data).length;
  return LOG_ADDRESS_BYTES + topicsBytes + dataBytes;
}

// DUO Terms (Data Use Ontology) - based on actual DUO ontology
// See: https://ega-archive.org/access/data-access-committee/data-use-ontology/
const DUO_TERMS = {
  GENERAL_RESEARCH: 0,         // DUO:0000042 - General research use (non-ontology-linked)
  DISEASE_SPECIFIC: 1,         // DUO:0000007 - Disease-specific research (ontology-linked → ICD-10)
  RESEARCH_SPECIFIC: 2,        // DUO:0000012 - Research specific restrictions (ontology-linked → OBI)
  POPULATION_ANCESTRY: 3,      // DUO:0000011 - Population origins/ancestry (ontology-linked → HANCESTRO)
  GEOGRAPHICAL_RESTRICTION: 4, // DUO:0000022 - Geographical restriction (ontology-linked → ISO 3166)
  CLINICAL_CARE: 5,            // DUO:0000043 - Clinical care use (ontology-linked → SNOMED CT)
  NON_COMMERCIAL_USE: 6,       // DUO:0000046 - Non-commercial use only
  COMMERCIAL_USE: 6,           // Deprecated compatibility alias; DUO:0000046 is NCU, not commercial use
  HEALTH_MEDICAL_BIOMEDICAL: 7,
  NO_METHODS_DEVELOPMENT: 8,
  GENETIC_STUDIES_ONLY: 9,
  NON_PROFIT_NON_COMMERCIAL: 10,
  NO_POPULATION_ANCESTRY: 11,
  NON_PROFIT_ONLY: 12
};

// Production DUO V3 circuit layout: N=13 attributes, M=11 fixed predicate slots.
const POLICY_ATTRIBUTE_ORDER = DUO_V3_ATTRIBUTE_ORDER;
const POLICY_ATTRIBUTE_CODES = DUO_V3_ATTRIBUTE_ORDER;
const POLICY_PREDICATE_COUNT = DUO_V3_M;

const POLICY_PREDICATE_SLOTS = [
  {
    slot: 0,
    duo: 'DS',
    namespace: 'ICD10',
    root: '0x0',
    description: 'ICD-10 whitelist for disease-specific research policies'
  },
  {
    slot: 1,
    duo: 'RS',
    namespace: 'OBI',
    root: '0x0',
    description: 'OBI whitelist for research-specific restriction policies'
  },
  {
    slot: 2,
    duo: 'POA',
    namespace: 'HANCESTRO',
    root: '0x0',
    description: 'HANCESTRO whitelist placeholder for population ancestry policies'
  },
  {
    slot: 3,
    duo: 'GS',
    namespace: 'ISO3166',
    root: '0x0',
    description: 'ISO 3166 whitelist placeholder for geographical restriction policies'
  },
  {
    slot: 4,
    duo: 'CC',
    namespace: 'SNOMED',
    root: '0x0',
    description: 'SNOMED whitelist placeholder for clinical care policies'
  }
];

const DUO_TO_ATTRIBUTE_CODE = {
  [DUO_TERMS.GENERAL_RESEARCH]: 'GRU',
  [DUO_TERMS.DISEASE_SPECIFIC]: 'DS',
  [DUO_TERMS.RESEARCH_SPECIFIC]: 'RS',
  [DUO_TERMS.POPULATION_ANCESTRY]: 'POA',
  [DUO_TERMS.GEOGRAPHICAL_RESTRICTION]: 'GS',
  [DUO_TERMS.CLINICAL_CARE]: 'CC',
  [DUO_TERMS.NON_COMMERCIAL_USE]: 'NCU',
  [DUO_TERMS.HEALTH_MEDICAL_BIOMEDICAL]: 'HMB',
  [DUO_TERMS.NO_METHODS_DEVELOPMENT]: 'NMDS',
  [DUO_TERMS.GENETIC_STUDIES_ONLY]: 'GSO',
  [DUO_TERMS.NON_PROFIT_NON_COMMERCIAL]: 'NPUNCU',
  [DUO_TERMS.NO_POPULATION_ANCESTRY]: 'NPOA',
  [DUO_TERMS.NON_PROFIT_ONLY]: 'NPU'
};

const ATTRIBUTE_ALIAS_MAP = Object.freeze({
  GR: 'GRU',
  GRU: 'GRU',
  GENERAL_RESEARCH: 'GRU',
  GENERAL_RESEARCH_USE: 'GRU',
  GENERALRESEARCH: 'GRU',
  DUO0000042: 'GRU',

  DS: 'DS',
  DISEASE_SPECIFIC: 'DS',
  DISEASE_SPECIFIC_RESEARCH: 'DS',
  DISEASESPECIFIC: 'DS',
  DUO0000007: 'DS',

  RS: 'RS',
  RESEARCH_SPECIFIC: 'RS',
  RESEARCH_SPECIFIC_RESTRICTIONS: 'RS',
  RESEARCHSPECIFIC: 'RS',
  DUO0000012: 'RS',

  PA: 'POA',
  POA: 'POA',
  POPULATION_ANCESTRY: 'POA',
  POPULATIONANCESRTY: 'POA',
  POPULATION_ORIGINS_ANCESTRY: 'POA',
  DUO0000011: 'POA',

  GE: 'GS',
  GS: 'GS',
  GEOGRAPHICAL_RESTRICTION: 'GS',
  GEOGRAPHIC_RESTRICTION: 'GS',
  DUO0000022: 'GS',

  CC: 'CC',
  CLINICAL_CARE: 'CC',
  CLINICALCARE: 'CC',
  DUO0000043: 'CC',

  CU: 'NCU',
  NCU: 'NCU',
  NON_COMMERCIAL_USE: 'NCU',
  NON_COMMERCIAL_USE_ONLY: 'NCU',
  DUO0000046: 'NCU',

  HMB: 'HMB',
  HEALTH_MEDICAL_BIOMEDICAL: 'HMB',
  DUO0000006: 'HMB',
  NMDS: 'NMDS',
  NO_METHODS_DEVELOPMENT: 'NMDS',
  DUO0000015: 'NMDS',
  GSO: 'GSO',
  GENETIC_STUDIES_ONLY: 'GSO',
  DUO0000016: 'GSO',
  NPUNCU: 'NPUNCU',
  NON_PROFIT_NON_COMMERCIAL: 'NPUNCU',
  DUO0000018: 'NPUNCU',
  NPOA: 'NPOA',
  NO_POPULATION_ANCESTRY: 'NPOA',
  DUO0000044: 'NPOA',
  NPU: 'NPU',
  NON_PROFIT_ONLY: 'NPU',
  DUO0000045: 'NPU'
});

const ATTRIBUTE_PREDICATE_SLOT = {
  DS: 0,
  RS: 1,
  POA: 2,
  GS: 3,
  CC: 4
};

// Ontology-linked DUO terms with their corresponding external ontology namespaces
// Each ontology-linked term requires verification against a specific external ontology
const ONTOLOGY_LINKED_TERMS = new Map([
  [DUO_TERMS.DISEASE_SPECIFIC, 'ICD10'],        // Disease ontology (ICD-10)
  [DUO_TERMS.RESEARCH_SPECIFIC, 'OBI'],         // Ontology for Biomedical Investigations
  [DUO_TERMS.POPULATION_ANCESTRY, 'HANCESTRO'], // Human Ancestry Ontology
  [DUO_TERMS.GEOGRAPHICAL_RESTRICTION, 'ISO3166'], // Country codes
  [DUO_TERMS.CLINICAL_CARE, 'SNOMED']           // SNOMED CT clinical terminology
]);

// External Ontology Namespaces
// Each namespace represents a different external ontology that can be linked to DUO terms
const ONTOLOGY_NAMESPACES = {
  ICD10: 0,      // ICD-10 disease classification
  OBI: 1,        // Ontology for Biomedical Investigations (research design types)
  HANCESTRO: 2,  // Human Ancestry Ontology
  ISO3166: 3,    // ISO 3166 country and region codes
  SNOMED: 4      // SNOMED CT clinical terminology
};

// ICD-10 Chapters (for Disease Specific Research - DUO:0000007)
const ICD10_CHAPTERS = {
  INFECTIOUS: 0,      // A00-B99
  NEOPLASMS: 1,       // C00-D49
  BLOOD: 2,           // D50-D89
  ENDOCRINE: 3,       // E00-E89
  MENTAL: 4,          // F01-F99
  NERVOUS: 5,         // G00-G99
  CIRCULATORY: 6,     // I00-I99
  RESPIRATORY: 7,     // J00-J99
  DIGESTIVE: 8,       // K00-K95
  MUSCULOSKELETAL: 9  // M00-M99
};

// OBI Research Design Types (for Research Specific - DUO:0000012)
const OBI_RESEARCH_TYPES = {
  RCT: 0,                    // OBI:0000175 - Randomized Controlled Trial
  COHORT_STUDY: 1,           // OBI:0001185 - Cohort Study
  CASE_CONTROL: 2,           // OBI:0001556 - Case-Control Study
  CROSS_SECTIONAL: 3,        // OBI:0001548 - Cross-Sectional Study
  LONGITUDINAL: 4            // OBI:0001546 - Longitudinal Study
};

// HANCESTRO Ancestry Groups (for Population Origins - DUO:0000011)
const HANCESTRO_GROUPS = {
  EUROPEAN: 0,               // HANCESTRO:0005 - European
  AFRICAN: 1,                // HANCESTRO:0008 - African
  ASIAN: 2,                  // HANCESTRO:0010 - Asian
  HISPANIC_LATIN: 3,         // HANCESTRO:0014 - Hispanic or Latin American
  NATIVE_AMERICAN: 4         // HANCESTRO:0013 - Native American
};

// ISO 3166 Geographic Regions (for Geographical Restriction - DUO:0000022)
const ISO3166_REGIONS = {
  NORTH_AMERICA: 0,          // USA, Canada, Mexico
  EUROPE: 1,                 // European countries
  ASIA: 2,                   // Asian countries
  OCEANIA: 3,                // Australia, New Zealand
  AFRICA: 4                  // African countries
};

// SNOMED CT Clinical Terms (for Clinical Care - DUO:0000043)
const SNOMED_TERMS = {
  DIAGNOSTIC: 0,             // Diagnostic procedures
  THERAPEUTIC: 1,            // Therapeutic procedures
  PREVENTIVE: 2,             // Preventive care
  PALLIATIVE: 3,             // Palliative care
  EMERGENCY: 4               // Emergency care
};

// ---------------------------------------------------------------------
// Layered sampling configuration
// ---------------------------------------------------------------------

const DEFAULT_POLICY_COUNT = 200;
const DEFAULT_EXECUTIONS_PER_POLICY = 20;
const DEFAULT_SATISFY_RATIO = 0.5;
// Must match PolicyPrivacyMain(13, 11, 64, 5, 8, 32).
const DEFAULT_POLICY_DEPTH = DUO_V3_DEPTH;

const DEFAULT_WHITELIST_BUCKETS = Object.freeze([4, 8, 16, 24, 32]);
const DEFAULT_MERKLE_DEPTH_OPTIONS = Object.freeze([8]);
const DEFAULT_PROOF_TYPES = Object.freeze([
  'merkle_proof',
  'range_proof',
  'credential_proof',
  'null_proof'
]);

const DEFAULT_EXECUTION_PROTECTIONS = Object.freeze({
  path_unify: [false, true],
  gas_pad: [true],
  event_pad: [false, true],
  proof_pad: [false],
  batch_pattern: ['baseline', 'batched', 'staggered']
});

const GAS_PAD_TARGET_GAS = Object.freeze({
  commit: 300000n,  // Base target for commit transaction
  access: 1000000n   // Base target for access transaction
});

// Gas randomization configuration
const GAS_PAD_VARIANCE = 0.1; // ±10% randomization range (50k for commit, 100k for access)

const PROTECTION_PROFILES = Object.freeze({
  B1_UNPADDED: 'b1_unpadded',
  B2_PADDED: 'b2_padded'
});

function normalizeProtectionProfile(profile = PROTECTION_PROFILES.B2_PADDED) {
  if (!Object.values(PROTECTION_PROFILES).includes(profile)) {
    throw new Error(
      `Unknown protection profile "${profile}". Expected one of: ${Object.values(PROTECTION_PROFILES).join(', ')}`
    );
  }
  return profile;
}

/**
 * Generate a randomized gas target within the configured variance range.
 * This adds noise to prevent gas-based policy fingerprinting.
 *
 * @param {bigint} baseTarget - Base gas target
 * @param {number} variance - Variance ratio (default: 0.10 for ±10%)
 * @returns {bigint} Randomized gas target
 */
function getRandomGasTarget(baseTarget, variance = GAS_PAD_VARIANCE) {
  const base = Number(baseTarget);
  // Generate random factor in range [1-variance, 1+variance]
  // Using crypto-grade randomness for better distribution
  const randomBytes = crypto.randomBytes(4);
  const randomValue = randomBytes.readUInt32BE(0) / 0xFFFFFFFF; // [0, 1]
  const randomFactor = 1 + (randomValue - 0.5) * 2 * variance;
  const randomizedTarget = Math.floor(base * randomFactor);
  return BigInt(randomizedTarget);
}

const DEFAULT_PROOF_PAD_TARGET_BYTES = 1200;
const ONTOLOGY_EPOCH = 2026;
const POLICY_VALID_FROM_EPOCH = 0;
const POLICY_VALID_UNTIL_EPOCH = 4294967295;
const PROFILE_TERM_SET = new Set(DUO_V3_PROFILE_TERMS);
const EXPERIMENT_PROFILE_ISSUER_PRIVATE_KEY = Uint8Array.from(
  crypto.createHash('sha256').update('policy-privacy-experiment-duo-v3-profile-issuer').digest()
);
let experimentProfileIssuerPromise = null;

async function getExperimentProfileIssuer() {
  if (!experimentProfileIssuerPromise) {
    experimentProfileIssuerPromise = signDuoProfileCredential(
      EXPERIMENT_PROFILE_ISSUER_PRIVATE_KEY,
      {
        policyCommitment: 1,
        requesterId: 1,
        resourceId: 1,
        profileClaims: 0,
        validFromEpoch: 0,
        validUntilEpoch: 1,
        credentialId: 1
      }
    ).then(({ issuerAx, issuerAy, issuerKeyCommitment }) => ({
      issuerAx,
      issuerAy,
      issuerKeyCommitment
    }));
  }
  return experimentProfileIssuerPromise;
}

const DEFAULT_SEMANTIC_LAYERS = Object.freeze([
  {
    name: 'singleton',
    combos: [
      ['GR'],
      ['DS'],
      ['RS'],
      ['POA'],
      ['GS'],
      ['CC']
    ],
    minPolicies: 120
  },
  {
    name: 'pair',
    combos: [
      ['GR', 'DS'],
      ['GR', 'RS'],
      ['GR', 'POA'],
      ['GR', 'GS'],
      ['GR', 'CC'],
      ['DS', 'RS'],
      ['DS', 'POA'],
      ['DS', 'GS'],
      ['DS', 'CC'],
      ['RS', 'POA'],
      ['RS', 'GS'],
      ['RS', 'CC'],
      ['POA', 'GS'],
      ['POA', 'CC'],
      ['GS', 'CC']
    ],
    minPolicies: 80
  }
]);

const DEFAULT_DUO_CONFLICT_RULES = Object.freeze([
  // Example rule structure – no default conflicts enforced today.
  // { includes: ['DS'], excludes: ['COMMERCIAL'] }
]);

const ICD10_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'INFECTIOUS',
    value: ICD10_CHAPTERS.INFECTIOUS,
    level: 'chapter',
    codeRange: 'A00-B99',
    label: 'Certain infectious and parasitic diseases',
    whitelistTerms: [
      'A00', 'A09', 'A15', 'A32', 'A80', 'B00', 'B05', 'B20', 'B33', 'B50', 'B65', 'B99'
    ]
  },
  {
    id: 'NEOPLASMS',
    value: ICD10_CHAPTERS.NEOPLASMS,
    level: 'chapter',
    codeRange: 'C00-D49',
    label: 'Neoplasms',
    whitelistTerms: [
      'C00', 'C15', 'C34', 'C50', 'C61', 'C71', 'C91', 'D05', 'D25', 'D35', 'D45', 'D49'
    ]
  },
  {
    id: 'BLOOD',
    value: ICD10_CHAPTERS.BLOOD,
    level: 'chapter',
    codeRange: 'D50-D89',
    label: 'Diseases of the blood and blood-forming organs',
    whitelistTerms: [
      'D50', 'D55', 'D57', 'D60', 'D65', 'D69', 'D70', 'D72', 'D76', 'D80', 'D83', 'D89'
    ]
  },
  {
    id: 'ENDOCRINE',
    value: ICD10_CHAPTERS.ENDOCRINE,
    level: 'chapter',
    codeRange: 'E00-E89',
    label: 'Endocrine, nutritional and metabolic diseases',
    whitelistTerms: [
      'E00', 'E03', 'E10', 'E11', 'E40', 'E50', 'E55', 'E70', 'E75', 'E78', 'E83', 'E89'
    ]
  },
  {
    id: 'MENTAL',
    value: ICD10_CHAPTERS.MENTAL,
    level: 'chapter',
    codeRange: 'F01-F99',
    label: 'Mental and behavioural disorders',
    whitelistTerms: [
      'F01', 'F03', 'F10', 'F20', 'F32', 'F41', 'F43', 'F50', 'F70', 'F80', 'F84', 'F99'
    ]
  },
  {
    id: 'NERVOUS',
    value: ICD10_CHAPTERS.NERVOUS,
    level: 'chapter',
    codeRange: 'G00-G99',
    label: 'Diseases of the nervous system',
    whitelistTerms: [
      'G00', 'G04', 'G11', 'G20', 'G35', 'G40', 'G47', 'G60', 'G70', 'G81', 'G91', 'G99'
    ]
  },
  {
    id: 'CIRCULATORY',
    value: ICD10_CHAPTERS.CIRCULATORY,
    level: 'chapter',
    codeRange: 'I00-I99',
    label: 'Diseases of the circulatory system',
    whitelistTerms: [
      'I00', 'I10', 'I20', 'I25', 'I42', 'I48', 'I50', 'I63', 'I70', 'I73', 'I83', 'I99'
    ]
  },
  {
    id: 'RESPIRATORY',
    value: ICD10_CHAPTERS.RESPIRATORY,
    level: 'chapter',
    codeRange: 'J00-J99',
    label: 'Diseases of the respiratory system',
    whitelistTerms: [
      'J00', 'J02', 'J12', 'J18', 'J20', 'J30', 'J40', 'J44', 'J45', 'J47', 'J60', 'J99'
    ]
  },
  {
    id: 'DIGESTIVE',
    value: ICD10_CHAPTERS.DIGESTIVE,
    level: 'chapter',
    codeRange: 'K00-K95',
    label: 'Diseases of the digestive system',
    whitelistTerms: [
      'K00', 'K12', 'K21', 'K29', 'K35', 'K50', 'K56', 'K57', 'K70', 'K74', 'K85', 'K95'
    ]
  },
  {
    id: 'MUSCULOSKELETAL',
    value: ICD10_CHAPTERS.MUSCULOSKELETAL,
    level: 'chapter',
    codeRange: 'M00-M99',
    label: 'Diseases of the musculoskeletal system',
    whitelistTerms: [
      'M00', 'M05', 'M10', 'M17', 'M25', 'M32', 'M40', 'M45', 'M51', 'M60', 'M65', 'M99'
    ]
  }
]);

const OBI_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'RCT',
    value: OBI_RESEARCH_TYPES.RCT,
    label: 'Randomized controlled trial',
    termId: 'OBI:0000175',
    whitelistTerms: [
      'OBI:0000175',
      'OBI:0000295',
      'OBI:0000470',
      'OBI:0000516',
      'OBI:0001334',
      'OBI:0002439',
      'OBI:0002440',
      'OBI:0002441',
      'OBI:0002503',
      'OBI:0002504',
      'OBI:0003021',
      'OBI:0003022'
    ]
  },
  {
    id: 'COHORT_STUDY',
    value: OBI_RESEARCH_TYPES.COHORT_STUDY,
    label: 'Cohort study',
    termId: 'OBI:0001185',
    whitelistTerms: [
      'OBI:0001185',
      'OBI:0000443',
      'OBI:0000446',
      'OBI:0000628',
      'OBI:0000651',
      'OBI:0000844',
      'OBI:0000930',
      'OBI:0000963',
      'OBI:0001088',
      'OBI:0001385',
      'OBI:0001987',
      'OBI:0002630'
    ]
  },
  {
    id: 'CASE_CONTROL',
    value: OBI_RESEARCH_TYPES.CASE_CONTROL,
    label: 'Case-control study',
    termId: 'OBI:0001556',
    whitelistTerms: [
      'OBI:0001556',
      'OBI:0000412',
      'OBI:0000447',
      'OBI:0000600',
      'OBI:0000721',
      'OBI:0000845',
      'OBI:0000895',
      'OBI:0001265',
      'OBI:0001496',
      'OBI:0001726',
      'OBI:0001988',
      'OBI:0002631'
    ]
  },
  {
    id: 'CROSS_SECTIONAL',
    value: OBI_RESEARCH_TYPES.CROSS_SECTIONAL,
    label: 'Cross-sectional study',
    termId: 'OBI:0001548',
    whitelistTerms: [
      'OBI:0001548',
      'OBI:0000299',
      'OBI:0000423',
      'OBI:0000604',
      'OBI:0000719',
      'OBI:0000872',
      'OBI:0000943',
      'OBI:0001266',
      'OBI:0001497',
      'OBI:0001623',
      'OBI:0001989',
      'OBI:0002632'
    ]
  },
  {
    id: 'LONGITUDINAL',
    value: OBI_RESEARCH_TYPES.LONGITUDINAL,
    label: 'Longitudinal study',
    termId: 'OBI:0001546',
    whitelistTerms: [
      'OBI:0001546',
      'OBI:0000300',
      'OBI:0000424',
      'OBI:0000605',
      'OBI:0000720',
      'OBI:0000873',
      'OBI:0000944',
      'OBI:0001267',
      'OBI:0001498',
      'OBI:0001727',
      'OBI:0001990',
      'OBI:0002633'
    ]
  }
]);

const HANCESTRO_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'EUROPEAN',
    value: HANCESTRO_GROUPS.EUROPEAN,
    label: 'European ancestry cohort',
    whitelistTerms: [
      'HANCESTRO:0005',
      'HANCESTRO:0006',
      'HANCESTRO:0007',
      'HANCESTRO:0008',
      'HANCESTRO:0010',
      'HANCESTRO:0012',
      'HANCESTRO:0013',
      'HANCESTRO:0014',
      'HANCESTRO:0020',
      'HANCESTRO:0021',
      'HANCESTRO:0030',
      'HANCESTRO:0040'
    ]
  },
  {
    id: 'AFRICAN',
    value: HANCESTRO_GROUPS.AFRICAN,
    label: 'African ancestry cohort',
    whitelistTerms: [
      'HANCESTRO:0008',
      'HANCESTRO:0009',
      'HANCESTRO:0026',
      'HANCESTRO:0032',
      'HANCESTRO:0035',
      'HANCESTRO:0048',
      'HANCESTRO:0050',
      'HANCESTRO:0060',
      'HANCESTRO:0061',
      'HANCESTRO:0062',
      'HANCESTRO:0063',
      'HANCESTRO:0064'
    ]
  },
  {
    id: 'ASIAN',
    value: HANCESTRO_GROUPS.ASIAN,
    label: 'Asian ancestry cohort',
    whitelistTerms: [
      'HANCESTRO:0010',
      'HANCESTRO:0011',
      'HANCESTRO:0015',
      'HANCESTRO:0018',
      'HANCESTRO:0022',
      'HANCESTRO:0031',
      'HANCESTRO:0042',
      'HANCESTRO:0044',
      'HANCESTRO:0052',
      'HANCESTRO:0054',
      'HANCESTRO:0066',
      'HANCESTRO:0067'
    ]
  },
  {
    id: 'HISPANIC_LATIN',
    value: HANCESTRO_GROUPS.HISPANIC_LATIN,
    label: 'Hispanic or Latin American cohort',
    whitelistTerms: [
      'HANCESTRO:0014',
      'HANCESTRO:0016',
      'HANCESTRO:0017',
      'HANCESTRO:0023',
      'HANCESTRO:0033',
      'HANCESTRO:0045',
      'HANCESTRO:0046',
      'HANCESTRO:0056',
      'HANCESTRO:0057',
      'HANCESTRO:0068',
      'HANCESTRO:0069',
      'HANCESTRO:0070'
    ]
  },
  {
    id: 'NATIVE_AMERICAN',
    value: HANCESTRO_GROUPS.NATIVE_AMERICAN,
    label: 'Native American cohort',
    whitelistTerms: [
      'HANCESTRO:0013',
      'HANCESTRO:0024',
      'HANCESTRO:0025',
      'HANCESTRO:0027',
      'HANCESTRO:0028',
      'HANCESTRO:0029',
      'HANCESTRO:0034',
      'HANCESTRO:0041',
      'HANCESTRO:0049',
      'HANCESTRO:0058',
      'HANCESTRO:0065',
      'HANCESTRO:0071'
    ]
  }
]);

const ISO3166_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'NORTH_AMERICA',
    value: ISO3166_REGIONS.NORTH_AMERICA,
    label: 'North America',
    whitelistTerms: ['US', 'CA', 'MX', 'BM', 'GL', 'PM', 'PR', 'VI', 'BQ', 'CW', 'SX', 'HT']
  },
  {
    id: 'EUROPE',
    value: ISO3166_REGIONS.EUROPE,
    label: 'Europe',
    whitelistTerms: ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'SE', 'NO', 'FI', 'PL', 'PT', 'IE', 'CH', 'AT']
  },
  {
    id: 'ASIA',
    value: ISO3166_REGIONS.ASIA,
    label: 'Asia-Pacific',
    whitelistTerms: ['CN', 'JP', 'KR', 'HK', 'SG', 'TW', 'TH', 'VN', 'MY', 'PH', 'ID', 'IN', 'PK', 'LK']
  },
  {
    id: 'OCEANIA',
    value: ISO3166_REGIONS.OCEANIA,
    label: 'Oceania',
    whitelistTerms: ['AU', 'NZ', 'PG', 'FJ', 'WS', 'TO', 'SB', 'VU', 'PF', 'NC', 'CK', 'NU']
  },
  {
    id: 'AFRICA',
    value: ISO3166_REGIONS.AFRICA,
    label: 'Africa',
    whitelistTerms: ['ZA', 'NG', 'EG', 'KE', 'TZ', 'GH', 'CI', 'UG', 'DZ', 'MA', 'TN', 'SN', 'ET']
  }
]);

const SNOMED_SCOPE_LIBRARY = Object.freeze([
  {
    id: 'DIAGNOSTIC',
    value: SNOMED_TERMS.DIAGNOSTIC,
    label: 'Diagnostic procedures',
    whitelistTerms: [
      'SNOMED:25245007',
      'SNOMED:363413005',
      'SNOMED:118227000',
      'SNOMED:252465000',
      'SNOMED:113076002',
      'SNOMED:252465004'
    ]
  },
  {
    id: 'THERAPEUTIC',
    value: SNOMED_TERMS.THERAPEUTIC,
    label: 'Therapeutic procedures',
    whitelistTerms: [
      'SNOMED:708339004',
      'SNOMED:432102000',
      'SNOMED:23426006',
      'SNOMED:397956004',
      'SNOMED:386053000',
      'SNOMED:225390008'
    ]
  },
  {
    id: 'PREVENTIVE',
    value: SNOMED_TERMS.PREVENTIVE,
    label: 'Preventive care',
    whitelistTerms: [
      'SNOMED:703423007',
      'SNOMED:710815001',
      'SNOMED:394703006',
      'SNOMED:243796009',
      'SNOMED:171828008',
      'SNOMED:243788004'
    ]
  },
  {
    id: 'PALLIATIVE',
    value: SNOMED_TERMS.PALLIATIVE,
    label: 'Palliative care',
    whitelistTerms: [
      'SNOMED:385763009',
      'SNOMED:385712009',
      'SNOMED:385725000',
      'SNOMED:385749007',
      'SNOMED:385797002',
      'SNOMED:385795005'
    ]
  },
  {
    id: 'EMERGENCY',
    value: SNOMED_TERMS.EMERGENCY,
    label: 'Emergency care',
    whitelistTerms: [
      'SNOMED:50849002',
      'SNOMED:74074008',
      'SNOMED:50849003',
      'SNOMED:114500000',
      'SNOMED:50849004',
      'SNOMED:87100002'
    ]
  }
]);

// ---------------------------------------------------------------------
// RNG helpers
// ---------------------------------------------------------------------

function createDeterministicRng(seedOrFn) {
  if (typeof seedOrFn === 'function') {
    return seedOrFn;
  }
  if (seedOrFn === undefined || seedOrFn === null) {
    return Math.random;
  }
  let seed;
  if (typeof seedOrFn === 'number') {
    seed = seedOrFn >>> 0;
  } else if (typeof seedOrFn === 'string') {
    const hash = crypto.createHash('sha256').update(seedOrFn).digest('hex');
    seed = parseInt(hash.slice(0, 8), 16) >>> 0;
  } else {
    throw new Error('Seed must be a number, string, RNG function, or undefined');
  }
  return mulberry32(seed);
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  if (min === max) return min;
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomChoice(rng, array) {
  if (!Array.isArray(array) || array.length === 0) {
    throw new Error('randomChoice requires a non-empty array');
  }
  const idx = randomInt(rng, 0, array.length - 1);
  return array[idx];
}

function shuffleInPlace(rng, array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function sampleWithoutReplacement(rng, source, count) {
  if (count <= 0) {
    return [];
  }
  if (count >= source.length) {
    return source.slice();
  }
  const indices = Array.from({ length: source.length }, (_, idx) => idx);
  shuffleInPlace(rng, indices);
  return indices.slice(0, count).map((idx) => source[idx]);
}

function formatNumberLike(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'object' && typeof value.toString === 'function') {
    return value.toString();
  }
  return value;
}

function serializeTransactionResponse(tx) {
  if (!tx) return null;
  return {
    hash: tx.hash || null,
    from: tx.from || null,
    to: tx.to || null,
    nonce: typeof tx.nonce === 'number' ? tx.nonce : null,
    gasLimit: formatNumberLike(tx.gasLimit),
    maxFeePerGas: formatNumberLike(tx.maxFeePerGas),
    maxPriorityFeePerGas: formatNumberLike(tx.maxPriorityFeePerGas),
    value: formatNumberLike(tx.value),
    type: tx.type ?? null,
    chainId: typeof tx.chainId === 'number' ? tx.chainId : null,
    dataLength: tx.data ? tx.data.length : 0
  };
}

function serializeLog(log) {
  if (!log) return null;
  return {
    address: log.address || null,
    data: log.data || null,
    topics: Array.isArray(log.topics) ? log.topics.slice() : [],
    index: typeof log.logIndex === 'number' ? log.logIndex : null,
    transactionIndex: typeof log.transactionIndex === 'number' ? log.transactionIndex : null
  };
}

function serializeReceipt(receipt) {
  if (!receipt) return null;
  return {
    transactionHash: receipt.transactionHash || null,
    blockNumber: typeof receipt.blockNumber === 'number' ? receipt.blockNumber : null,
    gasUsed: formatNumberLike(receipt.gasUsed),
    cumulativeGasUsed: formatNumberLike(receipt.cumulativeGasUsed),
    status: receipt.status ?? null,
    contractAddress: receipt.contractAddress || null,
    logs: Array.isArray(receipt.logs) ? receipt.logs.map(serializeLog) : []
  };
}

function evaluatePolicyTokens(tokens, numOperations, attrs, predicateTruth, attributeCount, predicateCount) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    return false;
  }
  const opCount = Math.min(
    Number.isInteger(numOperations) && numOperations > 0 ? numOperations : tokens.length,
    tokens.length
  );
  const stack = [];
  const predicates = Array.isArray(predicateTruth) ? predicateTruth : [];
  for (let i = 0; i < opCount; i += 1) {
    const token = tokens[i];
    if (!Number.isInteger(token)) {
      continue;
    }
    if (token < attributeCount) {
      stack.push(Boolean(attrs[token]));
      continue;
    }
    if (token < attributeCount + predicateCount) {
      const slot = token - attributeCount;
      stack.push(Boolean(predicates[slot]));
      continue;
    }
    const opCode = token - attributeCount - predicateCount;
    if (opCode === 0) {
      if (stack.length < 2) return false;
      const right = stack.pop();
      const left = stack.pop();
      stack.push(left && right);
    } else if (opCode === 1) {
      if (stack.length < 2) return false;
      const right = stack.pop();
      const left = stack.pop();
      stack.push(left || right);
    } else if (opCode === 2) {
      if (stack.length < 1) return false;
      const value = stack.pop();
      stack.push(!value);
    } else {
      return false;
    }
  }
  if (stack.length === 0) {
    return false;
  }
  return Boolean(stack[stack.length - 1]);
}

function findDuoV3AssignmentForPolicy({
  targetTruth,
  activeIndices,
  policyTokens = null,
  numOperations = null,
  predicateCount = POLICY_PREDICATE_COUNT
}) {
  const predicateTruth = Array.from({ length: predicateCount }, () => 1);
  const ontologyCodes = ['DS', 'RS', 'POA', 'GS', 'CC'];
  let fallback = null;

  for (let profileClaims = 0; profileClaims < 128; profileClaims += 1) {
    for (let ontologyMask = 0; ontologyMask < 32; ontologyMask += 1) {
      const ontologyAttrs = Object.fromEntries(
        ontologyCodes.map((code, index) => [code, Boolean((ontologyMask >> index) & 1)])
      );
      const attributes = deriveDuoV3RequesterAttrs(profileClaims, ontologyAttrs);
      const evaluatesToTarget = Array.isArray(policyTokens) && policyTokens.length > 0
        ? evaluatePolicyTokens(
          policyTokens,
          numOperations,
          attributes,
          predicateTruth,
          POLICY_ATTRIBUTE_ORDER.length,
          predicateCount
        ) === targetTruth
        : (targetTruth
          ? activeIndices.every((index) => attributes[index] === 1)
          : activeIndices.some((index) => attributes[index] === 0));

      if (!evaluatesToTarget) continue;

      const preferred = targetTruth
        ? activeIndices.every((index) => attributes[index] === 1)
        : activeIndices.some((index) => attributes[index] === 0);
      const candidate = { attributes, duoProfileClaims: profileClaims };
      if (preferred) return candidate;
      if (!fallback) fallback = candidate;
    }
  }

  return fallback;
}

function applyProofPadding(originalProof, targetLength = DEFAULT_PROOF_PAD_TARGET_BYTES, baseLengthHint) {
  const baseLength = typeof baseLengthHint === 'number'
    ? baseLengthHint
    : JSON.stringify(originalProof).length;
  if (baseLength >= targetLength) {
    return {
      paddedProof: originalProof,
      finalLength: baseLength,
      padApplied: false,
      padBytes: 0
    };
  }

  const baseWithPadOverhead = JSON.stringify({ ...originalProof, pad: '' }).length;
  const overhead = baseWithPadOverhead - baseLength;
  const requiredPad = Math.max(0, targetLength - baseLength - overhead);
  const padPayload = requiredPad > 0 ? '0'.repeat(requiredPad) : '';
  const paddedProof = { ...originalProof, pad: padPayload };
  let finalLength = JSON.stringify(paddedProof).length;

  if (finalLength < targetLength) {
    const extra = targetLength - finalLength;
    paddedProof.pad += '0'.repeat(extra);
    finalLength = JSON.stringify(paddedProof).length;
  }

  return {
    paddedProof,
    finalLength,
    padApplied: true,
    padBytes: finalLength - baseLength
  };
}

function incrementCounter(map, key, amount = 1) {
  const current = map.get(key) ?? 0;
  map.set(key, current + amount);
}

// Validate against the complete production DUO V3 attribute set.
const ATTRIBUTE_CODE_SET = new Set(POLICY_ATTRIBUTE_CODES);

const ATTRIBUTE_CODE_TO_DUO_TERM = Object.freeze(
  Object.entries(DUO_TO_ATTRIBUTE_CODE).reduce((acc, [duoValue, code]) => {
    acc[code] = Number(duoValue);
    return acc;
  }, {})
);

function canonicalizeAttributeCode(value) {
  if (value === undefined || value === null) {
    throw new Error('Attribute code is required');
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    if (ATTRIBUTE_CODE_SET.has(normalized)) {
      return normalized;
    }
    const mapped = ATTRIBUTE_ALIAS_MAP[normalized];
    if (mapped && ATTRIBUTE_CODE_SET.has(mapped)) {
      return mapped;
    }
  }
  if (typeof value === 'number') {
    const code = DUO_TO_ATTRIBUTE_CODE[value];
    if (code && ATTRIBUTE_CODE_SET.has(code)) {
      return code;
    }
  }
  throw new Error(`Unsupported attribute identifier for policy dataset generation: ${value}`);
}

function canonicalizeDuoCombination(combo) {
  if (!combo) {
    throw new Error('DUO combination is required');
  }
  const values = Array.isArray(combo) ? combo : [combo];
  const result = [];
  values.forEach((value) => {
    const code = canonicalizeAttributeCode(value);
    if (!result.includes(code)) {
      result.push(code);
    }
  });
  if (result.length === 0) {
    throw new Error('DUO combination must include at least one attribute');
  }

  return result;
}

function checkCombinationConflicts(combo, conflictRules = []) {
  for (const rule of conflictRules) {
    const includesAll = (rule.includes || []).every((code) => combo.includes(canonicalizeAttributeCode(code)));
    if (!includesAll) {
      continue;
    }
    const violates = (rule.excludes || []).some((code) => combo.includes(canonicalizeAttributeCode(code)));
    if (violates) {
      return false;
    }
  }
  return true;
}

function maybeNegate(rng, token, probability, budget) {
  if (probability <= 0) {
    return token;
  }
  if (budget && budget.remaining <= 0) {
    return token;
  }
  if (rng() < probability) {
    if (budget) {
      budget.remaining = Math.max(0, budget.remaining - 1);
    }
    return `!${token}`;
  }
  return token;
}

function buildLogicFromCombination(rng, combo, options = {}) {
  const {
    notProbability = 0,
    groupNotProbability = 0,
    operators = ['AND', 'OR'],
    maxNotOperators = Infinity,
    ensureMixedOperators = false
  } = options;

  const notBudget = Number.isFinite(maxNotOperators)
    ? { remaining: Math.max(0, maxNotOperators) }
    : null;

  if (combo.length === 1) {
    return maybeNegate(rng, combo[0], notProbability, notBudget);
  }

  const tokens = combo.slice();

  shuffleInPlace(rng, tokens);

  const junctionCount = tokens.length - 1;
  let operatorSequence = null;
  if (
    ensureMixedOperators &&
    junctionCount >= 2 &&
    operators.includes('AND') &&
    operators.includes('OR')
  ) {
    // Guarantee at least one AND and one OR junction so the author-level
    // expression always classifies as and_or_mixed.
    operatorSequence = ['AND', 'OR'];
    while (operatorSequence.length < junctionCount) {
      operatorSequence.push(randomChoice(rng, operators));
    }
    shuffleInPlace(rng, operatorSequence);
  }

  let expr = maybeNegate(rng, tokens[0], notProbability, notBudget);
  for (let i = 1; i < tokens.length; i += 1) {
    const operator = operatorSequence
      ? operatorSequence[i - 1]
      : randomChoice(rng, operators);
    const right = maybeNegate(rng, tokens[i], notProbability, notBudget);
    const grouped = `(${expr} ${operator === 'AND' ? '&' : '|'} ${right})`;
    expr = maybeNegate(rng, grouped, groupNotProbability, notBudget);
  }
  return expr;
}

function mergeLogicOptions(...candidates) {
  const merged = {};
  candidates.filter(Boolean).forEach((options) => {
    Object.entries(options).forEach(([key, value]) => {
      merged[key] = Array.isArray(value) ? value.slice() : value;
    });
  });
  return merged;
}

function normalizeArrayOption(option) {
  if (option === undefined || option === null) {
    return null;
  }
  if (Array.isArray(option)) {
    return option.length > 0 ? option : null;
  }
  return [option];
}

function resolveOptionArray(...options) {
  for (const option of options) {
    const normalized = normalizeArrayOption(option);
    if (normalized && normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function mergeExecutionProtections(...sources) {
  const merged = {};
  sources.filter(Boolean).forEach((source) => {
    Object.entries(source).forEach(([key, value]) => {
      merged[key] = Array.isArray(value) ? value.slice() : [value];
    });
  });
  return merged;
}

function estimateBaseTokenCount(combo) {
  let predicateCount = 0;
  let nonPredicateCount = 0;
  combo.forEach((code) => {
    if (ATTRIBUTE_PREDICATE_SLOT[code] !== undefined) {
      predicateCount += 1;
    } else {
      nonPredicateCount += 1;
    }
  });
  const structuralOps = Math.max(0, combo.length - 1);
  return predicateCount * 3 + nonPredicateCount + structuralOps;
}

function getIcdScopeByValue(value) {
  return ICD10_SCOPE_LIBRARY.find((entry) => entry.value === value) || null;
}

function getObiScopeByValue(value) {
  return OBI_SCOPE_LIBRARY.find((entry) => entry.value === value) || null;
}

async function buildOntologyWhitelistForScope(options) {
  const {
    rng,
    namespace,
    availableTerms,
    whitelistSize,
    merkleDepth,
    epoch = ONTOLOGY_EPOCH
  } = options;


  if (!Array.isArray(availableTerms) || availableTerms.length === 0) {
    throw new Error(`No ontology terms available for namespace ${namespace}`);
  }

  const treeCapacity = 1 << merkleDepth;
  const targetSize = Math.min(whitelistSize, availableTerms.length, treeCapacity);
  const selectedTerms = sampleWithoutReplacement(rng, availableTerms, targetSize);

  const whitelistTerms = selectedTerms.map((termId) => ({
    namespace,
    termId,
    epoch
  }));

  const whitelist = await buildWhitelist({
    merkleLevels: merkleDepth,
    terms: whitelistTerms,
    defaultNamespace: namespace,
    defaultEpoch: epoch
  });

  return {
    rootHex: whitelist.metadata.rootHex,
    configHash: whitelist.metadata.configHash,
    leafCount: whitelist.metadata.leafCount,
    treeSize: whitelist.metadata.treeSize,
    terms: selectedTerms,
    memberEvidence: {
      ontologyCode: whitelist.entries[0].packed.toString(),
      leaf: whitelist.entries[0].leaf.toString(),
      pathElements: whitelist.entries[0].pathElements.map(String),
      pathIndices: whitelist.entries[0].pathIndices.slice()
    }
  };
}

function ensureDepthForSize(depthOptions, size) {
  const sorted = [...depthOptions].sort((a, b) => a - b);
  for (const depth of sorted) {
    if ((1 << depth) >= size) {
      return depth;
    }
  }
  return sorted[sorted.length - 1];
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()].sort(([a], [b]) => {
    if (a < b) return -1;
    if (a > b) return 1;
    return 0;
  }));
}

async function createPolicyBlueprint(params) {
  const {
    layerName,
    combo,
    rng,
    config,
    index,
    layerConfig = {},
    variantProfile = null,
    layerState = {}
  } = params;

  const attributeOrder = config.attributeOrder || POLICY_ATTRIBUTE_ORDER;
  const combination = canonicalizeDuoCombination(combo);

  const logicOptions = mergeLogicOptions(
    config.logicOptions,
    layerConfig.logicOptions,
    variantProfile?.logicOptions
  );
  if (Number(logicOptions.notProbability || 0) > 0 || Number(logicOptions.groupNotProbability || 0) > 0) {
    throw new Error(
      `[layer:${layerName} combo:${combination.join('+')}] DUO V3 does not support NOT; ` +
      'set notProbability and groupNotProbability to 0'
    );
  }
  const depthLimit = config.policyDepth || DEFAULT_POLICY_DEPTH;
  const baseTokenEstimate = estimateBaseTokenCount(combination);
  if (baseTokenEstimate > depthLimit) {
    throw new Error(`Combination ${combination.join('+')} requires ${baseTokenEstimate} tokens but depth limit is ${depthLimit}`);
  }
  const configuredNotLimit = logicOptions.maxNotOperators;
  const computedNotLimit = Math.max(0, depthLimit - baseTokenEstimate);
  const effectiveNotLimit = Number.isFinite(configuredNotLimit)
    ? Math.min(configuredNotLimit, computedNotLimit)
    : computedNotLimit;
  const logicOptionsWithBudget = {
    ...logicOptions,
    maxNotOperators: effectiveNotLimit
  };

  const whitelistBuckets = resolveOptionArray(
    variantProfile?.whitelistBuckets,
    layerConfig.whitelistBuckets,
    config.whitelistBuckets,
    DEFAULT_WHITELIST_BUCKETS
  ) || DEFAULT_WHITELIST_BUCKETS;

  const merkleDepthOptions = resolveOptionArray(
    variantProfile?.merkleDepthOptions,
    layerConfig.merkleDepthOptions,
    config.merkleDepthOptions,
    DEFAULT_MERKLE_DEPTH_OPTIONS
  ) || DEFAULT_MERKLE_DEPTH_OPTIONS;
  if (merkleDepthOptions.some((depth) => depth !== 8)) {
    throw new Error(
      `[layer:${layerName} combo:${combination.join('+')}] DUO V3 requires merkleDepthOptions=[8]`
    );
  }

  const proofTypes = resolveOptionArray(
    variantProfile?.proofTypes,
    layerConfig.proofTypes,
    config.proofTypes,
    DEFAULT_PROOF_TYPES
  ) || DEFAULT_PROOF_TYPES;

  const executionProtections = mergeExecutionProtections(
    DEFAULT_EXECUTION_PROTECTIONS,
    config.executionProtections,
    layerConfig.executionProtections,
    variantProfile?.executionProtections
  );

  const proofType = randomChoice(rng, proofTypes);

  const logicOverride = variantProfile?.logic || layerConfig.logic;
  const lockLogic = Boolean(
    variantProfile?.lockLogicToCombination ??
    layerConfig.lockLogicToCombination
  );
  let logic;
  const logicCacheKey = combination.join('+');
  if (logicOverride) {
    logic = logicOverride;
  } else if (lockLogic) {
    layerState.logicCache = layerState.logicCache || new Map();
    if (layerState.logicCache.has(logicCacheKey)) {
      logic = layerState.logicCache.get(logicCacheKey);
    } else {
      logic = buildLogicFromCombination(rng, combination, logicOptionsWithBudget || {});
      layerState.logicCache.set(logicCacheKey, logic);
    }
  } else {
    logic = buildLogicFromCombination(rng, combination, logicOptionsWithBudget || {});
  }

  const structure = {
    whitelistSize: 0,
    merkleDepth: randomChoice(rng, merkleDepthOptions),
    proofType,
    predicateRoots: {},
    whitelists: {}
  };

  const variantLabel = variantProfile?.name || variantProfile?.label || variantProfile?.id || null;
  const hasProfile = combination.some((code) => PROFILE_TERM_SET.has(code));

  const semantics = {
    layer: layerName,
    layerVariant: variantLabel,
    duoTerms: combination.slice(),
    duoTermValues: combination.map((code) => ATTRIBUTE_CODE_TO_DUO_TERM[code]),
    primaryDuoTerm: combination[0],
    primaryDuoTermValue: ATTRIBUTE_CODE_TO_DUO_TERM[combination[0]],
    hasOntology: combination.some((code) => ATTRIBUTE_PREDICATE_SLOT[code] !== undefined),
    hasProfile,
    hasObligation: combination.includes('RS'),
    hasCredential: proofType === 'credential_proof',
    predicateCount: combination.filter((code) => ATTRIBUTE_PREDICATE_SLOT[code] !== undefined).length + (hasProfile ? 1 : 0),
    icd10Scope: null,
    obiScope: null,
    populationScope: null,
    geoScope: null,
    clinicalScope: null
  };

  const predicateSlots = [];
  const predicateValuesBySlot = {};
  const predicateEvidenceBySlot = {};

  const icdScopes = variantProfile?.icd10Scopes || layerConfig.icd10Scopes || config.icd10Scopes || ICD10_SCOPE_LIBRARY;
  const obiScopes = variantProfile?.obiScopes || layerConfig.obiScopes || config.obiScopes || OBI_SCOPE_LIBRARY;
  const ancestryScopes = variantProfile?.hancestroScopes || layerConfig.hancestroScopes || config.hancestroScopes || HANCESTRO_SCOPE_LIBRARY;
  const geoScopes = variantProfile?.iso3166Scopes || layerConfig.iso3166Scopes || config.iso3166Scopes || ISO3166_SCOPE_LIBRARY;
  const clinicalScopes = variantProfile?.snomedScopes || layerConfig.snomedScopes || config.snomedScopes || SNOMED_SCOPE_LIBRARY;

  async function attachPredicate(options) {
    const {
      code,
      namespace,
      scopes,
      semanticsKey,
      extraMetadata = () => ({})
    } = options;

    if (!combination.includes(code)) {
      return;
    }

    const chosenScope = randomChoice(rng, scopes);
    const whitelistSize = randomChoice(rng, whitelistBuckets);
    const adjustedDepth = ensureDepthForSize(merkleDepthOptions, whitelistSize);
    structure.whitelistSize = Math.max(structure.whitelistSize, whitelistSize);
    structure.merkleDepth = Math.max(structure.merkleDepth, adjustedDepth);

    const whitelist = await buildOntologyWhitelistForScope({
      rng,
      namespace,
      availableTerms: chosenScope.whitelistTerms || [],
      whitelistSize,
      merkleDepth: adjustedDepth
    });

    const slot = ATTRIBUTE_PREDICATE_SLOT[code];
    structure.predicateRoots[slot] = whitelist.rootHex;
    structure.whitelists[slot] = {
      namespace,
      scopeId: chosenScope.id,
      scopeLabel: chosenScope.label,
      configHash: whitelist.configHash,
      leafCount: whitelist.leafCount,
      selectedTerms: whitelist.terms,
      ...extraMetadata(chosenScope)
    };

    predicateSlots.push(slot);
    predicateValuesBySlot[slot] = chosenScope.value;
    predicateEvidenceBySlot[slot] = whitelist.memberEvidence;
    semantics[semanticsKey] = {
      id: chosenScope.id,
      label: chosenScope.label,
      ...(chosenScope.level ? { level: chosenScope.level } : {}),
      ...(chosenScope.codeRange ? { codeRange: chosenScope.codeRange } : {})
    };
  }

  if (combination.includes('DS')) {
    await attachPredicate({
      code: 'DS',
      namespace: 'ICD10',
      scopes: icdScopes,
      semanticsKey: 'icd10Scope',
      extraMetadata: (scope) => ({
        codeRange: scope.codeRange,
        level: scope.level
      })
    });
  }

  if (combination.includes('RS')) {
    await attachPredicate({
      code: 'RS',
      namespace: 'OBI',
      scopes: obiScopes,
      semanticsKey: 'obiScope',
      extraMetadata: (scope) => ({
        termId: scope.termId
      })
    });
  }

  if (combination.includes('POA')) {
    await attachPredicate({
      code: 'POA',
      namespace: 'HANCESTRO',
      scopes: ancestryScopes,
      semanticsKey: 'populationScope',
      extraMetadata: () => ({})
    });
  }

  if (combination.includes('GS')) {
    await attachPredicate({
      code: 'GS',
      namespace: 'ISO3166',
      scopes: geoScopes,
      semanticsKey: 'geoScope',
      extraMetadata: () => ({})
    });
  }

  if (combination.includes('CC')) {
    await attachPredicate({
      code: 'CC',
      namespace: 'SNOMED',
      scopes: clinicalScopes,
      semanticsKey: 'clinicalScope',
      extraMetadata: () => ({})
    });
  }

  if (predicateSlots.length === 0) {
    structure.whitelistSize = 0;
  }

  const execution = {};
  Object.entries(executionProtections).forEach(([key, values]) => {
    execution[key] = randomChoice(rng, values);
  });

  const attributes = {};
  attributeOrder.forEach((code) => {
    attributes[code] = combination.includes(code);
  });

  const predicateTemplates = POLICY_PREDICATE_SLOTS
    .filter((slot) => predicateSlots.includes(slot.slot))
    .map((slot) => {
    const copy = { ...slot };
    if (structure.predicateRoots[slot.slot]) {
      copy.root = structure.predicateRoots[slot.slot];
    }
    return copy;
  });

  if (hasProfile) {
    const profileIssuer = await getExperimentProfileIssuer();
    predicateTemplates.push({
      slot: DUO_V3_PROFILE_SLOT,
      duo: 'DUO_PROFILE',
      issuerKeyCommitment: profileIssuer.issuerKeyCommitment
    });
    predicateSlots.push(DUO_V3_PROFILE_SLOT);
  }

  const policyId = `${layerName || 'layer'}-${index}`;
  let artifacts;
  try {
    artifacts = await generatePolicyArtifacts(
      {
        policy_id: policyId,
        attributes,
        predicates: predicateTemplates,
        logic
      },
      {
        depth: config.policyDepth || DEFAULT_POLICY_DEPTH,
        attributeOrder
      }
    );
  } catch (error) {
    error.message = `[layer:${layerName} combo:${combination.join('+')}] ${error.message}`;
    throw error;
  }

  const blueprint = {
    id: policyId,
    layerName,
    layerVariant: variantLabel,
    index,
    duoTerms: combination.slice(),
    semantics: {
      ...semantics,
      logicOriginal: artifacts.logic.original,
      logicNormalized: artifacts.logic.normalized
    },
    structure: {
      ...structure,
      policyDepth: artifacts.depth,
      policyHash: artifacts.policyHash,
      randomizer: artifacts.randomizer,
      policyCommitment: artifacts.policyCommitment
    },
    execution,
    artifacts,
    predicateSlots,
    predicateValuesBySlot,
    predicateEvidenceBySlot,
    attributeOrder,
    satisfyPlanSeed: rng()
  };

  return blueprint;
}

function getVariantProfiles(layer) {
  if (Array.isArray(layer.variants) && layer.variants.length > 0) {
    return layer.variants;
  }
  if (Array.isArray(layer.variantProfiles) && layer.variantProfiles.length > 0) {
    return layer.variantProfiles;
  }
  return [null];
}

async function buildPolicyBlueprints(config, rng) {
  const policyCount = config.policyCount ?? DEFAULT_POLICY_COUNT;
  const semanticLayers = config.semanticLayers || DEFAULT_SEMANTIC_LAYERS;
  const conflictRules = config.duoConflicts || DEFAULT_DUO_CONFLICT_RULES;

  const layers = semanticLayers.map((layer) => {
    const combos = (layer.combos || [])
      .map((combo) => canonicalizeDuoCombination(combo))
      .filter((combo) => checkCombinationConflicts(combo, conflictRules));
    const minPolicies = layer.minPolicies ?? 0;
    let maxPolicies = layer.maxPolicies ?? Number.POSITIVE_INFINITY;
    if (!Number.isFinite(maxPolicies)) {
      maxPolicies = Number.POSITIVE_INFINITY;
    }
    if (maxPolicies < minPolicies) {
      maxPolicies = minPolicies;
    }
    return {
      ...layer,
      name: layer.name || 'layer',
      combos,
      minPolicies,
      maxPolicies,
      _state: layer._state || {}
    };
  }).filter((layer) => layer.combos.length > 0);

  if (layers.length === 0) {
    throw new Error('No semantic layers available to sample policies');
  }

  const totalMinPolicies = layers.reduce((sum, layer) => sum + layer.minPolicies, 0);
  const targetPolicies = Math.max(policyCount, totalMinPolicies);

  const layerTargets = layers.map((layer) => Math.min(layer.maxPolicies, layer.minPolicies));
  let assigned = layerTargets.reduce((sum, value) => sum + value, 0);

  while (assigned < targetPolicies) {
    let progressed = false;
    for (let i = 0; i < layers.length && assigned < targetPolicies; i += 1) {
      const layer = layers[i];
      if (layerTargets[i] < layer.maxPolicies) {
        layerTargets[i] += 1;
        assigned += 1;
        progressed = true;
      }
    }
    if (!progressed) {
      break;
    }
  }

  if (assigned < targetPolicies) {
    console.warn(`Unable to reach desired policy count (${targetPolicies}); capped at ${assigned} due to layer max policies.`);
  }

  const targetPlan = layers.map((layer, idx) => ({
    layer,
    target: layerTargets[idx]
  }));

  console.log('Policy blueprint targets per layer:',
    targetPlan.map(({ layer, target }) => ({
      layer: layer.name,
      target,
      min: layer.minPolicies,
      max: Number.isFinite(layer.maxPolicies) ? layer.maxPolicies : '∞'
    })));

  const blueprints = [];
  let policyIndex = 0;

  for (const { layer, target } of targetPlan) {
    if (target === 0) continue;
    const variantProfiles = getVariantProfiles(layer);
    let comboIndex = 0;
    let produced = 0;
    while (produced < target) {
      const combo = layer.combos[comboIndex % layer.combos.length];
      comboIndex += 1;
      for (const variantProfile of variantProfiles) {
        if (produced >= target) break;
        const blueprint = await createPolicyBlueprint({
          layerName: layer.name,
          combo,
          rng,
          config,
          index: policyIndex,
          layerConfig: layer,
          variantProfile,
          layerState: layer._state
        });
        blueprints.push(blueprint);
        produced += 1;
        policyIndex += 1;
      }
    }
  }

  return blueprints;
}

function buildSatisfactionPlan(executionsPerPolicy, satisfyRatio, rng) {
  const satisfyCount = Math.round(executionsPerPolicy * satisfyRatio);
  const plan = Array.from({ length: executionsPerPolicy }, (_, idx) => idx < satisfyCount);
  shuffleInPlace(rng, plan);
  return plan;
}

/**
 * Select the depth-layer subset for two-layer execution.
 *
 * Groups blueprints by author-level logicStructure (reusing the SPP classifier)
 * and deterministically samples `perStructure` blueprints from each requested
 * structure bucket. Returns a Set of policyId. The RNG is seeded so the same
 * config + seed always selects the same subset (auditable, reproducible).
 *
 * Lazy-requires the SPP data_generator to avoid a module-load circular import
 * (SPP data_generator requires this file); by call time the cycle is resolved.
 */
function selectDepthSubset(blueprints, { perStructure, structures, rng }) {
  const { analyzeLogicShape, classifyLogicStructure } =
    require('../analysis/crosscheck/spp/data_generator');

  const byStructure = new Map();
  for (const bp of blueprints) {
    const ls = classifyLogicStructure(
      analyzeLogicShape(bp.semantics.logicOriginal || bp.semantics.logicNormalized || '')
    );
    if (!byStructure.has(ls)) byStructure.set(ls, []);
    byStructure.get(ls).push(bp);
  }

  const selected = new Set();
  for (const structure of structures) {
    const pool = byStructure.get(structure) || [];
    const picked = sampleWithoutReplacement(rng, pool, perStructure);
    if (picked.length < perStructure) {
      console.warn(
        `[depth-subset] structure ${structure}: only ${picked.length}/${perStructure} blueprints available`
      );
    }
    picked.forEach((bp) => selected.add(bp.id));
  }
  return selected;
}

/**
 * Check if a DUO term is ontology-linked (requires external ontology)
 */
function isOntologyLinked(duoTerm) {
  return ONTOLOGY_LINKED_TERMS.has(duoTerm);
}

/**
 * Get the ontology namespace for an ontology-linked DUO term
 */
function getOntologyNamespace(duoTerm) {
  return ONTOLOGY_LINKED_TERMS.get(duoTerm);
}

/**
 * Get the ontology values for a given namespace
 */
function getOntologyValues(namespace) {
  switch (namespace) {
    case 'ICD10':
      return Object.values(ICD10_CHAPTERS);
    case 'OBI':
      return Object.values(OBI_RESEARCH_TYPES);
    case 'HANCESTRO':
      return Object.values(HANCESTRO_GROUPS);
    case 'ISO3166':
      return Object.values(ISO3166_REGIONS);
    case 'SNOMED':
      return Object.values(SNOMED_TERMS);
    default:
      return [];
  }
}

/**
 * Generate a policy configuration
 * Policy format: [attr0, attr1, attr2, op1, op2, ...padding]
 * We encode DUO terms as attributes and ontology terms as external predicates
 */
async function generatePolicy(duoTerm, ontologyValue = null) {
  const attributeCode = DUO_TO_ATTRIBUTE_CODE[duoTerm];
  if (!attributeCode) {
    throw new Error(`DUO term ${duoTerm} is not supported by the experiment configuration`);
  }

  const attributeMap = {};
  POLICY_ATTRIBUTE_ORDER.forEach((code) => {
    attributeMap[code] = code === attributeCode;
  });

  const requiresOntology = Boolean(ATTRIBUTE_PREDICATE_SLOT[attributeCode] !== undefined);
  const requiresProfile = PROFILE_TERM_SET.has(attributeCode);
  const namespace = requiresOntology ? getOntologyNamespace(duoTerm) : null;
  const predicates = [];
  if (requiresOntology) {
    const slot = POLICY_PREDICATE_SLOTS.find((entry) => entry.duo === attributeCode);
    predicates.push({ ...slot });
  }
  if (requiresProfile) {
    const profileIssuer = await getExperimentProfileIssuer();
    predicates.push({
      slot: DUO_V3_PROFILE_SLOT,
      duo: 'DUO_PROFILE',
      issuerKeyCommitment: profileIssuer.issuerKeyCommitment
    });
  }

  const artifacts = await generatePolicyArtifacts(
    {
      policy_id: `duo-${attributeCode.toLowerCase()}`,
      attributes: attributeMap,
      predicates,
      logic: attributeCode
    },
    {
      depth: DEFAULT_POLICY_DEPTH,
      attributeOrder: POLICY_ATTRIBUTE_ORDER
    }
  );

  const predicateSlot = requiresOntology ? ATTRIBUTE_PREDICATE_SLOT[attributeCode] : null;

  return {
    policy: artifacts.policy,
    tokens: artifacts.tokens,
    duoTerm,
    attributeCode,
    ontologyNamespace: requiresOntology ? namespace : null,
    ontologyValue: requiresOntology ? ontologyValue : null,
    requiresOntology,
    predicateSlots: [
      ...(requiresOntology && predicateSlot !== null ? [predicateSlot] : []),
      ...(requiresProfile ? [DUO_V3_PROFILE_SLOT] : [])
    ],
    requiresProfile,
    numOperations: artifacts.numOperations,
    description: requiresOntology
      ? `DUO:${attributeCode} & ${namespace}${ontologyValue !== null ? `:${ontologyValue}` : ''}`
      : `DUO:${attributeCode}`
  };
}

/**
 * Generate requester attributes that satisfy or don't satisfy the policy
 */
function resolveActiveCodes(selection) {
  if (!selection && selection !== 0) {
    throw new Error('Selection is required to generate requester attributes');
  }
  if (Array.isArray(selection)) {
    return canonicalizeDuoCombination(selection);
  }
  if (typeof selection === 'object' && selection !== null) {
    if (Array.isArray(selection.duoTerms)) {
      return canonicalizeDuoCombination(selection.duoTerms);
    }
    if (selection.primaryDuoTerm !== undefined) {
      return canonicalizeDuoCombination([selection.primaryDuoTerm].concat(selection.additionalDuoTerms || []));
    }
  }
  return canonicalizeDuoCombination([selection]);
}

function generateRequesterProfile(selection, satisfy, options = {}) {
  const {
    attributeOrder = POLICY_ATTRIBUTE_ORDER,
    policyTokens = null,
    numOperations = null,
    predicateCount = POLICY_PREDICATE_COUNT
  } = options;

  if (attributeOrder.join(',') !== POLICY_ATTRIBUTE_ORDER.join(',')) {
    throw new Error(
      `DUO V3 requester generation requires the canonical attribute order: ${POLICY_ATTRIBUTE_ORDER.join(',')}`
    );
  }

  const activeCodes = resolveActiveCodes(selection);
  const activeIndices = activeCodes
    .map((code) => attributeOrder.indexOf(code))
    .filter((idx) => idx >= 0);

  const assignment = findDuoV3AssignmentForPolicy({
    targetTruth: Boolean(satisfy),
    activeIndices,
    policyTokens,
    numOperations,
    predicateCount
  });
  if (!assignment) {
    throw new Error(`Unable to construct a DUO V3 requester profile with satisfy=${Boolean(satisfy)}`);
  }
  return assignment;
}

function generateRequesterAttrs(selection, satisfy, options = {}) {
  return generateRequesterProfile(selection, satisfy, options).attributes;
}

/**
 * Generate a dataset of policy configurations
 */
async function generateDataset(config = {}) {
  const {
    protocolVersion = 'duo-v3',
    seed = 'policy-dataset',
    policyCount = DEFAULT_POLICY_COUNT,
    executionsPerPolicy = DEFAULT_EXECUTIONS_PER_POLICY,
    // Two-layer execution: when depthExecutions is set, a stratified subset of
    // policies runs depthExecutions times (depth layer, for PI Level-III / TPS)
    // while every other policy runs coverageExecutions times (coverage layer).
    // When depthExecutions is null the global executionsPerPolicy is used for
    // all policies (backward-compatible single-layer behaviour).
    coverageExecutions = null,
    depthExecutions = null,
    depthSubsetPerStructure = 8,
    depthStructures = ['and_only', 'or_only', 'and_or_mixed'],
    satisfyRatio = DEFAULT_SATISFY_RATIO,
    semanticLayers = DEFAULT_SEMANTIC_LAYERS,
    duoTerms = null,
    attributeOrder = POLICY_ATTRIBUTE_ORDER,
    whitelistBuckets = DEFAULT_WHITELIST_BUCKETS,
    merkleDepthOptions = DEFAULT_MERKLE_DEPTH_OPTIONS,
    proofTypes = DEFAULT_PROOF_TYPES,
    executionProtections = DEFAULT_EXECUTION_PROTECTIONS,
    logicOptions = {},
    duoConflicts = DEFAULT_DUO_CONFLICT_RULES,
    icd10Scopes = ICD10_SCOPE_LIBRARY,
    obiScopes = OBI_SCOPE_LIBRARY,
    hancestroScopes = HANCESTRO_SCOPE_LIBRARY,
    iso3166Scopes = ISO3166_SCOPE_LIBRARY,
    snomedScopes = SNOMED_SCOPE_LIBRARY,
    policyDepth = DEFAULT_POLICY_DEPTH
  } = config;

  if (policyDepth !== DUO_V3_DEPTH) {
    throw new Error(`DUO V3 capture generation requires policyDepth=${DUO_V3_DEPTH}`);
  }
  if (attributeOrder.join(',') !== POLICY_ATTRIBUTE_ORDER.join(',')) {
    throw new Error(
      `DUO V3 capture generation requires the canonical attribute order: ${POLICY_ATTRIBUTE_ORDER.join(',')}`
    );
  }

  const rng = createDeterministicRng(seed); // random number generator  

  const allowedCodes = Array.isArray(duoTerms) && duoTerms.length > 0
    ? new Set(duoTerms.map((term) => canonicalizeAttributeCode(term)))
    : null;

  console.log('Allowed codes:', allowedCodes);

  // Filter against the canonical 13-attribute DUO V3 circuit layout.
  const circuitSupportedCodes = new Set(attributeOrder);

  const normalizedLayers = (semanticLayers || DEFAULT_SEMANTIC_LAYERS)
    .map((layer) => {
      const combos = (layer.combos || [])
        .map((combo) => canonicalizeDuoCombination(combo))
        .filter((combo) => {
          // Filter by allowed codes if specified
          if (allowedCodes && !combo.every((code) => allowedCodes.has(code))) {
            return false;
          }
          // Filter out combos with attributes not supported by circuit
          const unsupported = combo.filter(code => !circuitSupportedCodes.has(code));
          if (unsupported.length > 0) {
            console.log(`Filtering out combo ${combo.join('+')} - contains unsupported attributes: ${unsupported.join(', ')}`);
            return false;
          }
          return true;
        });
      return {
        ...layer,
        combos
      };
    })
    .filter((layer) => layer.combos.length > 0);


  const blueprintConfig = {
    seed,
    policyCount,
    semanticLayers: normalizedLayers.length > 0 ? normalizedLayers : DEFAULT_SEMANTIC_LAYERS,
    attributeOrder,
    whitelistBuckets,
    merkleDepthOptions,
    proofTypes,
    executionProtections,
    logicOptions,
    duoConflicts,
    icd10Scopes,
    obiScopes,
    hancestroScopes,
    iso3166Scopes,
    snomedScopes,
    policyDepth
  };

  const blueprints = await buildPolicyBlueprints(blueprintConfig, rng);

  // No need to filter here since we already filtered at the combo level
  // All blueprints should now only contain circuit-supported attributes

  const dataset = [];

  const coverage = {
    layers: new Map(),
    layerExecutions: new Map(),
    duoTerms: new Map(),
    combos: new Map(),
    icd10: new Map(),
    proofTypes: new Map()
  };

  blueprints.forEach((blueprint) => {
    incrementCounter(coverage.layers, blueprint.layerName || 'layer');
    incrementCounter(coverage.combos, blueprint.duoTerms.join('+'));
    blueprint.duoTerms.forEach((code) => incrementCounter(coverage.duoTerms, code));

    // TODO: Track ICD-10 scope coverage only in this experiment
    if (blueprint.semantics.icd10Scope) {
      incrementCounter(coverage.icd10, blueprint.semantics.icd10Scope.id);
    }
    incrementCounter(coverage.proofTypes, blueprint.structure.proofType);
  });

  // Two-layer execution: when depthExecutions is set, select a stratified
  // depth-layer subset (depthExecutions reps each) and run every other policy
  // coverageExecutions times. depthSubset is null in single-layer mode, in
  // which case every policy uses the global executionsPerPolicy (unchanged).
  const twoLayer = depthExecutions != null;
  const depthSubset = twoLayer
    ? selectDepthSubset(blueprints, {
        perStructure: depthSubsetPerStructure,
        structures: depthStructures,
        rng
      })
    : null;
  const effectiveCoverageExecutions = coverageExecutions != null ? coverageExecutions : 1;

  blueprints.forEach((blueprint, blueprintIndex) => {
    const isDepth = Boolean(depthSubset && depthSubset.has(blueprint.id));
    const execCount = twoLayer
      ? (isDepth ? depthExecutions : effectiveCoverageExecutions)
      : executionsPerPolicy;
    const plan = buildSatisfactionPlan(execCount, satisfyRatio, rng);
    plan.forEach((satisfy, execIndex) => {
      const requesterProfile = generateRequesterProfile(blueprint.duoTerms, satisfy, {
        attributeOrder,
        policyTokens: blueprint.artifacts.policy,
        numOperations: blueprint.artifacts.numOperations,
        predicateCount: POLICY_PREDICATE_COUNT
      });
      const datasetEntry = {
        policyIndex: blueprintIndex,
        policyId: blueprint.id,
        executionId: execIndex,
        layer: blueprint.layerName,
        layerVariant: blueprint.layerVariant || null,
        duoTerm: ATTRIBUTE_CODE_TO_DUO_TERM[blueprint.semantics.primaryDuoTerm],
        duoTerms: blueprint.duoTerms.map((code) => ATTRIBUTE_CODE_TO_DUO_TERM[code]),
        duoTermCodes: blueprint.duoTerms.slice(),
        semantics: blueprint.semantics,
        structure: blueprint.structure,
        execution: blueprint.execution,
        policy: blueprint.artifacts.policy,
        tokens: blueprint.artifacts.tokens,
        numOperations: blueprint.artifacts.numOperations,
        predicateSlots: blueprint.predicateSlots.slice(),
        predicateValuesBySlot: { ...blueprint.predicateValuesBySlot },
        predicateEvidenceBySlot: { ...blueprint.predicateEvidenceBySlot },
        predicateParameters: {
          predicateTypes: blueprint.artifacts.predicates.scopeParameters.predicateTypes.slice(),
          predicateSchemaTags: blueprint.artifacts.predicates.scopeParameters.predicateSchemaTags.slice(),
          scopeKinds: blueprint.artifacts.predicates.scopeParameters.scopeKinds.slice(),
          approvedScopeIds: blueprint.artifacts.predicates.scopeParameters.approvedScopeIds.slice(),
          merkleRoots: blueprint.artifacts.predicates.scopeParameters.merkleRoots.slice(),
          credPublicKeys: blueprint.artifacts.predicates.scopeParameters.credPublicKeys.slice(),
          moratoriumUntilEpoch: blueprint.artifacts.predicates.scopeParameters.moratoriumUntilEpoch,
          timeLimitEpochs: blueprint.artifacts.predicates.scopeParameters.timeLimitEpochs
        },
        attributeOrder: blueprint.attributeOrder.slice(),
        requesterAttrs: requesterProfile.attributes,
        duoProfileClaims: requesterProfile.duoProfileClaims,
        satisfy,
        randomizer: blueprint.artifacts.randomizer,
        policyCommitment: blueprint.artifacts.policyCommitment,
        depthLayer: isDepth,
        executionTier: twoLayer ? (isDepth ? 'depth' : 'coverage') : 'single'
      };

      const ontologySlots = datasetEntry.predicateSlots.filter((slot) => slot >= 0 && slot <= 4);
      if (ontologySlots.length > 0) {
        const primarySlot = ontologySlots[0];
        const slotInfo = POLICY_PREDICATE_SLOTS.find((slot) => slot.slot === primarySlot);
        datasetEntry.ontologyNamespace = slotInfo ? slotInfo.namespace : null;
        datasetEntry.ontologyValue = datasetEntry.predicateValuesBySlot.hasOwnProperty(primarySlot)
          ? datasetEntry.predicateValuesBySlot[primarySlot]
          : null;
        datasetEntry.requiresOntology = true;
      } else {
        datasetEntry.ontologyNamespace = null;
        datasetEntry.ontologyValue = null;
        datasetEntry.requiresOntology = false;
      }

      dataset.push(datasetEntry);

      incrementCounter(coverage.layerExecutions, blueprint.layerName || 'layer');
    });
  });

  dataset.__meta = {
    protocolVersion,
    circuit: {
      numAttributes: POLICY_ATTRIBUTE_ORDER.length,
      numPredicates: POLICY_PREDICATE_COUNT,
      policyDepth,
      merkleLevels: 8
    },
    seed,
    policyCount: blueprints.length,
    executionsPerPolicy,
    twoLayer: twoLayer ? {
      coverageExecutions: effectiveCoverageExecutions,
      depthExecutions,
      depthSubsetPerStructure,
      depthStructures,
      depthPolicyIds: [...depthSubset],
      depthPolicyCount: depthSubset.size,
      totalExecutions: dataset.length
    } : null,
    satisfyRatio,
    attributeOrder,
    coverage: {
      layers: mapToObject(coverage.layers),
      layerExecutions: mapToObject(coverage.layerExecutions),
      duoTerms: mapToObject(coverage.duoTerms),
      combos: mapToObject(coverage.combos),
      icd10: mapToObject(coverage.icd10),
      proofTypes: mapToObject(coverage.proofTypes)
    }
  };

  return dataset;
}

async function buildDuoV3PolicyMaterial(policyData) {
  const { policy, numOperations } = policyData;
  const parameters = policyData.predicateParameters;
  if (!parameters) {
    throw new Error('DUO V3 policy data is missing compiler-derived predicateParameters');
  }
  const exactParameterArray = (name) => {
    const values = parameters[name];
    if (!Array.isArray(values) || values.length !== POLICY_PREDICATE_COUNT) {
      throw new Error(
        `DUO V3 predicateParameters.${name} must contain exactly ${POLICY_PREDICATE_COUNT} entries`
      );
    }
    return values.slice();
  };

  const predicateTypes = exactParameterArray('predicateTypes');
  const predicateSchemaTags = exactParameterArray('predicateSchemaTags');
  const scopeKinds = exactParameterArray('scopeKinds');
  const approvedScopeIds = exactParameterArray('approvedScopeIds');
  const merkleRoots = exactParameterArray('merkleRoots');
  const credPublicKeys = exactParameterArray('credPublicKeys');
  const rangeMin = Array(POLICY_PREDICATE_COUNT).fill('0');
  const rangeMax = Array(POLICY_PREDICATE_COUNT).fill('0');
  const ontologyPolicyIds = predicateTypes.map((type, slot) => Number(type) === 3 ? String(100 + slot) : '0');
  const ontologyEpochs = predicateTypes.map((type) => Number(type) === 3 ? String(ONTOLOGY_EPOCH) : '0');
  const policyValidFromEpoch = String(POLICY_VALID_FROM_EPOCH);
  const policyValidUntilEpoch = String(POLICY_VALID_UNTIL_EPOCH);
  const moratoriumUntilEpoch = String(parameters.moratoriumUntilEpoch ?? 0);
  const timeLimitEpochs = String(parameters.timeLimitEpochs ?? 0);
  const randomizer = policyData.randomizer !== undefined
    ? BigInt(policyData.randomizer)
    : BigInt(Math.floor(Math.random() * 1000000));
  const effectiveNumOperations = numOperations || policy.filter((token) => token !== 0).length;
  const policyCommitment = await calculatePolicyCommitment(policy, randomizer, effectiveNumOperations);
  const parameterInputs = {
    predicateTypes,
    predicateSchemaTags,
    scopeKinds,
    approvedScopeIds,
    merkleRoots,
    credPublicKeys,
    rangeMin,
    rangeMax,
    ontologyPolicyIds,
    ontologyEpochs,
    policyValidFromEpoch,
    policyValidUntilEpoch,
    moratoriumUntilEpoch,
    timeLimitEpochs
  };
  const paramsCommitment = await calculateParamsCommitment(parameterInputs);
  const material = {
    penc: policy.slice(),
    randomizer: randomizer.toString(),
    paramsCommitment: paramsCommitment.toString(),
    ...parameterInputs,
    numOperations: effectiveNumOperations
  };

  return { material, policyCommitment, paramsCommitment };
}

/**
 * Provider behavior: commit policy on-chain, then provision material to TPS (Stage 1→2).
 */
async function providerCommitAndProvision(policyData, contract, options = {}) {
  const protectionProfile = normalizeProtectionProfile(options.protectionProfile);
  // Explicit gas-price override for provider txs (commit / registerResource).
  // On networks with an enforced minimum tip (e.g. Amoy's 25 gwei), an RPC
  // timeout+retry can otherwise fall back to a default ~1 gwei EIP-1559 tip and
  // get rejected ("gas tip cap below minimum"). Pinning a legacy gasPrice on the
  // tx itself makes every send/retry use the same safe value. Empty disables it
  // (local networks). Mirrors the TPS access-path pin (run.js TPS_GAS_PRICE_GWEI).
  const providerGasGwei = process.env.PROVIDER_GAS_PRICE_GWEI
    || process.env.TPS_GAS_PRICE_GWEI
    || '';
  const txOverrides = providerGasGwei
    ? { gasPrice: BigInt(Math.round(parseFloat(providerGasGwei) * 1e9)) }
    : {};

  const { material, policyCommitment, paramsCommitment } = await buildDuoV3PolicyMaterial(policyData);

  if (policyData.structure) {
    policyData.structure.paramsCommitment = paramsCommitment;
  }

  // Stage 1: commit policy on-chain (provider)
  const signer = await getExperimentSigner(contract.runner.provider);
  const gasPadEnabled = protectionProfile === PROTECTION_PROFILES.B2_PADDED;
  const commitPadTarget = gasPadEnabled ? getRandomGasTarget(GAS_PAD_TARGET_GAS.commit) : 0n;
  const contractWithSigner = contract.connect(signer);

  const commitWithPadFn = contractWithSigner['commitPolicyWithGasPad(uint256,uint256,string,uint256)'];
  const commitFn = contractWithSigner['commitPolicy(uint256,uint256,string)'];

  if (gasPadEnabled && typeof commitWithPadFn !== 'function') {
    throw new Error('Gas padding requested but commitPolicyWithGasPad is not available on the deployed contract.');
  }
  if (!gasPadEnabled && typeof commitFn !== 'function') {
    throw new Error('commitPolicy(uint256,uint256,string) overload is not available on the deployed contract.');
  }

  const commitTx = await retryRpc(
    'commitPolicy send',
    () => gasPadEnabled
      ? commitWithPadFn(policyCommitment, paramsCommitment, 'ipfs://policy-metadata', commitPadTarget, txOverrides)
      : commitFn(policyCommitment, paramsCommitment, 'ipfs://policy-metadata', txOverrides),
    { initialDelayMs: 5000, maxAttempts: 8 }
  );
  const commitReceipt = await waitForTx(commitTx, 1, { label: `commitPolicy tx ${commitTx.hash}` });
  console.log('commit gasUsed:', commitReceipt.gasUsed.toString());

  const policyCommittedEvent = commitReceipt.logs.find(log => {
    try { return contract.interface.parseLog(log).name === 'PolicyCommitted'; }
    catch (_) { return false; }
  });
  const parsedEvent = contract.interface.parseLog(policyCommittedEvent);
  const blockchainPolicyId = parsedEvent.args.policyId;

  // Stage 1c: register protected resource (provider)
  const resourceTx = await retryRpc(
    `registerResource send for policyId=${blockchainPolicyId}`,
    () => contractWithSigner.registerResource(blockchainPolicyId, txOverrides),
    { initialDelayMs: 5000, maxAttempts: 8 }
  );
  const resourceReceipt = await waitForTx(resourceTx, 1, { label: `registerResource tx ${resourceTx.hash}` });
  let resourceId;
  for (const log of resourceReceipt.logs) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed.name === 'ResourceRegistered') {
        resourceId = parsed.args.resourceId;
        break;
      }
    } catch (_) { /* skip */ }
  }
  if (!resourceId) throw new Error('ResourceRegistered event not found in receipt');
  console.log(`[Provider] Registered resourceId=${resourceId} for policyId=${blockchainPolicyId}`);

  // Stage 2: provision compiler-derived DUO V3 policy material to TPS (provider)
  await tpsClient.provision(blockchainPolicyId.toString(), material);
  console.log(`[Provider] Provisioned policyId=${blockchainPolicyId} to TPS`);

  return {
    blockchainPolicyId,
    resourceId,
    policyCommitment,
    paramsCommitment,
    commitReceipt,
    commitTx,
    resourceReceipt,
    resourceTx,
    gasPadEnabled,
    contractWithSigner
  };
}

async function buildDuoV3RequesterEvidence(policyData, { resourceId, policyCommitment }) {
  const predicateTypes = policyData.predicateParameters?.predicateTypes;
  if (!Array.isArray(predicateTypes) || predicateTypes.length !== POLICY_PREDICATE_COUNT) {
    throw new Error(`DUO V3 requester evidence requires exactly ${POLICY_PREDICATE_COUNT} predicate types`);
  }
  const usesProfile = Number(predicateTypes[DUO_V3_PROFILE_SLOT]) === 9;
  const randomNonZeroField = () => {
    const value = BigInt('0x' + crypto.randomBytes(16).toString('hex'));
    return value === 0n ? 1n : value;
  };
  const holderSecret = usesProfile ? randomNonZeroField() : 0n;
  const requesterId = usesProfile
    ? await calculateRequesterId(holderSecret)
    : randomNonZeroField().toString();
  const zeroStrings = () => Array(POLICY_PREDICATE_COUNT).fill('0');
  const zeroPaths = () => Array.from(
    { length: POLICY_PREDICATE_COUNT },
    () => Array(8).fill('0')
  );
  const zeroPathIndices = () => Array.from(
    { length: POLICY_PREDICATE_COUNT },
    () => Array(8).fill(0)
  );
  const merkleLeaves = zeroStrings();
  const merklePathElements = zeroPaths();
  const merklePathIndices = zeroPathIndices();
  const ontologyCodes = zeroStrings();

  for (const [slotKey, member] of Object.entries(policyData.predicateEvidenceBySlot || {})) {
    const slot = Number(slotKey);
    if (Number(predicateTypes[slot]) !== 3) continue;
    if (!member || !Array.isArray(member.pathElements) || member.pathElements.length !== 8) {
      throw new Error(`DUO V3 ontology evidence for slot ${slot} must contain an 8-level Merkle path`);
    }
    merkleLeaves[slot] = String(member.leaf);
    merklePathElements[slot] = member.pathElements.map(String);
    merklePathIndices[slot] = member.pathIndices.slice();
    ontologyCodes[slot] = String(member.ontologyCode);
  }

  const evidence = {
    attributes: policyData.requesterAttrs.slice(),
    requesterId,
    holderSecret: holderSecret.toString(),
    duoProfileClaims: policyData.duoProfileClaims ?? 0,
    merkleLeaves,
    merklePathElements,
    merklePathIndices,
    ontologyCodes,
    credSignatures: zeroStrings(),
    credSigR8x: zeroStrings(),
    credSigR8y: zeroStrings(),
    credIssuerAx: zeroStrings(),
    credIssuerAy: zeroStrings(),
    credValidFromEpochs: zeroStrings(),
    credValidUntilEpochs: zeroStrings(),
    credentialIds: zeroStrings()
  };

  if (usesProfile) {
    const credentialId = randomNonZeroField();
    const signed = await signDuoProfileCredential(
      EXPERIMENT_PROFILE_ISSUER_PRIVATE_KEY,
      {
        policyCommitment,
        requesterId,
        resourceId,
        profileClaims: evidence.duoProfileClaims,
        validFromEpoch: POLICY_VALID_FROM_EPOCH,
        validUntilEpoch: POLICY_VALID_UNTIL_EPOCH,
        credentialId
      }
    );
    evidence.credSignatures[DUO_V3_PROFILE_SLOT] = signed.S;
    evidence.credSigR8x[DUO_V3_PROFILE_SLOT] = signed.R8x;
    evidence.credSigR8y[DUO_V3_PROFILE_SLOT] = signed.R8y;
    evidence.credIssuerAx[DUO_V3_PROFILE_SLOT] = signed.issuerAx;
    evidence.credIssuerAy[DUO_V3_PROFILE_SLOT] = signed.issuerAy;
    evidence.credValidFromEpochs[DUO_V3_PROFILE_SLOT] = String(POLICY_VALID_FROM_EPOCH);
    evidence.credValidUntilEpochs[DUO_V3_PROFILE_SLOT] = String(POLICY_VALID_UNTIL_EPOCH);
    evidence.credentialIds[DUO_V3_PROFILE_SLOT] = credentialId.toString();
  }

  return evidence;
}

/**
 * Requester behavior: submit evidence to TPS; TPS generates proof and submits
 * on-chain via requestAccessBound() (Stage 4+5).
 * The requester's address is never recorded on-chain — only the TPS address appears.
 */
async function requesterRequestAccess(policyData, commitResult) {
  const { blockchainPolicyId, resourceId, policyCommitment } = commitResult;

  // Generate nonce for replay prevention (both TPS-side and on-chain)
  const nonce = BigInt('0x' + crypto.randomBytes(16).toString('hex')).toString();

  const evidence = await buildDuoV3RequesterEvidence(policyData, { resourceId, policyCommitment });

  // Stage 4+5: TPS generates proof and submits requestAccessBound() on-chain.
  // submitOnChain=true hides the requester address — on-chain msg.sender = TPS.
  const proveStartTime = Date.now();
  const { pA, pB, pC, pubSignals, sessionId, chainResult, proofTimings } = await tpsClient.prove({
    policyId: blockchainPolicyId.toString(),
    resourceId: resourceId.toString(),
    nonce,
    policyCommitment: policyCommitment.toString(),
    evidence,
    submitOnChain: true
  });
  // proofGenerationTime is end-to-end (witness + prove + HTTP + on-chain submit).
  // proofTimings carries the server-side, network-free breakdown when available.
  const proofGenerationTime = Date.now() - proveStartTime;

  console.log(`[TPS] Submitted proof on-chain for policyId=${blockchainPolicyId}, requestId=${chainResult.requestId}`);
  console.log(`access gasUsed: ${chainResult.gasUsed}`);

  return {
    accessReceipt: null,
    accessTx: { hash: chainResult.transactionHash },
    proof: { pA, pB, pC, pubSignals },
    proofGenerationTime,
    proofTimings,
    sessionId,
    chainResult
  };
}

/**
 * Execute a policy end-to-end via TPS workflow and collect observable features.
 * Provider: commitPolicy + registerResource + provision → TPS.
 * Requester: TPS prove + requestAccessBound (TPS submits on-chain, not requester).
 */
async function executePolicy(policyData, contract, options = {}) {
  const protectionProfile = normalizeProtectionProfile(options.protectionProfile);
  const commitResult = await providerCommitAndProvision(policyData, contract, {
    protectionProfile
  });
  const accessResult = await requesterRequestAccess(policyData, commitResult);

  const { commitReceipt, commitTx, resourceReceipt, policyCommitment, paramsCommitment, blockchainPolicyId } = commitResult;
  const { accessTx, proof, proofGenerationTime, proofTimings, chainResult } = accessResult;

  const commitEventLogs = commitReceipt.logs.filter(
    (log) => log.topics[0] === EVENT_SIGNATURES.POLICY_COMMITTED
  );
  const commitLogsCount = commitEventLogs.length;
  const commitLogsSizeBytes = commitEventLogs.reduce(
    (total, log) => total + computeLogPayloadSizeBytes(log), 0
  );

  // Access receipt is from the TPS chain submission; fetch it via provider
  const provider = contract.runner.provider;
  const accessReceipt = await waitForTransactionReceipt(provider, chainResult.transactionHash, {
    label: `requestAccessBound receipt ${chainResult.transactionHash}`
  });

  const accessEventLogs = (accessReceipt ? accessReceipt.logs : []).filter((log) =>
    ACCESS_EVENT_TOPICS.has(log.topics[0])
  );
  const accessLogsCount = accessEventLogs.length;
  const accessLogsSizeBytes = accessEventLogs.reduce(
    (total, log) => total + computeLogPayloadSizeBytes(log), 0
  );

  const proofSize = JSON.stringify({ pA: proof.pA, pB: proof.pB, pC: proof.pC, pubSignals: proof.pubSignals }).length;

  const features = {
    commitGasUsed: commitReceipt.gasUsed.toString(),
    commitCalldataLength: commitTx.data.length,
    accessGasUsed: chainResult.gasUsed,
    accessCalldataLength: null,
    proofSize,
    proofGenerationTime,
    // Server-side, network-free proof costs (ms). null when unavailable (e.g.
    // B2 rows predate this instrumentation). Performance side-metrics only —
    // excluded from every attack feature set, like proofGenerationTime.
    proofWitnessTime: proofTimings ? proofTimings.witnessMs : null,
    proofProveTime: proofTimings ? proofTimings.proveMs : null,
    proofVerifyTime: proofTimings ? proofTimings.verifyMs : null,
    commitLogsCount,
    commitLogsSize: commitLogsSizeBytes,
    accessLogsCount,
    accessLogsSize: accessLogsSizeBytes,
    commitBlockNumber: commitReceipt.blockNumber,
    accessBlockNumber: accessReceipt ? accessReceipt.blockNumber : null,
    blockDifference: accessReceipt ? accessReceipt.blockNumber - commitReceipt.blockNumber : null,
  };

  return {
    ...policyData,
    features,
    policyCommitment,
    paramsCommitment,
    blockchainPolicyId: blockchainPolicyId.toString(),
    protectionProfile,
    transactions: {
      commit: {
        tx: serializeTransactionResponse(commitTx),
        receipt: serializeReceipt(commitReceipt)
      },
      access: {
        tx: serializeTransactionResponse(accessTx),
        receipt: accessReceipt ? serializeReceipt(accessReceipt) : null
      }
    }
  };
}

/**
 * Execute dataset and collect all features
 */
async function executeDataset(dataset, contract, outputPath, options = {}) {
  const results = [];

  console.log(`Executing ${dataset.length} policy instances...`);

  for (let i = 0; i < dataset.length; i++) {
    // Debug limit removed - execute full dataset
    console.log(`Progress: ${i}/${dataset.length}`);

    try {
      const result = await executePolicy(dataset[i], contract, options);
      results.push(result);
    } catch (error) {
      console.error(`Error executing policy ${i}:`, error.message);
      // Continue with next policy
    }
  }

  // Save results
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`Saved ${results.length} results to ${outputPath}`);

  return results;
}

module.exports = {
  DUO_TERMS,
  ONTOLOGY_LINKED_TERMS,
  ONTOLOGY_NAMESPACES,
  ICD10_CHAPTERS,
  OBI_RESEARCH_TYPES,
  HANCESTRO_GROUPS,
  ISO3166_REGIONS,
  SNOMED_TERMS,
  GAS_PAD_TARGET_GAS,
  GAS_PAD_VARIANCE,
  PROTECTION_PROFILES,
  normalizeProtectionProfile,
  getRandomGasTarget,
  isOntologyLinked,
  getOntologyNamespace,
  getOntologyValues,
  POLICY_ATTRIBUTE_ORDER,
  POLICY_PREDICATE_COUNT,
  POLICY_PREDICATE_SLOTS,
  evaluatePolicyTokens,
  generatePolicy,
  generateRequesterProfile,
  generateRequesterAttrs,
  generateDataset,
  buildDuoV3PolicyMaterial,
  buildDuoV3RequesterEvidence,
  executePolicy,
  executeDataset
};
