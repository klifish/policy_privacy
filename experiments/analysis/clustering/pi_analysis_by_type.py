#!/usr/bin/env python3
"""Plot the authoritative balanced/debiased PI clustering results by pair type."""
import argparse
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from experiments.analysis.paths import CLUSTERING_RESULTS_DIR

DEFAULT_INPUT = (
    CLUSTERING_RESULTS_DIR / "pi" / "pi_balanced_debiased.csv"
)
DEFAULT_OUTPUT = (
    CLUSTERING_RESULTS_DIR / "pi" / "pi_analysis_by_type.png"
)


def main():
    parser = argparse.ArgumentParser(
        description="Plot balanced/debiased PI clustering metrics by pair type"
    )
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    frame = pd.read_csv(args.input)
    required = {
        "pair_type", "observed_ari", "observed_nmi", "baseline_nmi",
        "debiased_nmi", "p_value", "significant", "n0", "n1",
    }
    missing = sorted(required - set(frame.columns))
    if missing:
        raise ValueError(f"Missing PI balanced columns: {missing}")
    if frame.empty or frame[list(required)].isna().any().any():
        raise ValueError("PI balanced input is empty or contains NaN")
    if not ((frame["n0"] == 30) & (frame["n1"] == 30)).all():
        raise ValueError("PI plot input must contain only balanced 30-vs-30 pairs")

    pair_types = sorted(frame["pair_type"].unique())
    labels = [pair_type.replace("_", "\n") for pair_type in pair_types]
    summaries = frame.groupby("pair_type").agg(
        pairs=("pair_id", "size"),
        observed_ari=("observed_ari", "mean"),
        observed_nmi=("observed_nmi", "mean"),
        baseline_nmi=("baseline_nmi", "mean"),
        debiased_nmi=("debiased_nmi", "mean"),
        significant=("significant", "sum"),
    ).reindex(pair_types)

    print("Balanced PI clustering summary by pair type:")
    print(summaries.to_string())
    print(
        f"\nOverall: {len(frame)} pairs, "
        f"mean ARI={frame['observed_ari'].mean():.4f}, "
        f"mean observed NMI={frame['observed_nmi'].mean():.4f}, "
        f"mean debiased NMI={frame['debiased_nmi'].mean():.4f}, "
        f"significant={int(frame['significant'].sum())}/{len(frame)}"
    )

    x = np.arange(len(pair_types))
    width = 0.35
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))

    axes[0, 0].bar(x, summaries["observed_ari"], color="steelblue", alpha=0.8)
    axes[0, 0].axhline(0, color="black", linewidth=0.8)
    axes[0, 0].set_title("Observed ARI by Balanced Pair Type")
    axes[0, 0].set_ylabel("Mean ARI")

    axes[0, 1].bar(
        x - width / 2, summaries["observed_nmi"], width,
        label="Observed NMI", color="coral", alpha=0.8,
    )
    axes[0, 1].bar(
        x + width / 2, summaries["baseline_nmi"], width,
        label="Permutation baseline", color="gray", alpha=0.8,
    )
    axes[0, 1].set_title("Observed vs Permutation-Baseline NMI")
    axes[0, 1].set_ylabel("Mean NMI")
    axes[0, 1].legend()

    colors = [
        "seagreen" if value <= 0 else "darkorange"
        for value in summaries["debiased_nmi"]
    ]
    axes[1, 0].bar(x, summaries["debiased_nmi"], color=colors, alpha=0.8)
    axes[1, 0].axhline(0, color="black", linewidth=0.8)
    axes[1, 0].set_title("Debiased NMI by Balanced Pair Type")
    axes[1, 0].set_ylabel("Observed NMI - baseline NMI")

    rates = summaries["significant"] / summaries["pairs"]
    axes[1, 1].bar(x, rates, color="mediumpurple", alpha=0.8)
    axes[1, 1].axhline(0.05, color="red", linestyle="--", label="5% reference")
    axes[1, 1].set_ylim(0, max(0.1, float(rates.max()) * 1.25))
    axes[1, 1].set_title("Significant Pairs by Type")
    axes[1, 1].set_ylabel("Fraction with p < 0.05")
    axes[1, 1].legend()

    for axis in axes.flat:
        axis.set_xticks(x)
        axis.set_xticklabels(labels)
        axis.grid(True, axis="y", alpha=0.25)

    fig.suptitle(
        "PI Unsupervised Attack: Balanced 30-vs-30 Pairs\n"
        "20 K-Means seeds and 200 label permutations",
        fontsize=14,
    )
    fig.tight_layout()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(args.output, dpi=150, bbox_inches="tight")
    plt.close(fig)
    print(f"Saved -> {args.output}")


if __name__ == "__main__":
    main()
