/**
 * Program-length binding (prefix-truncation soundness)
 * ====================================================
 *
 * The policy commitment is h = Poseidon(Poseidon(P) || l || r), where l is the
 * program length (numOperations). Binding l into the preimage closes a
 * soundness gap: without it, l is a free private witness, and the interpreter's
 * only global stack constraint is `sp[DEPTH] === 1`. Since any RPN program
 * reaches stack depth 1 after its first operand, a prover holding the opening
 * of h could evaluate a shorter stack-consistent PREFIX of the committed token
 * array under the same commitment.
 *
 * The witness below is the concrete exploit. The committed policy is
 * "NOT attr3" = [3, NOT]; truncating it to l = 1 leaves the program [3], i.e.
 * bare "attr3". For a requester holding attr3, the real policy evaluates to 0
 * (deny) while the truncated prefix evaluates to 1 (allow) -- a cheating TPS
 * would gain authorization the committed policy denies.
 *
 * The truncation must be chosen so the skipped tokens still satisfy the
 * per-step arity constraints, which are NOT masked by the active flag: NOT is
 * unary and only requires stack depth >= 1, so index 1 stays satisfiable when
 * inactive. This is why the prefix ends just before a unary operator rather
 * than a binary one.
 *
 * Security property asserted: under a commitment that binds l, a truncated
 * witness must not yield isAuthorized = 1. Either outcome is a valid defense --
 * witness generation may fail outright, or the commitment check may fail and
 * force isAuthorized = 0 (commitmentValid is AND-ed into the output).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  calculatePolicyCommitment,
  calculateParamsCommitment,
  createCircuitInput
} = require('./utils/proofGenerator');

const CIRCUIT_DEPTH = 20;
const CIRCUIT_N = 6;   // requester attributes
const CIRCUIT_M = 5;   // external predicate slots

// Opcodes are offset past the operand range: token < N+M is an operand.
const OP_AND = CIRCUIT_N + CIRCUIT_M + 0; // 11
const OP_NOT = CIRCUIT_N + CIRCUIT_M + 2; // 13

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

describe('Program-length binding in the policy commitment', function () {
  let witnessCalculator;
  let paramsCommitment;
  let circuitAvailable = false;

  this.timeout(100000);

  before(async function () {
    if (!fs.existsSync(WASM_PATH) || !fs.existsSync(WITNESS_CALCULATOR_PATH)) {
      console.log('Compiled main circuit not found; run "npm run build:circuit" first.');
      console.log('Skipping circuit-level program-length binding tests.');
      return;
    }

    const buildWitnessCalculator = require(WITNESS_CALCULATOR_PATH);
    witnessCalculator = await buildWitnessCalculator(fs.readFileSync(WASM_PATH));
    paramsCommitment = await calculateParamsCommitment(disabledParams());
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

  describe('commitment computation', function () {
    it('binds the program length: same tokens and randomizer, different length => different commitment', async function () {
      const policy = padPolicy([3, OP_NOT]);
      const randomizer = 12345n;

      const hFull = await calculatePolicyCommitment(policy, randomizer, 2);
      const hTruncated = await calculatePolicyCommitment(policy, randomizer, 1);

      assert.notStrictEqual(
        hFull,
        hTruncated,
        'Program length must be part of the commitment preimage'
      );
    });

    it('rejects a missing program length rather than silently defaulting', async function () {
      const policy = padPolicy([3, OP_NOT]);
      await assert.rejects(
        () => calculatePolicyCommitment(policy, 12345n),
        /requires a programLength/,
        'Omitting the program length must throw, not produce a commitment'
      );
    });

    it('rejects an out-of-range program length', async function () {
      const policy = padPolicy([3, OP_NOT]);
      await assert.rejects(
        () => calculatePolicyCommitment(policy, 12345n, CIRCUIT_DEPTH + 1),
        /Invalid programLength/
      );
    });
  });

  describe('prefix-truncation attack', function () {
    // Committed policy: "NOT attr3". Requester holds attr3, so the honest
    // policy denies. The truncated prefix "attr3" would allow.
    const policyTokens = [3, OP_NOT];
    const honestLength = policyTokens.length;
    const truncatedLength = 1;
    const requesterAttrs = [0, 0, 0, 1, 0, 0]; // attr3 = 1

    it('evaluates the honest program to deny (isAuthorized = 0)', async function () {
      if (!circuitAvailable) this.skip();

      const policy = padPolicy(policyTokens);
      const randomizer = 12345n;
      const policyCommitment = await calculatePolicyCommitment(
        policy,
        randomizer,
        honestLength
      );

      const isAuthorized = await tryAuthorize(
        createCircuitInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          paramsCommitment,
          numOperations: honestLength
        })
      );

      assert.strictEqual(
        isAuthorized,
        '0',
        '"NOT attr3" must deny a requester holding attr3'
      );
    });

    it('does not authorize a truncated prefix of the committed program', async function () {
      if (!circuitAvailable) this.skip();

      const policy = padPolicy(policyTokens);
      const randomizer = 12345n;

      // The commitment the provider published, for the FULL program.
      const policyCommitment = await calculatePolicyCommitment(
        policy,
        randomizer,
        honestLength
      );

      // A cheating TPS reuses that commitment but evaluates only the prefix.
      const isAuthorized = await tryAuthorize(
        createCircuitInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          paramsCommitment,
          numOperations: truncatedLength
        })
      );

      assert.notStrictEqual(
        isAuthorized,
        '1',
        'Truncating the committed program to a stack-consistent prefix must ' +
        'not produce an authorizing proof'
      );
    });

    it('binds the length for binary operators as well', async function () {
      if (!circuitAvailable) this.skip();

      // "attr0 AND attr1", requester holds only attr0.
      const tokens = [0, 1, OP_AND];
      const policy = padPolicy(tokens);
      const randomizer = 67890n;
      const policyCommitment = await calculatePolicyCommitment(
        policy,
        randomizer,
        tokens.length
      );

      const honest = await tryAuthorize(
        createCircuitInput(policyCommitment, {
          policy,
          requesterAttrs: [1, 0, 0, 0, 0, 0],
          randomizer,
          paramsCommitment,
          numOperations: tokens.length
        })
      );
      assert.strictEqual(honest, '0', '"attr0 AND attr1" must deny without attr1');

      const truncated = await tryAuthorize(
        createCircuitInput(policyCommitment, {
          policy,
          requesterAttrs: [1, 0, 0, 0, 0, 0],
          randomizer,
          paramsCommitment,
          numOperations: 1
        })
      );
      assert.notStrictEqual(
        truncated,
        '1',
        'Truncating "attr0 AND attr1" to "attr0" must not authorize'
      );
    });
  });
});
