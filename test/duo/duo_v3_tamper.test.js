'use strict';

/**
 * DUO V3 witness-level tamper matrix. Distinguishes
 *   HARD  - the witness calculator rejects the input (constraint violation)
 *   SOFT  - the witness is valid but isAuthorized = 0
 * Only the circuit wasm is needed (no proving key).
 */

const { expect } = require('chai');
const H = require('./helpers/duo_v3_harness');
const { signDuoProfileCredential } = require('../../lib/prover');

const E = H.WITNESS_PUBLIC.requestEpoch;

describe('DUO V3 tamper matrix (witness level)', function () {
  this.timeout(120_000);
  let fx;
  let base;      // HMB AND DS AND US  -> slots 0 (ontology), 5 (allowlist), 10 (profile)
  let dsOnly;    // DS                 -> slot 0 only
  let obligations; // MOR AND TS       -> slots 8, 9

  before(async function () {
    if (!H.wasmAvailable()) this.skip();
    fx = await H.buildTermFixtures();
    base = await H.compilePolicy('HMB AND DS AND US', fx);
    dsOnly = await H.compilePolicy('DS', fx);
    obligations = await H.compilePolicy('MOR AND TS', fx);
  });

  const grant = () => H.resolveProfile({});
  const soft = (ctx, profile, options) => H.expectDecision(ctx, profile, fx, 0n, options);
  const hard = (ctx, profile, options) => H.expectWitnessRejected(() => H.witnessDecision(ctx, profile, fx, options));
  const ok = (ctx, profile, options) => H.expectDecision(ctx, profile, fx, 1n, options);

  it('baseline: the untampered witness authorizes', () => ok(base, grant()));

  describe('profile credential (slot 10)', function () {
    it('T1 SOFT: valid signature from an issuer other than the committed one', async function () {
      await soft(base, H.resolveProfile({ overrides: { credential: { issuer: 'rogue' } } }));
    });
    it('T2 HARD: rogue signature presented under the committed issuer key', async function () {
      await hard(base, grant(), {
        mutateInput: async (input, { idReq }) => {
          const forged = await signDuoProfileCredential(fx.issuers.rogue.priv, {
            policyCommitment: base.artifacts.policyCommitment, requesterId: idReq, resourceId: H.WITNESS_PUBLIC.resourceId,
            profileClaims: 75, validFromEpoch: E - 10, validUntilEpoch: E + 10_000, credentialId: 1
          });
          input.credSignatures[10] = forged.S; input.credSigR8x[10] = forged.R8x; input.credSigR8y[10] = forged.R8y;
          // issuer point stays the committed (good) one
        }
      });
    });
    it('T3a SOFT: credential expired (validUntil < requestEpoch)', async function () {
      await soft(base, H.resolveProfile({ overrides: { credential: { validUntilDelta: -1 } } }));
    });
    it('T3b SOFT: credential not yet valid (validFrom > requestEpoch)', async function () {
      await soft(base, H.resolveProfile({ overrides: { credential: { validFromDelta: 1 } } }));
    });
    it('T3c HARD: credentialId zeroed after signing (digest mismatch)', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.credentialIds[10] = '0'; } });
    });
    for (const [label, field] of [['policyCommitment', 'policyCommitment'], ['resourceId', 'resourceId'], ['requesterId', 'requesterId']]) {
      it(`T4 HARD: credential issued for another ${label}`, async function () {
        await hard(base, grant(), {
          mutateInput: async (input, { idReq }) => {
            const fields = {
              policyCommitment: base.artifacts.policyCommitment, requesterId: idReq, resourceId: H.WITNESS_PUBLIC.resourceId,
              profileClaims: 75, validFromEpoch: E - 10, validUntilEpoch: E + 10_000, credentialId: 1
            };
            fields[field] = BigInt(fields[field]) + 1n;
            const other = await signDuoProfileCredential(fx.issuers.good.priv, fields);
            input.credSignatures[10] = other.S; input.credSigR8x[10] = other.R8x; input.credSigR8y[10] = other.R8y;
          }
        });
      });
    }
    it('T4d HARD: credential signed over different claim bits than the ones asserted', async function () {
      await hard(base, grant(), {
        mutateInput: async (input, { idReq }) => {
          const other = await signDuoProfileCredential(fx.issuers.good.priv, {
            policyCommitment: base.artifacts.policyCommitment, requesterId: idReq, resourceId: H.WITNESS_PUBLIC.resourceId,
            profileClaims: 74, validFromEpoch: E - 10, validUntilEpoch: E + 10_000, credentialId: 1
          });
          input.credSignatures[10] = other.S; input.credSigR8x[10] = other.R8x; input.credSigR8y[10] = other.R8y;
        }
      });
    });
  });

  describe('claims -> attribute derivation', function () {
    it('T5a HARD: HMB attribute asserted while the health claim bit is 0', async function () {
      await hard(base, H.resolveProfile({ flip: ['HMB'] }), { mutateInput: (input) => { input.requesterAttrs[6] = 1; } });
    });
    it('T5b HARD: non-zero claims on a policy whose profile slot is disabled', async function () {
      await hard(dsOnly, grant(), { mutateInput: (input) => { input.duoProfileClaims = '75'; input.requesterAttrs = H.deriveAttrsFromClaims(75, H.BASE_REQUESTER.attrs); } });
    });
    it('T5c HARD: GRU attribute asserted without a profile slot', async function () {
      await hard(dsOnly, grant(), { mutateInput: (input) => { input.requesterAttrs[0] = 1; } });
    });
    it('T5d HARD: NMDS attribute cleared while the methods claim bit is 0', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.requesterAttrs[7] = 0; } });
    });
  });

  describe('holder binding', function () {
    it('T6a HARD: idReq is not Poseidon(holderSecret)', async function () {
      await hard(base, grant(), {
        mutateInput: async (input) => {
          input.idReq = String(BigInt(input.idReq) + 1n);
          input.contextHash = await require('../../lib/prover').calculateContextHash(input.idReq, input.idRes, input.nonce);
        }
      });
    });
    it('T6b HARD: zero holder secret on a holder-bound policy', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.holderSecret = '0'; } });
    });
    it('T6c HARD: non-zero holder secret on a policy without holder-bound slots', async function () {
      await hard(dsOnly, grant(), { mutateInput: (input) => { input.holderSecret = '101'; } });
    });
  });

  describe('allowlist (slot 5)', function () {
    it('T10a HARD: leaf is not Poseidon(2005, scopeKind, scopeId, idReq)', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.merkleLeaves[5] = '123'; } });
    });
    it('T10b HARD: US slot carries a non-zero approvedScopeId', async function () {
      await hard(base, grant(), { mutateInput: async (input) => { input.approvedScopeIds[5] = '5'; await H.recomputeParamsCommitment(input); } });
    });
    it('T10c HARD: non-binary Merkle path index', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.merklePathIndices[5][0] = 2; } });
    });
    it('T10d HARD: scopeKind outside {26,27,28} on an enabled allowlist slot', async function () {
      await hard(base, grant(), { mutateInput: async (input) => { input.scopeKinds[5] = 29; await H.recomputeParamsCommitment(input); } });
    });
    it('T7 PINNED: a PS allowlist (scopeKind 27) provisioned in the US slot is accepted by the circuit', async function () {
      // TODO(circuit): the main circuit does not bind scopeKind to the slot
      // index (ProductionPredicateVerifier does, but is unused). The compiler
      // is the only guard (see duo_v3_compiler_rejections "fixed slots").
      const ctx = await H.compilePolicy('US', fx, { predicateOverrides: { US: { allowlistRoot: fx.allowlists.PS.root.toString() } } });
      const alicePs = fx.allowlists.PS.entries.find((e) => e.requesterId === BigInt(fx.requesterIds.alice));
      await ok(ctx, grant(), {
        mutateInput: async (input) => {
          input.scopeKinds[5] = 27;
          input.approvedScopeIds[5] = '9001';
          input.merkleLeaves[5] = alicePs.leaf.toString();
          input.merklePathElements[5] = alicePs.pathElements.map(String);
          input.merklePathIndices[5] = alicePs.pathIndices.slice();
          await H.recomputeParamsCommitment(input);
        }
      });
    });
  });

  describe('disabled-slot padding (slot 1 disabled)', function () {
    const cases = [
      ['merkleRoots', async (input) => { input.merkleRoots[1] = '5'; await H.recomputeParamsCommitment(input); }],
      ['predicateSchemaTags', async (input) => { input.predicateSchemaTags[1] = 2005; await H.recomputeParamsCommitment(input); }],
      ['credentialIds', (input) => { input.credentialIds[1] = '1'; }],
      ['ontologyEpochs', async (input) => { input.ontologyEpochs[1] = String(H.ONTOLOGY_EPOCH); await H.recomputeParamsCommitment(input); }],
      ['merkleLeaves', (input) => { input.merkleLeaves[1] = '7'; }],
      ['credSignatures', (input) => { input.credSignatures[1] = '7'; }],
      ['scopeKinds', async (input) => { input.scopeKinds[1] = 26; await H.recomputeParamsCommitment(input); }]
    ];
    for (const [field, mutateInput] of cases) {
      it(`T8 HARD: non-zero ${field} on a disabled slot`, () => hard(base, grant(), { mutateInput }));
    }
  });

  describe('ontology (slot 0)', function () {
    it('T9a SOFT: an OBI member code presented in the ICD10 slot', async function () {
      await soft(base, grant(), {
        mutateInput: (input) => {
          const obi = fx.whitelists.OBI.member;
          input.ontologyCodes[0] = obi.packed.toString();
          input.merkleLeaves[0] = obi.leaf.toString();
        }
      });
    });
    it('T9b SOFT: ontologyPolicyId zero on the enabled slot', async function () {
      await soft(base, grant(), { mutateInput: async (input) => { input.ontologyPolicyIds[0] = '0'; await H.recomputeParamsCommitment(input); } });
    });
    it('T9c SOFT: ontologyEpoch zero on the enabled slot', async function () {
      await soft(base, grant(), { mutateInput: async (input) => { input.ontologyEpochs[0] = '0'; await H.recomputeParamsCommitment(input); } });
    });
  });

  describe('obligations (slots 8 / 9)', function () {
    it('baseline: MOR AND TS authorizes', () => ok(obligations, grant()));
    it('T11a SOFT: TS schema tag in the MOR slot', async function () {
      await soft(obligations, grant(), { mutateInput: async (input) => { input.predicateSchemaTags[8] = 2004; await H.recomputeParamsCommitment(input); } });
    });
    it('T11b HARD: moratorium epoch changed without re-committing the parameters', async function () {
      await hard(obligations, grant(), { mutateInput: (input) => { input.moratoriumUntilEpoch = '0'; } });
    });
    it('T11c SOFT: zero moratorium epoch committed in the parameters', async function () {
      await soft(obligations, grant(), { mutateInput: async (input) => { input.moratoriumUntilEpoch = '0'; await H.recomputeParamsCommitment(input); } });
    });
    it('T11d SOFT: zero time-limit committed in the parameters', async function () {
      await soft(obligations, grant(), { mutateInput: async (input) => { input.timeLimitEpochs = '0'; await H.recomputeParamsCommitment(input); } });
    });
    it('T11e HARD: scopeKind set on an obligation slot', async function () {
      await hard(obligations, grant(), { mutateInput: async (input) => { input.scopeKinds[8] = 26; await H.recomputeParamsCommitment(input); } });
    });
    it('T11f HARD: moratorium epoch outside uint32', async function () {
      await hard(obligations, grant(), { mutateInput: async (input) => { input.moratoriumUntilEpoch = '4294967296'; await H.recomputeParamsCommitment(input); } });
    });
  });

  describe('policy window and commitments', function () {
    it('T12 SOFT: request epoch after policyValidUntilEpoch', async function () {
      const ctx = await H.compilePolicy('DS', fx, { materialOptions: { policyValidUntilEpoch: E - 1 } });
      await soft(ctx, grant());
    });
    it('T12b SOFT: request epoch before policyValidFromEpoch', async function () {
      const ctx = await H.compilePolicy('DS', fx, { materialOptions: { policyValidFromEpoch: E + 1 } });
      await soft(ctx, grant());
    });
    it('T13a HARD: paramsCommitment does not match the parameters', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.paramsCommitment = String(BigInt(input.paramsCommitment) + 1n); } });
    });
    it('T13b SOFT: policyCommitment does not match the program (no profile slot)', async function () {
      await soft(dsOnly, grant(), { mutateInput: (input) => { input.policyCommitment = '0x' + (BigInt(input.policyCommitment) + 1n).toString(16); } });
    });
    it('T13b2 HARD: policyCommitment altered under a profile credential bound to it', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.policyCommitment = '0x' + (BigInt(input.policyCommitment) + 1n).toString(16); } });
    });
    it('T13c HARD: numOperations inconsistent with the program structure', async function () {
      await hard(base, grant(), { mutateInput: (input) => { input.numOperations = 1; } });
    });
    it('T13d SOFT: program token altered (AND -> OR) under the original commitment', async function () {
      await soft(base, grant(), { mutateInput: (input) => { input.policy[2] = H.TOK.OR; } });
    });
    it('T14 HARD: contextHash computed for another nonce', async function () {
      await hard(base, grant(), {
        mutateInput: async (input) => {
          input.contextHash = await require('../../lib/prover').calculateContextHash(input.idReq, input.idRes, BigInt(input.nonce) + 1n);
        }
      });
    });
  });
});
