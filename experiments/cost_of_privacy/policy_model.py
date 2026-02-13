"""
Policy Model and Access Success Rate (ASR) Calculator

Implements:
1. RPN policy evaluation (ported from JS evaluatePolicyTokens)
2. Analytical ASR computation for AND/OR/mixed policies
3. Monte Carlo ASR estimation for validation
4. Policy generation utilities
5. Prior vs Posterior ASR comparison

Two ASR metrics:
    ASR_prior(P, D):     P(random requester from population D satisfies P)
    ASR_posterior(P, D):  P(motivated requester who wants access satisfies P)

Note: The ZK circuit supports AND/OR/NOT. The current UI only generates AND.
This model analyzes the full protocol capability space.

Mathematical formulation:
    ASR(P, D) = sum_r D(r) * I[phi(sat_0(R), ..., sat_5(R)) = true]

For AND:  ASR = prod_{i in T} p_i(W_i)
For OR:   ASR = 1 - prod_{i in T} (1 - p_i(W_i))
"""

import numpy as np
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple
from enum import IntEnum
from itertools import product as itertools_product

from population_model import (
    DUO_ATTRIBUTES, NUM_ATTRIBUTES, NUM_PREDICATES,
    RequesterPopulation, PopulationScenario, ConditionalRequesterModel
)


# ---------------------------------------------------------------------------
# Constants (mirrored from ui/lib/policy.ts and circuits)
# ---------------------------------------------------------------------------

POLICY_DEPTH = 20       # Max RPN tokens
ATTR_COUNT = 6          # N = 6 attributes
PRED_COUNT = 5          # M = 5 predicates
TOKEN_AND = ATTR_COUNT + PRED_COUNT      # 11
TOKEN_OR  = ATTR_COUNT + PRED_COUNT + 1  # 12
TOKEN_NOT = ATTR_COUNT + PRED_COUNT + 2  # 13


class LogicType(IntEnum):
    AND_ONLY = 0
    OR_ONLY = 1
    AND_OR_MIXED = 2
    NEGATION = 3


# ---------------------------------------------------------------------------
# RPN Policy Evaluation (ported from JS)
# ---------------------------------------------------------------------------

def evaluate_policy_tokens(tokens: List[int], num_operations: int,
                           attrs: List[int], predicate_truth: List[int]) -> bool:
    """
    Evaluate an RPN policy expression.

    Ported from experiments/policy_content_hiding/data_generator.js:867-914

    Args:
        tokens: RPN token array (length <= POLICY_DEPTH)
        num_operations: number of active tokens to process
        attrs: requester attribute flags [0/1] * 6
        predicate_truth: predicate satisfaction flags [0/1] * 5

    Returns:
        True if the policy is satisfied
    """
    if not tokens:
        return False

    op_count = min(num_operations, len(tokens))
    stack: List[bool] = []

    for i in range(op_count):
        token = tokens[i]

        # Attribute operand (0-5)
        if token < ATTR_COUNT:
            stack.append(bool(attrs[token]))
            continue

        # Predicate operand (6-10)
        if token < ATTR_COUNT + PRED_COUNT:
            slot = token - ATTR_COUNT
            val = predicate_truth[slot] if slot < len(predicate_truth) else 0
            stack.append(bool(val))
            continue

        # Operator
        op_code = token - ATTR_COUNT - PRED_COUNT

        if op_code == 0:  # AND
            if len(stack) < 2:
                return False
            right = stack.pop()
            left = stack.pop()
            stack.append(left and right)
        elif op_code == 1:  # OR
            if len(stack) < 2:
                return False
            right = stack.pop()
            left = stack.pop()
            stack.append(left or right)
        elif op_code == 2:  # NOT
            if len(stack) < 1:
                return False
            value = stack.pop()
            stack.append(not value)
        else:
            return False

    return bool(stack[-1]) if stack else False


# ---------------------------------------------------------------------------
# Policy data structure
# ---------------------------------------------------------------------------

@dataclass
class DUOPolicy:
    """
    A DUO consent policy.

    Attributes:
        active_attrs: list of active attribute indices (subset of {0,...,5})
        whitelists: dict mapping attr_index -> list of allowed ontology codes
        tokens: RPN token array
        num_operations: number of active RPN operations
        logic_type: AND_ONLY, OR_ONLY, AND_OR_MIXED, or NEGATION
    """
    active_attrs: List[int]
    whitelists: Dict[int, List[str]]  # attr_index -> whitelist codes
    tokens: List[int]
    num_operations: int
    logic_type: LogicType = LogicType.AND_ONLY

    @property
    def predicate_count(self) -> int:
        """Number of predicate attributes (excludes GR)."""
        return sum(1 for a in self.active_attrs if a > 0)

    @property
    def selectivity(self) -> Dict[int, float]:
        """Selectivity sigma_i = |W_i| / |S_i| per active predicate."""
        result = {}
        for attr_idx in self.active_attrs:
            if attr_idx == 0:
                continue
            universe = DUO_ATTRIBUTES[attr_idx]["universe"]
            wl = self.whitelists.get(attr_idx, universe)
            result[attr_idx] = len(wl) / len(universe)
        return result


