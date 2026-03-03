pragma circom 2.0.0;

include "interpreter/postfix_policy_interpreter.circom";
include "gadgets/policy_commitment.circom";
include "gadgets/external_predicates.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/*
    PolicyPrivacyMain Circuit — Untrusted Data Requester Model
    ===========================================================

    This circuit implements privacy-preserving policy compliance verification
    with a fully untrusted data requester. It proves simultaneously that:

    1. C(P,(a,p)) = 1  - Policy P is satisfied by attributes a and predicates p
    2. Com(P;r) = h    - Policy commitment is consistent
    3. Each p_j ∈ p is correctly derived from external predicate verification
    4. Identity binding: pid = Poseidon(sk_req) prevents credential transfer
    5. Scope binding: credentials are bound to specific dataset+policy via scopeHash
    6. Nullifier: Poseidon(sk_req, scopeHash) enables replay prevention
    7. Expiry: credential expiry is enforced against currentTimestamp

    The requester is modeled as fully adversarial and policy-oblivious.
    DUO credentials are verified via Baby Jubjub EdDSA (EdDSAPoseidonVerifier).

    Parameters:
    - N: Number of requester attributes
    - M: Number of external predicates
    - DEPTH: Maximum policy token depth
    - K: Bit width for operand indexing
    - MERKLE_LEVELS: Merkle tree depth for set membership proofs
    - RANGE_BITS: Bit width for range/threshold proofs
*/

