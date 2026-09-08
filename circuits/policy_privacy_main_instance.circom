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

/*
    Public interface (commitment-only):
    pubSignals = [isAuthorized, policyCommitment, paramsCommitment, contextHash]

    Per-predicate parameters (merkleRoots, credPublicKeys, rangeMin/Max,
    ontologyPolicyIds, ontologyEpochs) are private witness inputs. They are
    bound to paramsCommitment in-circuit via the Poseidon digest chain, and
    the contract compares paramsCommitment against the value committed at
    commitPolicy time. Exposing them publicly leaks predicate-slot occupancy
    through calldata zero-byte gas pricing (EIP-2028).

    contextHash = Poseidon(id_req || id_res || nonce) binds the proof to the
    authorization context. The three context values themselves remain private
    witness inputs for the same EIP-2028 reason and to keep the requester
    pseudonym off-chain; the ACM recomputes the digest from the transaction
    parameters and rejects a mismatch.
*/
component main {
    public [policyCommitment, paramsCommitment, contextHash]
} = PolicyPrivacyMain(6, 5, 20, 4, 8, 32);
