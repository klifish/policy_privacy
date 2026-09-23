'use strict';

/**
 * Shared harness for the DUO V3 term / combination test suite.
 *
 * Layers:
 *   compile  - generatePolicyArtifacts with predicates auto-derived from the logic string
 *   witness  - witness_calculator only; returns isAuthorized (soft) or throws (hard constraint)
 *   chain    - Groth16 proof via tps/proofGenerator + PolicyPrivacy.requestAccessBound
 *
 * Tiers (environment):
 *   DUO_E2E_WITNESS_ONLY=1  skip every proof / on-chain case
 *   DUO_E2E_FULL=1          also prove the cases marked tier:'full'
 *   DUO_E2E_LOG_TIMINGS=1   print per-proof witness/prove/verify timings
 *
 * Measured on the 94,156-constraint build (Apple M1): ~5 s per proof;
 * `npm run test:duo` = 64 proofs / 367 tests in ~8 min.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { expect } = require('chai');

const { generatePolicyArtifacts } = require('../../../compiler/policy_generator');
const { buildWhitelist } = require('../../../utils/merkle/ontology_whitelist');
const { buildRequesterAllowlist, calculateRequesterAllowlistLeaf } = require('../../../utils/merkle/requester_allowlist');
const {
  calculateParamsCommitment,
  calculateRequesterId,
  signDuoProfileCredential,
  calculateContextHash
} = require('../../../lib/prover');
const { deployPoseidon3 } = require('../../../lib/poseidon_contract');
const {
  DUO_V3_ATTRIBUTE_ORDER: ATTR_ORDER,
  DUO_V3_N: N,
  DUO_V3_M: M,
  DUO_V3_DEPTH: DEPTH,
  DUO_V3_PROFILE_SLOT: PROFILE_SLOT,
  DUO_V3_PROFILE_TERMS: PROFILE_TERMS,
  DUO_V3_CLAIM_BITS: CLAIM_BIT,
  encodeDuoV3ProfileClaims,
  deriveDuoV3RequesterAttrs
} = require('../../../lib/duo_v3');
const { buildWitness, generateProof, WASM_PATH, ZKEY_PATH, VKEY_PATH } = require('../../../tps/proofGenerator');

// ---------------------------------------------------------------------------
// Constants (must match circuits/policy_privacy_main_instance.circom and the
// fixed slot layout in compiler/policy_generator.js)
// ---------------------------------------------------------------------------
// The frozen production circuit uses eight levels. Offline capacity benchmarks
// may override this in a child process; all normal tests and deployments leave
// the variable unset and retain the RC1 value.
const MERKLE_LEVELS = Number(process.env.PROTOCOL_MERKLE_LEVELS || 8);
const MAX_UINT32 = 4294967295;
const ONTOLOGY_EPOCH = 2026;
const ONTOLOGY_POLICY_ID = (slot) => 100 + slot;
const WITNESS_CALCULATOR_PATH = path.join(path.dirname(WASM_PATH), 'witness_calculator.js');

const ATTR_INDEX = Object.fromEntries(ATTR_ORDER.map((code, i) => [code, i]));

const ONTOLOGY_TERMS = { DS: ['ICD10', 0], RS: ['OBI', 1], POA: ['HANCESTRO', 2], GS: ['ISO3166', 3], CC: ['SNOMED', 4] };
const SCOPED_TERMS = {
  US: { slot: 5, scopeKind: 26, scopeId: 0 },
  PS: { slot: 6, scopeKind: 27, scopeId: 9001 },
  IS: { slot: 7, scopeKind: 28, scopeId: 9002 }
};
const OBLIGATION_TERMS = { MOR: 8, TS: 9 };
const NS_TO_TERM = Object.fromEntries(Object.entries(ONTOLOGY_TERMS).map(([t, [ns]]) => [ns, t]));
const ALL_TERMS = ['NRES', ...PROFILE_TERMS, ...Object.keys(ONTOLOGY_TERMS), ...Object.keys(SCOPED_TERMS), ...Object.keys(OBLIGATION_TERMS)];

const TOK = { attr: (code) => ATTR_INDEX[code], pred: (slot) => N + slot, AND: N + M, OR: N + M + 1, NOT: N + M + 2, TRUE: N + M + 3 };

const MORATORIUM_UNTIL_EPOCH = 100;
const TS_DURATION_MONTHS = 1; // -> 720 epochs
const TS_EPOCHS = 720;
const ANON_ID = 111n; // idReq for policies without a holder-bound slot

const FULL = process.env.DUO_E2E_FULL === '1';
const WITNESS_ONLY = process.env.DUO_E2E_WITNESS_ONLY === '1';
const circuitAvailable = () => [WASM_PATH, ZKEY_PATH, VKEY_PATH].every((p) => fs.existsSync(p));
const wasmAvailable = () => fs.existsSync(WASM_PATH) && fs.existsSync(WITNESS_CALCULATOR_PATH);

const ZERO_PROOF = [[0, 0], [[0, 0], [0, 0]], [0, 0]];

const zeros = (n) => Array(n).fill('0');
const zeroPaths = () => Array.from({ length: M }, () => Array(MERKLE_LEVELS).fill('0'));
const zeroPathIndices = () => Array.from({ length: M }, () => Array(MERKLE_LEVELS).fill(0));
const dec = (v) => BigInt(v).toString();

// ---------------------------------------------------------------------------
// Requester profile abstraction
// ---------------------------------------------------------------------------
// `anonId` (optional) is the pseudonym presented when the policy has no
// holder-bound slot; holder-bound policies always use Poseidon(holderSecret).
const BASE_REQUESTER = Object.freeze({
  holder: 'alice',
  claims: { research: 1, health: 1, methods: 0, genetic: 1, ancestry: 0, commercial: 0, nonprofit: 1 }, // = 75
  attrs: { DS: 1, RS: 1, POA: 1, GS: 1, CC: 1 },
  ontology: { ICD10: 'member', OBI: 'member', HANCESTRO: 'member', ISO3166: 'member', SNOMED: 'member' },
  allowlists: { US: 'member', PS: 'member', IS: 'member' },
  credential: { issuer: 'good', validFromDelta: -10, validUntilDelta: 10_000, credentialId: 1 }
});

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(profile));
}

function claimsToInt(claims) {
  return encodeDuoV3ProfileClaims(claims);
}

/**
 * Attribute vector as constrained by policy_privacy_main.circom (profile
 * claim bits -> attrs[0], attrs[6..12]); attrs[1..5] are the requester's own
 * ontology-term booleans.
 */
