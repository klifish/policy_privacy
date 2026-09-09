'use strict';

// Global, sparse Poseidon registry for DUO user/project/institution scoped
// memberships. It deliberately has a different leaf domain from ontology
// whitelists, even though both use the same binary Poseidon Merkle primitive.
const { getPoseidon, toBigInt, toHex } = require('./ontology_whitelist');

const SCOPED_MEMBERSHIP_V1 = 2001n;
const SCOPE_KINDS = Object.freeze({ US: 26n, PS: 27n, IS: 28n });
const DEFAULT_MERKLE_LEVELS = 20;
const MAX_EPOCH = (1n << 32n) - 1n;
const BN254_FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

function fieldString(value, name) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0)) {
    throw new Error(`${name} must be a non-negative safe integer, string, or bigint`);
  }
  const normalized = toBigInt(value, name);
  if (normalized < 0n || normalized >= BN254_FIELD_MODULUS) throw new Error(`${name} is outside the BN254 scalar field`);
  return normalized;
}

function normalizeScopeKind(value) {
  if (typeof value === 'string' && value.trim().toUpperCase() in SCOPE_KINDS) {
    return SCOPE_KINDS[value.trim().toUpperCase()];
  }
  const kind = fieldString(value, 'scopeKind');
  if (kind !== SCOPE_KINDS.US && kind !== SCOPE_KINDS.PS && kind !== SCOPE_KINDS.IS) {
    throw new Error('scopeKind must be US/PS/IS or 26/27/28');
  }
  return kind;
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') throw new Error('Scoped registry record must be an object');
  const normalized = {
    scopeKind: normalizeScopeKind(record.scopeKind ?? record.duo ?? record.kind),
    requesterId: fieldString(record.requesterId, 'requesterId'),
    scopeId: fieldString(record.scopeId ?? record.approvedScopeId, 'scopeId'),
    validFromEpoch: fieldString(record.validFromEpoch ?? 0, 'validFromEpoch'),
    validUntilEpoch: fieldString(record.validUntilEpoch, 'validUntilEpoch'),
    recordVersion: fieldString(record.recordVersion ?? 1, 'recordVersion')
  };
  if (normalized.validFromEpoch > MAX_EPOCH || normalized.validUntilEpoch > MAX_EPOCH) {
    throw new Error('Scoped membership epochs must fit in 32 bits');
  }
  if (normalized.validFromEpoch > normalized.validUntilEpoch) {
    throw new Error('validFromEpoch must not exceed validUntilEpoch');
  }
  if (normalized.requesterId === 0n || normalized.scopeId === 0n || normalized.recordVersion === 0n) {
    throw new Error('requesterId, scopeId, and recordVersion must be non-zero');
  }
  // DUO:0000026 (US) names the approved user, not an arbitrary group.
  if (normalized.scopeKind === SCOPE_KINDS.US && normalized.requesterId !== normalized.scopeId) {
    throw new Error('US scoped membership requires requesterId to equal scopeId');
  }
  return normalized;
}

function toBig(poseidon, value) {
  return BigInt(poseidon.F.toString(value));
}

async function calculateScopedMembershipLeaf(record) {
  const r = normalizeRecord(record);
  const poseidon = await getPoseidon();
  const leaf = toBig(poseidon, poseidon([
    SCOPED_MEMBERSHIP_V1, r.scopeKind, r.requesterId, r.scopeId,
    r.validFromEpoch, r.validUntilEpoch, r.recordVersion
  ]));
  return { ...r, leaf, leafHex: toHex(leaf) };
}

