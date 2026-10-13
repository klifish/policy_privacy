/**
 * Parameter-commitment blinding
 * =============================
 *
 * The public parameter commitment pp is published in the PolicyCommitted event
 * and as a proof public signal. Before protocol v3.0.0-rc2 it was a
 * deterministic Poseidon chain over the predicate parameters, so policies with
 * equal parameter sets carried equal pp values, and an observer could hash
 * known candidate parameter sets and compare them with pp offline. In the
 * evaluated Amoy capture, 147 profile-only policies shared one pp value.
 *
 * pp now also hashes the policy commitment randomizer r. This test asserts that
 * (1) equal parameters under different randomizers give different pp, and
 * (2) the circuit enforces the blinded form: a witness whose pp was computed
 * with a randomizer other than the committed one is rejected, while the honest
 * witness is decided.
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
  DUO_V3_DEPTH: DEPTH,
  deriveDuoV3RequesterAttrs
} = require('../lib/duo_v3');
const { WASM_PATH } = require('../tps/proofGenerator');

// Index 1 is DS, an ontology-backed term that is a free Boolean input when its
// predicate slot is disabled (see program_length_binding_test.js).
const ATTR_DS = 1;
const WITNESS_CALCULATOR_PATH = path.join(path.dirname(WASM_PATH), 'witness_calculator.js');

const padPolicy = (tokens) => [...tokens, ...Array(DEPTH - tokens.length).fill(0)];

function parameterFields(input) {
  return {
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
  };
}

describe('Parameter-commitment blinding', function () {
  let witnessCalculator;
  let circuitAvailable = false;

  this.timeout(100000);

  before(async function () {
    if (!fs.existsSync(WASM_PATH) || !fs.existsSync(WITNESS_CALCULATOR_PATH)) {
      console.log('Compiled main circuit not found; skipping circuit-level blinding tests.');
      return;
    }
    const buildWitnessCalculator = require(WITNESS_CALCULATOR_PATH);
    witnessCalculator = await buildWitnessCalculator(fs.readFileSync(WASM_PATH));
    circuitAvailable = true;
  });

  const policy = padPolicy([ATTR_DS]);
  const requesterAttrs = deriveDuoV3RequesterAttrs(0, { DS: true });
  const randomizer = 12345n;

  async function buildInput(ppRandomizer) {
    const policyCommitment = await calculatePolicyCommitment(policy, randomizer, 1);
    const input = createCircuitInput(policyCommitment, {
      policy,
      requesterAttrs,
      randomizer,
      numOperations: 1
    });
    input.contextHash = await calculateContextHash(input.idReq, input.idRes, input.nonce);
    input.paramsCommitment = await calculateParamsCommitment({
      ...parameterFields(input),
      randomizer: ppRandomizer
    });
    return input;
  }

  async function tryAuthorize(input) {
    try {
      const witness = await witnessCalculator.calculateWitness(input, true);
      return witness[1].toString();
    } catch (error) {
      return null;
    }
  }

  describe('commitment computation', function () {
    it('gives equal parameter sets different commitments under different randomizers', async function () {
      const input = await buildInput(randomizer);
      const fields = parameterFields(input);
      const first = await calculateParamsCommitment({ ...fields, randomizer: 1n });
      const second = await calculateParamsCommitment({ ...fields, randomizer: 2n });
      assert.notStrictEqual(first, second, 'pp must depend on the randomizer');
    });

    it('rejects a call without the randomizer rather than producing an unblinded value', async function () {
      const input = await buildInput(randomizer);
      await assert.rejects(
        () => calculateParamsCommitment(parameterFields(input)),
        /requires the commitment randomizer/
      );
    });
  });

  describe('circuit enforcement', function () {
    it('decides the honest witness whose pp is blinded by the committed randomizer', async function () {
      if (!circuitAvailable) this.skip();
      assert.strictEqual(
        await tryAuthorize(await buildInput(randomizer)),
        '1',
        '"DS" must authorize a requester holding DS'
      );
    });

    it('rejects a witness whose pp was blinded with a different randomizer', async function () {
      if (!circuitAvailable) this.skip();
      // Non-vacuity: the honest witness passes through the same builder.
      assert.strictEqual(await tryAuthorize(await buildInput(randomizer)), '1');
      assert.strictEqual(
        await tryAuthorize(await buildInput(randomizer + 1n)),
        null,
        'pp must equal the chain over the parameters and the committed randomizer'
      );
    });
  });
});
