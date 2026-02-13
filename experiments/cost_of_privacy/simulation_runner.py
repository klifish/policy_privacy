"""
Simulation Runner — Main entry point for all experiments.

Experiments:
    A: ASR Sweep — varies attributes, whitelist fraction, logic structure, population
    B: Cost Decomposition — gas/time/leakage breakdown per policy
    C: Pareto Frontier — 10k random policies in (utility, cost) space
    D: Population Sensitivity — 10 representative policies × 5 population scenarios
    E: Optimal Recommendation — constrained optimization grid search
    F: Prior vs Posterior — compares population-level ASR with motivated-requester ASR

Note on scope:
    This simulation analyzes the PROTOCOL-LAYER capability of the ZK circuit,
    which supports AND/OR/NOT logic (postfix_policy_interpreter.circom).
    The current UI (compileDuoToTokens in policy.ts) only generates AND policies.
    Experiment F explicitly compares AND-only (current UI) vs full logic (protocol).

Usage:
    python3 simulation_runner.py                  # Run all experiments
    python3 simulation_runner.py --experiment A   # Run specific experiment
    python3 simulation_runner.py --experiment F   # Prior/posterior comparison
"""

import argparse
import json
import os
import sys
import time
import numpy as np
from pathlib import Path

from population_model import (
    RequesterPopulation, ConditionalRequesterModel,
    get_scenario_presets, DUO_ATTRIBUTES, NUM_ATTRIBUTES
)
from policy_model import (
    DUOPolicy, build_and_policy, build_or_policy, build_mixed_policy,
    compute_asr_analytical, compute_asr_monte_carlo, generate_policy_space,
    compute_asr_posterior, compute_prior_posterior_comparison,
    generate_random_policies
)
from privacy_cost import (
    compute_privacy_cost, compute_privacy_overhead, compute_gas_cost,
    compute_proof_time, compute_leakage
)
from pareto_analysis import (
    compute_pareto_frontier, extract_frontier, find_optimal_policy,
    sweep_optimal_policies, sensitivity_analysis
)

RESULTS_DIR = Path(__file__).parent / "results"


def ensure_results_dir():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Experiment A: ASR Sweep
# ---------------------------------------------------------------------------

def run_experiment_a(verbose: bool = True) -> dict:
    """
    Sweep over policy configurations and compute ASR.

    Dimensions:
        - Number of attributes: 1-6
        - Whitelist fraction: 0.1, 0.25, 0.5, 0.75, 1.0
        - Logic: AND, OR, mixed
        - Population: uniform, real_world, cancer_focused
    """
    if verbose:
        print("=" * 60)
        print("Experiment A: ASR Sweep")
        print("=" * 60)

    scenarios = get_scenario_presets()
    target_scenarios = ["uniform", "real_world", "cancer_focused"]
    wl_fractions = [0.1, 0.25, 0.5, 0.75, 1.0]
    attr_combos = [
        [0],           # GR only
        [1],           # DS only
        [0, 1],        # GR + DS
        [1, 4],        # DS + GS
        [0, 1, 4],     # GR + DS + GS
        [1, 2, 3],     # DS + RS + POA
        [0, 1, 2, 4],  # GR + DS + RS + GS
        [1, 2, 3, 4, 5],  # All predicates
        [0, 1, 2, 3, 4, 5],  # All attributes
    ]

    results = []
    total = len(attr_combos) * len(wl_fractions) * 3 * len(target_scenarios)
    count = 0

    for attrs in attr_combos:
        for wl_frac in wl_fractions:
            # Build whitelists
            whitelists = {}
            for a_idx in attrs:
                if a_idx == 0:
                    continue
                universe = DUO_ATTRIBUTES[a_idx]["universe"]
                k = max(1, int(len(universe) * wl_frac))
                whitelists[a_idx] = universe[:k]

            # Three logic types
            logic_configs = [("AND", build_and_policy(attrs, whitelists))]
            if len(attrs) >= 2:
                logic_configs.append(("OR", build_or_policy(attrs, whitelists)))
            if len(attrs) >= 3:
                mid = len(attrs) // 2
                logic_configs.append(("MIXED",
                    build_mixed_policy([attrs[:mid], attrs[mid:]], whitelists)))

            for logic_name, policy in logic_configs:
                for sc_name in target_scenarios:
                    population = RequesterPopulation(scenarios[sc_name])
                    asr = compute_asr_analytical(policy, population)

                    attr_names = [DUO_ATTRIBUTES[i]["code"] for i in attrs]
                    results.append({
                        "attrs": attr_names,
                        "n_attrs": len(attrs),
                        "n_predicates": policy.predicate_count,
                        "wl_fraction": wl_frac,
                        "logic": logic_name,
                        "scenario": sc_name,
                        "asr": round(asr, 6),
                        "selectivity": {str(k): round(v, 4)
                                        for k, v in policy.selectivity.items()},
                    })
                    count += 1

    if verbose:
        print(f"  Computed {count} configurations")
        # Print summary
        for logic in ["AND", "OR", "MIXED"]:
            subset = [r for r in results if r["logic"] == logic and r["scenario"] == "real_world"]
            if subset:
                asrs = [r["asr"] for r in subset]
                print(f"  {logic}: ASR range [{min(asrs):.4f}, {max(asrs):.4f}], mean={np.mean(asrs):.4f}")

    return {"experiment": "A", "results": results}


