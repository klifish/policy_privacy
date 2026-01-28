pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/*
    Ownership Commitment Verifier
    =============================

    This circuit proves ownership of a policy without revealing the secret.

    Used for policy revocation: only the original creator who knows the
    ownershipSecret can revoke the policy.

    Commitment scheme: ownershipCommitment = Poseidon(ownershipSecret)

    To revoke a policy, the owner provides a ZK proof that they know the
    secret corresponding to the stored ownershipCommitment.
*/

template OwnershipProof() {
    // Private input - known only to policy owner
    signal input ownershipSecret;

    // Public input - stored on-chain when policy was committed
    signal input expectedOwnershipCommitment;

    // Output - indicates if proof is valid
    signal output isValid;

    // Compute commitment from secret
    component hasher = Poseidon(1);
    hasher.inputs[0] <== ownershipSecret;

    // Verify the commitment matches expected value
    component check = IsEqual();
    check.in[0] <== hasher.out;
    check.in[1] <== expectedOwnershipCommitment;

    isValid <== check.out;
}

component main {public [expectedOwnershipCommitment]} = OwnershipProof();
