"""
Visualization Module — Generates figures and tables for the paper.

Figures:
    1. ASR Heatmap (attrs × whitelist fraction × logic)
    2. Pareto Frontier (utility vs cost scatter + frontier curve)
    3. Privacy Cost Decomposition (stacked bar chart)
    4. Population Sensitivity (violin plots)
    5. Optimal Policy Phase Diagram (tau × epsilon)
    6. Ontology Coverage Curves (|W_i| vs ASR per namespace)

Tables:
    1. Ontology statistics
    2. Gas cost breakdown
    3. Optimal policy configurations
    4. ASR under different populations
    5. Privacy metrics summary
"""

import json
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
from matplotlib.colors import LinearSegmentedColormap
from pathlib import Path
from typing import Dict, List, Optional

RESULTS_DIR = Path(__file__).parent / "results"
FIGURES_DIR = RESULTS_DIR / "figures"


def ensure_dirs():
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)


def load_results(experiment: str = "all") -> dict:
    path = RESULTS_DIR / f"results_{experiment}.json"
    with open(path) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Figure 1: ASR Heatmap
# ---------------------------------------------------------------------------

def plot_asr_heatmap(results_a: dict, scenario: str = "real_world"):
    """
    Heatmap: x = whitelist fraction, y = attribute combo, color = ASR.
    Three sub-panels for AND, OR, MIXED.
    """
    data = results_a["results"]
    filtered = [r for r in data if r["scenario"] == scenario]

    logic_types = ["AND", "OR", "MIXED"]
    fig, axes = plt.subplots(1, 3, figsize=(18, 8), sharey=True)

    for ax_idx, logic in enumerate(logic_types):
        subset = [r for r in filtered if r["logic"] == logic]
        if not subset:
            axes[ax_idx].set_title(f"{logic} (no data)")
            continue

        # Get unique attr combos and wl fractions
        attr_labels = sorted(set(tuple(r["attrs"]) for r in subset),
                             key=lambda x: (len(x), x))
        wl_fracs = sorted(set(r["wl_fraction"] for r in subset))

        matrix = np.full((len(attr_labels), len(wl_fracs)), np.nan)
        for r in subset:
            row = attr_labels.index(tuple(r["attrs"]))
            col = wl_fracs.index(r["wl_fraction"])
            matrix[row, col] = r["asr"]

        im = axes[ax_idx].imshow(matrix, aspect="auto", cmap="RdYlGn",
                                  vmin=0, vmax=1, origin="lower")

        axes[ax_idx].set_xticks(range(len(wl_fracs)))
        axes[ax_idx].set_xticklabels([f"{f:.0%}" for f in wl_fracs], fontsize=8)
        axes[ax_idx].set_xlabel("Whitelist Fraction (σ)")
        axes[ax_idx].set_title(f"{logic} Logic", fontsize=12, fontweight="bold")

        if ax_idx == 0:
            axes[ax_idx].set_yticks(range(len(attr_labels)))
            axes[ax_idx].set_yticklabels(
                ["+".join(a) for a in attr_labels], fontsize=7)
            axes[ax_idx].set_ylabel("Attribute Combination")

        # Add value annotations
        for i in range(matrix.shape[0]):
            for j in range(matrix.shape[1]):
                if not np.isnan(matrix[i, j]):
                    color = "white" if matrix[i, j] < 0.3 or matrix[i, j] > 0.8 else "black"
                    axes[ax_idx].text(j, i, f"{matrix[i,j]:.2f}",
                                       ha="center", va="center", fontsize=6, color=color)

    fig.colorbar(im, ax=axes, label="Access Success Rate (ASR)", shrink=0.6)
    fig.suptitle("Access Success Rate by Policy Configuration", fontsize=14, fontweight="bold")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig1_asr_heatmap.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig1_asr_heatmap.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig1_asr_heatmap.pdf")


# ---------------------------------------------------------------------------
# Figure 2: Pareto Frontier
# ---------------------------------------------------------------------------