# ---------------------------------------------------------------------------
# Experiment B: Cost Decomposition
# ---------------------------------------------------------------------------

def run_experiment_b(verbose: bool = True) -> dict:
    """Gas/time/leakage cost breakdown for representative policies."""
    if verbose:
        print("\n" + "=" * 60)
        print("Experiment B: Privacy Cost Decomposition")
        print("=" * 60)

    # Representative policies
    policies_config = [
        ("GR only", [0], {}),
        ("DS (small WL)", [1], {1: DUO_ATTRIBUTES[1]["universe"][:3]}),
        ("DS (full WL)", [1], {}),
        ("GR AND DS", [0, 1], {1: DUO_ATTRIBUTES[1]["universe"][:5]}),
        ("GR OR DS", None, None),  # Special: built separately
        ("DS AND GS", [1, 4], {1: DUO_ATTRIBUTES[1]["universe"][:5],
                                4: DUO_ATTRIBUTES[4]["universe"][:5]}),
        ("DS OR RS OR GS", None, None),
        ("All predicates AND", [1, 2, 3, 4, 5], {}),
        ("All attrs AND", [0, 1, 2, 3, 4, 5], {}),
        ("(GR) OR (DS AND GS)", None, None),
    ]

    policies = []
    for name, attrs, wl in policies_config:
        if name == "GR OR DS":
            p = build_or_policy([0, 1], {1: DUO_ATTRIBUTES[1]["universe"][:5]})
        elif name == "DS OR RS OR GS":
            p = build_or_policy([1, 2, 4], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                2: DUO_ATTRIBUTES[2]["universe"][:3],
                4: DUO_ATTRIBUTES[4]["universe"][:5],
            })
        elif name == "(GR) OR (DS AND GS)":
            p = build_mixed_policy([[0], [1, 4]], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                4: DUO_ATTRIBUTES[4]["universe"][:5],
            })
        else:
            p = build_and_policy(attrs, wl if wl else {})
        policies.append((name, p))

    results = []
    for name, policy in policies:
        overhead = compute_privacy_overhead(policy)
        priv_cost = overhead["privacy_cost"]

        results.append({
            "name": name,
            "n_predicates": policy.predicate_count,
            "gas_zk_verification": priv_cost.gas.zk_verification,
            "gas_padding": priv_cost.gas.gas_padding,
            "gas_encrypted_sharing": priv_cost.gas.encrypted_sharing,
            "gas_total_with_padding": priv_cost.gas.total_with_padding,
            "gas_total_no_padding": priv_cost.gas.total_without_padding,
            "gas_multiplier": round(overhead["gas_multiplier"], 2),
            "proof_time_s": round(priv_cost.proof_time, 1),
            "leakage": round(priv_cost.leakage, 4),
            "composite_cost": round(priv_cost.composite, 4),
            "padding_ratio": round(priv_cost.gas.padding_ratio, 4),
        })

    if verbose:
        for r in results:
            print(f"  {r['name']:30s} | Gas: {r['gas_total_with_padding']:>8,} "
                  f"({r['gas_multiplier']}x) | Time: {r['proof_time_s']}s "
                  f"| Leak: {r['leakage']:.4f} | CoP: {r['composite_cost']:.4f}")

    return {"experiment": "B", "results": results}


