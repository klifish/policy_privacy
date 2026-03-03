pragma circom 2.0.0;

include "policy_privacy_main_ttp.circom";

/*
    TTP Instance of PolicyPrivacyMainTTP — proof₂ in Variant 3
    ===========================================================

    Instantiates PolicyPrivacyMainTTP with the same concrete parameters as
    PolicyPrivacyMain (N=6, M=5, DEPTH=20, K=4, MERKLE_LEVELS=8, RANGE_BITS=32).

    Public Signals (42 total):
    ────────────────────────────────────────────────────────────────
    Index  Signal
    ────────────────────────────────────────────────────────────────
    [0]    isAuthorized          — output: 1 if policy is satisfied
    [1]    nullifier             — output: Poseidon(pid, scopeHash)
    [2]    pid                   — requester identity commitment (NEW)
    [3]    policyCommitment      — on-chain policy commitment
    [4]    paramsCommitment      — on-chain params commitment
    [5..9] merkleRoots[5]        — Merkle roots for set predicates
    [10..14] credPubKeyAx[5]     — Issuer Baby Jubjub public key x
    [15..19] credPubKeyAy[5]     — Issuer Baby Jubjub public key y
    [20..24] rangeMin[5]         — Range lower bounds
    [25..29] rangeMax[5]         — Range upper bounds
    [30..34] ontologyPolicyIds[5]— Ontology policy IDs
    [35..39] ontologyEpochs[5]   — Ontology epochs
    [40]   scopeHash             — Poseidon(datasetId, policyId)
    [41]   currentTimestamp      — Block timestamp for expiry check
    ────────────────────────────────────────────────────────────────

    Compared to policy_privacy_main_instance.circom (41 signals),
    this instance has one additional public signal: pid at index [2].
    The ACM function requestAccessAsTTP reads pid = pubSignals[2].
*/

component main {
    public [
        pid,
        policyCommitment, paramsCommitment,
        merkleRoots,
        credPubKeyAx, credPubKeyAy,
        rangeMin, rangeMax,
        ontologyPolicyIds, ontologyEpochs,
        scopeHash, currentTimestamp
    ]
} = PolicyPrivacyMainTTP(6, 5, 20, 4, 8, 32);
