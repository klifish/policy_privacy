pragma circom 2.0.0;

include "policy_privacy_provider_proves.circom";

/*
    Provider-Proves Instance of PolicyPrivacyProviderProves
    =======================================================

    Instantiates PolicyPrivacyProviderProves with concrete parameters:
    N=6, M=5, DEPTH=20, K=4, MERKLE_LEVELS=8, RANGE_BITS=32.

    Public Signals (41 total):
    ────────────────────────────────────────────────────────────────
    Index  Signal
    ────────────────────────────────────────────────────────────────
    [0]    isAuthorized          — output: 1 if policy is satisfied
    [1]    requesterAddress      — Requester's Ethereum address (uint160)
    [2]    policyCommitment      — on-chain policy commitment
    [3]    paramsCommitment      — on-chain params commitment
    [4..8] merkleRoots[5]        — Merkle roots for set predicates
    [9..13] credPubKeyAx[5]      — Issuer Baby Jubjub public key x
    [14..18] credPubKeyAy[5]     — Issuer Baby Jubjub public key y
    [19..23] rangeMin[5]         — Range lower bounds
    [24..28] rangeMax[5]         — Range upper bounds
    [29..33] ontologyPolicyIds[5]— Ontology policy IDs
    [34..38] ontologyEpochs[5]   — Ontology epochs
    [39]   scopeHash             — Poseidon(datasetId, policyId)
    [40]   currentTimestamp      — Block timestamp for expiry check
    ────────────────────────────────────────────────────────────────

    Compared to PolicyPrivacyMain (Path A, 41 signals):
    - pubSignals[1] is requesterAddress instead of nullifier
    - No pid, no nullifier — identity bound by Ethereum address
    - Credential message uses requesterAddress instead of pid
*/

component main {
    public [
        requesterAddress,
        policyCommitment, paramsCommitment,
        merkleRoots,
        credPubKeyAx, credPubKeyAy,
        rangeMin, rangeMax,
        ontologyPolicyIds, ontologyEpochs,
        scopeHash, currentTimestamp
    ]
} = PolicyPrivacyProviderProves(6, 5, 20, 4, 8, 32);