# ---------------------------------------------------------------------------
# Experiment C: Pareto Frontier
# ---------------------------------------------------------------------------

def run_experiment_c(n_policies: int = 10000, verbose: bool = True) -> dict:
    """Generate Pareto frontier from random policies."""
    if verbose:
        print("\n" + "=" * 60)
        print(f"Experiment C: Pareto Frontier ({n_policies} policies)")
        print("=" * 60)

    rng = np.random.default_rng(42)
    policies = generate_random_policies(n_policies, rng)

    # Also add structured extremes
    policies.append(build_and_policy([0]))  # GR only (max utility)
    policies.append(build_and_policy([0, 1, 2, 3, 4, 5]))  # All AND (min utility)
    policies.append(build_or_policy([0, 1, 2, 3, 4, 5]))   # All OR

    scenarios = get_scenario_presets()
    population = RequesterPopulation(scenarios["real_world"])

    points = compute_pareto_frontier(policies, population)
    frontier = extract_frontier(points)

    results = {
        "all_points": [{
            "utility": round(p.utility, 6),
            "cost": round(p.cost, 6),
            "gas": p.gas_cost,
            "proof_time": round(p.proof_time, 2),
            "leakage": round(p.leakage, 4),
            "is_pareto": p.is_pareto,
            "n_attrs": len(p.policy.active_attrs),
            "logic": p.policy.logic_type.name,
            "n_predicates": p.policy.predicate_count,
        } for p in points],
        "frontier": [{
            "utility": round(p.utility, 6),
            "cost": round(p.cost, 6),
            "attrs": [DUO_ATTRIBUTES[i]["code"] for i in p.policy.active_attrs],
            "logic": p.policy.logic_type.name,
            "selectivity": {str(k): round(v, 4) for k, v in p.policy.selectivity.items()},
        } for p in frontier],
    }

    if verbose:
        print(f"  Total points: {len(points)}")
        print(f"  Pareto-optimal: {len(frontier)}")
        if frontier:
            print(f"  Frontier utility range: [{frontier[0].utility:.4f}, {frontier[-1].utility:.4f}]")
            print(f"  Frontier cost range: [{frontier[0].cost:.4f}, {frontier[-1].cost:.4f}]")

    return {"experiment": "C", "results": results}


# ---------------------------------------------------------------------------
# Experiment D: Population Sensitivity
# ---------------------------------------------------------------------------