function deriveAttrsFromClaims(claimsInt, attrs = {}) {
  return deriveDuoV3RequesterAttrs(claimsInt, attrs);
}

/** DUO terms referenced by a logic string (bare shorthands and P[NS] tokens). */
function termsIn(logic) {
  const found = new Set();
  const predicateRe = /P\[\s*([A-Za-z0-9_:\-]+)\s*\]/gi;
  let m;
  while ((m = predicateRe.exec(logic)) !== null) {
    const inner = m[1].toUpperCase();
    if (NS_TO_TERM[inner]) found.add(NS_TO_TERM[inner]);
    else if (SCOPED_TERMS[inner] || OBLIGATION_TERMS[inner]) found.add(inner);
    else if (inner === 'DUO_PROFILE') found.add('__PROFILE__');
  }
  const stripped = logic.replace(predicateRe, ' ');
  for (const word of stripped.match(/[A-Za-z0-9_]+/g) || []) {
    const upper = word.toUpperCase();
    if (ALL_TERMS.includes(upper)) found.add(upper);
  }
  return found;
}

/** Mechanical deny perturbation for one term. */
function denyVariant(profile, term, variant = 'default') {
  const p = cloneProfile(profile);
  const setClaim = (name, value) => { p.claims[name] = value; };
  switch (term) {
    case 'GRU': setClaim('research', 0); break;
    case 'HMB': variant === 'ancestry' ? setClaim('ancestry', 1) : setClaim('health', 0); break;
    case 'NMDS': setClaim('methods', 1); break;
    case 'GSO': setClaim('genetic', 0); break;
    case 'NPUNCU': variant === 'nonprofit' ? setClaim('nonprofit', 0) : setClaim('commercial', 1); break;
    case 'NPOA': setClaim('ancestry', 1); break;
    case 'NPU': setClaim('nonprofit', 0); break;
    case 'NCU': setClaim('commercial', 1); break;
    case 'DS': case 'RS': case 'POA': case 'GS': case 'CC': {
      if (variant === 'attr') p.attrs[term] = 0;
      else p.ontology[ONTOLOGY_TERMS[term][0]] = 'nonmember';
      break;
    }
    case 'US': case 'PS': case 'IS':
      if (variant === 'keep-holder') {
        // Same (listed) holder, but this one slot is presented with an
        // unrelated Merkle path: isolates the slot's membership check.
        p.allowlists[term] = 'outsider';
      } else {
        // An unlisted requester: not a member of any allowlist.
        p.holder = 'outsider';
        for (const t of Object.keys(SCOPED_TERMS)) p.allowlists[t] = 'outsider';
      }
      break;
    case 'MOR': case 'TS':
      throw new Error(`${term} has no requester-side deny: obligations are configured by the provider`);
    default:
      throw new Error(`Unknown term ${term}`);
  }
  return p;
}

