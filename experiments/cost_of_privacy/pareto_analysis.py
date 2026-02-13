"""
Pareto Analysis and Constrained Optimization

Finds the Pareto frontier of privacy-utility tradeoffs and solves
the constrained optimal policy design problem:

    min   CoP(P)
    s.t.  ASR(P, D) >= tau
          L(P) <= epsilon
"""

import numpy as np
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from policy_model import (
    DUOPolicy, build_and_policy, build_or_policy, build_mixed_policy,
    compute_asr_analytical, generate_random_policies, DUO_ATTRIBUTES,
    NUM_ATTRIBUTES
)
from population_model import RequesterPopulation, PopulationScenario
from privacy_cost import compute_privacy_cost, PrivacyCost


# ---------------------------------------------------------------------------
# Pareto frontier extraction
# ---------------------------------------------------------------------------

@dataclass
class PolicyPoint:
    """A point in the (utility, cost) space."""
    policy: DUOPolicy
    utility: float      # ASR
    cost: float         # CoP composite
    gas_cost: int       # Raw gas
    proof_time: float   # Seconds
    leakage: float      # [0, 1]
    is_pareto: bool = False


def compute_pareto_frontier(policies: List[DUOPolicy],
                            population: RequesterPopulation,
                            alpha: float = 0.5,
                            beta: float = 0.3) -> List[PolicyPoint]:
    """
    Compute points in the (utility, cost) space and identify Pareto-optimal policies.

    A policy P* is Pareto-optimal if no P' exists such that:
        U(P') >= U(P*) AND C(P') <= C(P*) with at least one strict inequality.
    """
    points = []
    for policy in policies:
        asr = compute_asr_analytical(policy, population)
        priv_cost = compute_privacy_cost(policy, alpha, beta)

        points.append(PolicyPoint(
            policy=policy,
            utility=asr,
            cost=priv_cost.composite,
            gas_cost=priv_cost.gas.total_with_padding,
            proof_time=priv_cost.proof_time,
            leakage=priv_cost.leakage,
        ))

    # Extract Pareto frontier
    # Sort by utility descending
    points.sort(key=lambda p: -p.utility)

    # A point is Pareto-optimal if no other point has both higher utility and lower cost
    n = len(points)
    for i in range(n):
        dominated = False
        for j in range(n):
            if i == j:
                continue
            if (points[j].utility >= points[i].utility and
                points[j].cost <= points[i].cost and
                (points[j].utility > points[i].utility or
                 points[j].cost < points[i].cost)):
                dominated = True
                break
        points[i].is_pareto = not dominated

    return points


def extract_frontier(points: List[PolicyPoint]) -> List[PolicyPoint]:
    """Extract only Pareto-optimal points, sorted by utility."""
    frontier = [p for p in points if p.is_pareto]
    frontier.sort(key=lambda p: p.utility)
    return frontier


# ---------------------------------------------------------------------------
# Constrained optimization
# ---------------------------------------------------------------------------

@dataclass
class OptimalPolicyResult:
    """Result of constrained optimization."""
    policy: Optional[DUOPolicy]
    asr: float
    cost: float
    feasible: bool
    tau: float          # Target ASR
    epsilon: float      # Max leakage
    description: str


def find_optimal_policy(population: RequesterPopulation,
                        tau: float,
                        epsilon: float,
                        n_candidates: int = 5000,
                        alpha: float = 0.5,
                        beta: float = 0.3,
                        rng: Optional[np.random.Generator] = None) -> OptimalPolicyResult:
    """
    Find the optimal policy that minimizes CoP subject to ASR >= tau and L <= epsilon.

    Uses random search over the policy space (tractable since the space is relatively small).

    Args:
        population: requester population model
        tau: minimum required access success rate
        epsilon: maximum allowed information leakage
        n_candidates: number of random policies to evaluate
        alpha, beta: cost weights
    """
    if rng is None:
        rng = np.random.default_rng(42)

    candidates = generate_random_policies(n_candidates, rng)

    # Also add structured policies for better coverage
    # Single-attribute GR policy (trivially optimal for high tau)
    candidates.append(build_and_policy([0]))
    # All OR
    candidates.append(build_or_policy([0, 1, 2, 3, 4, 5]))

    best_policy = None
    best_cost = float("inf")
    best_asr = 0.0

    for policy in candidates:
        priv_cost = compute_privacy_cost(policy, alpha, beta)

        # Check leakage constraint
        if priv_cost.leakage > epsilon:
            continue

        asr = compute_asr_analytical(policy, population)

        # Check ASR constraint
        if asr < tau:
            continue

        # Minimize cost among feasible policies
        if priv_cost.composite < best_cost:
            best_cost = priv_cost.composite
            best_policy = policy
            best_asr = asr

    if best_policy is None:
        return OptimalPolicyResult(
            policy=None, asr=0.0, cost=float("inf"), feasible=False,
            tau=tau, epsilon=epsilon,
            description=f"No feasible policy found for tau={tau}, epsilon={epsilon}"
        )

    # Build description
    attrs = [DUO_ATTRIBUTES[i]["code"] for i in best_policy.active_attrs]
    logic = best_policy.logic_type.name
    desc = f"{logic}: {' + '.join(attrs)}, selectivity={best_policy.selectivity}"

    return OptimalPolicyResult(
        policy=best_policy, asr=best_asr, cost=best_cost, feasible=True,
        tau=tau, epsilon=epsilon, description=desc
    )


def sweep_optimal_policies(population: RequesterPopulation,
                           tau_values: List[float] = None,
                           epsilon_values: List[float] = None,
                           **kwargs) -> List[OptimalPolicyResult]:
    """
    Run constrained optimization over a grid of (tau, epsilon) values.

    Returns optimal policies for each combination.
    """
    if tau_values is None:
        tau_values = [0.1, 0.3, 0.5, 0.7, 0.9]
    if epsilon_values is None:
        epsilon_values = [0.01, 0.05, 0.10]

    results = []
    for tau in tau_values:
        for epsilon in epsilon_values:
            result = find_optimal_policy(population, tau, epsilon, **kwargs)
            results.append(result)

    return results


# ---------------------------------------------------------------------------
# Sensitivity analysis
# ---------------------------------------------------------------------------

def sensitivity_analysis(policies: List[DUOPolicy],
                         scenarios: Dict[str, PopulationScenario],
                         ) -> Dict[str, Dict[str, float]]:
    """
    Compute ASR for each policy under each population scenario.

    Returns: {scenario_name: {policy_id: asr}}
    """
    results = {}
    for sc_name, scenario in scenarios.items():
        population = RequesterPopulation(scenario)
        results[sc_name] = {}
        for i, policy in enumerate(policies):
            asr = compute_asr_analytical(policy, population)
            results[sc_name][f"policy_{i}"] = asr

    return results
