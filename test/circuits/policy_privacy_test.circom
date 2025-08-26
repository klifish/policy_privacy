pragma circom 2.0.0;

include "../../circuits/policy_privacy_main.circom";

/*
    Test instantiation of PolicyPrivacyMain circuit with concrete parameters
    
    This creates a testable version suitable for Phase 1 development:
    - N=3: 3 requester attributes (WillPublish, IRBApproval, DataSale)  
    - M=2: 2 external predicates (ICD-10 membership, institutional credential)
    - DEPTH=10: Support policies up to 10 RPN tokens
    - K=3: ceil(log2(N+M)) = ceil(log2(5)) = 3 bits for operand indexing
    - MERKLE_LEVELS=8: Support Merkle trees up to 256 leaves
    - RANGE_BITS=32: 32-bit range proofs
*/

component main { 
    public [policyCommitment, merkleRoots, credPublicKeys, rangeMin, rangeMax, numOperations]
} = PolicyPrivacyMain(3, 2, 10, 3, 8, 32);