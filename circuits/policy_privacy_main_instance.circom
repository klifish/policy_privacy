pragma circom 2.0.0;

include "policy_privacy_main.circom";

/*
    Main instantiation of PolicyPrivacyMain circuit for Groth16 proof system
    
    This creates the main circuit instance with parameters suitable for production:
    - N=3: 3 requester attributes (WillPublish, IRBApproval, DataSale)  
    - M=2: 2 external predicates (ICD-10 membership, institutional credential)
    - DEPTH=10: Support policies up to 10 RPN tokens
    - K=3: ceil(log2(N+M)) = ceil(log2(5)) = 3 bits for operand indexing
    - MERKLE_LEVELS=8: Support Merkle trees up to 256 leaves
    - RANGE_BITS=32: 32-bit range proofs
*/

component main { 
    public [policyCommitment, merkleRoots, credPublicKeys, rangeMin, rangeMax, ontologyPolicyIds, ontologyEpochs, numOperations]
} = PolicyPrivacyMain(3, 2, 10, 3, 8, 32);