async function buildScopedRegistry(config = {}) {
  const merkleLevels = config.merkleLevels ?? config.levels ?? DEFAULT_MERKLE_LEVELS;
  if (merkleLevels !== DEFAULT_MERKLE_LEVELS) {
    throw new Error(`Scoped registry must use merkleLevels=${DEFAULT_MERKLE_LEVELS}`);
  }
  if (!Array.isArray(config.records) || config.records.length === 0) {
    throw new Error('records must be a non-empty array');
  }
  const capacity = 2 ** merkleLevels;
  if (config.records.length > capacity) throw new Error('Too many scoped records for merkleLevels');

  const entries = await Promise.all(config.records.map(calculateScopedMembershipLeaf));
  entries.sort((a, b) => a.leaf === b.leaf ? 0 : (a.leaf < b.leaf ? -1 : 1));
  const seen = new Set();
  for (const entry of entries) {
    const key = `${entry.scopeKind}|${entry.requesterId}|${entry.scopeId}|${entry.validFromEpoch}|${entry.validUntilEpoch}|${entry.recordVersion}`;
    if (seen.has(key)) throw new Error('Duplicate scoped registry record');
    seen.add(key);
  }

  const poseidon = await getPoseidon();
  const zeroHashes = [0n];
  for (let level = 0; level < merkleLevels; level++) {
    zeroHashes.push(toBig(poseidon, poseidon([zeroHashes[level], zeroHashes[level]])));
  }

  const levels = [];
  let nodes = new Map();
  entries.forEach((entry, index) => {
    entry.index = index;
    nodes.set(index, entry.leaf);
  });
  levels.push(nodes);
  for (let level = 0; level < merkleLevels; level++) {
    const parents = new Map();
    for (const index of nodes.keys()) {
      const parent = Math.floor(index / 2);
      if (!parents.has(parent)) {
        const left = nodes.get(parent * 2) ?? zeroHashes[level];
        const right = nodes.get(parent * 2 + 1) ?? zeroHashes[level];
        parents.set(parent, toBig(poseidon, poseidon([left, right])));
      }
    }
    nodes = parents;
    levels.push(nodes);
  }
  const root = nodes.get(0) ?? zeroHashes[merkleLevels];

  for (const entry of entries) {
    let index = entry.index;
    entry.pathElements = [];
    entry.pathIndices = [];
    for (let level = 0; level < merkleLevels; level++) {
      entry.pathElements.push(levels[level].get(index ^ 1) ?? zeroHashes[level]);
      entry.pathIndices.push(index & 1);
      index = Math.floor(index / 2);
    }
  }
  return {
    metadata: { merkleLevels, treeSize: capacity, leafCount: entries.length, root, rootHex: toHex(root) },
    entries
  };
}

async function verifyScopedMembershipProof(entry, root) {
  if (!entry || !Array.isArray(entry.pathElements) || !Array.isArray(entry.pathIndices)) {
    throw new Error('A scoped registry entry with pathElements/pathIndices is required');
  }
  if (entry.pathElements.length !== DEFAULT_MERKLE_LEVELS || entry.pathIndices.length !== DEFAULT_MERKLE_LEVELS) {
    throw new Error(`Scoped registry paths must have exactly ${DEFAULT_MERKLE_LEVELS} levels`);
  }
  const calculated = await calculateScopedMembershipLeaf(entry);
  let current = calculated.leaf;
  const poseidon = await getPoseidon();
  for (let i = 0; i < entry.pathElements.length; i++) {
    const sibling = fieldString(entry.pathElements[i], `pathElements[${i}]`);
    const bit = Number(entry.pathIndices[i]);
    if (bit !== 0 && bit !== 1) throw new Error(`pathIndices[${i}] must be 0 or 1`);
    current = toBig(poseidon, poseidon(bit === 0 ? [current, sibling] : [sibling, current]));
  }
  return current === fieldString(root, 'root');
}

module.exports = {
  SCOPED_MEMBERSHIP_V1,
  SCOPE_KINDS,
  DEFAULT_MERKLE_LEVELS,
  BN254_FIELD_MODULUS,
  calculateScopedMembershipLeaf,
  buildScopedRegistry,
  verifyScopedMembershipProof
};