def plot_pareto_frontier(results_c: dict):
    """Scatter plot of (utility, cost) with Pareto frontier highlighted."""
    points = results_c["results"]["all_points"]
    frontier = results_c["results"]["frontier"]

    fig, ax = plt.subplots(figsize=(10, 7))

    # Non-Pareto points, colored by predicate count
    non_pareto = [p for p in points if not p["is_pareto"]]
    pred_counts = [p["n_predicates"] for p in non_pareto]
    scatter = ax.scatter(
        [p["utility"] for p in non_pareto],
        [p["cost"] for p in non_pareto],
        c=pred_counts, cmap="viridis", alpha=0.3, s=8,
        label="Dominated policies"
    )
    plt.colorbar(scatter, ax=ax, label="Number of Predicates")

    # Pareto frontier
    f_util = [p["utility"] for p in frontier]
    f_cost = [p["cost"] for p in frontier]
    ax.scatter(f_util, f_cost, c="red", s=50, zorder=5, label="Pareto-optimal")
    # Connect frontier with line
    sorted_idx = np.argsort(f_util)
    ax.plot([f_util[i] for i in sorted_idx],
            [f_cost[i] for i in sorted_idx],
            "r--", alpha=0.7, linewidth=1.5)

    ax.set_xlabel("Utility (ASR)", fontsize=12)
    ax.set_ylabel("Cost of Privacy (CoP)", fontsize=12)
    ax.set_title("Privacy-Utility Pareto Frontier", fontsize=14, fontweight="bold")
    ax.legend(loc="upper right")
    ax.set_xlim(-0.05, 1.05)

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig2_pareto_frontier.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig2_pareto_frontier.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig2_pareto_frontier.pdf")


# ---------------------------------------------------------------------------
# Figure 3: Cost Decomposition
# ---------------------------------------------------------------------------

def plot_cost_decomposition(results_b: dict):
    """Stacked bar chart of gas components."""
    data = results_b["results"]

    names = [d["name"] for d in data]
    zk = [d["gas_zk_verification"] for d in data]
    padding = [d["gas_padding"] for d in data]
    encrypt = [d["gas_encrypted_sharing"] for d in data]
    base = [d["gas_total_no_padding"] - d["gas_zk_verification"] for d in data]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    # Left: Gas breakdown (stacked bar)
    x = np.arange(len(names))
    width = 0.6

    ax1.bar(x, base, width, label="Base TX + Commit", color="#2196F3")
    ax1.bar(x, zk, width, bottom=base, label="ZK Verification", color="#FF9800")
    ax1.bar(x, padding, width, bottom=[b + z for b, z in zip(base, zk)],
            label="Gas Padding", color="#F44336", alpha=0.7)

    ax1.set_xticks(x)
    ax1.set_xticklabels(names, rotation=45, ha="right", fontsize=8)
    ax1.set_ylabel("Gas Usage")
    ax1.set_title("Gas Cost Decomposition", fontweight="bold")
    ax1.legend()
    ax1.yaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}k"))

    # Right: Proof time + leakage
    times = [d["proof_time_s"] for d in data]
    leakages = [d["leakage"] for d in data]

    ax2_twin = ax2.twinx()
    bars1 = ax2.bar(x - 0.15, times, 0.3, label="Proof Time (s)", color="#4CAF50")
    bars2 = ax2_twin.bar(x + 0.15, leakages, 0.3, label="Leakage", color="#9C27B0")

    ax2.set_xticks(x)
    ax2.set_xticklabels(names, rotation=45, ha="right", fontsize=8)
    ax2.set_ylabel("Proof Time (seconds)", color="#4CAF50")
    ax2_twin.set_ylabel("Information Leakage", color="#9C27B0")
    ax2.set_title("Proof Time & Leakage", fontweight="bold")
    ax2.legend(loc="upper left")
    ax2_twin.legend(loc="upper right")

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig3_cost_decomposition.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig3_cost_decomposition.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig3_cost_decomposition.pdf")


# ---------------------------------------------------------------------------
# Figure 4: Population Sensitivity
# ---------------------------------------------------------------------------

def plot_population_sensitivity(results_d: dict):
    """Grouped bar chart: policies × scenarios."""
    data = results_d["results"]
    policy_names = list(data.keys())
    scenarios = list(next(iter(data.values())).keys())

    fig, ax = plt.subplots(figsize=(16, 7))

    x = np.arange(len(policy_names))
    width = 0.15
    colors = ["#2196F3", "#4CAF50", "#FF9800", "#F44336", "#9C27B0"]

    for i, sc in enumerate(scenarios):
        values = [data[p][sc] for p in policy_names]
        ax.bar(x + i * width, values, width, label=sc, color=colors[i % len(colors)])

    ax.set_xticks(x + width * (len(scenarios) - 1) / 2)
    ax.set_xticklabels(policy_names, rotation=30, ha="right", fontsize=8)
    ax.set_ylabel("Access Success Rate (ASR)")
    ax.set_title("ASR Sensitivity to Population Distribution", fontsize=14, fontweight="bold")
    ax.legend(title="Population Scenario", fontsize=8)
    ax.set_ylim(0, 1.05)
    ax.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig4_population_sensitivity.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig4_population_sensitivity.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig4_population_sensitivity.pdf")


