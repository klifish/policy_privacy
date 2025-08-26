pragma circom 2.0.0;

include "./gadgets/policy_commitment.circom";

/*
    Test for PolicyCommitmentVerifier with concrete parameters
*/

component main {
    public [expectedCommitment]  
} = PolicyCommitmentVerifier(10);