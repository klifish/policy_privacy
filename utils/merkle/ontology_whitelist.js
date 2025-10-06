'use strict';

const circomlibjs = require('circomlibjs');
const crypto = require('crypto');

const NAMESPACE_IDS = Object.freeze({
  ICD10: 0,
  OBI: 1,
  HANCESTRO: 2,
  ISO3166: 3,
  SNOMED: 4
});

const NAMESPACE_ALIASES = Object.freeze({
  DS: 'ICD10',
  DISEASE_SPECIFIC: 'ICD10',
  ICD10: 'ICD10',
  RS: 'OBI',
  RESEARCH_SPECIFIC: 'OBI',
  OBI: 'OBI',
  POA: 'HANCESTRO',
  POPULATION_ANCESTRY: 'HANCESTRO',
  HANCESTRO: 'HANCESTRO',
  GS: 'ISO3166',
  GEOGRAPHICAL_RESTRICTION: 'ISO3166',
  ISO3166: 'ISO3166',
  CC: 'SNOMED',
  CLINICAL_CARE: 'SNOMED',
  SNOMED: 'SNOMED'
});

const NAMESPACE_BITS = 16n;
const TERM_BITS = 128n;
const EPOCH_BITS = 32n;

const TERM_MASK = (1n << TERM_BITS) - 1n;
const EPOCH_MASK = (1n << EPOCH_BITS) - 1n;

let poseidonInstancePromise = null;

async function getPoseidon() {
  if (!poseidonInstancePromise) {
    poseidonInstancePromise = circomlibjs.buildPoseidon();
  }
  return poseidonInstancePromise;
}

function toBigInt(value, fieldName) {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric value for ${fieldName || 'value'}`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`Empty string provided for ${fieldName || 'value'}`);
    }
    if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    if (/^-?\d+$/.test(trimmed)) {
      return BigInt(trimmed);
    }
    throw new Error(`Unsupported string format for ${fieldName || 'value'}: ${value}`);
  }
  if (value instanceof Uint8Array) {
    let hex = Buffer.from(value).toString('hex');
    if (!hex) {
      hex = '0';
    }
    return BigInt(`0x${hex}`);
  }
  throw new Error(`Cannot convert value to BigInt${fieldName ? ` for ${fieldName}` : ''}`);
}

function toHex(value) {
  const big = toBigInt(value);
  if (big === 0n) {
    return '0x0';
  }
  return `0x${big.toString(16)}`;
}

function sha256BigInt(input) {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : Buffer.from(String(input), 'utf8');
  const digestHex = crypto.createHash('sha256').update(buffer).digest('hex');
  return BigInt(`0x${digestHex}`);
}

function canonicalNamespace(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    const entry = Object.entries(NAMESPACE_IDS).find(([, id]) => id === value);
    if (!entry) {
      throw new Error(`Unknown namespace id: ${value}`);
    }
    return entry[0];
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const upper = trimmed.toUpperCase();
    if (upper in NAMESPACE_IDS) {
      return upper;
    }
    if (upper in NAMESPACE_ALIASES) {
      return NAMESPACE_ALIASES[upper];
    }
  }
  throw new Error(`Unknown namespace value: ${value}`);
}

function normalizeTerm(raw, defaults, index) {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Term at index ${index} must be an object`);
  }
  const namespaceValue = raw.namespace ?? raw.namespaceId ?? raw.ns ?? defaults.defaultNamespace;
  const namespace = canonicalNamespace(namespaceValue);
  if (!namespace) {
    throw new Error(`Term at index ${index} is missing namespace`);
  }
  const namespaceId = NAMESPACE_IDS[namespace];

  const termValue = raw.termId ?? raw.term ?? raw.value ?? raw.id;
  if (termValue === undefined || termValue === null) {
    throw new Error(`Term at index ${index} is missing termId`);
  }
  const termId = String(termValue).trim();
  if (!termId) {
    throw new Error(`Term at index ${index} has empty termId`);
  }

  const epochValue = raw.epoch ?? raw.termEpoch ?? defaults.defaultEpoch;
  const epoch = toBigInt(epochValue ?? 0, 'epoch');
  if (epoch < 0n) {
    throw new Error(`Epoch must be non-negative (index ${index})`);
  }
  if (epoch > EPOCH_MASK) {
    throw new Error(`Epoch exceeds ${EPOCH_MASK} at index ${index}`);
  }

  return { namespace, namespaceId, termId, epoch };
}

function computeLeafComponents(term) {
  const termHashFull = sha256BigInt(term.termId);
  const termHashTruncated = termHashFull & TERM_MASK;
  const namespaceBig = BigInt(term.namespaceId);
  if (namespaceBig < 0n || namespaceBig > ((1n << NAMESPACE_BITS) - 1n)) {
    throw new Error(`Namespace id ${term.namespaceId} out of range`);
  }
  const packed = (namespaceBig << (TERM_BITS + EPOCH_BITS)) |
    (termHashTruncated << EPOCH_BITS) |
    term.epoch;
  return {
    termHashFull,
    termHashTruncated,
    packed
  };
}

function FtoBig(poseidon, value) {
  return BigInt(poseidon.F.toString(value));
}

function buildLayers(poseidon, leaves) {
  const layers = [];
  layers.push([...leaves]);
  let current = leaves;
  while (current.length > 1) {
    const next = new Array(current.length / 2);
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = current[i + 1] ?? 0n;
      const hashed = poseidon([left, right]);
      next[i / 2] = FtoBig(poseidon, hashed);
    }
    layers.push(next);
    current = next;
  }
  return { layers, root: current[0] ?? 0n };
}

