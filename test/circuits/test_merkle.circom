pragma circom 2.0.0;

include "../../circuits/gadgets/external_predicates.circom";

/*
    Test for MerkleProofVerifier with concrete parameters
*/

component main {
    public [root]  
} = MerkleProofVerifier(8);