def run_experiment_d(verbose: bool = True) -> dict:
    """Test 10 representative policies across 5 population scenarios."""
    if verbose:
        print("\n" + "=" * 60)
        print("Experiment D: Population Sensitivity")
        print("=" * 60)

    # 10 representative policies
    rep_policies = [
        ("GR only", build_and_policy([0])),
        ("DS (3 codes)", build_and_policy([1], {1: DUO_ATTRIBUTES[1]["universe"][:3]})),
        ("DS (full)", build_and_policy([1])),
        ("GR OR DS", build_or_policy([0, 1], {1: DUO_ATTRIBUTES[1]["universe"][:5]})),
        ("DS AND GS (small)", build_and_policy([1, 4], {
            1: DUO_ATTRIBUTES[1]["universe"][:3],
            4: DUO_ATTRIBUTES[4]["universe"][:3]})),
        ("DS AND GS (large)", build_and_policy([1, 4], {
            1: DUO_ATTRIBUTES[1]["universe"][:10],
            4: DUO_ATTRIBUTES[4]["universe"][:10]})),
        ("(GR) OR (DS AND GS)", build_mixed_policy([[0], [1, 4]], {
            1: DUO_ATTRIBUTES[1]["universe"][:5],
            4: DUO_ATTRIBUTES[4]["universe"][:5]})),
        ("DS OR RS OR POA", build_or_policy([1, 2, 3], {
            1: DUO_ATTRIBUTES[1]["universe"][:5],
            2: DUO_ATTRIBUTES[2]["universe"][:3],
            3: DUO_ATTRIBUTES[3]["universe"][:3]})),
        ("All pred AND (small)", build_and_policy([1, 2, 3, 4, 5], {
            i: DUO_ATTRIBUTES[i]["universe"][:3] for i in range(1, 6)})),
        ("All OR (full)", build_or_policy([0, 1, 2, 3, 4, 5])),
    ]

    scenarios = get_scenario_presets()
    results = {}

    for policy_name, policy in rep_policies:
        results[policy_name] = {}
        for sc_name, scenario in scenarios.items():
            population = RequesterPopulation(scenario)
            asr = compute_asr_analytical(policy, population)
            results[policy_name][sc_name] = round(asr, 6)

    if verbose:
        # Print as a table
        sc_names = list(scenarios.keys())
        header = f"{'Policy':35s}" + "".join(f" {s:>16s}" for s in sc_names)
        print(header)
        print("-" * len(header))
        for policy_name, _ in rep_policies:
            row = f"{policy_name:35s}"
            for sc in sc_names:
                row += f" {results[policy_name][sc]:>16.4f}"
            print(row)

    return {"experiment": "D", "results": results}


# ---------------------------------------------------------------------------
# Experiment E: Optimal Policy Recommendation
# ---------------------------------------------------------------------------

def run_experiment_e(verbose: bool = True) -> dict:
    """Find optimal policies for various (tau, epsilon) combinations."""
    if verbose:
        print("\n" + "=" * 60)
        print("Experiment E: Optimal Policy Recommendation")
        print("=" * 60)

    scenarios = get_scenario_presets()
    population = RequesterPopulation(scenarios["real_world"])

    tau_values = [0.1, 0.3, 0.5, 0.7, 0.9]
    epsilon_values = [0.01, 0.05, 0.10]

    opt_results = sweep_optimal_policies(
        population, tau_values, epsilon_values,
        n_candidates=5000, rng=np.random.default_rng(42)
    )

    results = []
    for r in opt_results:
        entry = {
            "tau": r.tau,
            "epsilon": r.epsilon,
            "feasible": r.feasible,
            "asr": round(r.asr, 4),
            "cost": round(r.cost, 4) if r.cost != float("inf") else None,
            "description": r.description,
        }
        if r.policy:
            entry["attrs"] = [DUO_ATTRIBUTES[i]["code"] for i in r.policy.active_attrs]
            entry["logic"] = r.policy.logic_type.name
            entry["n_predicates"] = r.policy.predicate_count
        results.append(entry)

    if verbose:
        print(f"\n{'tau':>6s} {'eps':>6s} {'feasible':>8s} {'ASR':>8s} {'CoP':>8s} {'Description'}")
        print("-" * 80)
        for r in results:
            cost_str = f"{r['cost']:.4f}" if r['cost'] is not None else "N/A"
            print(f"{r['tau']:6.2f} {r['epsilon']:6.2f} "
                  f"{'YES' if r['feasible'] else 'NO':>8s} "
                  f"{r['asr']:8.4f} {cost_str:>8s} {r['description'][:40]}")

    return {"experiment": "E", "results": results}


# ---------------------------------------------------------------------------
# Experiment F: Prior vs Posterior ASR & AND-only vs Full Logic
# ---------------------------------------------------------------------------

