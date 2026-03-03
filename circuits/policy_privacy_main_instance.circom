pragma circom 2.0.0;

include "policy_privacy_main.circom";

/*
    Main instantiation of PolicyPrivacyMain circuit for Groth16 proof system
    (Untrusted Data Requester model with EdDSA credential verification)

    Parameters:
    - N=6: 6 requester attributes (GR, DS, RS, POA, GS, CC)
    - M=5: up to 5 external predicates
    - DEPTH=20: Support policies up to 20 RPN tokens
    - K=4: ceil(log2(N+M)) = ceil(log2(11)) = 4 bits for operand indexing
    - MERKLE_LEVELS=8: Support Merkle trees up to 256 leaves
    - RANGE_BITS=32: 32-bit range proofs

    Public signals (41 total):
    - Outputs: isAuthorized, nullifier
    - Inputs: policyCommitment, paramsCommitment, merkleRoots[5],
              credPubKeyAx[5], credPubKeyAy[5], rangeMin[5], rangeMax[5],
              ontologyPolicyIds[5], ontologyEpochs[5], scopeHash, currentTimestamp
*/

component main {
    public [
        policyCommitment, paramsCommitment,
        merkleRoots,
        credPubKeyAx, credPubKeyAy,
        rangeMin, rangeMax,
        ontologyPolicyIds, ontologyEpochs,
        scopeHash, currentTimestamp
    ]
} = PolicyPrivacyMain(6, 5, 20, 4, 8, 32);
