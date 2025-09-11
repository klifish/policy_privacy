pragma circom 2.0.0;

include "interpreter/postfix_policy_interpreter.circom";
include "gadgets/policy_commitment.circom";
include "gadgets/external_predicates.circom";
include "../node_modules/circomlib/circuits/gates.circom";

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
    
    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC INPUTS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Policy commitment h = Com(P;r)
    signal input policyCommitment;
    
    // Public parameters pp for external predicate verification
    signal input merkleRoots[M];                        // Merkle tree roots
    signal input credPublicKeys[M];                     // Institution public keys (simplified)
    signal input rangeMin[M];                           // Range minimum values
    signal input rangeMax[M];                           // Range maximum values
    signal input ontologyPolicyIds[M];                  // Policy IDs for ontology-linked terms
    signal input ontologyEpochs[M];                     // Policy epochs for ontology-linked terms
    
    // Policy evaluation inputs (made public for verification)
    signal input numOperations;                         // Actual policy length
    
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
    component finalAnd;
    
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
    // 2. VERIFY EXTERNAL PREDICATES: Generate p from external proofs  
    // ───────────────────────────────────────────────────────────────────────
    
    for (var i = 0; i < M; i++) {
        predicateVerifiers[i] = ExternalPredicateVerifier(MERKLE_LEVELS, RANGE_BITS);
        
        // Connect predicate type
        predicateVerifiers[i].predicateType <== predicateTypes[i];
        
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
    }
    
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
        tmp2[i] <== tmp1[i] * (predicateTypes[i] - 2);
        tmp3[i] <== tmp2[i] * (predicateTypes[i] - 3);
        tmp3[i] === 0;
    }
}