# ---------------------------------------------------------------------------
# Policy builders
# ---------------------------------------------------------------------------

def build_and_policy(attr_indices: List[int],
                     whitelists: Optional[Dict[int, List[str]]] = None) -> DUOPolicy:
    """Build a pure AND policy: a_i1 AND a_i2 AND ... AND a_ik."""
    if whitelists is None:
        whitelists = {}

    tokens = []
    for i, attr_idx in enumerate(attr_indices):
        tokens.append(attr_idx)
        if i > 0:
            tokens.append(TOKEN_AND)

    num_ops = len(tokens)
    # Pad to POLICY_DEPTH
    tokens.extend([0] * (POLICY_DEPTH - len(tokens)))

    return DUOPolicy(
        active_attrs=list(attr_indices),
        whitelists=whitelists,
        tokens=tokens,
        num_operations=num_ops,
        logic_type=LogicType.AND_ONLY,
    )


def build_or_policy(attr_indices: List[int],
                    whitelists: Optional[Dict[int, List[str]]] = None) -> DUOPolicy:
    """Build a pure OR policy: a_i1 OR a_i2 OR ... OR a_ik."""
    if whitelists is None:
        whitelists = {}

    tokens = []
    for i, attr_idx in enumerate(attr_indices):
        tokens.append(attr_idx)
        if i > 0:
            tokens.append(TOKEN_OR)

    num_ops = len(tokens)
    tokens.extend([0] * (POLICY_DEPTH - len(tokens)))

    return DUOPolicy(
        active_attrs=list(attr_indices),
        whitelists=whitelists,
        tokens=tokens,
        num_operations=num_ops,
        logic_type=LogicType.OR_ONLY,
    )


def build_mixed_policy(or_groups: List[List[int]],
                       whitelists: Optional[Dict[int, List[str]]] = None) -> DUOPolicy:
    """
    Build a mixed policy: (group1_AND) OR (group2_AND) OR ...

    Example: or_groups=[[0, 1], [2, 4]] builds (GR AND DS) OR (RS AND GS)
    """
    if whitelists is None:
        whitelists = {}

    all_attrs = [a for group in or_groups for a in group]
    tokens = []

    for g_idx, group in enumerate(or_groups):
        # Build AND sub-expression for this group
        for i, attr_idx in enumerate(group):
            tokens.append(attr_idx)
            if i > 0:
                tokens.append(TOKEN_AND)
        # OR with previous group
        if g_idx > 0:
            tokens.append(TOKEN_OR)

    num_ops = len(tokens)
    tokens.extend([0] * (POLICY_DEPTH - len(tokens)))

    return DUOPolicy(
        active_attrs=sorted(set(all_attrs)),
        whitelists=whitelists,
        tokens=tokens,
        num_operations=num_ops,
        logic_type=LogicType.AND_OR_MIXED,
    )


# ---------------------------------------------------------------------------
# ASR computation
# ---------------------------------------------------------------------------

def _check_requester_satisfies(policy: DUOPolicy, requester: Dict,
                                population: RequesterPopulation) -> bool:
    """
    Check if a single requester satisfies the policy.

    Since policy tokens reference attribute indices (0-5) directly and
    evaluate_policy_tokens uses attrs[token] for attribute operands,
    we set attrs[i] = 1 only when both the attribute is claimed AND
    the predicate (if any) is satisfied.
    """
    raw_attrs = requester["attrs"]
    codes = requester["codes"]

    # Build effective satisfaction vector: attribute claimed AND predicate matched
    effective_attrs = [0] * NUM_ATTRIBUTES
    predicate_truth = [0] * PRED_COUNT

    for attr_idx in range(NUM_ATTRIBUTES):
        if attr_idx == 0:
            # GR: no predicate, just check if claimed
            effective_attrs[0] = raw_attrs[0]
        else:
            # Predicate attribute: must be claimed AND code must be in whitelist
            if raw_attrs[attr_idx] == 1 and codes[attr_idx] is not None:
                wl = policy.whitelists.get(attr_idx, DUO_ATTRIBUTES[attr_idx]["universe"])
                if codes[attr_idx] in wl:
                    effective_attrs[attr_idx] = 1
                    predicate_truth[attr_idx - 1] = 1

    return evaluate_policy_tokens(
        policy.tokens, policy.num_operations, effective_attrs, predicate_truth
    )


