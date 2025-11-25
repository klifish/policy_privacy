/**
 * Data Generator for Policy Content Hiding Evaluation
 * 
 * Generates a dataset of policies with DUO terms and ICD-10 codes,
 * executes them multiple times, and collects observable features
 * from blockchain transactions.
 */

const crypto = require('crypto');
const { ethers } = require('hardhat');
const { id, getBytes } = require('ethers');
const { generatePolicyArtifacts } = require('../../compiler/policy_generator');
const { buildWhitelist } = require('../../utils/merkle/ontology_whitelist');
const { generateGroth16Proof, calculatePolicyCommitment, calculateParamsCommitment, createCircuitInput } = require('../../test/utils/proofGenerator');
const { json } = require('stream/consumers');

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
  COMMERCIAL_USE: 6            // DUO:0000046 - Commercial purpose (non-ontology-linked)
};

// Attribute configuration for policy generation within the experiment.
// The main circuit instance currently supports N=3 attributes and M=2 predicates,
// so we focus on the subset {GR, DS, RS}.
const POLICY_ATTRIBUTE_ORDER = ['GR', 'DS', 'RS', 'POA', 'GS', 'CC'];

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
  [DUO_TERMS.GENERAL_RESEARCH]: 'GR',
  [DUO_TERMS.DISEASE_SPECIFIC]: 'DS',
  [DUO_TERMS.RESEARCH_SPECIFIC]: 'RS',
  [DUO_TERMS.POPULATION_ANCESTRY]: 'POA',
  [DUO_TERMS.GEOGRAPHICAL_RESTRICTION]: 'GS',
  [DUO_TERMS.CLINICAL_CARE]: 'CC'
};

const ATTRIBUTE_ALIAS_MAP = Object.freeze({
  GR: 'GR',
  GENERAL_RESEARCH: 'GR',
  GENERAL_RESEARCH_USE: 'GR',
  GENERALRESEARCH: 'GR',
  DUO0000042: 'GR',

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
  DUO0000043: 'CC'
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
// Circom instance is compiled with DEPTH=10 (see circuits/policy_privacy_main_instance.circom)
// so dataset generator must not emit policies longer than 10 tokens.
const DEFAULT_POLICY_DEPTH = 10;

const DEFAULT_WHITELIST_BUCKETS = Object.freeze([4, 8, 16, 24, 32]);
const DEFAULT_MERKLE_DEPTH_OPTIONS = Object.freeze([3, 4, 5, 6, 7]);
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
  commit: 500000n,  // Base target for commit transaction
  access: 1000000n   // Base target for access transaction
});

// Gas randomization configuration
const GAS_PAD_VARIANCE = 0.25; // ±25% randomization range (125k for commit, 250k for access)

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
const DISABLED_PREDICATE_TYPE = 4;
const DEFAULT_DISABLED_NUMBER = 0;

