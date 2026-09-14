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
 *
 * Non-vacuity: every attack case first evaluates the honest witness through
 * the same input builder and requires a real decision from the circuit. A
 * builder that no longer matches the compiled instance therefore fails the
 * honest step loudly instead of letting the attack step pass on a rejected
 * witness. A positive control also commits to the prefix itself and checks
 * that it authorizes, so the "not 1" assertion is known to be reachable.
 *
 * Circuit parameters and the input builder come from the modules the TPS
 * itself uses (lib/duo_v3, lib/prover), so the test tracks the compiled
 * instance rather than a private copy of N/M/DEPTH.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const {
  calculatePolicyCommitment,
  calculateParamsCommitment,
  calculateContextHash,
  createCircuitInput
} = require('../lib/prover');
const {
  DUO_V3_N: N,
  DUO_V3_M: M,
  DUO_V3_DEPTH: DEPTH,
  deriveDuoV3RequesterAttrs
} = require('../lib/duo_v3');
const { WASM_PATH } = require('../tps/proofGenerator');

// Opcodes are offset past the operand range: token < N+M is an operand.
const OP_AND = N + M + 0;
const OP_NOT = N + M + 2;

// Requester attribute indices used by the exploit. Indices 1..5 are the
// ontology-backed terms (DS, RS, POA, GS, CC); they are free Boolean inputs
// when the corresponding predicate slot is disabled. Indices 0 and 6..12 are
// derived in-circuit from the signed DUO profile claims and must be built
// with deriveDuoV3RequesterAttrs, never asserted directly.
const ATTR_DS = 1;
const ATTR_RS = 2;
const ATTR_POA = 3;

const WITNESS_CALCULATOR_PATH = path.join(path.dirname(WASM_PATH), 'witness_calculator.js');

const padPolicy = (tokens) => [
  ...tokens,
  ...Array(DEPTH - tokens.length).fill(0)
];

// Requester holding only the named ontology attributes and no profile claims.
const attrsWith = (ontologyAttrs) => deriveDuoV3RequesterAttrs(0, ontologyAttrs);

describe('Program-length binding in the policy commitment', function () {
  let witnessCalculator;
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
    circuitAvailable = true;
  });

  /**
   * Build a full circuit input for a policy with all predicate slots disabled.
   * paramsCommitment and contextHash are recomputed from the input's own
   * fields, as the TPS does, so both hard equalities in the circuit hold.
   */
  async function buildInput(policyCommitment, { policy, requesterAttrs, randomizer, numOperations }) {
    const input = createCircuitInput(policyCommitment, {
      policy,
      requesterAttrs,
      randomizer,
      numOperations
    });
    input.contextHash = await calculateContextHash(input.idReq, input.idRes, input.nonce);
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

  /** Compute the witness and return isAuthorized; throws when the circuit rejects it. */
  async function decide(input) {
    const witness = await witnessCalculator.calculateWitness(input, true);
    // Signal 0 is the constant 1; signal 1 is the single public output.
    return witness[1].toString();
  }

  /** Like decide(), but returns null when the circuit rejects the witness outright. */
  async function tryAuthorize(input) {
    try {
      return await decide(input);
    } catch (error) {
      return null;
    }
  }

  describe('commitment computation', function () {
    it('binds the program length: same tokens and randomizer, different length => different commitment', async function () {
      const policy = padPolicy([ATTR_POA, OP_NOT]);
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
      const policy = padPolicy([ATTR_POA, OP_NOT]);
      await assert.rejects(
        () => calculatePolicyCommitment(policy, 12345n),
        /requires a programLength/,
        'Omitting the program length must throw, not produce a commitment'
      );
    });

    it('rejects an out-of-range program length', async function () {
      const policy = padPolicy([ATTR_POA, OP_NOT]);
      await assert.rejects(
        () => calculatePolicyCommitment(policy, 12345n, DEPTH + 1),
        /Invalid programLength/
      );
    });
  });

  describe('prefix-truncation attack', function () {
    // Committed policy: "NOT attr3". Requester holds attr3, so the honest
    // policy denies. The truncated prefix "attr3" would allow.
    const policyTokens = [ATTR_POA, OP_NOT];
    const honestLength = policyTokens.length;
    const truncatedLength = 1;
    const requesterAttrs = attrsWith({ POA: true });
    const randomizer = 12345n;

    it('evaluates the honest program to deny (isAuthorized = 0)', async function () {
      if (!circuitAvailable) this.skip();

      const policy = padPolicy(policyTokens);
      const policyCommitment = await calculatePolicyCommitment(policy, randomizer, honestLength);

      const isAuthorized = await decide(
        await buildInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          numOperations: honestLength
        })
      );

      assert.strictEqual(
        isAuthorized,
        '0',
        '"NOT attr3" must deny a requester holding attr3'
      );
    });

    it('positive control: the prefix committed at its own length authorizes', async function () {
      if (!circuitAvailable) this.skip();

      // Same token array, but the provider commits to l = 1, i.e. the policy
      // really is bare "attr3". This is what the cheating TPS wants the
      // verifier to accept under the l = 2 commitment.
      const policy = padPolicy(policyTokens);
      const prefixCommitment = await calculatePolicyCommitment(policy, randomizer, truncatedLength);

      const isAuthorized = await decide(
        await buildInput(prefixCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          numOperations: truncatedLength
        })
      );

      assert.strictEqual(
        isAuthorized,
        '1',
        'The prefix "attr3" must authorize a requester holding attr3; ' +
        'otherwise the truncation case below cannot distinguish a defense from a broken setup'
      );
    });

    it('does not authorize a truncated prefix of the committed program', async function () {
      if (!circuitAvailable) this.skip();

      const policy = padPolicy(policyTokens);

      // The commitment the provider published, for the FULL program.
      const policyCommitment = await calculatePolicyCommitment(policy, randomizer, honestLength);

      // Guard against vacuity: the honest witness must go through the circuit.
      const honest = await decide(
        await buildInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          numOperations: honestLength
        })
      );
      assert.strictEqual(honest, '0', 'honest witness must be decided before testing the attack');

      // A cheating TPS reuses that commitment but evaluates only the prefix.
      const isAuthorized = await tryAuthorize(
        await buildInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
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

      // "attr1 AND attr2", requester holds only attr1.
      const tokens = [ATTR_DS, ATTR_RS, OP_AND];
      const policy = padPolicy(tokens);
      const randomizer = 67890n;
      const requesterAttrs = attrsWith({ DS: true });
      const policyCommitment = await calculatePolicyCommitment(policy, randomizer, tokens.length);

      const honest = await decide(
        await buildInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          numOperations: tokens.length
        })
      );
      assert.strictEqual(honest, '0', '"attr1 AND attr2" must deny without attr2');

      const truncated = await tryAuthorize(
        await buildInput(policyCommitment, {
          policy,
          requesterAttrs,
          randomizer,
          numOperations: 1
        })
      );
      assert.notStrictEqual(
        truncated,
        '1',
        'Truncating "attr1 AND attr2" to "attr1" must not authorize'
      );
    });
  });
});
