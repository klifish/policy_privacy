/**
 * Authorization-context binding (proof-transferability soundness)
 * ===============================================================
 *
 * The proof statement now carries a fourth public signal
 *
 *     contextHash = Poseidon(id_req || id_res || nonce),
 *
 * constrained in-circuit by a hard equality. Before this binding, the public
 * statement was [isAuthorized, policyCommitment, paramsCommitment] only: it
 * certified "SOMEONE satisfied policy h", not "THIS requester satisfied h for
 * THIS resource in THIS session". The requester, resource and nonce were
 * transaction-level parameters the ACM validated separately, with no
 * cryptographic link to the proof.
 *
 * The consequence is proof transferability. A party holding a proof issued for
 * one authorization context -- a deviating or compromised TPS, which sees every
 * proof it produces -- could resubmit it under a different context. Nonce
 * single-use does not help: the nonce is part of the context being changed, so
 * a fresh one sidesteps the replay check while the proof still verifies.
 *
 * The three context values remain PRIVATE witness inputs; only their digest is
 * public. That keeps the requester pseudonym out of calldata (the design
 * deliberately does not record requester identity on-chain) and costs one extra
 * public input rather than three.
 *
 * Security property asserted: a witness whose context triple differs from the
 * one bound in contextHash must not yield isAuthorized = 1. Because the binding
 * is a hard `===` constraint rather than a soft boolean AND-ed into the output,
 * the expected defense is witness-generation failure; the assertions accept
 * either that or isAuthorized = 0, so they stay valid if the constraint is ever
 * restructured.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  calculatePolicyCommitment,
  calculateParamsCommitment,
  calculateContextHash,
  createCircuitInput
} = require('./utils/proofGenerator');

const CIRCUIT_DEPTH = 20;
const CIRCUIT_N = 6;   // requester attributes
const CIRCUIT_M = 5;   // external predicate slots

// Opcodes are offset past the operand range: token < N+M is an operand.
const OP_AND = CIRCUIT_N + CIRCUIT_M + 0; // 11

const BUILD_DIR = path.join(__dirname, '../build/circuits');
const WASM_PATH = path.join(
  BUILD_DIR,
  'policy_privacy_main_instance_js/policy_privacy_main_instance.wasm'
);
const WITNESS_CALCULATOR_PATH = path.join(
  BUILD_DIR,
  'policy_privacy_main_instance_js/witness_calculator.js'
);

const padPolicy = (tokens) => [
  ...tokens,
  ...Array(CIRCUIT_DEPTH - tokens.length).fill(0)
];

const disabledParams = () => ({
  merkleRoots: Array(CIRCUIT_M).fill('0'),
  credPublicKeys: Array(CIRCUIT_M).fill('0'),
  rangeMin: Array(CIRCUIT_M).fill('0'),
  rangeMax: Array(CIRCUIT_M).fill('0'),
  ontologyPolicyIds: Array(CIRCUIT_M).fill('0'),
  ontologyEpochs: Array(CIRCUIT_M).fill('0')
});

// The authorization context a proof is legitimately issued for.
const ALICE = 111n;      // requester pseudonym
const RESOURCE_A = 7n;   // protected resource
const SESSION_1 = 999n;  // per-session nonce

// The context an adversary would try to reuse that proof under.
const BOB = 222n;
const RESOURCE_B = 8n;
const SESSION_2 = 1000n;

describe('Authorization-context binding in the proof statement', function () {
  let witnessCalculator;
  let paramsCommitment;
  let circuitAvailable = false;

  this.timeout(100000);

  // Policy "attr0 AND attr1", satisfied by the requester below: the honest
  // decision is grant, so a failure to authorize can only come from the
  // context binding rather than from the policy itself.
  const policyTokens = [0, 1, OP_AND];
  const honestLength = policyTokens.length;
  const requesterAttrs = [1, 1, 0, 0, 0, 0];
  const randomizer = 12345n;

  let policyCommitment;
  let honestContextHash;

  before(async function () {
    if (!fs.existsSync(WASM_PATH) || !fs.existsSync(WITNESS_CALCULATOR_PATH)) {
      console.log('Compiled main circuit not found; run "npm run build:circuit" first.');
      console.log('Skipping circuit-level context-binding tests.');
      return;
    }

    const buildWitnessCalculator = require(WITNESS_CALCULATOR_PATH);
    witnessCalculator = await buildWitnessCalculator(fs.readFileSync(WASM_PATH));
    paramsCommitment = await calculateParamsCommitment(disabledParams());
    policyCommitment = await calculatePolicyCommitment(
      padPolicy(policyTokens),
      randomizer,
      honestLength
    );
    honestContextHash = await calculateContextHash(ALICE, RESOURCE_A, SESSION_1);
    circuitAvailable = true;
  });

  /**
   * Compute the witness and return isAuthorized, or null when the circuit
   * rejects the witness outright.
   */
  async function tryAuthorize(input) {
    try {
      const witness = await witnessCalculator.calculateWitness(input, true);
      // Signal 0 is the constant 1; signal 1 is the single public output.
      return witness[1].toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * A witness for the honest policy, evaluated under an arbitrary context
   * triple while presenting `contextHash` as the public signal. Passing the
   * honest digest together with a different triple is exactly the replay a
   * captured proof would represent.
   */
  function contextInput({ idReq, idRes, nonce, contextHash }) {
    return createCircuitInput(policyCommitment, {
      policy: padPolicy(policyTokens),
      requesterAttrs,
      randomizer,
      paramsCommitment,
      numOperations: honestLength,
      idReq,
      idRes,
      nonce,
      contextHash
    });
  }

  describe('context digest computation', function () {
    it('separates contexts differing only in the requester', async function () {
      const a = await calculateContextHash(ALICE, RESOURCE_A, SESSION_1);
      const b = await calculateContextHash(BOB, RESOURCE_A, SESSION_1);
      assert.notStrictEqual(a, b, 'Requester must be bound into the digest');
    });

    it('separates contexts differing only in the resource', async function () {
      const a = await calculateContextHash(ALICE, RESOURCE_A, SESSION_1);
      const b = await calculateContextHash(ALICE, RESOURCE_B, SESSION_1);
      assert.notStrictEqual(a, b, 'Resource must be bound into the digest');
    });

    it('separates contexts differing only in the session nonce', async function () {
      const a = await calculateContextHash(ALICE, RESOURCE_A, SESSION_1);
      const b = await calculateContextHash(ALICE, RESOURCE_A, SESSION_2);
      assert.notStrictEqual(a, b, 'Nonce must be bound into the digest');
    });

    it('rejects a missing context value rather than defaulting it', async function () {
      const { calculateContextHash: libContextHash } = require('../lib/prover');
      await assert.rejects(
        () => libContextHash(ALICE, undefined, SESSION_1),
        /requires idRes/,
        'Omitting a context value must throw, not silently bind zero'
      );
    });
  });

  describe('proof-transferability attack', function () {
    it('authorizes the honest request under its own context', async function () {
      if (!circuitAvailable) this.skip();

      const isAuthorized = await tryAuthorize(contextInput({
        idReq: ALICE,
        idRes: RESOURCE_A,
        nonce: SESSION_1,
        contextHash: honestContextHash
      }));

      assert.strictEqual(
        isAuthorized,
        '1',
        'The honest requester must be authorized under the bound context'
      );
    });

    it('does not authorize the same statement under a different requester', async function () {
      if (!circuitAvailable) this.skip();

      // Bob replays Alice's public statement (same contextHash) while the
      // request is actually his.
      const isAuthorized = await tryAuthorize(contextInput({
        idReq: BOB,
        idRes: RESOURCE_A,
        nonce: SESSION_1,
        contextHash: honestContextHash
      }));

      assert.notStrictEqual(
        isAuthorized,
        '1',
        'A proof bound to one requester must not authorize another'
      );
    });

    it('does not authorize the same statement for a different resource', async function () {
      if (!circuitAvailable) this.skip();

      const isAuthorized = await tryAuthorize(contextInput({
        idReq: ALICE,
        idRes: RESOURCE_B,
        nonce: SESSION_1,
        contextHash: honestContextHash
      }));

      assert.notStrictEqual(
        isAuthorized,
        '1',
        'A proof bound to one resource must not authorize access to another'
      );
    });

    it('does not authorize the same statement under a fresh nonce', async function () {
      if (!circuitAvailable) this.skip();

      // This is the replay the ACM's nonce check cannot catch: the nonce is
      // the value being changed, so usedNonces never sees a repeat.
      const isAuthorized = await tryAuthorize(contextInput({
        idReq: ALICE,
        idRes: RESOURCE_A,
        nonce: SESSION_2,
        contextHash: honestContextHash
      }));

      assert.notStrictEqual(
        isAuthorized,
        '1',
        'Replaying a captured proof under a fresh nonce must not authorize'
      );
    });

    it('authorizes a genuinely re-proved request in a new session', async function () {
      if (!circuitAvailable) this.skip();

      // The legitimate path: the TPS generates a NEW proof for the new
      // context. Binding must not break honest re-authorization.
      const freshContextHash = await calculateContextHash(
        ALICE,
        RESOURCE_A,
        SESSION_2
      );

      const isAuthorized = await tryAuthorize(contextInput({
        idReq: ALICE,
        idRes: RESOURCE_A,
        nonce: SESSION_2,
        contextHash: freshContextHash
      }));

      assert.strictEqual(
        isAuthorized,
        '1',
        'A freshly generated proof must authorize in the new session'
      );
    });
  });
});
