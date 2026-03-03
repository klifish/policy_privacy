pragma circom 2.0.0;

include "interpreter/postfix_policy_interpreter.circom";
include "gadgets/policy_commitment.circom";
include "gadgets/external_predicates.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
    PolicyPrivacyProviderProves Circuit — Provider-Side Proving Model
    =================================================================

    In this model the Data Provider generates the ZK proof, protecting
    the Provider's policy privacy while the Requester submits encrypted
    credential evidence (attributes + EdDSA signatures) via an on-chain
    event.

    Flow
    ----
    1. Provider commits policy on-chain (policyCommitment, paramsCommitment).
    2. Requester encrypts attributes + credential signatures with the
       Provider's ECDH public key and calls submitAttributes() on-chain.
       The encrypted payload is emitted as an event log (no storage write).
    3. Provider monitors the event, decrypts the payload, and runs THIS
       circuit locally to produce a Groth16 proof.
    4. Provider submits the proof via requestAccessAsProvider(). The
       contract verifies the proof and records access for the Requester's
       Ethereum address.

    Differences from PolicyPrivacyMain / PolicyPrivacyMainTTP
    ---------------------------------------------------------
    ┌──────────────────────────────────────────────────────────────────┐
    │  - skReq is REMOVED (Provider does not know Requester's secret) │
    │  - pid is REMOVED (identity bound via Ethereum address instead) │
    │  - nullifier output is REMOVED (replay prevention by address)   │
    │  - requesterAddress is a NEW PUBLIC INPUT (Ethereum address)     │
    │  - Credential message: Poseidon(duoToken, requesterAddress,     │
    │    scopeHash, expiry) — replaces pid with requesterAddress       │
    └──────────────────────────────────────────────────────────────────┘

    Privacy Model
    -------------
    - Provider's policy: hidden from Requester (never shared).
      Only the commitment is on-chain.
    - Requester's attributes: visible to Provider (who decrypts them),
      but hidden from on-chain observers (encrypted in event data).
    - On-chain: only the proof result (isAuthorized) and public
      parameters are visible — neither the policy nor attributes.

    Public Signals (41 total):
    - Output:  isAuthorized
    - Inputs:  requesterAddress, policyCommitment, paramsCommitment,
               merkleRoots[M], credPubKeyAx[M], credPubKeyAy[M],
               rangeMin[M], rangeMax[M],
               ontologyPolicyIds[M], ontologyEpochs[M],
               scopeHash, currentTimestamp

    Parameters:
    - N: Number of requester attributes
    - M: Number of external predicates
    - DEPTH: Maximum policy token depth
    - K: Bit width for operand indexing
    - MERKLE_LEVELS: Merkle tree depth for set membership proofs
    - RANGE_BITS: Bit width for range/threshold proofs
*/

template PolicyPrivacyProviderProves(N, M, DEPTH, K, MERKLE_LEVELS, RANGE_BITS) {
    // ═══════════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════════

    var DEFAULT_MERKLE_VALUE = 0;
    var DEFAULT_RANGE_VALUE = 0;
    var DEFAULT_RANGE_MIN = 0;
    var DEFAULT_RANGE_MAX = 0;
    var DEFAULT_ONTOLOGY_CODE = 0;
    var DEFAULT_ONTOLOGY_POLICY_ID = 0;
    var DEFAULT_ONTOLOGY_EPOCH = 0;
    var PARAM_DOMAIN_SEPARATOR = 1;

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE WITNESS INPUTS
    // ═══════════════════════════════════════════════════════════════════════

    // Policy P: RPN token sequence (Provider's own policy — kept private)
    signal input policy[DEPTH];

    // Requester attributes a ∈ {0,1}^N  (decrypted from Requester's submission)
    signal input requesterAttrs[N];

    // External predicate inputs for generating p ∈ {0,1}^M
    signal input predicateTypes[M];

    // Merkle proof inputs
    signal input merkleLeaves[M];
    signal input merklePathElements[M][MERKLE_LEVELS];
    signal input merklePathIndices[M][MERKLE_LEVELS];

    // EdDSA credential signature inputs (per predicate slot)
    signal input credSigR8x[M];
    signal input credSigR8y[M];
    signal input credSigS[M];
    signal input duoTokens[M];
    signal input credExpiries[M];

    // Range proof inputs
    signal input rangeValues[M];

    // Ontology-linked terms inputs
    signal input ontologyCodes[M];

    // Commitment randomizer r
    signal input randomizer;

    // Actual policy length
    signal input numOperations;

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC INPUTS
    // ═══════════════════════════════════════════════════════════════════════

    // Requester's Ethereum address as a field element (uint160 → uint256).
    // Replaces pid (Poseidon(skReq)) — identity is now bound to on-chain
    // address rather than a ZK identity commitment.
    signal input requesterAddress;

    // Policy commitment h = Com(P;r)
    signal input policyCommitment;
    signal input paramsCommitment;

    // Public parameters for external predicate verification
    signal input merkleRoots[M];
    signal input credPubKeyAx[M];
    signal input credPubKeyAy[M];
    signal input rangeMin[M];
    signal input rangeMax[M];
    signal input ontologyPolicyIds[M];
    signal input ontologyEpochs[M];

    // Scope and timestamp for credential binding
    signal input scopeHash;
    signal input currentTimestamp;

    // ═══════════════════════════════════════════════════════════════════════
    // OUTPUTS
    // ═══════════════════════════════════════════════════════════════════════

    signal output isAuthorized;

    // NOTE: No nullifier output.
    // Replay prevention is handled at the contract level via
    // accessRegistry[resourceId][requesterAddress].

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL SIGNALS
    // ═══════════════════════════════════════════════════════════════════════

    signal predicateValues[M];
    signal policyResult;
    signal commitmentValid;

    // ═══════════════════════════════════════════════════════════════════════
    // CIRCUIT COMPONENTS
    // ═══════════════════════════════════════════════════════════════════════

    component policyInterpreter;
    component commitmentVerifier;
    component predicateVerifiers[M];
    component disabledCheckers[M];
    component merkleRootHashers[M];
    component credPubKeyAxHashers[M];
    component credPubKeyAyHashers[M];
    component rangeMinHashers[M];
    component rangeMaxHashers[M];
    component ontologyPolicyIdHashers[M];
    component ontologyEpochHashers[M];
    component paramsDigestHashers[8];
    signal disabledFlags[M];
    signal merkleRootHashChain[M + 1];
    signal credPubKeyAxHashChain[M + 1];
    signal credPubKeyAyHashChain[M + 1];
    signal rangeMinHashChain[M + 1];
    signal rangeMaxHashChain[M + 1];
    signal ontologyPolicyIdHashChain[M + 1];
    signal ontologyEpochHashChain[M + 1];
    signal paramsDigestChain[9];
    component finalAnd;

    component credMsgHasher[M];
    signal computedCredMsg[M];

    component expiryCheck[M];
    component type1ForExpiry[M];

    // ───────────────────────────────────────────────────────────────────────
    // 1. VERIFY POLICY COMMITMENT: Com(P;r) = h
    // ───────────────────────────────────────────────────────────────────────

    commitmentVerifier = PolicyCommitmentVerifier(DEPTH);
    for (var i = 0; i < DEPTH; i++) {
        commitmentVerifier.policy[i] <== policy[i];
    }
    commitmentVerifier.randomizer <== randomizer;
    commitmentVerifier.expectedCommitment <== policyCommitment;
    commitmentValid <== commitmentVerifier.isValid;

    // ───────────────────────────────────────────────────────────────────────
    // 2. VERIFY EXTERNAL PREDICATES
    // ───────────────────────────────────────────────────────────────────────

    merkleRootHashChain[0] <== 0;
    credPubKeyAxHashChain[0] <== 0;
    credPubKeyAyHashChain[0] <== 0;
    rangeMinHashChain[0] <== 0;
    rangeMaxHashChain[0] <== 0;
    ontologyPolicyIdHashChain[0] <== 0;
    ontologyEpochHashChain[0] <== 0;

    for (var i = 0; i < M; i++) {
        predicateVerifiers[i] = ExternalPredicateVerifier(MERKLE_LEVELS, RANGE_BITS);

        predicateVerifiers[i].predicateType <== predicateTypes[i];
        disabledCheckers[i] = IsEqual();
        disabledCheckers[i].in[0] <== predicateTypes[i];
        disabledCheckers[i].in[1] <== 4;
        disabledFlags[i] <== disabledCheckers[i].out;

        predicateVerifiers[i].merkleLeaf <== merkleLeaves[i];
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            predicateVerifiers[i].merklePathElements[j] <== merklePathElements[i][j];
            predicateVerifiers[i].merklePathIndices[j] <== merklePathIndices[i][j];
        }
        predicateVerifiers[i].merkleRoot <== merkleRoots[i];

        // Credential message: Poseidon(duoToken, requesterAddress, scopeHash, expiry)
        // Uses requesterAddress instead of pid for identity binding
        credMsgHasher[i] = Poseidon(4);
        credMsgHasher[i].inputs[0] <== duoTokens[i];
        credMsgHasher[i].inputs[1] <== requesterAddress;
        credMsgHasher[i].inputs[2] <== scopeHash;
        credMsgHasher[i].inputs[3] <== credExpiries[i];
        computedCredMsg[i] <== credMsgHasher[i].out;

        predicateVerifiers[i].credMessage <== computedCredMsg[i];
        predicateVerifiers[i].credSigR8x <== credSigR8x[i];
        predicateVerifiers[i].credSigR8y <== credSigR8y[i];
        predicateVerifiers[i].credSigS <== credSigS[i];
        predicateVerifiers[i].credPubKeyAx <== credPubKeyAx[i];
        predicateVerifiers[i].credPubKeyAy <== credPubKeyAy[i];

        predicateVerifiers[i].rangeValue <== rangeValues[i];
        predicateVerifiers[i].rangeMin <== rangeMin[i];
        predicateVerifiers[i].rangeMax <== rangeMax[i];

        predicateVerifiers[i].ontologyCode <== ontologyCodes[i];
        predicateVerifiers[i].ontologyPolicyId <== ontologyPolicyIds[i];
        predicateVerifiers[i].ontologyEpoch <== ontologyEpochs[i];

        predicateValues[i] <== predicateVerifiers[i].isValid;

        // Expiry check (SIGNATURE type only)
        type1ForExpiry[i] = IsEqual();
        type1ForExpiry[i].in[0] <== predicateTypes[i];
        type1ForExpiry[i].in[1] <== 1;
        expiryCheck[i] = LessEqThan(64);
        expiryCheck[i].in[0] <== currentTimestamp;
        expiryCheck[i].in[1] <== credExpiries[i];
        type1ForExpiry[i].out * (expiryCheck[i].out - 1) === 0;

        // Disabled predicate padding enforcement
        (merkleLeaves[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            (merklePathElements[i][j] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
            merklePathIndices[i][j] * disabledFlags[i] === 0;
        }
        (merkleRoots[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;

        credSigR8x[i] * disabledFlags[i] === 0;
        credSigR8y[i] * disabledFlags[i] === 0;
        credSigS[i] * disabledFlags[i] === 0;
        credPubKeyAx[i] * disabledFlags[i] === 0;
        credPubKeyAy[i] * disabledFlags[i] === 0;
        duoTokens[i] * disabledFlags[i] === 0;
        credExpiries[i] * disabledFlags[i] === 0;

        (rangeValues[i] - DEFAULT_RANGE_VALUE) * disabledFlags[i] === 0;
        (rangeMin[i] - DEFAULT_RANGE_MIN) * disabledFlags[i] === 0;
        (rangeMax[i] - DEFAULT_RANGE_MAX) * disabledFlags[i] === 0;

        (ontologyCodes[i] - DEFAULT_ONTOLOGY_CODE) * disabledFlags[i] === 0;
        (ontologyPolicyIds[i] - DEFAULT_ONTOLOGY_POLICY_ID) * disabledFlags[i] === 0;
        (ontologyEpochs[i] - DEFAULT_ONTOLOGY_EPOCH) * disabledFlags[i] === 0;

        predicateValues[i] * disabledFlags[i] === 0;

        // Parameter commitment hash chains
        merkleRootHashers[i] = Poseidon(2);
        merkleRootHashers[i].inputs[0] <== merkleRootHashChain[i];
        merkleRootHashers[i].inputs[1] <== merkleRoots[i];
        merkleRootHashChain[i + 1] <== merkleRootHashers[i].out;

        credPubKeyAxHashers[i] = Poseidon(2);
        credPubKeyAxHashers[i].inputs[0] <== credPubKeyAxHashChain[i];
        credPubKeyAxHashers[i].inputs[1] <== credPubKeyAx[i];
        credPubKeyAxHashChain[i + 1] <== credPubKeyAxHashers[i].out;

        credPubKeyAyHashers[i] = Poseidon(2);
        credPubKeyAyHashers[i].inputs[0] <== credPubKeyAyHashChain[i];
        credPubKeyAyHashers[i].inputs[1] <== credPubKeyAy[i];
        credPubKeyAyHashChain[i + 1] <== credPubKeyAyHashers[i].out;

        rangeMinHashers[i] = Poseidon(2);
        rangeMinHashers[i].inputs[0] <== rangeMinHashChain[i];
        rangeMinHashers[i].inputs[1] <== rangeMin[i];
        rangeMinHashChain[i + 1] <== rangeMinHashers[i].out;

        rangeMaxHashers[i] = Poseidon(2);
        rangeMaxHashers[i].inputs[0] <== rangeMaxHashChain[i];
        rangeMaxHashers[i].inputs[1] <== rangeMax[i];
        rangeMaxHashChain[i + 1] <== rangeMaxHashers[i].out;

        ontologyPolicyIdHashers[i] = Poseidon(2);
        ontologyPolicyIdHashers[i].inputs[0] <== ontologyPolicyIdHashChain[i];
        ontologyPolicyIdHashers[i].inputs[1] <== ontologyPolicyIds[i];
        ontologyPolicyIdHashChain[i + 1] <== ontologyPolicyIdHashers[i].out;

        ontologyEpochHashers[i] = Poseidon(2);
        ontologyEpochHashers[i].inputs[0] <== ontologyEpochHashChain[i];
        ontologyEpochHashers[i].inputs[1] <== ontologyEpochs[i];
        ontologyEpochHashChain[i + 1] <== ontologyEpochHashers[i].out;
    }

    // Parameters commitment
    paramsDigestChain[0] <== 0;

    paramsDigestHashers[0] = Poseidon(2);
    paramsDigestHashers[0].inputs[0] <== paramsDigestChain[0];
    paramsDigestHashers[0].inputs[1] <== merkleRootHashChain[M];
    paramsDigestChain[1] <== paramsDigestHashers[0].out;

    paramsDigestHashers[1] = Poseidon(2);
    paramsDigestHashers[1].inputs[0] <== paramsDigestChain[1];
    paramsDigestHashers[1].inputs[1] <== credPubKeyAxHashChain[M];
    paramsDigestChain[2] <== paramsDigestHashers[1].out;

    paramsDigestHashers[2] = Poseidon(2);
    paramsDigestHashers[2].inputs[0] <== paramsDigestChain[2];
    paramsDigestHashers[2].inputs[1] <== credPubKeyAyHashChain[M];
    paramsDigestChain[3] <== paramsDigestHashers[2].out;

    paramsDigestHashers[3] = Poseidon(2);
    paramsDigestHashers[3].inputs[0] <== paramsDigestChain[3];
    paramsDigestHashers[3].inputs[1] <== rangeMinHashChain[M];
    paramsDigestChain[4] <== paramsDigestHashers[3].out;

    paramsDigestHashers[4] = Poseidon(2);
    paramsDigestHashers[4].inputs[0] <== paramsDigestChain[4];
    paramsDigestHashers[4].inputs[1] <== rangeMaxHashChain[M];
    paramsDigestChain[5] <== paramsDigestHashers[4].out;

    paramsDigestHashers[5] = Poseidon(2);
    paramsDigestHashers[5].inputs[0] <== paramsDigestChain[5];
    paramsDigestHashers[5].inputs[1] <== ontologyPolicyIdHashChain[M];
    paramsDigestChain[6] <== paramsDigestHashers[5].out;

    paramsDigestHashers[6] = Poseidon(2);
    paramsDigestHashers[6].inputs[0] <== paramsDigestChain[6];
    paramsDigestHashers[6].inputs[1] <== ontologyEpochHashChain[M];
    paramsDigestChain[7] <== paramsDigestHashers[6].out;

    paramsDigestHashers[7] = Poseidon(2);
    paramsDigestHashers[7].inputs[0] <== paramsDigestChain[7];
    paramsDigestHashers[7].inputs[1] <== PARAM_DOMAIN_SEPARATOR;
    paramsDigestChain[8] <== paramsDigestHashers[7].out;

    paramsCommitment === paramsDigestChain[8];

    // ───────────────────────────────────────────────────────────────────────
    // 3. EVALUATE POLICY: C(P,(a,p)) = 1
    // ───────────────────────────────────────────────────────────────────────

    policyInterpreter = PostfixPolicyInterpreter(N, M, DEPTH, K);

    for (var i = 0; i < DEPTH; i++) {
        policyInterpreter.postfixExpr[i] <== policy[i];
    }
    policyInterpreter.numOperations <== numOperations;

    for (var i = 0; i < N; i++) {
        policyInterpreter.requesterPolicy[i] <== requesterAttrs[i];
    }

    for (var i = 0; i < M; i++) {
        policyInterpreter.predicateValues[i] <== predicateValues[i];
    }

    policyResult <== policyInterpreter.isValid;

    // ───────────────────────────────────────────────────────────────────────
    // 4. COMBINE RESULTS
    // ───────────────────────────────────────────────────────────────────────

    component and = AND();
    and.a <== commitmentValid;
    and.b <== policyResult;

    isAuthorized <== and.out;

    // ═══════════════════════════════════════════════════════════════════════
    // ADDITIONAL CONSTRAINTS
    // ═══════════════════════════════════════════════════════════════════════

    signal tmp1[M];
    signal tmp2[M];
    signal tmp3[M];
    signal tmp4[M];

    for (var i = 0; i < N; i++) {
        requesterAttrs[i] * (requesterAttrs[i] - 1) === 0;
    }

    for (var i = 0; i < M; i++) {
        tmp1[i] <== predicateTypes[i] * (predicateTypes[i] - 1);
        tmp2[i] <== (predicateTypes[i] - 2) * (predicateTypes[i] - 3);
        tmp3[i] <== tmp1[i] * tmp2[i];
        tmp4[i] <== tmp3[i] * (predicateTypes[i] - 4);
        tmp4[i] === 0;
    }
}
