pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/poseidon.circom";

/*
    IdentityBinding Circuit
    =======================

    Purpose
    -------
    This is the small "proof₁" circuit run exclusively by the Data Requester
    in Variant 3 of the TTP-assisted access flow.

    The Requester proves: "I know a secret key sk_req such that
    Poseidon(sk_req) == pid", where pid is their public identity commitment.

    The proof is sent to the TTP off-chain. The TTP:
      1. Verifies this proof (confirms the requester legitimately owns pid)
      2. Uses pid (now trusted) as a public input to PolicyPrivacyMainTTP
         in order to generate the full policy compliance proof (proof₂)

    Security Properties
    -------------------
    - sk_req NEVER leaves the Requester (it is a private witness input)
    - pid is the only identity-related value shared with the TTP
    - Knowing pid alone does not allow impersonation: pid is a one-way
      commitment (Poseidon is collision-resistant in the BN254 scalar field)
    - A valid proof₁ proves knowledge of sk_req without revealing it

    Constraint Budget
    -----------------
    Poseidon(1): ~240 constraints
    Equality check: 1 constraint
    Total: ~241 constraints (negligible proving time, <100ms)

    Usage
    -----
    Requester runs:
      snarkjs groth16 fullProve(
        { skReq: <private_key> },
        identity_binding.wasm,
        identity_binding_final.zkey
      )
      → { proof, publicSignals: [pid] }

    Then sends { proof₁, publicSignals: [pid] } to TTP over a secure channel.
    The TTP verifies proof₁ and extracts pid for use in PolicyPrivacyMainTTP.

    Public Signals
    --------------
    [0]: pid = Poseidon(sk_req)  — the requester's identity commitment
*/

template IdentityBinding() {
    // ── Private Inputs ────────────────────────────────────────────────────
    // The requester's secret identity key.
    // This MUST remain private and never be shared with the TTP.
    signal input skReq;

    // ── Public Inputs ─────────────────────────────────────────────────────
    // The requester's public identity commitment: pid = Poseidon(skReq).
    // This is what the Requester shares with the TTP as proof of identity ownership.
    signal input pid;

    // ── Core Constraint ───────────────────────────────────────────────────
    // Prove: Poseidon(skReq) == pid
    // The prover cannot fake this: given only pid, finding skReq requires
    // inverting Poseidon (computationally infeasible in BN254 scalar field).

    component pidHasher = Poseidon(1);
    pidHasher.inputs[0] <== skReq;

    // Enforce equality — this is the sole constraint of the circuit
    pidHasher.out === pid;
}

// ── Instantiation ─────────────────────────────────────────────────────────
// pid is public so the TTP (and the verifier) can read the identity commitment.
component main { public [pid] } = IdentityBinding();