def run_experiment_f(verbose: bool = True) -> dict:
    """
    Compare:
    1. Prior ASR (population) vs Posterior ASR (motivated requester)
    2. AND-only policies (current UI) vs OR policies (protocol capability)

    This experiment answers two key questions:
    - How much does requester motivation affect access success?
    - How much ASR improvement would OR logic provide over AND-only?
    """
    if verbose:
        print("\n" + "=" * 60)
        print("Experiment F: Prior/Posterior & AND vs OR Comparison")
        print("=" * 60)

    scenarios = get_scenario_presets()
    population = RequesterPopulation(scenarios["real_world"])

    # Motivation boost factors to test
    boosts = [1.0, 1.5, 2.0, 3.0]

    # Test policies — paired AND vs OR for direct comparison
    policy_pairs = [
        {
            "name": "DS (5 codes)",
            "and": build_and_policy([1], {1: DUO_ATTRIBUTES[1]["universe"][:5]}),
            "or": None,  # Single attr: no OR variant
        },
        {
            "name": "GR + DS",
            "and": build_and_policy([0, 1], {1: DUO_ATTRIBUTES[1]["universe"][:5]}),
            "or":  build_or_policy([0, 1], {1: DUO_ATTRIBUTES[1]["universe"][:5]}),
        },
        {
            "name": "DS + GS",
            "and": build_and_policy([1, 4], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                4: DUO_ATTRIBUTES[4]["universe"][:5]}),
            "or":  build_or_policy([1, 4], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                4: DUO_ATTRIBUTES[4]["universe"][:5]}),
        },
        {
            "name": "DS + RS + POA",
            "and": build_and_policy([1, 2, 3], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                2: DUO_ATTRIBUTES[2]["universe"][:3],
                3: DUO_ATTRIBUTES[3]["universe"][:3]}),
            "or":  build_or_policy([1, 2, 3], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                2: DUO_ATTRIBUTES[2]["universe"][:3],
                3: DUO_ATTRIBUTES[3]["universe"][:3]}),
        },
        {
            "name": "GR + DS + GS (mixed)",
            "and": build_and_policy([0, 1, 4], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                4: DUO_ATTRIBUTES[4]["universe"][:5]}),
            "or":  build_mixed_policy([[0], [1, 4]], {
                1: DUO_ATTRIBUTES[1]["universe"][:5],
                4: DUO_ATTRIBUTES[4]["universe"][:5]}),
        },
        {
            "name": "All predicates",
            "and": build_and_policy([1, 2, 3, 4, 5], {
                i: DUO_ATTRIBUTES[i]["universe"][:3] for i in range(1, 6)}),
            "or":  build_or_policy([1, 2, 3, 4, 5], {
                i: DUO_ATTRIBUTES[i]["universe"][:3] for i in range(1, 6)}),
        },
    ]

    results = []
    for pair in policy_pairs:
        entry = {"name": pair["name"]}

        # AND policy: prior vs posterior at different boosts
        and_policy = pair["and"]
        and_prior = compute_asr_analytical(and_policy, population)
        entry["and_prior"] = round(and_prior, 6)

        entry["and_posterior"] = {}
        for boost in boosts:
            cond = ConditionalRequesterModel(population, boost)
            and_post = compute_asr_posterior(and_policy, cond)
            entry["and_posterior"][str(boost)] = round(and_post, 6)

        # OR policy: prior vs posterior (if exists)
        or_policy = pair["or"]
        if or_policy is not None:
            or_prior = compute_asr_analytical(or_policy, population)
            entry["or_prior"] = round(or_prior, 6)

            entry["or_posterior"] = {}
            for boost in boosts:
                cond = ConditionalRequesterModel(population, boost)
                or_post = compute_asr_posterior(or_policy, cond)
                entry["or_posterior"][str(boost)] = round(or_post, 6)

            # OR uplift over AND (at prior level)
            entry["or_uplift"] = round(or_prior / and_prior, 2) if and_prior > 0 else None
        else:
            entry["or_prior"] = None
            entry["or_posterior"] = None
            entry["or_uplift"] = None

        results.append(entry)

    if verbose:
        print(f"\n{'Policy':25s} {'AND prior':>10s} {'AND post':>10s} "
              f"{'OR prior':>10s} {'OR post':>10s} {'OR/AND':>8s}")
        print("-" * 85)
        for r in results:
            and_post_15 = r["and_posterior"].get("1.5", "N/A")
            or_prior = f"{r['or_prior']:.4f}" if r['or_prior'] is not None else "N/A"
            or_post = "N/A"
            if r["or_posterior"]:
                or_post = f"{r['or_posterior'].get('1.5', 'N/A')}"
            uplift = f"{r['or_uplift']:.1f}x" if r['or_uplift'] else "N/A"
            print(f"{r['name']:25s} {r['and_prior']:10.4f} {and_post_15:>10} "
                  f"{or_prior:>10s} {or_post:>10s} {uplift:>8s}")

    return {"experiment": "F", "results": results}