template PolicyPrivacyMain(N, M, DEPTH, K, MERKLE_LEVELS, RANGE_BITS) {
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

    // Policy P: RPN token sequence
    signal input policy[DEPTH];

    // Requester attributes a ∈ {0,1}^N
    signal input requesterAttrs[N];

    // Requester identity key (private — never revealed)
    signal input skReq;

    // External predicate inputs for generating p ∈ {0,1}^M
    signal input predicateTypes[M];                     // Type selector for each predicate

    // Merkle proof inputs (for predicates that use them)
    signal input merkleLeaves[M];
    signal input merklePathElements[M][MERKLE_LEVELS];
    signal input merklePathIndices[M][MERKLE_LEVELS];

    // EdDSA credential signature inputs (per predicate slot)
    signal input credSigR8x[M];                    // EdDSA R8 x-coordinate
    signal input credSigR8y[M];                    // EdDSA R8 y-coordinate
    signal input credSigS[M];                      // EdDSA scalar S
    signal input duoTokens[M];                     // DUO token value per slot (for credential message)
    signal input credExpiries[M];                  // Credential expiry timestamps

    // Range proof inputs (for predicates that use them)
    signal input rangeValues[M];

    // Ontology-linked terms inputs (for predicates that use them)
    signal input ontologyCodes[M];                  // ICD codes or other ontology terms

    // Commitment randomizer r
    signal input randomizer;

    // Actual policy length
    signal input numOperations;

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC INPUTS
    // ═══════════════════════════════════════════════════════════════════════

    // Policy commitment h = Com(P;r)
    signal input policyCommitment;
    signal input paramsCommitment;

    // Public parameters pp for external predicate verification
    signal input merkleRoots[M];                        // Merkle tree roots
    signal input credPubKeyAx[M];                       // Issuer public key x (Baby Jubjub)
    signal input credPubKeyAy[M];                       // Issuer public key y (Baby Jubjub)
    signal input rangeMin[M];                           // Range minimum values
    signal input rangeMax[M];                           // Range maximum values
    signal input ontologyPolicyIds[M];                  // Policy IDs for ontology-linked terms
    signal input ontologyEpochs[M];                     // Policy epochs for ontology-linked terms

    // Scope and timestamp for credential binding
    signal input scopeHash;                             // Poseidon(datasetId, policyId)
    signal input currentTimestamp;                      // Block timestamp for expiry check

    // ═══════════════════════════════════════════════════════════════════════
    // OUTPUTS
    // ═══════════════════════════════════════════════════════════════════════

    signal output isAuthorized;                         // Final authorization decision
    signal output nullifier;                            // Poseidon(skReq, scopeHash) for replay prevention

    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL SIGNALS
    // ═══════════════════════════════════════════════════════════════════════

    signal predicateValues[M];                          // Computed predicate values p
    signal policyResult;                                // Policy evaluation result
    signal commitmentValid;                             // Commitment verification result

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

    // Credential message construction components
    component credMsgHasher[M];
    signal computedCredMsg[M];

    // Expiry check components
    component expiryCheck[M];
    component type1ForExpiry[M];

    // ───────────────────────────────────────────────────────────────────────
    // 1. VERIFY POLICY COMMITMENT: Com(P;r) = h
    // ───────────────────────────────────────────────────────────────────────

    commitmentVerifier = PolicyCommitmentVerifier(DEPTH);

    // Connect policy and randomizer
    for (var i = 0; i < DEPTH; i++) {
        commitmentVerifier.policy[i] <== policy[i];
    }
    commitmentVerifier.randomizer <== randomizer;
    commitmentVerifier.expectedCommitment <== policyCommitment;

    commitmentValid <== commitmentVerifier.isValid;

    // ───────────────────────────────────────────────────────────────────────
    // 1b. IDENTITY BINDING: pid = Poseidon(skReq)
    // ───────────────────────────────────────────────────────────────────────

    signal pid;
    component pidHasher = Poseidon(1);
    pidHasher.inputs[0] <== skReq;
    pid <== pidHasher.out;

    // ───────────────────────────────────────────────────────────────────────
    // 1c. NULLIFIER: Poseidon(skReq, scopeHash) — public output for replay prevention
    // ───────────────────────────────────────────────────────────────────────

    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== skReq;
    nullifierHasher.inputs[1] <== scopeHash;
    nullifier <== nullifierHasher.out;

    // ───────────────────────────────────────────────────────────────────────
    // 2. VERIFY EXTERNAL PREDICATES: Generate p from external proofs
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

        // Connect predicate type
        predicateVerifiers[i].predicateType <== predicateTypes[i];
        disabledCheckers[i] = IsEqual();
        disabledCheckers[i].in[0] <== predicateTypes[i];
        disabledCheckers[i].in[1] <== 4;
        disabledFlags[i] <== disabledCheckers[i].out;

        // Connect Merkle proof inputs
        predicateVerifiers[i].merkleLeaf <== merkleLeaves[i];
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            predicateVerifiers[i].merklePathElements[j] <== merklePathElements[i][j];
            predicateVerifiers[i].merklePathIndices[j] <== merklePathIndices[i][j];
        }
        predicateVerifiers[i].merkleRoot <== merkleRoots[i];

        // ── Construct credential message in-circuit ──
        // message = Poseidon(duoToken, pid, scopeHash, expiry)
        // This ensures the requester cannot substitute arbitrary messages.
        credMsgHasher[i] = Poseidon(4);
        credMsgHasher[i].inputs[0] <== duoTokens[i];
        credMsgHasher[i].inputs[1] <== pid;
        credMsgHasher[i].inputs[2] <== scopeHash;
        credMsgHasher[i].inputs[3] <== credExpiries[i];
        computedCredMsg[i] <== credMsgHasher[i].out;

        // Connect EdDSA credential signature inputs
        predicateVerifiers[i].credMessage <== computedCredMsg[i];
        predicateVerifiers[i].credSigR8x <== credSigR8x[i];
        predicateVerifiers[i].credSigR8y <== credSigR8y[i];
        predicateVerifiers[i].credSigS <== credSigS[i];
        predicateVerifiers[i].credPubKeyAx <== credPubKeyAx[i];
        predicateVerifiers[i].credPubKeyAy <== credPubKeyAy[i];

        // Connect range proof inputs
        predicateVerifiers[i].rangeValue <== rangeValues[i];
        predicateVerifiers[i].rangeMin <== rangeMin[i];
        predicateVerifiers[i].rangeMax <== rangeMax[i];

        // Connect ontology-linked terms inputs
        predicateVerifiers[i].ontologyCode <== ontologyCodes[i];
        predicateVerifiers[i].ontologyPolicyId <== ontologyPolicyIds[i];
        predicateVerifiers[i].ontologyEpoch <== ontologyEpochs[i];

        // Extract verified predicate value
        predicateValues[i] <== predicateVerifiers[i].isValid;

        // ── Expiry check: currentTimestamp <= credExpiries[i] (SIGNATURE type only) ──
        type1ForExpiry[i] = IsEqual();
        type1ForExpiry[i].in[0] <== predicateTypes[i];
        type1ForExpiry[i].in[1] <== 1;
        expiryCheck[i] = LessEqThan(64);
        expiryCheck[i].in[0] <== currentTimestamp;
        expiryCheck[i].in[1] <== credExpiries[i];
        // When predicateType == 1 (SIGNATURE), expiry must be valid (expiryCheck.out == 1)
        // Constraint: type1 * (expiryValid - 1) === 0
        type1ForExpiry[i].out * (expiryCheck[i].out - 1) === 0;

        // ── Enforce default padding for disabled predicates (type=4) ──
        (merkleLeaves[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            (merklePathElements[i][j] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
            merklePathIndices[i][j] * disabledFlags[i] === 0;
        }
        (merkleRoots[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;

        // EdDSA credential signals: all zero when disabled
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

        // ── Hash chains for parameter commitment ──
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

    // ── Parameters commitment hash chain ──
    // Order: merkleRoots → credPubKeyAx → credPubKeyAy → rangeMin → rangeMax
    //        → ontologyPolicyIds → ontologyEpochs → domainSeparator
    // Note: scopeHash and currentTimestamp are public inputs but NOT part of paramsCommitment
    //       because paramsCommitment is stored on-chain before scopeHash/policyId are known
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

    // Connect policy
    for (var i = 0; i < DEPTH; i++) {
        policyInterpreter.postfixExpr[i] <== policy[i];
    }
    policyInterpreter.numOperations <== numOperations;

    // Connect requester attributes
    for (var i = 0; i < N; i++) {
        policyInterpreter.requesterPolicy[i] <== requesterAttrs[i];
    }

    // Connect verified predicate values
    for (var i = 0; i < M; i++) {
        policyInterpreter.predicateValues[i] <== predicateValues[i];
    }

    policyResult <== policyInterpreter.isValid;

    // ───────────────────────────────────────────────────────────────────────
    // 4. COMBINE RESULTS: Authorization requires all components to be valid
    // ───────────────────────────────────────────────────────────────────────

    // Import AND gate from circomlib
    component and = AND();
    and.a <== commitmentValid;
    and.b <== policyResult;

    // Final authorization decision
    isAuthorized <== and.out;

    // Internal signals for type checking
    signal tmp1[M];
    signal tmp2[M];
    signal tmp3[M];
    signal tmp4[M];

    // ═══════════════════════════════════════════════════════════════════════
    // ADDITIONAL CONSTRAINTS
    // ═══════════════════════════════════════════════════════════════════════

    // Enforce Boolean nature of requester attributes
    for (var i = 0; i < N; i++) {
        requesterAttrs[i] * (requesterAttrs[i] - 1) === 0;
    }

    // Ensure predicate types are valid (0, 1, 2, 3, or 4) using quadratic constraints
    for (var i = 0; i < M; i++) {
        // Check that predicateTypes[i] * (predicateTypes[i] - 1) * ... * (predicateTypes[i] - 4) == 0
        tmp1[i] <== predicateTypes[i] * (predicateTypes[i] - 1);
        tmp2[i] <== (predicateTypes[i] - 2) * (predicateTypes[i] - 3);
        tmp3[i] <== tmp1[i] * tmp2[i];
        tmp4[i] <== tmp3[i] * (predicateTypes[i] - 4);
        tmp4[i] === 0;
    }
}
