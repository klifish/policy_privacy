"""
Privacy Cost Model

Three-dimensional cost model:
    1. Gas overhead G(P) — on-chain computation cost
    2. Proof generation time T(P) — off-chain latency
    3. Information leakage L(P) — privacy loss metric

Composite cost:
    CoP(P) = alpha * G_norm + beta * T_norm + (1-alpha-beta) * L_norm

Gas constants from ui/config/gas.ts:
    - backend callGasLimit: 800,000
    - backendHighStorage callGasLimit: 4,000,000
    - ZK verification: ~280,000 gas
    - Gas padding target: 800,000
"""

from dataclasses import dataclass
from typing import Dict, Optional
import numpy as np

from policy_model import DUOPolicy, PRED_COUNT


# ---------------------------------------------------------------------------
# Gas model constants (from ui/config/gas.ts)
# ---------------------------------------------------------------------------

GAS_ZK_VERIFICATION = 280_000       # Groth16 on-chain verification
GAS_PADDING_TARGET = 800_000        # backend callGasLimit
GAS_HIGH_STORAGE_TARGET = 4_000_000 # backendHighStorage callGasLimit
GAS_BASE_TX = 21_000                # EVM base transaction cost
GAS_SSTORE_NEW = 20_000             # SSTORE for new 32-byte slot
GAS_CALLDATA_NONZERO = 16           # per non-zero byte
GAS_CALLDATA_ZERO = 4               # per zero byte

# Estimated per-operation gas costs
GAS_COMMIT_POLICY_BASE = 50_000     # commitPolicy without padding
GAS_REQUEST_ACCESS_BASE = 100_000   # requestAccess without ZK
GAS_ENCRYPTED_RESPONSE_PER_KB = 36_000  # ~36k gas per KB of encrypted data
GAS_VERIFICATION_LIMIT = 78_000     # verificationGasLimit
GAS_PAYMASTER_VERIFICATION = 34_000 # paymasterVerificationGasLimit

# Proof generation time estimates (seconds, measured empirically)
PROOF_TIME_BASE = 3.0               # Base proof generation time
PROOF_TIME_PER_PREDICATE = 1.5      # Additional time per active predicate
PROOF_TIME_MERKLE_OVERHEAD = 0.5    # Extra for Merkle path computation

# Encrypted payload size estimates (bytes)
PAYLOAD_BASE_SIZE = 500             # Base JSON structure
PAYLOAD_PER_PREDICATE = 400         # Per active predicate
PAYLOAD_MERKLE_OVERHEAD = 200       # Extra for Merkle predicates


# ---------------------------------------------------------------------------
# Gas cost model
# ---------------------------------------------------------------------------

@dataclass
class GasCostBreakdown:
    """Detailed gas cost breakdown for a policy operation."""
    zk_verification: int
    gas_padding: int
    encrypted_sharing: int
    commit_policy: int
    total_with_padding: int
    total_without_padding: int
    padding_ratio: float        # gamma = padding / total
    efficiency: float           # actual / limit (Alchemy requires >= 0.4)


def compute_gas_cost(policy: DUOPolicy) -> GasCostBreakdown:
    """
    Compute gas cost breakdown for a policy.

    With gas padding enabled, total is always ~800k (the padding target).
    Without padding, cost depends on policy complexity.
    """
    n_predicates = policy.predicate_count

    # ZK verification cost (constant for Groth16)
    g_zk = GAS_ZK_VERIFICATION

    # Encrypted policy sharing (depends on payload size)
    payload_size = PAYLOAD_BASE_SIZE + n_predicates * PAYLOAD_PER_PREDICATE
    if n_predicates > 0:
        payload_size += n_predicates * PAYLOAD_MERKLE_OVERHEAD
    payload_kb = payload_size / 1024
    g_encrypt = int(payload_kb * GAS_ENCRYPTED_RESPONSE_PER_KB)

    # Commit policy
    g_commit = GAS_COMMIT_POLICY_BASE

    # Total without padding
    g_actual = g_zk + g_commit + GAS_BASE_TX
    total_no_pad = g_actual

    # With gas padding
    total_with_pad = GAS_PADDING_TARGET
    g_padding = max(0, total_with_pad - g_actual)

    # Gas efficiency
    efficiency = g_actual / total_with_pad if total_with_pad > 0 else 0

    return GasCostBreakdown(
        zk_verification=g_zk,
        gas_padding=g_padding,
        encrypted_sharing=g_encrypt,
        commit_policy=g_commit,
        total_with_padding=total_with_pad,
        total_without_padding=total_no_pad,
        padding_ratio=g_padding / total_with_pad if total_with_pad > 0 else 0,
        efficiency=efficiency,
    )


# ---------------------------------------------------------------------------
# Proof time model
# ---------------------------------------------------------------------------

