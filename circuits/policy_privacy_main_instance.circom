pragma circom 2.0.0;

include "policy_privacy_main.circom";

/*
    Main instantiation of PolicyPrivacyMain circuit for Groth16 proof system

    This creates the main circuit instance with parameters suitable for production:
    - N=13: complete non-procedural DUO attribute set
    - M=11: fixed slots for ontology, requester restrictions, obligations and DUO profile
    - DEPTH=64: supports every legal non-procedural DUO combination
    - K=5: ceil(log2(N+M+4)) bits for operands/operators
    - MERKLE_LEVELS=8: Support Merkle trees up to 256 leaves
    - RANGE_BITS=32: 32-bit range proofs
*/

/*
    Public interface (commitment-only):
    pubSignals = [isAuthorized, policyCommitment, paramsCommitment, contextHash,
                  requestEpoch]

    Per-predicate parameters (merkleRoots, credPublicKeys, rangeMin/Max,
    ontologyPolicyIds, ontologyEpochs) are private witness inputs. They are
    bound to paramsCommitment in-circuit via the Poseidon digest chain, and
    the contract compares paramsCommitment against the value committed at
    commitPolicy time. Exposing them publicly leaks predicate-slot occupancy
    through calldata zero-byte gas pricing (EIP-2028).

    contextHash = Poseidon(id_req || id_res || nonce) binds the proof to the
    authorization context. The three values are private circuit inputs and are
    not separate Groth16 public signals. In requestAccessBound they are also
    supplied as public transaction calldata (and selected values are recorded
    on-chain), allowing the ACM to recompute the digest and reject a mismatch.
*/
component main {
    public [policyCommitment, paramsCommitment, contextHash, requestEpoch]
} = PolicyPrivacyMain(13, 11, 64, 5, 8, 32);
