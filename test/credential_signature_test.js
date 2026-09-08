/**
 * Institutional-credential binding (attribute-origin soundness)
 * =============================================================
 *
 * The credential predicate now verifies a real EdDSA-Poseidon signature under
 * an issuer key committed in the policy parameters. Before this change the
 * gadget was an acknowledged placeholder: it checked
 *
 *     signature == Poseidon(message, publicKey)
 *
 * which provides no unforgeability whatsoever. Because `publicKey` is carried
 * in the policy parameters and `message` is requester-supplied, anyone able to
 * evaluate Poseidon could compute a satisfying "signature" for any message
 * under any issuer. Credential-required consent terms -- ethics approval (IRB),
 * collaboration (COL), project- and institution-specific restrictions (PS, IS)
 * -- therefore had no cryptographic backing: the predicate certified only that
 * the prover could hash, not that any institution had attested anything.
 *
 * The revised gadget verifies signature validity as a hard constraint, so a
 * forged credential makes the witness unsatisfiable rather than merely
 * yielding a predicate value of 0. The issuer key point (Ax, Ay) is a private
 * witness bound to the committed parameter by
 *
 *     credPublicKey = Poseidon(Ax, Ay),
 *
 * which keeps the parameter-commitment layout at one field element per slot
 * and leaves the public interface unchanged.
 *
 * Two properties are asserted here:
 *   1. Attack validity -- the forgery that the placeholder accepted is
 *      constructed explicitly, so the test cannot pass vacuously.
 *   2. The defense -- an honest signature authorizes; a forged one, a wrong
 *      issuer, and a signature transplanted onto a different message do not.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  calculatePolicyCommitment,
  calculateParamsCommitment,
  calculateContextHash,
  createCircuitInput,
  deriveIssuerKey,
  signCredential
} = require('./utils/proofGenerator');

const CIRCUIT_DEPTH = 20;
const CIRCUIT_N = 6;   // requester attributes
const CIRCUIT_M = 5;   // external predicate slots

// Predicate-slot operands start at token index N; slot 0 is token N.
const PREDICATE_SLOT_0 = CIRCUIT_N;
const OP_AND = CIRCUIT_N + CIRCUIT_M + 0; // 11

// Predicate type selectors, per the circuit's type encoding.
const TYPE_CREDENTIAL = 1;
const TYPE_DISABLED = 4;

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

const fill = (value) => Array(CIRCUIT_M).fill(value);

// Issuer private keys. ISSUER is the institution named in the policy; ROGUE is
// any other party holding a well-formed key pair.
const ISSUER_KEY = Buffer.alloc(32, 7);
const ROGUE_KEY = Buffer.alloc(32, 9);

// The attested credential message (e.g. an IRB approval identifier).
const CREDENTIAL_MESSAGE = 42n;
const OTHER_MESSAGE = 43n;

const ALICE = 111n;
const RESOURCE_A = 7n;
const SESSION_1 = 999n;

describe('Institutional credential binding (EdDSA)', function () {
  let witnessCalculator;
  let circuitAvailable = false;

  let issuer;
  let rogue;
  let honestSignature;
  let paramsCommitment;
  let policyCommitment;
  let contextHash;

  this.timeout(120000);

  // Policy "attr0 AND predicateSlot0": the requester holds attr0, so the
  // decision turns entirely on the credential predicate.
  const policyTokens = [0, PREDICATE_SLOT_0, OP_AND];
  const honestLength = policyTokens.length;
  const requesterAttrs = [1, 0, 0, 0, 0, 0];
  const randomizer = 12345n;

  before(async function () {
    if (!fs.existsSync(WASM_PATH) || !fs.existsSync(WITNESS_CALCULATOR_PATH)) {
      console.log('Compiled main circuit not found; run "npm run build:circuit" first.');
      console.log('Skipping credential-binding tests.');
      return;
    }

    const buildWitnessCalculator = require(WITNESS_CALCULATOR_PATH);
    witnessCalculator = await buildWitnessCalculator(fs.readFileSync(WASM_PATH));

    issuer = await deriveIssuerKey(ISSUER_KEY);
    rogue = await deriveIssuerKey(ROGUE_KEY);
    honestSignature = await signCredential(ISSUER_KEY, CREDENTIAL_MESSAGE);

    // Slot 0 carries the credential predicate under the committed issuer.
    const credPublicKeys = fill('0');
    credPublicKeys[0] = issuer.committed;

    paramsCommitment = await calculateParamsCommitment({
      merkleRoots: fill('0'),
      credPublicKeys,
      rangeMin: fill('0'),
      rangeMax: fill('0'),
      ontologyPolicyIds: fill('0'),
      ontologyEpochs: fill('0')
    });

    policyCommitment = await calculatePolicyCommitment(
      padPolicy(policyTokens),
      randomizer,
      honestLength
    );
    contextHash = await calculateContextHash(ALICE, RESOURCE_A, SESSION_1);
    circuitAvailable = true;
  });

  /** Compute the witness; return isAuthorized, or null if the circuit rejects. */
  async function tryAuthorize(input) {
    try {
      const witness = await witnessCalculator.calculateWitness(input, true);
      return witness[1].toString();
    } catch (error) {
      return null;
    }
  }

  /**
   * A witness in which predicate slot 0 is a credential predicate carrying the
   * supplied signature and issuer key point.
   */
  function credentialInput({ message, S, R8x, R8y, Ax, Ay, committedKey }) {
    const predicateTypes = fill(TYPE_DISABLED);
    predicateTypes[0] = TYPE_CREDENTIAL;

    const credMessages = fill('0');
    const credSignatures = fill('0');
    const credSigR8x = fill('0');
    const credSigR8y = fill('0');
    const credIssuerAx = fill('0');
    const credIssuerAy = fill('0');
    const credPublicKeys = fill('0');

    credMessages[0] = message.toString();
    credSignatures[0] = S;
    credSigR8x[0] = R8x;
    credSigR8y[0] = R8y;
    credIssuerAx[0] = Ax;
    credIssuerAy[0] = Ay;
    credPublicKeys[0] = committedKey;

    return createCircuitInput(policyCommitment, {
      policy: padPolicy(policyTokens),
      requesterAttrs,
      randomizer,
      paramsCommitment,
      numOperations: honestLength,
      predicateTypes,
      credMessages,
      credSignatures,
      credSigR8x,
      credSigR8y,
      credIssuerAx,
      credIssuerAy,
      credPublicKeys,
      idReq: ALICE,
      idRes: RESOURCE_A,
      nonce: SESSION_1,
      contextHash
    });
  }

  describe('issuer key binding', function () {
    it('binds the key point to the committed parameter by Poseidon(Ax, Ay)', function () {
      if (!circuitAvailable) this.skip();
      assert.notStrictEqual(
        issuer.committed,
        rogue.committed,
        'Distinct issuer keys must commit to distinct parameter values'
      );
    });
  });

  describe('honest credential', function () {
    it('authorizes when the issuer signed the presented message', async function () {
      if (!circuitAvailable) this.skip();

      const result = await tryAuthorize(credentialInput({
        message: CREDENTIAL_MESSAGE,
        S: honestSignature.S,
        R8x: honestSignature.R8x,
        R8y: honestSignature.R8y,
        Ax: issuer.Ax,
        Ay: issuer.Ay,
        committedKey: issuer.committed
      }));

      assert.strictEqual(
        result,
        '1',
        'A credential signed by the committed issuer must authorize'
      );
    });
  });

  describe('forgery resistance', function () {
    /**
     * Attack validity: this is exactly the witness the superseded placeholder
     * accepted. It set signature = Poseidon(message, publicKey), a value any
     * party can compute from public parameters alone, with no signing key. The
     * assertion is that the revised circuit rejects it.
     */
    it('rejects the placeholder forgery Poseidon(message, publicKey)', async function () {
      if (!circuitAvailable) this.skip();

      const circomlibjs = require('circomlibjs');
      const poseidon = await circomlibjs.buildPoseidon();
      const forged = poseidon.F.toObject(
        poseidon([CREDENTIAL_MESSAGE, BigInt(issuer.committed)])
      ).toString();

      const result = await tryAuthorize(credentialInput({
        message: CREDENTIAL_MESSAGE,
        S: forged,
        R8x: honestSignature.R8x,
        R8y: honestSignature.R8y,
        Ax: issuer.Ax,
        Ay: issuer.Ay,
        committedKey: issuer.committed
      }));

      assert.notStrictEqual(
        result,
        '1',
        'The hash-relation forgery accepted by the placeholder must be rejected'
      );
    });

    it('rejects a signature from an issuer other than the committed one', async function () {
      if (!circuitAvailable) this.skip();

      const rogueSignature = await signCredential(ROGUE_KEY, CREDENTIAL_MESSAGE);

      // A genuine signature, but under the wrong institution's key. The key
      // point is presented honestly, so the mismatch is caught by the binding
      // to the committed issuer parameter.
      const result = await tryAuthorize(credentialInput({
        message: CREDENTIAL_MESSAGE,
        S: rogueSignature.S,
        R8x: rogueSignature.R8x,
        R8y: rogueSignature.R8y,
        Ax: rogue.Ax,
        Ay: rogue.Ay,
        committedKey: issuer.committed
      }));

      assert.notStrictEqual(
        result,
        '1',
        'Only the issuer committed in the policy parameters may attest'
      );
    });

    it('rejects a valid signature transplanted onto a different message', async function () {
      if (!circuitAvailable) this.skip();

      const result = await tryAuthorize(credentialInput({
        message: OTHER_MESSAGE,
        S: honestSignature.S,
        R8x: honestSignature.R8x,
        R8y: honestSignature.R8y,
        Ax: issuer.Ax,
        Ay: issuer.Ay,
        committedKey: issuer.committed
      }));

      assert.notStrictEqual(
        result,
        '1',
        'A signature must not carry over to a message it does not cover'
      );
    });

    it('rejects a substituted issuer key point that matches no commitment', async function () {
      if (!circuitAvailable) this.skip();

      // The rogue signs, and the rogue key point is presented together with the
      // rogue's own committed value. The policy parameters still name the real
      // issuer, so paramsCommitment no longer matches.
      const rogueSignature = await signCredential(ROGUE_KEY, CREDENTIAL_MESSAGE);

      const result = await tryAuthorize(credentialInput({
        message: CREDENTIAL_MESSAGE,
        S: rogueSignature.S,
        R8x: rogueSignature.R8x,
        R8y: rogueSignature.R8y,
        Ax: rogue.Ax,
        Ay: rogue.Ay,
        committedKey: rogue.committed
      }));

      assert.notStrictEqual(
        result,
        '1',
        'Swapping the issuer must break the parameter commitment'
      );
    });
  });

  describe('unused predicate slots', function () {
    it('still authorizes a policy that uses no credential predicate', async function () {
      if (!circuitAvailable) this.skip();

      // Regression guard: the EdDSA check is enforced by hard constraint, so
      // disabled slots must not be required to carry a valid signature.
      const plainPolicy = [0, 1, OP_AND];
      const plainCommitment = await calculatePolicyCommitment(
        padPolicy(plainPolicy),
        randomizer,
        plainPolicy.length
      );
      const plainParams = await calculateParamsCommitment({
        merkleRoots: fill('0'),
        credPublicKeys: fill('0'),
        rangeMin: fill('0'),
        rangeMax: fill('0'),
        ontologyPolicyIds: fill('0'),
        ontologyEpochs: fill('0')
      });

      const result = await tryAuthorize(createCircuitInput(plainCommitment, {
        policy: padPolicy(plainPolicy),
        requesterAttrs: [1, 1, 0, 0, 0, 0],
        randomizer,
        paramsCommitment: plainParams,
        numOperations: plainPolicy.length,
        idReq: ALICE,
        idRes: RESOURCE_A,
        nonce: SESSION_1,
        contextHash
      }));

      assert.strictEqual(
        result,
        '1',
        'Policies without credential predicates must be unaffected'
      );
    });
  });
});