# ---------------------------------------------------------------------------
# Figure 5: Optimal Policy Phase Diagram
# ---------------------------------------------------------------------------

def plot_optimal_phase_diagram(results_e: dict):
    """Heatmap showing feasibility and optimal policy type in (tau, epsilon) space."""
    data = results_e["results"]

    tau_values = sorted(set(r["tau"] for r in data))
    eps_values = sorted(set(r["epsilon"] for r in data))

    # Matrix of ASR achieved (or -1 if infeasible)
    matrix = np.full((len(tau_values), len(eps_values)), np.nan)
    labels = [[""]*len(eps_values) for _ in range(len(tau_values))]

    for r in data:
        i = tau_values.index(r["tau"])
        j = eps_values.index(r["epsilon"])
        if r["feasible"]:
            matrix[i, j] = r["asr"]
            if r.get("attrs"):
                labels[i][j] = "+".join(r["attrs"][:3])
                if len(r.get("attrs", [])) > 3:
                    labels[i][j] += "..."
        else:
            matrix[i, j] = -0.1

    fig, ax = plt.subplots(figsize=(8, 6))

    cmap = plt.cm.RdYlGn.copy()
    cmap.set_under("lightgray")
    im = ax.imshow(matrix, aspect="auto", cmap=cmap, vmin=0, vmax=1, origin="lower")

    ax.set_xticks(range(len(eps_values)))
    ax.set_xticklabels([f"{e}" for e in eps_values])
    ax.set_yticks(range(len(tau_values)))
    ax.set_yticklabels([f"{t}" for t in tau_values])
    ax.set_xlabel("Max Leakage (ε)")
    ax.set_ylabel("Min ASR Target (τ)")
    ax.set_title("Optimal Policy Feasibility", fontsize=14, fontweight="bold")

    # Annotate cells
    for i in range(len(tau_values)):
        for j in range(len(eps_values)):
            if matrix[i, j] >= 0:
                ax.text(j, i, labels[i][j], ha="center", va="center", fontsize=7)
            else:
                ax.text(j, i, "N/A", ha="center", va="center", fontsize=8, color="gray")

    plt.colorbar(im, ax=ax, label="Achieved ASR")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig5_optimal_phase_diagram.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig5_optimal_phase_diagram.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig5_optimal_phase_diagram.pdf")


# ---------------------------------------------------------------------------
# Figure 6: Ontology Coverage Curves
# ---------------------------------------------------------------------------

def plot_ontology_coverage():
    """Per-ontology analysis: whitelist size vs ASR."""
    from population_model import DUO_ATTRIBUTES, RequesterPopulation, get_scenario_presets
    from policy_model import build_and_policy, compute_asr_analytical

    scenarios = get_scenario_presets()
    population = RequesterPopulation(scenarios["real_world"])

    fig, axes = plt.subplots(1, 5, figsize=(20, 4), sharey=True)

    for ax_idx, attr in enumerate(DUO_ATTRIBUTES[1:]):  # Skip GR
        idx = attr["index"]
        ns = attr["namespace"]
        universe = attr["universe"]
        total = len(universe)

        sizes = list(range(1, total + 1))
        asrs = []
        for k in sizes:
            wl = universe[:k]
            policy = build_and_policy([idx], {idx: wl})
            asr = compute_asr_analytical(policy, population)
            asrs.append(asr)

        axes[ax_idx].plot(sizes, asrs, "o-", markersize=3, linewidth=1.5)
        axes[ax_idx].fill_between(sizes, asrs, alpha=0.2)
        axes[ax_idx].set_xlabel(f"|W| (of {total})")
        axes[ax_idx].set_title(f"{attr['code']} ({ns})", fontsize=10, fontweight="bold")
        axes[ax_idx].set_xlim(0, total + 1)
        axes[ax_idx].grid(alpha=0.3)

    axes[0].set_ylabel("ASR (single attribute, AND)")
    fig.suptitle("Ontology Coverage vs Access Success Rate", fontsize=13, fontweight="bold")
    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig6_ontology_coverage.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig6_ontology_coverage.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig6_ontology_coverage.pdf")


# ---------------------------------------------------------------------------
# Figure 7: Prior vs Posterior & AND vs OR Comparison
# ---------------------------------------------------------------------------

