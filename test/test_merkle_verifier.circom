pragma circom 2.0.0;

include "../circuits/gadgets/external_predicates.circom";

// Test circuit for MerkleProofVerifier alone
template TestMerkleProofVerifier(LEVELS) {
    signal input leaf;
    signal input pathElements[LEVELS];
    signal input pathIndices[LEVELS];
    signal input root;
    signal output isValid;
    
    component verifier = MerkleProofVerifier(LEVELS);
    verifier.leaf <== leaf;
    verifier.root <== root;
    for (var i = 0; i < LEVELS; i++) {
        verifier.pathElements[i] <== pathElements[i];
        verifier.pathIndices[i] <== pathIndices[i];
    }
    
    isValid <== verifier.isValid;
}

component main { public [leaf, root] } = TestMerkleProofVerifier(8);