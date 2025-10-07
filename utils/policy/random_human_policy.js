'use strict';

/**
 * Random human-authored DUO policy generator.
 *
 * Produces author-facing JSON policies (attributes, predicates, logic) that
 * comply with the schema consumed by compiler/policy_generator.js. Useful for
 * generating synthetic datasets that resemble policies authored by data
 * custodians.
 */

const crypto = require('crypto');

const { generatePolicyArtifacts } = require('../../compiler/policy_generator');

const ATTRIBUTE_CATALOG = [
  {
    code: 'GR',
    label: 'General research use',
    requiresPredicate: false,
    namespace: null,
    description: 'General research allowance'
  },
  {
    code: 'DS',
    label: 'Disease-specific research',
    requiresPredicate: true,
    namespace: 'ICD10',
    description: 'ICD-10 whitelist for disease-specific research'
  },
  {
    code: 'RS',
    label: 'Research-specific restrictions',
    requiresPredicate: true,
    namespace: 'OBI',
    description: 'OBI whitelist for research-specific restrictions'
  },
  {
    code: 'POA',
    label: 'Population origins/ancestry',
    requiresPredicate: true,
    namespace: 'HANCESTRO',
    description: 'HANCESTRO whitelist for ancestry-restricted studies'
  },
  {
    code: 'GS',
    label: 'Geographical restriction',
    requiresPredicate: true,
    namespace: 'ISO3166',
    description: 'ISO 3166 whitelist for geographical restrictions'
  },
  {
    code: 'CC',
    label: 'Clinical care use',
    requiresPredicate: true,
    namespace: 'SNOMED',
    description: 'SNOMED whitelist for clinical-care policies'
  }
];

const ATTRIBUTE_ALIAS = Object.freeze({
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

  POA: 'POA',
  POPULATION_ORIGINS_ANCESTRY: 'POA',
  POPULATION_ORIGINS: 'POA',
  POPULATION_ANCESTRY: 'POA',
  POPULATIONORIGINS: 'POA',
  DUO0000011: 'POA',

  GS: 'GS',
  GEOGRAPHICAL_RESTRICTION: 'GS',
  GEOGRAPHIC_RESTRICTION: 'GS',
  DUO0000022: 'GS',

  CC: 'CC',
  CLINICAL_CARE: 'CC',
  CLINICALCARE: 'CC',
  DUO0000043: 'CC'
});

const ATTRIBUTE_MAP = new Map(ATTRIBUTE_CATALOG.map((attr) => [attr.code, attr]));

function canonicalizeAttribute(code) {
  if (!code) {
    throw new Error('Attribute code is required');
  }
  const normalized = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const mapped = ATTRIBUTE_ALIAS[normalized];
  if (!mapped) {
    throw new Error(`Unknown attribute code: ${code}`);
  }
  return mapped;
}

function resolveAttributeOrder(order) {
  if (!order || order.length === 0) {
    return ATTRIBUTE_CATALOG.slice();
  }
  return order.map((entry, idx) => {
    const code = canonicalizeAttribute(entry);
    const attr = ATTRIBUTE_MAP.get(code);
    if (!attr) {
      throw new Error(`Unsupported attribute at attributeOrder[${idx}]: ${entry}`);
    }
    return attr;
  });
}