def plot_prior_posterior_comparison(results_f: dict):
    """
    Grouped bar chart comparing:
    - AND prior vs AND posterior (motivation effect)
    - AND vs OR (logic structure effect)
    """
    data = results_f["results"]

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

    # Left panel: AND prior vs posterior at different boost levels
    names = [d["name"] for d in data]
    x = np.arange(len(names))
    width = 0.18

    and_prior = [d["and_prior"] for d in data]
    and_post_10 = [d["and_posterior"]["1.0"] for d in data]
    and_post_15 = [d["and_posterior"]["1.5"] for d in data]
    and_post_20 = [d["and_posterior"]["2.0"] for d in data]
    and_post_30 = [d["and_posterior"]["3.0"] for d in data]

    ax1.bar(x - 1.5*width, and_prior, width, label="Prior (population)", color="#2196F3")
    ax1.bar(x - 0.5*width, and_post_15, width, label="Posterior (boost=1.5×)", color="#4CAF50")
    ax1.bar(x + 0.5*width, and_post_20, width, label="Posterior (boost=2.0×)", color="#FF9800")
    ax1.bar(x + 1.5*width, and_post_30, width, label="Posterior (boost=3.0×)", color="#F44336")

    ax1.set_xticks(x)
    ax1.set_xticklabels(names, rotation=30, ha="right", fontsize=8)
    ax1.set_ylabel("ASR (AND policy)")
    ax1.set_title("Motivation Effect on AND Policies\n(current UI capability)",
                   fontweight="bold", fontsize=11)
    ax1.legend(fontsize=8)
    ax1.set_ylim(0, 1.05)
    ax1.grid(axis="y", alpha=0.3)

    # Right panel: AND vs OR (prior)
    has_or = [d for d in data if d["or_prior"] is not None]
    if has_or:
        names_or = [d["name"] for d in has_or]
        x2 = np.arange(len(names_or))
        and_vals = [d["and_prior"] for d in has_or]
        or_vals = [d["or_prior"] for d in has_or]

        bars_and = ax2.bar(x2 - 0.2, and_vals, 0.35,
                           label="AND (current UI)", color="#2196F3")
        bars_or = ax2.bar(x2 + 0.2, or_vals, 0.35,
                          label="OR (protocol capability)", color="#4CAF50")

        # Add uplift annotations
        for i, d in enumerate(has_or):
            if d["or_uplift"]:
                ax2.annotate(f"{d['or_uplift']}×",
                             xy=(i + 0.2, d["or_prior"]),
                             xytext=(0, 5), textcoords="offset points",
                             ha="center", fontsize=8, fontweight="bold", color="#F44336")

        ax2.set_xticks(x2)
        ax2.set_xticklabels(names_or, rotation=30, ha="right", fontsize=8)
        ax2.set_ylabel("ASR (prior, population-level)")
        ax2.set_title("AND vs OR Logic Structure\n(protocol supports both; UI only AND)",
                       fontweight="bold", fontsize=11)
        ax2.legend(fontsize=9)
        ax2.set_ylim(0, 1.05)
        ax2.grid(axis="y", alpha=0.3)

    plt.tight_layout()
    plt.savefig(FIGURES_DIR / "fig7_prior_posterior_and_vs_or.pdf", dpi=150, bbox_inches="tight")
    plt.savefig(FIGURES_DIR / "fig7_prior_posterior_and_vs_or.png", dpi=150, bbox_inches="tight")
    plt.close()
    print("  Saved: fig7_prior_posterior_and_vs_or.pdf")


# ---------------------------------------------------------------------------
# Generate all figures
# ---------------------------------------------------------------------------

def generate_all_figures(results: Optional[dict] = None):
    """Generate all 7 figures from experiment results."""
    ensure_dirs()

    if results is None:
        results = load_results("all")

    print("Generating figures...")

    if "A" in results:
        plot_asr_heatmap(results["A"])
    if "C" in results:
        plot_pareto_frontier(results["C"])
    if "B" in results:
        plot_cost_decomposition(results["B"])
    if "D" in results:
        plot_population_sensitivity(results["D"])
    if "E" in results:
        plot_optimal_phase_diagram(results["E"])

    # Figure 6 doesn't depend on experiment results
    plot_ontology_coverage()

    if "F" in results:
        plot_prior_posterior_comparison(results["F"])

    print(f"\nAll figures saved to: {FIGURES_DIR}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    generate_all_figures()
