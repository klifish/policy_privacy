pragma circom 2.0.0;

include "../../circuits/gadgets/policy_commitment.circom";

/*
    Simple test for PolicyCommitmentVerifier component with concrete parameters
*/

component main {
    public [expectedCommitment]  
} = PolicyCommitmentVerifierDirect(10);