def compute_asr_monte_carlo(policy: DUOPolicy, population: RequesterPopulation,
                             n_samples: int = 100_000) -> Tuple[float, float]:
    """
    Estimate ASR via Monte Carlo sampling.

    Returns:
        (asr_estimate, standard_error)
    """
    requesters = population.sample(n_samples)
    successes = sum(
        1 for r in requesters if _check_requester_satisfies(policy, r, population)
    )
    asr = successes / n_samples
    se = np.sqrt(asr * (1 - asr) / n_samples)
    return asr, se


def compute_asr_analytical(policy: DUOPolicy, population: RequesterPopulation) -> float:
    """
    Compute ASR analytically by evaluating the RPN expression over probabilities.

    For complex policies, enumerates all 2^|T| attribute satisfaction combinations
    and weights by their joint probability.
    """
    active = policy.active_attrs
    n_active = len(active)

    # Compute per-attribute satisfaction probability
    p_sat = {}
    for attr_idx in active:
        if attr_idx == 0:
            p_sat[attr_idx] = population.scenario.p_gr
        else:
            wl = policy.whitelists.get(attr_idx, DUO_ATTRIBUTES[attr_idx]["universe"])
            p_sat[attr_idx] = population.attribute_satisfaction_probability(attr_idx, wl)

    # Fast path for pure AND
    if policy.logic_type == LogicType.AND_ONLY:
        result = 1.0
        for attr_idx in active:
            result *= p_sat[attr_idx]
        return result

    # Fast path for pure OR
    if policy.logic_type == LogicType.OR_ONLY:
        result = 1.0
        for attr_idx in active:
            result *= (1.0 - p_sat[attr_idx])
        return 1.0 - result

    # General case: enumerate all 2^|T| combinations
    # Each combination is a binary vector over active attributes
    asr = 0.0
    for bits in range(2 ** n_active):
        # Build attribute satisfaction vector
        attrs_full = [0] * NUM_ATTRIBUTES
        predicate_truth = [0] * PRED_COUNT

        prob = 1.0
        for bit_pos, attr_idx in enumerate(active):
            satisfied = (bits >> bit_pos) & 1
            if satisfied:
                attrs_full[attr_idx] = 1
                prob *= p_sat[attr_idx]
                if attr_idx > 0:
                    predicate_truth[attr_idx - 1] = 1
            else:
                prob *= (1.0 - p_sat[attr_idx])

        # Evaluate policy with this combination
        if evaluate_policy_tokens(policy.tokens, policy.num_operations,
                                  attrs_full, predicate_truth):
            asr += prob

    return asr


# ---------------------------------------------------------------------------
# Policy space generation
# ---------------------------------------------------------------------------

def generate_policy_space(whitelist_fractions: List[float] = None,
                          max_attrs: int = 4) -> List[DUOPolicy]:
    """
    Generate a comprehensive set of policies for analysis.

    Varies:
        - Number of active attributes (1 to max_attrs)
        - Logic structure (AND, OR, mixed)
        - Whitelist fraction (selectivity)
    """
    if whitelist_fractions is None:
        whitelist_fractions = [0.1, 0.25, 0.5, 0.75, 1.0]

    policies = []
    attr_indices = list(range(NUM_ATTRIBUTES))  # [0, 1, 2, 3, 4, 5]

    for n_attrs in range(1, min(max_attrs + 1, NUM_ATTRIBUTES + 1)):
        # Generate all combinations of n_attrs attributes
        from itertools import combinations
        for attr_combo in combinations(attr_indices, n_attrs):
            attr_combo = list(attr_combo)

            for wl_frac in whitelist_fractions:
                # Build whitelists at this fraction
                whitelists = {}
                for a_idx in attr_combo:
                    if a_idx == 0:
                        continue
                    universe = DUO_ATTRIBUTES[a_idx]["universe"]
                    k = max(1, int(len(universe) * wl_frac))
                    # Take the first k codes (deterministic for reproducibility)
                    whitelists[a_idx] = universe[:k]

                # AND policy
                if n_attrs >= 1:
                    policies.append(build_and_policy(attr_combo, whitelists))

                # OR policy (only if > 1 attribute)
                if n_attrs >= 2:
                    policies.append(build_or_policy(attr_combo, whitelists))

                # Mixed policy: split into 2 OR groups (only if >= 3 attrs)
                if n_attrs >= 3:
                    mid = n_attrs // 2
                    group1 = attr_combo[:mid]
                    group2 = attr_combo[mid:]
                    policies.append(build_mixed_policy([group1, group2], whitelists))

    return policies


