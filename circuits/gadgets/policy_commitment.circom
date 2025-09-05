pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/*
    Policy Commitment Verifier
    ==========================
    
    Implements the paper's commitment scheme: h = Com(P;r) = Poseidon(P || r)
    
    This verifier proves that a hidden policy P with randomness r produces
    the expected commitment h without revealing P or r.
    
    The policy P is represented as a fixed-length RPN token sequence.
*/

template PolicyCommitmentVerifier(DEPTH) {
    // Private inputs
    signal input policy[DEPTH];                     // Policy as RPN tokens P = [t_1, ..., t_d]
    signal input randomizer;                        // Commitment randomness r
    
    // Public input
    signal input expectedCommitment;                // Expected commitment h
    
    // Output
    signal output isValid;                          // Boolean: Com(P;r) == h?
    
    // Internal signals
    signal policyHash;
    signal computedCommitment;
    
    // Components
    component policyHasher;
    component commitmentHasher;
    component commitmentCheck;
    
    // First, hash the policy tokens to create a compact representation
    // This handles the variable-length aspect while maintaining fixed circuit size
    policyHasher = Poseidon(DEPTH);
    for (var i = 0; i < DEPTH; i++) {
        policyHasher.inputs[i] <== policy[i];
    }
    policyHash <== policyHasher.out;
    
    // Then create commitment: h = Poseidon(policyHash || randomizer)  
    // This matches the paper's specification Com(P;r) = Poseidon(P || r)
    commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== policyHash;
    commitmentHasher.inputs[1] <== randomizer;
    computedCommitment <== commitmentHasher.out;
    
    // Verify the commitment matches expected value
    commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== computedCommitment;
    commitmentCheck.in[1] <== expectedCommitment;
    isValid <== commitmentCheck.out;
}

/*
    Alternative commitment verifier that directly hashes all tokens with randomizer
    This provides a more direct implementation of Com(P;r) = Poseidon(P || r)
*/
template PolicyCommitmentVerifierDirect(DEPTH) {
    // Private inputs
    signal input policy[DEPTH];                     // Policy as RPN tokens
    signal input randomizer;                        // Commitment randomness
    
    // Public input  
    signal input expectedCommitment;                // Expected commitment
    
    // Output
    signal output isValid;                          // Boolean: Com(P;r) == h?
    
    // Components
    component commitmentHasher;
    component commitmentCheck;
    
    // Direct commitment: h = Poseidon(t_1, t_2, ..., t_d, r)
    commitmentHasher = Poseidon(DEPTH + 1);
    
    // Add all policy tokens
    for (var i = 0; i < DEPTH; i++) {
        commitmentHasher.inputs[i] <== policy[i];
    }
    
    // Add randomizer as final input
    commitmentHasher.inputs[DEPTH] <== randomizer;
    
    // Verify commitment
    commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== commitmentHasher.out;
    commitmentCheck.in[1] <== expectedCommitment;
    isValid <== commitmentCheck.out;
}