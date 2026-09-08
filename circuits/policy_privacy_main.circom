pragma circom 2.0.0;

include "interpreter/postfix_policy_interpreter.circom";
include "gadgets/policy_commitment.circom";
include "gadgets/external_predicates.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
    PolicyPrivacyMain Circuit
    =========================
    
    This is the main circuit implementing the paper's zero-knowledge approach
    for privacy-preserving consent management. It proves simultaneously that:
    
    1. C(P,(a,p)) = 1  - Policy P is satisfied by attributes a and predicates p
    2. Com(P;r) = h    - Policy commitment is consistent  
    3. Each p_j ∈ p is correctly derived from external predicate verification
    
    This circuit embodies the complete witness structure: w = (P, a, p, r)
    
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
    // PRIVATE WITNESS INPUTS (w = (P, a, p, r))
    // ═══════════════════════════════════════════════════════════════════════
    
    var DEFAULT_MERKLE_VALUE = 0;
    var DEFAULT_CRED_MESSAGE = 0;
    var DEFAULT_CRED_SIGNATURE = 0;
    var DEFAULT_CRED_PUBLIC_KEY = 0;
    var DEFAULT_RANGE_VALUE = 0;
    var DEFAULT_RANGE_MIN = 0;
    var DEFAULT_RANGE_MAX = 0;
    var DEFAULT_ONTOLOGY_CODE = 0;
    var DEFAULT_ONTOLOGY_POLICY_ID = 0;
    var DEFAULT_ONTOLOGY_EPOCH = 0;
    var PARAM_DOMAIN_SEPARATOR = 1;
    
    // Policy P: RPN token sequence
    signal input policy[DEPTH];
    
    // Requester attributes a ∈ {0,1}^N
    signal input requesterAttrs[N];
    
    // External predicate inputs for generating p ∈ {0,1}^M
    signal input predicateTypes[M];                     // Type selector for each predicate
    
    // Merkle proof inputs (for predicates that use them)
    signal input merkleLeaves[M];
    signal input merklePathElements[M][MERKLE_LEVELS];
    signal input merklePathIndices[M][MERKLE_LEVELS];
    
    // Credential signature inputs (for predicates that use them)  
    signal input credMessages[M];                   // Single message values
    signal input credSignatures[M];                 // Single signature values
    
    // Range proof inputs (for predicates that use them)
    signal input rangeValues[M];
    
    // Ontology-linked terms inputs (for predicates that use them)
    signal input ontologyCodes[M];                   // ICD codes or other ontology terms
    
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
    signal input credPublicKeys[M];                     // Institution public keys (simplified)
    signal input rangeMin[M];                           // Range minimum values
    signal input rangeMax[M];                           // Range maximum values
    signal input ontologyPolicyIds[M];                  // Policy IDs for ontology-linked terms
    signal input ontologyEpochs[M];                     // Policy epochs for ontology-linked terms
    
    // ═══════════════════════════════════════════════════════════════════════
    // OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    
    signal output isAuthorized;                         // Final authorization decision
    
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
    component credPublicKeyHashers[M];
    component rangeMinHashers[M];
    component rangeMaxHashers[M];
    component ontologyPolicyIdHashers[M];
    component ontologyEpochHashers[M];
    component paramsDigestHashers[7];
    signal disabledFlags[M];
    signal merkleRootHashChain[M + 1];
    signal credPublicKeyHashChain[M + 1];
    signal rangeMinHashChain[M + 1];
    signal rangeMaxHashChain[M + 1];
    signal ontologyPolicyIdHashChain[M + 1];
    signal ontologyEpochHashChain[M + 1];
    signal paramsDigestChain[8];
    component finalAnd;
    
    // ───────────────────────────────────────────────────────────────────────
    // 1. VERIFY POLICY COMMITMENT: Com(P;r) = h
    // ───────────────────────────────────────────────────────────────────────
    
    commitmentVerifier = PolicyCommitmentVerifier(DEPTH);
    
    // Connect policy, program length and randomizer.
    // numOperations is bound into the commitment preimage so that the same
    // committed token array cannot be re-interpreted at a shorter prefix.
    for (var i = 0; i < DEPTH; i++) {
        commitmentVerifier.policy[i] <== policy[i];
    }
    commitmentVerifier.programLength <== numOperations;
    commitmentVerifier.randomizer <== randomizer;
    commitmentVerifier.expectedCommitment <== policyCommitment;
    
    commitmentValid <== commitmentVerifier.isValid;
    
    // ───────────────────────────────────────────────────────────────────────
    // 2. VERIFY EXTERNAL PREDICATES: Generate p from external proofs  
    // ───────────────────────────────────────────────────────────────────────
    
    merkleRootHashChain[0] <== 0;
    credPublicKeyHashChain[0] <== 0;
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
        
        // Connect credential signature inputs
        predicateVerifiers[i].credMessage <== credMessages[i];
        predicateVerifiers[i].credSignature <== credSignatures[i];
        predicateVerifiers[i].credPublicKey <== credPublicKeys[i];
        
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

        // Enforce default padding for disabled predicates
        (merkleLeaves[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            (merklePathElements[i][j] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
            merklePathIndices[i][j] * disabledFlags[i] === 0;
        }
        (merkleRoots[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;

        (credMessages[i] - DEFAULT_CRED_MESSAGE) * disabledFlags[i] === 0;
        (credSignatures[i] - DEFAULT_CRED_SIGNATURE) * disabledFlags[i] === 0;
        (credPublicKeys[i] - DEFAULT_CRED_PUBLIC_KEY) * disabledFlags[i] === 0;

        (rangeValues[i] - DEFAULT_RANGE_VALUE) * disabledFlags[i] === 0;
        (rangeMin[i] - DEFAULT_RANGE_MIN) * disabledFlags[i] === 0;
        (rangeMax[i] - DEFAULT_RANGE_MAX) * disabledFlags[i] === 0;

        (ontologyCodes[i] - DEFAULT_ONTOLOGY_CODE) * disabledFlags[i] === 0;
        (ontologyPolicyIds[i] - DEFAULT_ONTOLOGY_POLICY_ID) * disabledFlags[i] === 0;
        (ontologyEpochs[i] - DEFAULT_ONTOLOGY_EPOCH) * disabledFlags[i] === 0;

        predicateValues[i] * disabledFlags[i] === 0;

        // Hash chains for parameter commitment
        merkleRootHashers[i] = Poseidon(2);
        merkleRootHashers[i].inputs[0] <== merkleRootHashChain[i];
        merkleRootHashers[i].inputs[1] <== merkleRoots[i];
        merkleRootHashChain[i + 1] <== merkleRootHashers[i].out;

        credPublicKeyHashers[i] = Poseidon(2);
        credPublicKeyHashers[i].inputs[0] <== credPublicKeyHashChain[i];
        credPublicKeyHashers[i].inputs[1] <== credPublicKeys[i];
        credPublicKeyHashChain[i + 1] <== credPublicKeyHashers[i].out;

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

    paramsDigestChain[0] <== 0;

    paramsDigestHashers[0] = Poseidon(2);
    paramsDigestHashers[0].inputs[0] <== paramsDigestChain[0];
    paramsDigestHashers[0].inputs[1] <== merkleRootHashChain[M];
    paramsDigestChain[1] <== paramsDigestHashers[0].out;

    paramsDigestHashers[1] = Poseidon(2);
    paramsDigestHashers[1].inputs[0] <== paramsDigestChain[1];
    paramsDigestHashers[1].inputs[1] <== credPublicKeyHashChain[M];
    paramsDigestChain[2] <== paramsDigestHashers[1].out;

    paramsDigestHashers[2] = Poseidon(2);
    paramsDigestHashers[2].inputs[0] <== paramsDigestChain[2];
    paramsDigestHashers[2].inputs[1] <== rangeMinHashChain[M];
    paramsDigestChain[3] <== paramsDigestHashers[2].out;

    paramsDigestHashers[3] = Poseidon(2);
    paramsDigestHashers[3].inputs[0] <== paramsDigestChain[3];
    paramsDigestHashers[3].inputs[1] <== rangeMaxHashChain[M];
    paramsDigestChain[4] <== paramsDigestHashers[3].out;

    paramsDigestHashers[4] = Poseidon(2);
    paramsDigestHashers[4].inputs[0] <== paramsDigestChain[4];
    paramsDigestHashers[4].inputs[1] <== ontologyPolicyIdHashChain[M];
    paramsDigestChain[5] <== paramsDigestHashers[4].out;

    paramsDigestHashers[5] = Poseidon(2);
    paramsDigestHashers[5].inputs[0] <== paramsDigestChain[5];
    paramsDigestHashers[5].inputs[1] <== ontologyEpochHashChain[M];
    paramsDigestChain[6] <== paramsDigestHashers[5].out;

    paramsDigestHashers[6] = Poseidon(2);
    paramsDigestHashers[6].inputs[0] <== paramsDigestChain[6];
    paramsDigestHashers[6].inputs[1] <== PARAM_DOMAIN_SEPARATOR;
    paramsDigestChain[7] <== paramsDigestHashers[6].out;

    paramsCommitment === paramsDigestChain[7];
    
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
    
    // Ensure predicate types are valid (0, 1, 2, or 3) using quadratic constraints
    for (var i = 0; i < M; i++) {
        // Check that predicateTypes[i] * (predicateTypes[i] - 1) * (predicateTypes[i] - 2) * (predicateTypes[i] - 3) == 0
        // Break down into quadratic operations
        tmp1[i] <== predicateTypes[i] * (predicateTypes[i] - 1);
        tmp2[i] <== (predicateTypes[i] - 2) * (predicateTypes[i] - 3);
        tmp3[i] <== tmp1[i] * tmp2[i];
        tmp4[i] <== tmp3[i] * (predicateTypes[i] - 4);
        tmp4[i] === 0;
    }
}