function createRng(seedOrFn) {
  if (typeof seedOrFn === 'function') {
    return seedOrFn;
  }
  if (seedOrFn === undefined || seedOrFn === null) {
    return Math.random;
  }
  let seed = typeof seedOrFn === 'number' ? seedOrFn >>> 0 : null;
  if (typeof seedOrFn === 'string') {
    const hash = crypto.createHash('sha256').update(seedOrFn).digest('hex');
    seed = parseInt(hash.slice(0, 8), 16) >>> 0;
  }
  if (seed === null) {
    throw new Error('Seed must be a number, string, or RNG function');
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
  return array[randomInt(rng, 0, array.length - 1)];
}

function shuffle(rng, array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function randomHex(rng, bytes = 16) {
  if (!rng || rng === Math.random) {
    return '0x' + crypto.randomBytes(bytes).toString('hex');
  }
  let hex = '';
  for (let i = 0; i < bytes; i++) {
    const value = Math.floor(rng() * 256) & 0xff;
    hex += value.toString(16).padStart(2, '0');
  }
  return '0x' + hex;
}

function maybeNegate(rng, expr, probability) {
  if (probability <= 0) return expr;
  return rng() < probability ? `!${expr}` : expr;
}

function buildLogicExpression(rng, attributeCodes, options = {}) {
  const { notProbability = 0.25, groupNotProbability = 0.15, operators = ['&', '|'] } = options;
  if (attributeCodes.length === 1) {
    return maybeNegate(rng, attributeCodes[0], notProbability);
  }
  const shuffled = shuffle(rng, attributeCodes);
  const stack = shuffled.map((code) => maybeNegate(rng, code, notProbability));

  while (stack.length > 1) {
    const right = stack.pop();
    const left = stack.pop();
    const op = randomChoice(rng, operators);
    let expr = `(${left} ${op} ${right})`;
    expr = maybeNegate(rng, expr, groupNotProbability);
    stack.push(expr);
  }

  return stack[0];
}

function ensureAttributeMap(attributeOrder, selectedCodes) {
  const attrMap = {};
  attributeOrder.forEach((attr) => {
    attrMap[attr.code] = selectedCodes.includes(attr.code);
  });
  ATTRIBUTE_CATALOG.forEach((attr) => {
    if (!Object.prototype.hasOwnProperty.call(attrMap, attr.code)) {
      attrMap[attr.code] = false;
    }
  });
  return attrMap;
}

function buildPredicates(rng, selectedAttributes) {
  const predicates = [];
  let slot = 0;
  selectedAttributes.forEach((attr) => {
    if (attr.requiresPredicate) {
      predicates.push({
        slot,
        duo: attr.code,
        namespace: attr.namespace,
        root: randomHex(rng, 16),
        description: attr.description
      });
      slot += 1;
    }
  });
  return predicates;
}

function generateRandomHumanPolicy(options = {}) {
  const {
    policyId,
    datasetId = null,
    attributeOrder: attributeOrderOption,
    minAttributes = 1,
    maxAttributes = 3,
    seed,
    rng: rngOption,
    logicOperators = ['&', '|'],
    notProbability = 0.25,
    groupNotProbability = 0.15
  } = options;

  const rng = createRng(rngOption !== undefined ? rngOption : seed);
  const attributeOrder = resolveAttributeOrder(attributeOrderOption);

  const minSel = Math.min(Math.max(1, minAttributes), attributeOrder.length);
  const maxSel = Math.min(Math.max(minSel, maxAttributes), attributeOrder.length);
  const selectionCount = randomInt(rng, minSel, maxSel);
  const selectedAttributes = shuffle(rng, attributeOrder).slice(0, selectionCount);
  const selectedCodes = selectedAttributes.map((attr) => attr.code);

  const attributes = ensureAttributeMap(attributeOrder, selectedCodes);
  const predicates = buildPredicates(rng, selectedAttributes);
  const logic = buildLogicExpression(rng, selectedCodes, {
    notProbability,
    groupNotProbability,
    operators: logicOperators
  });

  const policyIdentifier =
    policyId || `policy-${randomHex(rng, 4).slice(2)}`;

  return {
    policy_id: policyIdentifier,
    dataset_id: datasetId,
    attributes,
    predicates,
    logic,
    attribute_order: attributeOrder.map((attr) => attr.code),
    metadata: {
      selectedAttributes: selectedCodes,
      seed: seed ?? null
    }
  };
}

async function generateRandomPolicyArtifacts(options = {}) {
  const authorPolicy = generateRandomHumanPolicy(options);
  const attributeOrder = options.attributeOrder || authorPolicy.attribute_order;
  const artifacts = await generatePolicyArtifacts(authorPolicy, {
    depth: options.depth ?? 10,
    randomizer: options.randomizer,
    attributeOrder
  });
  return { authorPolicy, artifacts };
}

module.exports = {
  generateRandomHumanPolicy,
  generateRandomPolicyArtifacts
};
