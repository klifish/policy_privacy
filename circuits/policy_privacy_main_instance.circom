pragma circom 2.0.0;

include "policy_privacy_main.circom";

/*
    Main instantiation of PolicyPrivacyMain circuit for Groth16 proof system

    This creates the main circuit instance with parameters suitable for production:
    - N=6: 6 requester attributes (GR, DS, RS, POA, GS, CC)
    - M=5: up to 5 external predicates (ICD-10, OBI, HANCESTRO, ISO, SNOMED)
    - DEPTH=20: Support policies up to 20 RPN tokens (enables all 6 attributes simultaneously)
    - K=4: ceil(log2(N+M)) = ceil(log2(11)) = 4 bits for operand indexing
    - MERKLE_LEVELS=8: Support Merkle trees up to 256 leaves
    - RANGE_BITS=32: 32-bit range proofs
*/

component main {
    public [policyCommitment, paramsCommitment, merkleRoots, credPublicKeys, rangeMin, rangeMax, ontologyPolicyIds, ontologyEpochs]
} = PolicyPrivacyMain(6, 5, 20, 4, 8, 32);
