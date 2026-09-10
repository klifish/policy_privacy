'use strict';

const circomlibjs = require('circomlibjs');

// A separate domain prevents a requester pseudonym leaf from being
// reinterpreted as an ontology term or another Merkle-committed value.
const USER_ALLOWLIST_V1 = 2005n;
const MERKLE_LEVELS = 8;
const BN254_SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let poseidonPromise = null;

async function getPoseidon() {
  if (!poseidonPromise) poseidonPromise = circomlibjs.buildPoseidon();
  return poseidonPromise;
}

function toBigInt(value, name = 'value') {
  try {
    const parsed = BigInt(value);
    if (parsed <= 0n || parsed >= BN254_SCALAR_FIELD) throw new Error('out of field range');
    return parsed;
  } catch (_) {
    throw new Error(`${name} must be a non-zero BN254 field element`);
  }
}

function fieldToBigInt(poseidon, value) {
  return BigInt(poseidon.F.toString(value));
}

function normalizeScope({ scopeKind = 26, scopeId = 0 } = {}) {
  const kind = BigInt(scopeKind);
  if (![26n, 27n, 28n].includes(kind)) {
    throw new Error('scopeKind must be 26 (US), 27 (PS), or 28 (IS)');
  }
  let id;
  try { id = BigInt(scopeId); } catch (_) { throw new Error('scopeId must be a BN254 field element'); }
  if (kind === 26n && id !== 0n) throw new Error('US scopeId must be zero');
  if (kind !== 26n) id = toBigInt(id, 'scopeId');
  return { scopeKind: kind, scopeId: id };
}

async function calculateRequesterAllowlistLeaf(requesterId, scope = {}) {
  const poseidon = await getPoseidon();
  const normalizedScope = normalizeScope(scope);
  return fieldToBigInt(
    poseidon,
    poseidon([
      USER_ALLOWLIST_V1,
      normalizedScope.scopeKind,
      normalizedScope.scopeId,
      toBigInt(requesterId, 'requesterId')
    ])
  );
}

function buildLayers(poseidon, leaves) {
  const layers = [[...leaves]];
  let current = leaves;
  while (current.length > 1) {
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      next.push(fieldToBigInt(poseidon, poseidon([current[i], current[i + 1]])));
    }
    layers.push(next);
    current = next;
  }
  return { layers, root: current[0] };
}

function buildPath(layers, index) {
  const pathElements = [];
  const pathIndices = [];
  let cursor = index;
  for (let level = 0; level < layers.length - 1; level += 1) {
    pathElements.push(layers[level][cursor ^ 1]);
    pathIndices.push(cursor & 1);
    cursor >>= 1;
  }
  return { pathElements, pathIndices };
}

/**
 * Create a fixed-depth Poseidon Merkle allowlist for requester pseudonyms.
 * The provider commits only `root`; each requester later provides its own
 * private membership path as part of the Groth16 witness.
 */
async function buildRequesterAllowlist({ requesterIds, scopeKind = 26, scopeId = 0, merkleLevels = MERKLE_LEVELS } = {}) {
  if (merkleLevels !== MERKLE_LEVELS) {
    throw new Error(`merkleLevels must be ${MERKLE_LEVELS} to match the production circuit`);
  }
  if (!Array.isArray(requesterIds) || requesterIds.length === 0) {
    throw new Error('requesterIds must be a non-empty array');
  }

  const normalized = requesterIds.map((id, index) => toBigInt(id, `requesterIds[${index}]`));
  const normalizedScope = normalizeScope({ scopeKind, scopeId });
  if (new Set(normalized.map(String)).size !== normalized.length) {
    throw new Error('requesterIds must not contain duplicates');
  }
  normalized.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const capacity = 1 << merkleLevels;
  if (normalized.length > capacity) {
    throw new Error(`requesterIds exceeds capacity ${capacity} for merkleLevels=${merkleLevels}`);
  }

  const poseidon = await getPoseidon();
  const leaves = Array(capacity).fill(0n);
  const entries = [];
  for (let index = 0; index < normalized.length; index += 1) {
    const requesterId = normalized[index];
    const leaf = fieldToBigInt(poseidon, poseidon([
      USER_ALLOWLIST_V1,
      normalizedScope.scopeKind,
      normalizedScope.scopeId,
      requesterId
    ]));
    leaves[index] = leaf;
    entries.push({ requesterId, leaf, index });
  }

  const { layers, root } = buildLayers(poseidon, leaves);
  for (const entry of entries) {
    Object.assign(entry, buildPath(layers, entry.index));
  }

  return { merkleLevels, root, scopeKind: normalizedScope.scopeKind, scopeId: normalizedScope.scopeId, entries };
}

module.exports = {
  USER_ALLOWLIST_V1,
  MERKLE_LEVELS,
  calculateRequesterAllowlistLeaf,
  buildRequesterAllowlist
};