function buildProof(layers, index) {
  const pathElements = [];
  const pathIndices = [];
  let idx = index;
  for (let level = 0; level < layers.length - 1; level++) {
    const layer = layers[level];
    const siblingIndex = idx ^ 1;
    const sibling = layer[siblingIndex] ?? 0n;
    pathElements.push(sibling);
    pathIndices.push(idx & 1);
    idx >>= 1;
  }
  return { pathElements, pathIndices };
}

function computeConfigHash(entries) {
  const canonical = entries.map(entry => ({
    namespace: entry.namespace,
    termId: entry.termId,
    epoch: entry.epoch.toString()
  }));
  const canonicalJson = JSON.stringify(canonical);
  return toHex(sha256BigInt(canonicalJson));
}

async function buildWhitelist(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }
  const merkleLevels = config.merkleLevels ?? config.levels;
  if (!Number.isInteger(merkleLevels) || merkleLevels <= 0) {
    throw new Error('merkleLevels must be a positive integer');
  }
  const treeSize = 1 << merkleLevels;

  if (!Array.isArray(config.terms) || config.terms.length === 0) {
    throw new Error('terms must be a non-empty array');
  }

  const defaultEpoch = config.defaultEpoch !== undefined ? toBigInt(config.defaultEpoch, 'defaultEpoch') : 0n;
  if (defaultEpoch < 0n) {
    throw new Error('defaultEpoch must be non-negative');
  }
  if (defaultEpoch > EPOCH_MASK) {
    throw new Error(`defaultEpoch exceeds ${EPOCH_MASK}`);
  }

  const defaults = {
    defaultEpoch,
    defaultNamespace: canonicalNamespace(config.defaultNamespace ?? config.namespace ?? null)
  };

  const normalized = [];
  const dedupeMap = new Map();
  for (let i = 0; i < config.terms.length; i++) {
    const term = normalizeTerm(config.terms[i], defaults, i);
    const key = `${term.namespace}|${term.termId}|${term.epoch.toString()}`;
    if (!dedupeMap.has(key)) {
      dedupeMap.set(key, term);
      normalized.push(term);
    }
  }

  normalized.sort((a, b) => {
    if (a.namespace !== b.namespace) {
      return a.namespace < b.namespace ? -1 : 1;
    }
    if (a.termId !== b.termId) {
      return a.termId < b.termId ? -1 : 1;
    }
    if (a.epoch !== b.epoch) {
      return a.epoch < b.epoch ? -1 : 1;
    }
    return 0;
  });

  if (normalized.length > treeSize) {
    throw new Error(`Too many terms (${normalized.length}) for merkleLevels=${merkleLevels}`);
  }

  const poseidon = await getPoseidon();
  const leaves = new Array(treeSize).fill(0n);
  const entries = normalized.map((term, index) => {
    const { termHashFull, termHashTruncated, packed } = computeLeafComponents(term);
    const leaf = FtoBig(poseidon, poseidon([packed]));
    leaves[index] = leaf;
    const entry = {
      namespace: term.namespace,
      namespaceId: term.namespaceId,
      termId: term.termId,
      epoch: term.epoch,
      index,
      termHash: termHashTruncated,
      termHashFull,
      packed,
      leaf
    };
    return entry;
  });

  const { layers, root } = buildLayers(poseidon, leaves);
  const rootHex = toHex(root);

  entries.forEach(entry => {
    const { pathElements, pathIndices } = buildProof(layers, entry.index);
    entry.pathElements = pathElements;
    entry.pathIndices = pathIndices;
  });

  return {
    metadata: {
      merkleLevels,
      root,
      rootHex,
      treeSize,
      leafCount: entries.length,
      fillerLeafHex: toHex(0n),
      configHash: computeConfigHash(entries)
    },
    entries
  };
}

async function verifyProof(proof, options = {}) {
  if (!proof) {
    throw new Error('Proof is required');
  }
  const poseidon = options.poseidon || await getPoseidon();
  const leafValue = proof.leaf ?? proof.leafHex ?? proof.leafValue;
  const rootValue = options.root ?? proof.root ?? proof.rootHex;
  if (leafValue === undefined) {
    throw new Error('Proof is missing leaf');
  }
  if (rootValue === undefined) {
    throw new Error('Root value is required to verify proof');
  }
  let current = toBigInt(leafValue, 'leaf');
  const root = toBigInt(rootValue, 'root');

  const elementsSource = proof.pathElements ?? proof.path ?? proof.siblings;
  const indicesSource = proof.pathIndices ?? proof.pathPos ?? proof.indices;
  if (!Array.isArray(elementsSource) || !Array.isArray(indicesSource)) {
    throw new Error('Proof must include pathElements/pathIndices arrays');
  }
  if (elementsSource.length !== indicesSource.length) {
    throw new Error('pathElements and pathIndices must have same length');
  }

  for (let i = 0; i < elementsSource.length; i++) {
    const sibling = toBigInt(elementsSource[i], `pathElements[${i}]`);
    const indexBit = Number(indicesSource[i]);
    if (indexBit !== 0 && indexBit !== 1) {
      throw new Error(`pathIndices[${i}] must be 0 or 1`);
    }
    const left = indexBit === 0 ? current : sibling;
    const right = indexBit === 0 ? sibling : current;
    current = FtoBig(poseidon, poseidon([left, right]));
  }

  return current === root;
}

module.exports = {
  NAMESPACE_IDS,
  NAMESPACE_ALIASES,
  NAMESPACE_BITS,
  TERM_BITS,
  EPOCH_BITS,
  TERM_MASK,
  EPOCH_MASK,
  getPoseidon,
  toBigInt,
  toHex,
  buildWhitelist,
  verifyProof
};