const DEFAULT_SEMANTIC_LAYERS = Object.freeze([
  {
    name: 'singleton',
    combos: [
      ['GR'],
      ['DS'],
      ['RS']
    ],
    minPolicies: 60
  },
  {
    name: 'pair',
    combos: [
      ['GR', 'DS'],
      ['GR', 'RS'],
      ['DS', 'RS']
    ],
    minPolicies: 40
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

const ATTRIBUTE_CODE_SET = new Set(POLICY_ATTRIBUTE_ORDER);

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

function maybeNegate(rng, token, probability) {
  if (probability <= 0) {
    return token;
  }
  return rng() < probability ? `!${token}` : token;
}

function buildLogicFromCombination(rng, combo, options = {}) {
  const {
    notProbability = 0.2,
    groupNotProbability = 0.1,
    operators = ['AND', 'OR']
  } = options;

  if (combo.length === 1) {
    return maybeNegate(rng, combo[0], notProbability);
  }

  const tokens = combo.slice();

  shuffleInPlace(rng, tokens);

  let expr = maybeNegate(rng, tokens[0], notProbability);
  for (let i = 1; i < tokens.length; i += 1) {
    const operator = randomChoice(rng, operators);
    const right = maybeNegate(rng, tokens[i], notProbability);
    const grouped = `(${expr} ${operator === 'AND' ? '&' : '|'} ${right})`;
    expr = maybeNegate(rng, grouped, groupNotProbability);
  }
  return expr;
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
    epoch = 0
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
    terms: selectedTerms
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
    index
  } = params;

  const attributeOrder = config.attributeOrder || POLICY_ATTRIBUTE_ORDER;
  const combination = canonicalizeDuoCombination(combo);
  const logic = buildLogicFromCombination(rng, combination, config.logicOptions || {});

  const proofType = randomChoice(rng, config.proofTypes || DEFAULT_PROOF_TYPES);
  const executionProtections = config.executionProtections || DEFAULT_EXECUTION_PROTECTIONS;

  const structure = {
    whitelistSize: 0,
    merkleDepth: randomChoice(rng, config.merkleDepthOptions || DEFAULT_MERKLE_DEPTH_OPTIONS),
    proofType,
    predicateRoots: {},
    whitelists: {}
  };

  const semantics = {
    layer: layerName,
    duoTerms: combination.slice(),
    duoTermValues: combination.map((code) => ATTRIBUTE_CODE_TO_DUO_TERM[code]),
    primaryDuoTerm: combination[0],
    primaryDuoTermValue: ATTRIBUTE_CODE_TO_DUO_TERM[combination[0]],
    hasOntology: combination.some((code) => ATTRIBUTE_PREDICATE_SLOT[code] !== undefined),
    hasObligation: combination.includes('RS'),
    hasCredential: proofType === 'credential_proof',
    predicateCount: combination.filter((code) => ATTRIBUTE_PREDICATE_SLOT[code] !== undefined).length,
    icd10Scope: null,
    obiScope: null
  };

  const predicateSlots = [];
  const predicateValuesBySlot = {};
  console.log('Generating policy', layerName, index, 'with combination', combination, 'and logic', logic);
  if (combination.includes('DS')) {
    console.log('Building DS predicate for policy', layerName, index);
    const icdScopes = config.icd10Scopes || ICD10_SCOPE_LIBRARY;
    const chosenScope = randomChoice(rng, icdScopes);
    const whitelistSize = randomChoice(rng, config.whitelistBuckets || DEFAULT_WHITELIST_BUCKETS);
    const adjustedDepth = ensureDepthForSize(config.merkleDepthOptions || DEFAULT_MERKLE_DEPTH_OPTIONS, whitelistSize);
    structure.whitelistSize = Math.max(structure.whitelistSize, whitelistSize);
    structure.merkleDepth = Math.max(structure.merkleDepth, adjustedDepth);

    const whitelist = await buildOntologyWhitelistForScope({
      rng,
      namespace: 'ICD10',
      availableTerms: chosenScope.whitelistTerms,
      whitelistSize,
      merkleDepth: adjustedDepth
    });

    structure.predicateRoots[ATTRIBUTE_PREDICATE_SLOT.DS] = whitelist.rootHex;
    structure.whitelists[ATTRIBUTE_PREDICATE_SLOT.DS] = {
      namespace: 'ICD10',
      scopeId: chosenScope.id,
      scopeLabel: chosenScope.label,
      codeRange: chosenScope.codeRange,
      configHash: whitelist.configHash,
      leafCount: whitelist.leafCount,
      selectedTerms: whitelist.terms
    };

    predicateSlots.push(ATTRIBUTE_PREDICATE_SLOT.DS);
    predicateValuesBySlot[ATTRIBUTE_PREDICATE_SLOT.DS] = chosenScope.value;
    semantics.icd10Scope = {
      id: chosenScope.id,
      label: chosenScope.label,
      level: chosenScope.level,
      codeRange: chosenScope.codeRange
    };
  }

  if (combination.includes('RS')) {
    console.log('Building RS predicate for policy', layerName, index);
    const obiScopes = config.obiScopes || OBI_SCOPE_LIBRARY;
    const chosenObi = randomChoice(rng, obiScopes);
    const whitelistSize = randomChoice(rng, config.whitelistBuckets || DEFAULT_WHITELIST_BUCKETS);
    const adjustedDepth = ensureDepthForSize(config.merkleDepthOptions || DEFAULT_MERKLE_DEPTH_OPTIONS, whitelistSize);
    structure.whitelistSize = Math.max(structure.whitelistSize, whitelistSize);
    structure.merkleDepth = Math.max(structure.merkleDepth, adjustedDepth);

    const whitelist = await buildOntologyWhitelistForScope({
      rng,
      namespace: 'OBI',
      availableTerms: chosenObi.whitelistTerms || [chosenObi.termId],
      whitelistSize,
      merkleDepth: adjustedDepth
    });

    structure.predicateRoots[ATTRIBUTE_PREDICATE_SLOT.RS] = whitelist.rootHex;
    structure.whitelists[ATTRIBUTE_PREDICATE_SLOT.RS] = {
      namespace: 'OBI',
      scopeId: chosenObi.id,
      scopeLabel: chosenObi.label,
      termId: chosenObi.termId,
      configHash: whitelist.configHash,
      leafCount: whitelist.leafCount,
      selectedTerms: whitelist.terms
    };

    predicateSlots.push(ATTRIBUTE_PREDICATE_SLOT.RS);
    predicateValuesBySlot[ATTRIBUTE_PREDICATE_SLOT.RS] = chosenObi.value;
    semantics.obiScope = {
      id: chosenObi.id,
      label: chosenObi.label,
      termId: chosenObi.termId
    };
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

  const predicateTemplates = POLICY_PREDICATE_SLOTS.map((slot) => {
    const copy = { ...slot };
    if (structure.predicateRoots[slot.slot]) {
      copy.root = structure.predicateRoots[slot.slot];
    }
    return copy;
  });

  const policyId = `${layerName || 'layer'}-${index}`;
  const artifacts = await generatePolicyArtifacts(
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

  const blueprint = {
    id: policyId,
    layerName,
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
    attributeOrder,
    satisfyPlanSeed: rng()
  };

  return blueprint;
}

async function buildPolicyBlueprints(config, rng) {
  const policyCount = config.policyCount ?? DEFAULT_POLICY_COUNT;
  const semanticLayers = config.semanticLayers || DEFAULT_SEMANTIC_LAYERS;
  const conflictRules = config.duoConflicts || DEFAULT_DUO_CONFLICT_RULES;

  const layers = semanticLayers.map((layer) => ({
    name: layer.name || 'layer',
    combos: (layer.combos || []).map((combo) => canonicalizeDuoCombination(combo))
      .filter((combo) => checkCombinationConflicts(combo, conflictRules)),
    minPolicies: layer.minPolicies ?? 0
  })).filter((layer) => layer.combos.length > 0);


  if (layers.length === 0) {
    throw new Error('No semantic layers available to sample policies');
  }

  const totalMinPolicies = layers.reduce((sum, layer) => sum + layer.minPolicies, 0);
  const targetPolicies = Math.max(policyCount, totalMinPolicies);
  const remaining = targetPolicies - totalMinPolicies;
  const perLayerBonus = Math.floor(remaining / layers.length);
  let leftover = remaining - perLayerBonus * layers.length;

  const layerTargets = layers.map((layer) => {
    const base = layer.minPolicies + perLayerBonus;
    const allocation = leftover > 0 ? 1 : 0;
    if (allocation > 0) leftover -= 1;
    return { layer, target: Math.max(layer.minPolicies, base + allocation) };
  });

  const blueprints = [];
  let policyIndex = 0;
  for (const { layer, target } of layerTargets) {
    if (target === 0) continue;
    let comboIndex = 0;
    for (let i = 0; i < target; i += 1) {
      const combo = layer.combos[comboIndex % layer.combos.length];
      comboIndex += 1;
      const blueprint = await createPolicyBlueprint({
        layerName: layer.name,
        combo,
        rng,
        config,
        index: policyIndex
      });
      blueprints.push(blueprint);
      policyIndex += 1;
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
  const namespace = requiresOntology ? getOntologyNamespace(duoTerm) : null;

  const artifacts = await generatePolicyArtifacts(
    {
      policy_id: `duo-${attributeCode.toLowerCase()}`,
      attributes: attributeMap,
      predicates: POLICY_PREDICATE_SLOTS,
      logic: attributeCode
    },
    {
      depth: 10,
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
    predicateSlots: requiresOntology && predicateSlot !== null ? [predicateSlot] : [],
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

function generateRequesterAttrs(selection, satisfy, options = {}) {
  const {
    attributeOrder = POLICY_ATTRIBUTE_ORDER,
    rng = Math.random
  } = options;

  const activeCodes = resolveActiveCodes(selection);
  const activeSet = new Set(activeCodes);
  const attrs = attributeOrder.map(() => 0);

  if (satisfy) {
    activeCodes.forEach((code) => {
      const idx = attributeOrder.indexOf(code);
      if (idx >= 0) {
        attrs[idx] = 1;
      }
    });
    return attrs;
  }

  if (activeCodes.length === 0) {
    return attrs;
  }

  const failCount = randomInt(rng, 1, activeCodes.length);
  const codesToFail = sampleWithoutReplacement(rng, activeCodes, failCount);
  const codesToPartiallySatisfy = activeCodes.filter((code) => !codesToFail.includes(code));

  codesToPartiallySatisfy.forEach((code) => {
    const idx = attributeOrder.indexOf(code);
    if (idx >= 0 && rng() < 0.6) {
      attrs[idx] = 1;
    }
  });

  return attrs;
}

/**
 * Generate a dataset of policy configurations
 */
async function generateDataset(config = {}) {
  const {
    seed = 'policy-dataset',
    policyCount = DEFAULT_POLICY_COUNT,
    executionsPerPolicy = DEFAULT_EXECUTIONS_PER_POLICY,
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
    policyDepth = DEFAULT_POLICY_DEPTH
  } = config;
  // console.log(JSON.stringify({ semanticLayers }, null, 2));

  const rng = createDeterministicRng(seed); // random number generator  

  const allowedCodes = Array.isArray(duoTerms) && duoTerms.length > 0
    ? new Set(duoTerms.map((term) => canonicalizeAttributeCode(term)))
    : null;

  console.log('Allowed codes:', allowedCodes);
  const normalizedLayers = (semanticLayers || DEFAULT_SEMANTIC_LAYERS)
    .map((layer) => {
      const combos = (layer.combos || [])
        .map((combo) => canonicalizeDuoCombination(combo))
        .filter((combo) => {
          if (!allowedCodes) return true;
          return combo.every((code) => allowedCodes.has(code));
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
    policyDepth
  };

  const blueprints = await buildPolicyBlueprints(blueprintConfig, rng);
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
    if (blueprint.semantics.icd10Scope) {
      incrementCounter(coverage.icd10, blueprint.semantics.icd10Scope.id);
    }
    incrementCounter(coverage.proofTypes, blueprint.structure.proofType);
  });

  blueprints.forEach((blueprint, blueprintIndex) => {
    const plan = buildSatisfactionPlan(executionsPerPolicy, satisfyRatio, rng);
    plan.forEach((satisfy, execIndex) => {
      const requesterAttrs = generateRequesterAttrs(blueprint.duoTerms, satisfy, {
        attributeOrder,
        rng
      });
      const datasetEntry = {
        policyIndex: blueprintIndex,
        policyId: blueprint.id,
        executionId: execIndex,
        layer: blueprint.layerName,
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
        attributeOrder: blueprint.attributeOrder.slice(),
        requesterAttrs,
        satisfy,
        randomizer: blueprint.artifacts.randomizer,
        policyCommitment: blueprint.artifacts.policyCommitment
      };

      if (datasetEntry.predicateSlots.length > 0) {
        const primarySlot = datasetEntry.predicateSlots[0];
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
    seed,
    policyCount: blueprints.length,
    executionsPerPolicy,
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

/**
 * Execute a policy and collect observable features
 */
async function executePolicy(policyData, contract) {
  const {
    policy,
    requesterAttrs,
    numOperations,
    predicateSlots = [],
    predicateValuesBySlot = {},
    structure = {}
  } = policyData;

  const randomizer = BigInt(Math.floor(Math.random() * 1000000));
  const policyCommitment = await calculatePolicyCommitment(policy, randomizer);

  // Prepare circuit input
  const predicateCount = POLICY_PREDICATE_SLOTS.length;
  const predicateTypes = Array.from({ length: predicateCount }, () => DISABLED_PREDICATE_TYPE); // Type 3 = ontology, 4 = disabled
  const activePredicateSlots = predicateSlots.length > 0
    ? predicateSlots
    : Object.keys(predicateValuesBySlot).map((slot) => parseInt(slot, 10)).filter(Number.isInteger);
  activePredicateSlots.forEach((slot) => {
    if (slot >= 0 && slot < predicateCount) {
      predicateTypes[slot] = 3;
    }
  });

  const zeroStringArray = (length) => Array.from({ length }, () => '0');
  const zeroNumberArray = (length, value = 0) => Array.from({ length }, () => value);

  const merkleRoots = zeroStringArray(predicateCount);
  const merkleLeaves = zeroStringArray(predicateCount);
  const credPublicKeys = zeroStringArray(predicateCount);
  const rangeMin = zeroNumberArray(predicateCount, DEFAULT_DISABLED_NUMBER);
  const rangeMax = zeroNumberArray(predicateCount, DEFAULT_DISABLED_NUMBER);
  const rangeValues = zeroNumberArray(predicateCount, DEFAULT_DISABLED_NUMBER);
  const ontologyPolicyIds = zeroNumberArray(predicateCount, DEFAULT_DISABLED_NUMBER);
  const ontologyEpochs = zeroNumberArray(predicateCount, DEFAULT_DISABLED_NUMBER);
  const ontologyCodes = zeroNumberArray(predicateCount, DEFAULT_DISABLED_NUMBER);

  const predicateRoots = structure.predicateRoots || {};
  Object.entries(predicateRoots).forEach(([slotKey, root]) => {
    const slot = parseInt(slotKey, 10);
    if (slot >= 0 && slot < predicateCount && typeof root === 'string') {
      merkleRoots[slot] = root;
    }
  });

  activePredicateSlots.forEach((slot) => {
    if (slot >= 0 && slot < predicateCount) {
      const value = predicateValuesBySlot[slot] ?? policyData.ontologyValue ?? 0;
      ontologyCodes[slot] = typeof value === 'number' ? value : Number(value) || 0;
    }
  });

  const MERKLE_LEVELS = 8;
  const merklePathElements = Array.from({ length: predicateCount }, () => zeroStringArray(MERKLE_LEVELS));
  const merklePathIndices = Array.from({ length: predicateCount }, () => zeroNumberArray(MERKLE_LEVELS, 0));

  const circuitInput = createCircuitInput(policyCommitment, {
    policy,
    requesterAttrs,
    randomizer,
    predicateTypes,
    // Simplified external predicate setup
    merkleRoots,
    merkleLeaves,
    credPublicKeys,
    merklePathElements,
    merklePathIndices,
    rangeValues,
    rangeMin,
    rangeMax,
    ontologyCodes,
    ontologyPolicyIds,
    ontologyEpochs,
    numOperations: numOperations || 3  // Use numOperations from policy data, default to 3
  });

  const paramsCommitment = await calculateParamsCommitment({
    merkleRoots: circuitInput.merkleRoots,
    credPublicKeys: circuitInput.credPublicKeys,
    rangeMin: circuitInput.rangeMin,
    rangeMax: circuitInput.rangeMax,
    ontologyPolicyIds: circuitInput.ontologyPolicyIds,
    ontologyEpochs: circuitInput.ontologyEpochs
  });
  circuitInput.paramsCommitment = paramsCommitment;
  if (policyData.structure) {
    policyData.structure.paramsCommitment = paramsCommitment;
  }

  // Measure proof generation time
  const proofStartTime = Date.now();
  const proof = await generateGroth16Proof(circuitInput);
  const proofGenerationTime = Date.now() - proofStartTime;

  const baseProofLength = JSON.stringify(proof).length;
  const proofPadEnabled = policyData.execution?.proof_pad === true;
  const configuredPadTarget = policyData.execution?.proof_pad_target ?? DEFAULT_PROOF_PAD_TARGET_BYTES;
  const proofPadTarget = proofPadEnabled ? Math.max(configuredPadTarget, baseProofLength) : baseProofLength;
  const proofPadResult = proofPadEnabled
    ? applyProofPadding(proof, proofPadTarget, baseProofLength)
    : {
      paddedProof: proof,
      finalLength: baseProofLength,
      padApplied: false,
      padBytes: 0
    };

  // Commit policy to blockchain
  const [signer] = await ethers.getSigners();
  // const gasPadEnabled = policyData.execution?.gas_pad === true;
  const gasPadEnabled = true; // Always enable gas padding for experiment
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

  const commitTx = gasPadEnabled
    ? await commitWithPadFn(
      policyCommitment,
      paramsCommitment,
      'ipfs://policy-metadata',
      commitPadTarget
    )
    : await commitFn(
      policyCommitment,
      paramsCommitment,
      'ipfs://policy-metadata'
    );
  const commitReceipt = await commitTx.wait();

  // Extract policy ID from events
  const policyCommittedEvent = commitReceipt.logs.find(log => {
    try {
      const parsed = contract.interface.parseLog(log);
      return parsed.name === 'PolicyCommitted';
    } catch (e) {
      return false;
    }
  });

  const parsedEvent = contract.interface.parseLog(policyCommittedEvent);
  const blockchainPolicyId = parsedEvent.args.policyId;

  // Request access with proof
  const accessPadTarget = gasPadEnabled ? getRandomGasTarget(GAS_PAD_TARGET_GAS.access) : 0n;
  if (gasPadEnabled && typeof contractWithSigner.requestAccessWithGasPad !== 'function') {
    throw new Error('Gas padding requested but requestAccessWithGasPad is not available on the deployed contract.');
  }

  // console.log("proof pubsignals:", proof.pubSignals);

  const accessTx = gasPadEnabled
    ? await contractWithSigner.requestAccessWithGasPad(
      blockchainPolicyId,
      proof.pA,
      proof.pB,
      proof.pC,
      proof.pubSignals,
      accessPadTarget
    )
    : await contractWithSigner.requestAccess(
      blockchainPolicyId,
      proof.pA,
      proof.pB,
      proof.pC,
      proof.pubSignals
    );
  const accessReceipt = await accessTx.wait();

  const commitEventLogs = commitReceipt.logs.filter(
    (log) => log.topics[0] === EVENT_SIGNATURES.POLICY_COMMITTED
  );
  const commitLogsCount = commitEventLogs.length;
  const commitLogsSizeBytes = commitEventLogs.reduce(
    (total, log) => total + computeLogPayloadSizeBytes(log),
    0
  );

  const accessEventLogs = accessReceipt.logs.filter((log) =>
    ACCESS_EVENT_TOPICS.has(log.topics[0])
  );
  const accessLogsCount = accessEventLogs.length;
  const accessLogsSizeBytes = accessEventLogs.reduce(
    (total, log) => total + computeLogPayloadSizeBytes(log),
    0
  );

  // Extract observable features
  const features = {
    // Transaction features
    commitGasUsed: commitReceipt.gasUsed.toString(),
    commitCalldataLength: commitTx.data.length,
    accessGasUsed: accessReceipt.gasUsed.toString(),
    accessCalldataLength: accessTx.data.length,

    // Proof features
    proofSize: proofPadResult.finalLength,
    proofGenerationTime,

    // Event features
    commitLogsCount,
    commitLogsSize: commitLogsSizeBytes,
    accessLogsCount,
    accessLogsSize: accessLogsSizeBytes,

    // Timing (block numbers can reveal information)
    commitBlockNumber: commitReceipt.blockNumber,
    accessBlockNumber: accessReceipt.blockNumber,
    blockDifference: accessReceipt.blockNumber - commitReceipt.blockNumber,
  };

  return {
    ...policyData,
    features,
    policyCommitment,
    paramsCommitment,
    blockchainPolicyId: blockchainPolicyId.toString()
  };
}

/**
 * Execute dataset and collect all features
 */
async function executeDataset(dataset, contract, outputPath) {
  const fs = require('fs');
  const results = [];

  console.log(`Executing ${dataset.length} policy instances...`);

  for (let i = 0; i < dataset.length; i++) {
    // Debug limit removed - execute full dataset
    console.log(`Progress: ${i}/${dataset.length}`);

    try {
      const result = await executePolicy(dataset[i], contract);
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
  getRandomGasTarget,
  isOntologyLinked,
  getOntologyNamespace,
  getOntologyValues,
  generatePolicy,
  generateRequesterAttrs,
  generateDataset,
  executePolicy,
  executeDataset
};