function denyAll(profile, terms) {
  return terms.reduce((acc, t) => denyVariant(acc, t), profile);
}

/**
 * Resolve a case profile spec into a concrete profile.
 *   { flip: ['HMB','DS'], variant: 'ancestry', overrides: {holder:'bob'} }
 */
function resolveProfile(spec = {}) {
  let p = cloneProfile(BASE_REQUESTER);
  if (spec.overrides) {
    for (const [key, value] of Object.entries(spec.overrides)) {
      p[key] = typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...p[key], ...value } : value;
    }
  }
  for (const term of spec.flip || []) p = denyVariant(p, term, spec.variant);
  return p;
}

function describeSpec(spec = {}) {
  const parts = [];
  if (spec.flip && spec.flip.length) parts.push(`flip ${spec.flip.join('+')}${spec.variant ? `/${spec.variant}` : ''}`);
  if (spec.overrides) parts.push(`overrides ${JSON.stringify(spec.overrides)}`);
  return parts.length ? parts.join(', ') : 'BASE';
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const WHITELIST_TERMS = {
  ICD10: { members: ['C34.9', 'C50.9', 'E11.9'], nonMember: 'Z99.9' },
  OBI: { members: ['OBI:0000070', 'OBI:0000185', 'OBI:0002118'], nonMember: 'OBI:9999999' },
  HANCESTRO: { members: ['HANCESTRO:0005', 'HANCESTRO:0010', 'HANCESTRO:0016'], nonMember: 'HANCESTRO:9999' },
  ISO3166: { members: ['DE', 'FR', 'US'], nonMember: 'ZZ' },
  SNOMED: { members: ['22298006', '44054006', '73211009'], nonMember: '999999' }
};

async function buildTermFixtures() {
  const whitelists = {};
  for (const [ns, { members, nonMember }] of Object.entries(WHITELIST_TERMS)) {
    const built = await buildWhitelist({
      merkleLevels: MERKLE_LEVELS, defaultNamespace: ns, defaultEpoch: ONTOLOGY_EPOCH,
      terms: members.map((termId) => ({ termId }))
    });
    const decoy = await buildWhitelist({
      merkleLevels: MERKLE_LEVELS, defaultNamespace: ns, defaultEpoch: ONTOLOGY_EPOCH,
      terms: [{ termId: nonMember }]
    });
    whitelists[ns] = { built, member: built.entries.find((e) => e.termId === members[1]), nonMember: decoy.entries[0] };
  }

  const holders = { alice: 101n, bob: 202n, outsider: 404n, decoy: 505n };
  const requesterIds = {};
  for (const [name, secret] of Object.entries(holders)) requesterIds[name] = await calculateRequesterId(secret);

  const allowlists = {};
  const decoyAllowlists = {};
  // Requester allowlists are part of the frozen eight-level production
  // protocol. Non-eight-level benchmark variants exercise ontology slots only,
  // so do not weaken the production helper's depth guard for a synthetic run.
  if (MERKLE_LEVELS === 8) {
    for (const [term, { scopeKind, scopeId }] of Object.entries(SCOPED_TERMS)) {
      allowlists[term] = await buildRequesterAllowlist({ requesterIds: [requesterIds.alice, requesterIds.bob], scopeKind, scopeId });
      decoyAllowlists[term] = await buildRequesterAllowlist({ requesterIds: [requesterIds.decoy], scopeKind, scopeId });
    }
  }

  const issuers = {};
  for (const [name, fill] of [['good', 7], ['rogue', 9]]) {
    const priv = new Uint8Array(32).fill(fill);
    const probe = await signDuoProfileCredential(priv, {
      policyCommitment: 1, requesterId: 1, resourceId: 1, profileClaims: 0, validFromEpoch: 0, validUntilEpoch: 1, credentialId: 1
    });
    issuers[name] = { priv, keyCommitment: probe.issuerKeyCommitment, Ax: probe.issuerAx, Ay: probe.issuerAy };
  }

  return { whitelists, holders, requesterIds, allowlists, decoyAllowlists, issuers };
}

// ---------------------------------------------------------------------------
// Compile + material
// ---------------------------------------------------------------------------
function randomizerFor(logic) {
  return BigInt(`0x${crypto.createHash('sha256').update(logic).digest('hex').slice(0, 16)}`);
}

function predicatesFor(terms, fixtures, overrides = {}) {
  const predicates = [];
  let needsProfile = false;
  for (const term of terms) {
    if (term === 'NRES') continue;
    if (term === '__PROFILE__' || PROFILE_TERMS.includes(term)) { needsProfile = true; continue; }
    if (ONTOLOGY_TERMS[term]) {
      const [namespace, slot] = ONTOLOGY_TERMS[term];
      predicates.push({ slot, duo: term, namespace, root: fixtures.whitelists[namespace].built.metadata.rootHex });
    } else if (SCOPED_TERMS[term]) {
      const { slot, scopeId } = SCOPED_TERMS[term];
      predicates.push({ slot, duo: term, scopeId, allowlistRoot: fixtures.allowlists[term].root.toString() });
    } else if (term === 'MOR') {
      predicates.push({ slot: OBLIGATION_TERMS.MOR, duo: 'MOR', moratoriumUntilEpoch: MORATORIUM_UNTIL_EPOCH });
    } else if (term === 'TS') {
      predicates.push({ slot: OBLIGATION_TERMS.TS, duo: 'TS', durationMonths: TS_DURATION_MONTHS });
    }
  }
  if (needsProfile) {
    predicates.push({ slot: PROFILE_SLOT, duo: 'DUO_PROFILE', issuerKeyCommitment: fixtures.issuers.good.keyCommitment });
  }
  return predicates.map((p) => ({ ...p, ...(overrides[p.duo] || {}) }));
}

async function materialFromArtifacts(artifacts, { policyValidFromEpoch = 0, policyValidUntilEpoch = MAX_UINT32 } = {}) {
  const scope = artifacts.predicates.scopeParameters;
  const predicateTypes = scope.predicateTypes.slice();
  const parameterInputs = {
    predicateTypes,
    predicateSchemaTags: scope.predicateSchemaTags.slice(),
    scopeKinds: scope.scopeKinds.slice(),
    approvedScopeIds: scope.approvedScopeIds.map(dec),
    merkleRoots: scope.merkleRoots.map(dec),
    credPublicKeys: scope.credPublicKeys.map(dec),
    rangeMin: zeros(M),
    rangeMax: zeros(M),
    ontologyPolicyIds: predicateTypes.map((t, i) => (t === 3 ? String(ONTOLOGY_POLICY_ID(i)) : '0')),
    ontologyEpochs: predicateTypes.map((t) => (t === 3 ? String(ONTOLOGY_EPOCH) : '0')),
    policyValidFromEpoch,
    policyValidUntilEpoch,
    moratoriumUntilEpoch: dec(scope.moratoriumUntilEpoch ?? 0),
    timeLimitEpochs: dec(scope.timeLimitEpochs ?? 0)
  };
  return {
    penc: artifacts.tokens.slice(),
    randomizer: BigInt(artifacts.randomizer).toString(),
    numOperations: artifacts.numOperations,
    ...parameterInputs,
    paramsCommitment: await calculateParamsCommitment(parameterInputs)
  };
}

async function compilePolicy(logic, fixtures, { randomizer, predicateOverrides, materialOptions, predicates } = {}) {
  const terms = termsIn(logic);
  const artifacts = await generatePolicyArtifacts(
    { logic, predicates: predicates || predicatesFor(terms, fixtures, predicateOverrides) },
    { randomizer: randomizer ?? randomizerFor(logic) }
  );
  const material = await materialFromArtifacts(artifacts, materialOptions);
  return { logic, terms, artifacts, material };
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
function isHolderBound(material) {
  return material.predicateTypes.some((t) => t === 8 || t === 9);
}

/** The idReq a profile presents under a policy (holder-bound or anonymous). */
function requesterIdFor(ctx, profile, fixtures) {
  if (isHolderBound(ctx.material)) return BigInt(fixtures.requesterIds[profile.holder]);
  return profile.anonId !== undefined ? BigInt(profile.anonId) : ANON_ID;
}

/**
 * Build requester evidence for a compiled policy under a requester profile.
 * `resourceId` and `requestEpoch` are bound into the profile credential, so
 * the chain tier must pass the on-chain resource id and the epoch it submits.
 */
async function evidenceFor(ctx, profile, fixtures, { resourceId, requestEpoch }) {
  const { material, artifacts } = ctx;
  const holderBound = isHolderBound(material);
  const holderSecret = holderBound ? fixtures.holders[profile.holder] : 0n;
  const idReq = requesterIdFor(ctx, profile, fixtures);
  const claimsInt = material.predicateTypes[PROFILE_SLOT] === 9 ? claimsToInt(profile.claims) : 0;

  const evidence = {
    attributes: deriveAttrsFromClaims(claimsInt, profile.attrs),
    holderSecret: holderSecret.toString(),
    duoProfileClaims: claimsInt,
    merkleLeaves: zeros(M),
    merklePathElements: zeroPaths(),
    merklePathIndices: zeroPathIndices(),
    ontologyCodes: zeros(M),
    credSignatures: zeros(M),
    credSigR8x: zeros(M),
    credSigR8y: zeros(M),
    credIssuerAx: zeros(M),
    credIssuerAy: zeros(M),
    credValidFromEpochs: zeros(M),
    credValidUntilEpochs: zeros(M),
    credentialIds: zeros(M)
  };

  for (let slot = 0; slot < M; slot += 1) {
    const type = material.predicateTypes[slot];
    if (type === 3) {
      const [namespace] = Object.values(ONTOLOGY_TERMS).find(([, s]) => s === slot);
      const wl = fixtures.whitelists[namespace];
      const membership = profile.ontology[namespace];
      const entry = membership === 'member' ? wl.member : wl.nonMember;
      evidence.merkleLeaves[slot] = entry.leaf.toString();
      evidence.ontologyCodes[slot] = entry.packed.toString();
      // Non-members borrow the member's path: the Merkle root then differs
      // from the committed one and the predicate evaluates to false.
      evidence.merklePathElements[slot] = wl.member.pathElements.map(String);
      evidence.merklePathIndices[slot] = wl.member.pathIndices.slice();
    } else if (type === 8) {
      const [term, { scopeKind, scopeId }] = Object.entries(SCOPED_TERMS).find(([, s]) => s.slot === slot);
      const membership = profile.allowlists[term];
      if (membership === 'member') {
        const entry = fixtures.allowlists[term].entries.find((e) => e.requesterId === idReq);
        if (!entry) throw new Error(`${profile.holder} is not in the ${term} allowlist fixture`);
        evidence.merkleLeaves[slot] = entry.leaf.toString();
        evidence.merklePathElements[slot] = entry.pathElements.map(String);
        evidence.merklePathIndices[slot] = entry.pathIndices.slice();
      } else {
        // Own (correctly domain-separated) leaf with a path from an unrelated
        // tree: the leaf constraint holds, membership fails.
        const decoy = fixtures.decoyAllowlists[term].entries[0];
        evidence.merkleLeaves[slot] = (await calculateRequesterAllowlistLeaf(idReq, { scopeKind, scopeId })).toString();
        evidence.merklePathElements[slot] = decoy.pathElements.map(String);
        evidence.merklePathIndices[slot] = decoy.pathIndices.slice();
      }
    } else if (type === 9) {
      const cred = profile.credential;
      const issuer = fixtures.issuers[cred.issuer];
      const signed = await signDuoProfileCredential(issuer.priv, {
        policyCommitment: artifacts.policyCommitment,
        requesterId: idReq,
        resourceId,
        profileClaims: claimsInt,
        validFromEpoch: Number(requestEpoch) + cred.validFromDelta,
        validUntilEpoch: Number(requestEpoch) + cred.validUntilDelta,
        credentialId: cred.credentialId
      });
      evidence.credSignatures[slot] = signed.S;
      evidence.credSigR8x[slot] = signed.R8x;
      evidence.credSigR8y[slot] = signed.R8y;
      evidence.credIssuerAx[slot] = signed.issuerAx;
      evidence.credIssuerAy[slot] = signed.issuerAy;
      evidence.credValidFromEpochs[slot] = String(Number(requestEpoch) + cred.validFromDelta);
      evidence.credValidUntilEpochs[slot] = String(Number(requestEpoch) + cred.validUntilDelta);
      evidence.credentialIds[slot] = String(cred.credentialId);
    }
  }

  return { evidence, idReq, holderSecret };
}

// ---------------------------------------------------------------------------
// Witness tier
// ---------------------------------------------------------------------------
let witnessCalculatorPromise = null;
function getWitnessCalculator() {
  if (!witnessCalculatorPromise) {
    const build = require(WITNESS_CALCULATOR_PATH);
    witnessCalculatorPromise = build(fs.readFileSync(WASM_PATH));
  }
  return witnessCalculatorPromise;
}

async function assembleInput(material, evidence, publicInputs) {
  const input = buildWitness(material, evidence, publicInputs);
  input.contextHash = await calculateContextHash(input.idReq, input.idRes, input.nonce);
  return input;
}

/** Recompute input.paramsCommitment from the parameter arrays currently in `input`. */
async function recomputeParamsCommitment(input) {
  input.paramsCommitment = await calculateParamsCommitment({
    predicateTypes: input.predicateTypes,
    predicateSchemaTags: input.predicateSchemaTags,
    merkleRoots: input.merkleRoots,
    credPublicKeys: input.credPublicKeys,
    rangeMin: input.rangeMin,
    rangeMax: input.rangeMax,
    ontologyPolicyIds: input.ontologyPolicyIds,
    ontologyEpochs: input.ontologyEpochs,
    scopeKinds: input.scopeKinds,
    approvedScopeIds: input.approvedScopeIds,
    policyValidFromEpoch: input.policyValidFromEpoch,
    policyValidUntilEpoch: input.policyValidUntilEpoch,
    moratoriumUntilEpoch: input.moratoriumUntilEpoch,
    timeLimitEpochs: input.timeLimitEpochs
  });
  return input;
}

/** Returns isAuthorized (0n | 1n); throws when a hard constraint fails. */
async function witnessDecisionForInput(input) {
  const wc = await getWitnessCalculator();
  const witness = await wc.calculateWitness(input, true);
  // Signal 0 is the constant 1; signal 1 is the first public output.
  return BigInt(witness[1]);
}

const WITNESS_PUBLIC = Object.freeze({ resourceId: 777n, requestEpoch: 500_000, nonce: 1n });
let witnessNonce = 1n;

/** Full witness-tier evaluation of a profile against a compiled policy. */
async function witnessDecision(ctx, profile, fixtures, { resourceId = WITNESS_PUBLIC.resourceId, requestEpoch = WITNESS_PUBLIC.requestEpoch, mutateInput } = {}) {
  const { evidence, idReq } = await evidenceFor(ctx, profile, fixtures, { resourceId, requestEpoch });
  const nonce = witnessNonce++;
  const input = await assembleInput(ctx.material, evidence, {
    policyCommitment: ctx.artifacts.policyCommitment, idReq, idRes: resourceId, nonce, requestEpoch
  });
  if (mutateInput) await mutateInput(input, { evidence, idReq, nonce });
  return witnessDecisionForInput(input);
}

async function expectWitnessRejected(promiseOrFn) {
  const originalError = console.error;
  console.error = () => {};
  let rejected = false;
  let message = null;
  try {
    await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
  } catch (error) {
    rejected = true;
    message = error && error.message;
  } finally {
    console.error = originalError;
  }
  expect(rejected, 'expected the witness calculator to reject the input').to.equal(true);
  return message;
}

async function expectDecision(ctx, profile, fixtures, expected, options) {
  const decision = await witnessDecision(ctx, profile, fixtures, options);
  expect(decision, `isAuthorized for ${ctx.logic}`).to.equal(BigInt(expected));
}

// ---------------------------------------------------------------------------
// Chain tier
// ---------------------------------------------------------------------------
function parseEvent(contract, receipt, eventName) {
  return receipt.logs
    .map((log) => { try { return contract.interface.parseLog(log); } catch (_) { return null; } })
    .find((event) => event && event.name === eventName);
}

async function deployStack(ethers) {
  const [provider, tpsSigner] = await ethers.getSigners();
  const verifier = await (await ethers.getContractFactory('PolicyPrivacyMainVerifier')).deploy();
  const hasher = await deployPoseidon3(ethers);
  const contract = await (await ethers.getContractFactory('PolicyPrivacy')).deploy(verifier.target, hasher.target);
  return { ethers, provider, tpsSigner, verifier, hasher, contract };
}

async function commitAndRegister(stack, ctx, { uri = 'ipfs://duo-v3-test' } = {}) {
  const { contract, provider } = stack;
  const commitment = BigInt(ctx.artifacts.policyCommitment);
  const params = BigInt(ctx.material.paramsCommitment);
  const timeLimit = BigInt(ctx.material.timeLimitEpochs);
  let policyId;
  if (timeLimit !== 0n) {
    policyId = await contract.connect(provider).commitPolicyWithTimeLimit.staticCall(commitment, params, uri, timeLimit);
    await contract.connect(provider).commitPolicyWithTimeLimit(commitment, params, uri, timeLimit);
  } else {
    policyId = await contract.connect(provider)['commitPolicy(uint256,uint256,string)'].staticCall(commitment, params, uri);
    await contract.connect(provider)['commitPolicy(uint256,uint256,string)'](commitment, params, uri);
  }
  const resourceId = await contract.connect(provider).registerResource.staticCall(policyId);
  await contract.connect(provider).registerResource(policyId);
  ctx.policyId = policyId;
  ctx.resourceId = resourceId;
  return { policyId, resourceId };
}

/**
 * Current chain-hour bucket, guaranteed to have at least `minSecondsLeft`
 * remaining so a proof generated now still lands in the same bucket.
 */
async function freshRequestEpoch(ethers, minSecondsLeft = 900) {
  await ethers.provider.send('evm_mine', []);
  let ts = Number((await ethers.provider.getBlock('latest')).timestamp);
  if (3600 - (ts % 3600) < minSecondsLeft) {
    ts = (Math.floor(ts / 3600) + 1) * 3600;
    await ethers.provider.send('evm_setNextBlockTimestamp', [ts]);
    await ethers.provider.send('evm_mine', []);
  }
  return BigInt(Math.floor(ts / 3600));
}

async function setChainEpoch(ethers, epoch) {
  await ethers.provider.send('evm_setNextBlockTimestamp', [Number(BigInt(epoch) * 3600n)]);
}

let chainNonce = 10_000n;
function nextNonce() { chainNonce += 1n; return chainNonce; }

const proofTimings = [];

/** Prove for `profile` and submit on-chain; asserts the expected outcome. */
async function proveAndSubmit(stack, ctx, profile, fixtures, { expect: expected = 'grant', nonce = nextNonce(), requestEpoch } = {}) {
  const { ethers, contract, tpsSigner } = stack;
  if (ctx.policyId === undefined) await commitAndRegister(stack, ctx);
  const epoch = requestEpoch ?? await freshRequestEpoch(ethers);
  const { evidence, idReq } = await evidenceFor(ctx, profile, fixtures, { resourceId: ctx.resourceId, requestEpoch: epoch });

  const started = Date.now();
  const result = await generateProof(ctx.material, evidence, {
    policyCommitment: ctx.artifacts.policyCommitment, idReq, idRes: ctx.resourceId, nonce, requestEpoch: epoch
  });
  const totalMs = Date.now() - started;
  proofTimings.push({ logic: ctx.logic, expected, ...result.timings, totalMs });
  if (process.env.DUO_E2E_LOG_TIMINGS === '1') {
    console.log(`      [proof] ${ctx.logic} (${expected}): ${JSON.stringify(result.timings)} total=${totalMs}ms`);
  }

  expect(result.timings.verified, 'off-chain Groth16 verification').to.equal(true);
  expect(BigInt(result.pubSignals[0])).to.equal(expected === 'grant' ? 1n : 0n);
  expect(BigInt(result.pubSignals[1])).to.equal(BigInt(ctx.artifacts.policyCommitment));
  expect(BigInt(result.pubSignals[2])).to.equal(BigInt(ctx.material.paramsCommitment));

  const receipt = await (await contract.connect(tpsSigner).requestAccessBound(
    ctx.policyId, ctx.resourceId, nonce, idReq, epoch, result.pA, result.pB, result.pC, result.pubSignals
  )).wait();
  const event = parseEvent(contract, receipt, expected === 'grant' ? 'AccessGranted' : 'AccessDenied');
  expect(event, `${expected === 'grant' ? 'AccessGranted' : 'AccessDenied'} event`).to.exist;
  expect(await contract.isAccessGranted(event.args.requestId)).to.equal(expected === 'grant');

  if (expected === 'grant' && BigInt(ctx.material.timeLimitEpochs) !== 0n) {
    const started = parseEvent(contract, receipt, 'RequesterTimeLimitStarted');
    const window = await contract.getRequesterTimeLimit(ctx.policyId, idReq);
    // The window starts on the requester's first grant; later grants reuse it.
    if (started) {
      expect(window).to.deep.equal([epoch, epoch + BigInt(ctx.material.timeLimitEpochs)]);
    } else {
      expect(window[1]).to.not.equal(0n);
    }
  }

  return { result, receipt, event, idReq, requestEpoch: epoch, nonce };
}

/** Submit an arbitrary (possibly zero) proof; returns the tx promise for revert assertions. */
function submitRaw(stack, { policyId, resourceId, nonce, idReq, requestEpoch, proof = ZERO_PROOF, pubSignals }) {
  return stack.contract.connect(stack.tpsSigner).requestAccessBound(
    policyId, resourceId, nonce, idReq, requestEpoch, proof[0], proof[1], proof[2], pubSignals
  );
}

// ---------------------------------------------------------------------------
// Case registration
// ---------------------------------------------------------------------------
function proofTier(c) {
  if (WITNESS_ONLY) return false;
  return c.tier === 'core' || FULL;
}

/**
 * Register mocha blocks for one case descriptor:
 *   { id, logic, tier, grant, deny:[spec], orGrants:[spec], expectTokens, expectNumOps, compileOptions }
 * `env` must expose `fixtures` and (for the chain tier) `stack` after `before()`.
 */
function registerCase(c, env) {
  describe(`${c.id}: ${c.logic}`, function () {
    let ctx;
    before(async function () {
      ctx = await compilePolicy(c.logic, env.fixtures, c.compileOptions);
      if (c.expectTokens) expect(ctx.artifacts.tokens).to.deep.equal(c.expectTokens);
      if (c.expectNumOps !== undefined) expect(ctx.artifacts.numOperations).to.equal(c.expectNumOps);
    });

    it(`witness: grant (${describeSpec(c.grant)})`, async function () {
      await expectDecision(ctx, resolveProfile(c.grant), env.fixtures, 1n);
    });
    for (const spec of c.orGrants || []) {
      it(`witness: grant via other branch (${describeSpec(spec)})`, async function () {
        await expectDecision(ctx, resolveProfile(spec), env.fixtures, 1n);
      });
    }
    for (const spec of c.deny || []) {
      it(`witness: deny (${describeSpec(spec)})`, async function () {
        await expectDecision(ctx, resolveProfile(spec), env.fixtures, 0n);
      });
    }

    if (proofTier(c)) {
      it('proof + chain: grant', async function () {
        await proveAndSubmit(env.stack, ctx, resolveProfile(c.grant), env.fixtures, { expect: 'grant' });
      });
      if (c.deny && c.deny.length) {
        it(`proof + chain: deny (${describeSpec(c.deny[0])})`, async function () {
          await proveAndSubmit(env.stack, ctx, resolveProfile(c.deny[0]), env.fixtures, { expect: 'deny' });
        });
      }
    }

    if (c.extra) c.extra({ ctx: () => ctx, env });
  });
}

function summarizeTimings() {
  if (!proofTimings.length) return;
  const total = proofTimings.reduce((acc, t) => acc + t.totalMs, 0);
  const prove = proofTimings.reduce((acc, t) => acc + (t.proveMs || 0), 0);
  console.log(`      [proofs] ${proofTimings.length} proofs, total ${(total / 1000).toFixed(1)}s, prove ${(prove / 1000).toFixed(1)}s, mean ${(total / proofTimings.length / 1000).toFixed(1)}s`);
}

module.exports = {
  N, M, DEPTH, MERKLE_LEVELS, MAX_UINT32, ONTOLOGY_EPOCH, ONTOLOGY_POLICY_ID,
  ATTR_ORDER, ATTR_INDEX, CLAIM_BIT, PROFILE_TERMS, ONTOLOGY_TERMS, SCOPED_TERMS, OBLIGATION_TERMS, PROFILE_SLOT, NS_TO_TERM, ALL_TERMS,
  TOK, MORATORIUM_UNTIL_EPOCH, TS_DURATION_MONTHS, TS_EPOCHS, ANON_ID, ZERO_PROOF,
  FULL, WITNESS_ONLY, circuitAvailable, wasmAvailable,
  WASM_PATH, ZKEY_PATH, VKEY_PATH, WITNESS_CALCULATOR_PATH,
  BASE_REQUESTER, cloneProfile, claimsToInt, deriveAttrsFromClaims, termsIn, denyVariant, denyAll, resolveProfile, describeSpec,
  buildTermFixtures, predicatesFor, materialFromArtifacts, compilePolicy, randomizerFor,
  isHolderBound, requesterIdFor, evidenceFor, assembleInput, recomputeParamsCommitment, witnessDecisionForInput, witnessDecision, expectWitnessRejected, expectDecision, WITNESS_PUBLIC,
  parseEvent, deployStack, commitAndRegister, freshRequestEpoch, setChainEpoch, nextNonce, proveAndSubmit, submitRaw,
  proofTier, registerCase, summarizeTimings, proofTimings,
  zeros, zeroPaths, zeroPathIndices, dec
};