def generate_random_policies(n: int, rng: Optional[np.random.Generator] = None) -> List[DUOPolicy]:
    """Generate n random policies with varied structures."""
    if rng is None:
        rng = np.random.default_rng(42)

    policies = []
    attr_indices = list(range(NUM_ATTRIBUTES))

    for _ in range(n):
        # Random number of attributes (1-5)
        n_attrs = rng.integers(1, 6)
        chosen = sorted(rng.choice(attr_indices, size=n_attrs, replace=False).tolist())

        # Random whitelist fraction per attribute
        whitelists = {}
        for a_idx in chosen:
            if a_idx == 0:
                continue
            universe = DUO_ATTRIBUTES[a_idx]["universe"]
            frac = rng.uniform(0.1, 1.0)
            k = max(1, int(len(universe) * frac))
            selected = rng.choice(universe, size=k, replace=False).tolist()
            whitelists[a_idx] = selected

        # Random logic type
        logic_roll = rng.random()
        if n_attrs == 1 or logic_roll < 0.4:
            policy = build_and_policy(chosen, whitelists)
        elif logic_roll < 0.7:
            policy = build_or_policy(chosen, whitelists)
        else:
            if n_attrs >= 3:
                mid = rng.integers(1, n_attrs)
                policy = build_mixed_policy([chosen[:mid], chosen[mid:]], whitelists)
            else:
                policy = build_or_policy(chosen, whitelists)

        policies.append(policy)

    return policies


# ---------------------------------------------------------------------------
# Posterior ASR: conditional on motivated requester
# ---------------------------------------------------------------------------

def compute_asr_posterior(policy: DUOPolicy,
                          conditional_model: ConditionalRequesterModel) -> float:
    """
    Compute ASR for motivated requesters (posterior model).

    Uses boosted claim probabilities that reflect selection bias:
    requesters who seek specific data are more likely to have relevant credentials.
    """
    active = policy.active_attrs
    n_active = len(active)

    # Compute per-attribute conditional satisfaction probability
    p_sat = {}
    for attr_idx in active:
        wl = None
        if attr_idx > 0:
            wl = policy.whitelists.get(attr_idx, DUO_ATTRIBUTES[attr_idx]["universe"])
        p_sat[attr_idx] = conditional_model.conditional_satisfaction_probability(attr_idx, wl)

    # Fast path for pure AND
    if policy.logic_type == LogicType.AND_ONLY:
        result = 1.0
        for attr_idx in active:
            result *= p_sat[attr_idx]
        return result

    # Fast path for pure OR
    if policy.logic_type == LogicType.OR_ONLY:
        result = 1.0
        for attr_idx in active:
            result *= (1.0 - p_sat[attr_idx])
        return 1.0 - result

    # General case: enumerate all 2^|T| combinations
    asr = 0.0
    for bits in range(2 ** n_active):
        attrs_full = [0] * NUM_ATTRIBUTES
        predicate_truth = [0] * PRED_COUNT
        prob = 1.0

        for bit_pos, attr_idx in enumerate(active):
            satisfied = (bits >> bit_pos) & 1
            if satisfied:
                attrs_full[attr_idx] = 1
                prob *= p_sat[attr_idx]
                if attr_idx > 0:
                    predicate_truth[attr_idx - 1] = 1
            else:
                prob *= (1.0 - p_sat[attr_idx])

        if evaluate_policy_tokens(policy.tokens, policy.num_operations,
                                  attrs_full, predicate_truth):
            asr += prob

    return asr


def compute_prior_posterior_comparison(
    policy: DUOPolicy,
    population: RequesterPopulation,
    motivation_boost: float = 1.5,
) -> Dict[str, float]:
    """
    Compare prior ASR (population-level) vs posterior ASR (motivated requester).

    Returns dict with:
        prior_asr: P(random person from population satisfies policy)
        posterior_asr: P(motivated requester satisfies policy)
        uplift: posterior / prior ratio
        gap: posterior - prior absolute difference
    """
    cond_model = ConditionalRequesterModel(population, motivation_boost)

    prior = compute_asr_analytical(policy, population)
    posterior = compute_asr_posterior(policy, cond_model)

    return {
        "prior_asr": prior,
        "posterior_asr": posterior,
        "uplift": posterior / prior if prior > 0 else float("inf"),
        "gap": posterior - prior,
    }