def compute_proof_time(policy: DUOPolicy) -> float:
    """
    Estimate ZK proof generation time in seconds.

    Model: T = T_base + n_pred * T_per_pred + n_merkle * T_merkle
    """
    n_predicates = policy.predicate_count
    t = PROOF_TIME_BASE + n_predicates * PROOF_TIME_PER_PREDICATE

    # All predicates in current system use Merkle proofs
    if n_predicates > 0:
        t += n_predicates * PROOF_TIME_MERKLE_OVERHEAD

    return t


# ---------------------------------------------------------------------------
# Information leakage model
# ---------------------------------------------------------------------------

def compute_leakage(policy: DUOPolicy, gas_variance_pct: float = 3.0) -> float:
    """
    Estimate information leakage score L(P).

    With gas padding enabled:
        - Gas variance ~3-5% remains (not perfectly uniform)
        - Leakage is proportional to variance and predicate count

    L(P) in [0, 1] where 0 = perfect privacy, 1 = full leakage

    Components:
        L_gas:  gas side-channel leakage (from padding variance)
        L_meta: metadata leakage (IPFS hash is public)
        L_timing: proof generation time correlation
    """
    n_predicates = policy.predicate_count

    # Gas leakage: bounded by padding variance
    # After padding, variance is ~3-5% of target
    l_gas = gas_variance_pct / 100.0 * 0.5  # Scale to [0, ~0.025]

    # Metadata leakage: policy ID is public, number of events visible
    l_meta = 0.02  # Small constant (IPFS hash reveals nothing about policy content)

    # Timing leakage: more predicates = longer proof time
    # Normalized: 0 predicates = 0, 5 predicates = max timing leakage
    l_timing = (n_predicates / PRED_COUNT) * 0.05

    # Composite leakage (max of dimensions, as in experiment framework)
    return max(l_gas, l_meta, l_timing)


# ---------------------------------------------------------------------------
# Composite Cost of Privacy
# ---------------------------------------------------------------------------

@dataclass
class PrivacyCost:
    """Complete privacy cost for a policy."""
    gas: GasCostBreakdown
    proof_time: float           # seconds
    leakage: float              # [0, 1]
    composite: float            # weighted combination
    gas_overhead_ratio: float   # (padded - unpadded) / padded


def compute_privacy_cost(policy: DUOPolicy,
                         alpha: float = 0.5,
                         beta: float = 0.3) -> PrivacyCost:
    """
    Compute the total Cost of Privacy (CoP).

    CoP = alpha * G_norm + beta * T_norm + (1-alpha-beta) * L_norm

    Normalization:
        G_norm: total_with_padding / GAS_HIGH_STORAGE_TARGET (max possible)
        T_norm: proof_time / 30.0 (max expected ~30s)
        L_norm: leakage (already in [0, 1])

    Args:
        policy: the DUO policy to evaluate
        alpha: weight for gas dimension
        beta: weight for time dimension
    """
    gas = compute_gas_cost(policy)
    proof_time = compute_proof_time(policy)
    leakage = compute_leakage(policy)

    # Normalize
    g_norm = gas.total_with_padding / GAS_HIGH_STORAGE_TARGET
    t_norm = min(proof_time / 30.0, 1.0)
    l_norm = leakage

    gamma = 1.0 - alpha - beta
    composite = alpha * g_norm + beta * t_norm + gamma * l_norm

    gas_overhead = (gas.total_with_padding - gas.total_without_padding) / gas.total_with_padding

    return PrivacyCost(
        gas=gas,
        proof_time=proof_time,
        leakage=leakage,
        composite=composite,
        gas_overhead_ratio=gas_overhead,
    )


# ---------------------------------------------------------------------------
# Cost comparison utilities
# ---------------------------------------------------------------------------

def compute_no_privacy_cost(policy: DUOPolicy) -> Dict:
    """
    Estimate costs for a hypothetical no-privacy baseline.

    No ZK, no padding, no encryption — just plaintext policy check.
    """
    n_predicates = policy.predicate_count

    # Without ZK: simple on-chain comparison
    gas_no_zk = GAS_BASE_TX + 50_000 + n_predicates * 5_000  # Simple SLOAD + compare
    # Without encryption: no extra round-trip
    # Without padding: actual gas only

    return {
        "gas_total": gas_no_zk,
        "proof_time": 0.0,
        "leakage": 1.0,  # Full leakage — everything visible
        "extra_round_trips": 0,
    }


def compute_privacy_overhead(policy: DUOPolicy) -> Dict:
    """Compute the overhead of privacy vs no-privacy baseline."""
    priv = compute_privacy_cost(policy)
    no_priv = compute_no_privacy_cost(policy)

    return {
        "gas_multiplier": priv.gas.total_with_padding / max(no_priv["gas_total"], 1),
        "gas_absolute_overhead": priv.gas.total_with_padding - no_priv["gas_total"],
        "time_overhead_seconds": priv.proof_time - no_priv["proof_time"],
        "leakage_reduction": no_priv["leakage"] - priv.leakage,
        "privacy_cost": priv,
        "no_privacy_cost": no_priv,
    }