# ---------------------------------------------------------------------------
# Validation: analytical vs Monte Carlo
# ---------------------------------------------------------------------------

def run_validation(verbose: bool = True) -> dict:
    """Validate analytical ASR against Monte Carlo estimates."""
    if verbose:
        print("\n" + "=" * 60)
        print("Validation: Analytical vs Monte Carlo")
        print("=" * 60)

    scenarios = get_scenario_presets()
    population = RequesterPopulation(scenarios["real_world"])

    test_policies = [
        ("GR only", build_and_policy([0])),
        ("DS AND GS", build_and_policy([1, 4], {
            1: DUO_ATTRIBUTES[1]["universe"][:5],
            4: DUO_ATTRIBUTES[4]["universe"][:5]})),
        ("GR OR DS", build_or_policy([0, 1], {1: DUO_ATTRIBUTES[1]["universe"][:5]})),
        ("(GR) OR (DS AND GS)", build_mixed_policy([[0], [1, 4]], {
            1: DUO_ATTRIBUTES[1]["universe"][:5],
            4: DUO_ATTRIBUTES[4]["universe"][:5]})),
    ]

    results = []
    for name, policy in test_policies:
        asr_analytical = compute_asr_analytical(policy, population)
        asr_mc, se = compute_asr_monte_carlo(policy, population, n_samples=100_000)
        diff = abs(asr_analytical - asr_mc)
        within_se = diff < 3 * se  # Within 3 standard errors

        results.append({
            "name": name,
            "analytical": round(asr_analytical, 6),
            "monte_carlo": round(asr_mc, 6),
            "se": round(se, 6),
            "diff": round(diff, 6),
            "within_3se": within_se,
        })

        if verbose:
            status = "OK" if within_se else "MISMATCH"
            print(f"  {name:30s} | Analytical: {asr_analytical:.6f} "
                  f"| MC: {asr_mc:.6f} +/- {se:.6f} | diff: {diff:.6f} [{status}]")

    return {"validation": results}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Cost of Privacy Simulation")
    parser.add_argument("--experiment", type=str, default="all",
                        choices=["all", "A", "B", "C", "D", "E", "F", "validate"],
                        help="Which experiment to run")
    parser.add_argument("--n-policies", type=int, default=10000,
                        help="Number of random policies for experiment C")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress verbose output")
    args = parser.parse_args()

    ensure_results_dir()
    verbose = not args.quiet
    all_results = {}

    t0 = time.time()

    if args.experiment in ("all", "validate"):
        all_results["validation"] = run_validation(verbose)

    if args.experiment in ("all", "A"):
        all_results["A"] = run_experiment_a(verbose)

    if args.experiment in ("all", "B"):
        all_results["B"] = run_experiment_b(verbose)

    if args.experiment in ("all", "C"):
        all_results["C"] = run_experiment_c(args.n_policies, verbose)

    if args.experiment in ("all", "D"):
        all_results["D"] = run_experiment_d(verbose)

    if args.experiment in ("all", "E"):
        all_results["E"] = run_experiment_e(verbose)

    if args.experiment in ("all", "F"):
        all_results["F"] = run_experiment_f(verbose)

    elapsed = time.time() - t0

    # Save results
    output_file = RESULTS_DIR / f"results_{args.experiment}.json"
    with open(output_file, "w") as f:
        json.dump(all_results, f, indent=2, default=str)

    if verbose:
        print(f"\nTotal time: {elapsed:.1f}s")
        print(f"Results saved to: {output_file}")


if __name__ == "__main__":
    main()
