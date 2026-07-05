#!/usr/bin/env python3
"""
Gas-padding ablation cross-check (supervised, sklearn).

Runs the SPP supervised attack on the paired ablation datasets
``b1_unpadded`` and ``b2_padded`` and reports, per pairwise contrast and model,
the leakage reduction attributable to padding:

    deltaLeakage = |AUC_b1 - 0.5| - |AUC_b2 - 0.5|      (per seed, then bootstrapped)

with a bootstrap 95% CI over the shared seeds (seeds are paired: the same
policy-disjoint partition is applied to both datasets, which share policy ids).
Leakage is measured as advantage (distance of AUC from chance in either
direction), matching ``comparison/ablation_report.json``'s
``effectDefinition: "abs(AUC_B1 - 0.5) - abs(AUC_B2 - 0.5)"``. Interpretation
follows the same report: CI excludes 0 and delta>0 -> padding_reduces_leakage;
CI excludes 0 and delta<0 -> padding_increases_leakage; otherwise
no_detectable_incremental_effect.
"""
import argparse
import csv
import itertools
import json
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from joblib import Parallel, delayed

from spp_supervised import (
    TARGET_ATTRS,
    build_feature_matrix,
    evaluate_seed,
    find_spp_dataset,
    load_json,
)

# Parallel processes over seeds; set from CLI (see main).
JOBS = 1

DEFAULT_ABLATION_DIR = (
    Path(__file__).parents[2]
    / "experiments" / "ablation" / "gas_padding" / "polygonAmoy"
)
OUTPUT_DIR = Path(__file__).parents[1] / "results" / "supervised_analysis"
BOOTSTRAP_ITERS = 500
BOOTSTRAP_SEED = 12345


def per_seed_aucs(X, y, groups, seeds: int, model: str):
    """Return {seed: auc} for one contrast/model (only non-degenerate splits)."""
    rf_n_jobs = -1 if JOBS == 1 else 1
    if JOBS == 1:
        results = [evaluate_seed(X, y, groups, s, [model], rf_n_jobs) for s in range(seeds)]
    else:
        results = Parallel(n_jobs=JOBS)(
            delayed(evaluate_seed)(X, y, groups, s, [model], rf_n_jobs) for s in range(seeds)
        )
    return {s: res[model]["auc"] for s, res in enumerate(results) if res is not None}


def bootstrap_delta_ci(deltas: np.ndarray, iters: int, rng: np.random.Generator):
    """Bootstrap 95% CI of the mean paired delta by resampling seeds."""
    if len(deltas) == 0:
        return (float("nan"), float("nan"), float("nan"))
    means = np.array([
        rng.choice(deltas, size=len(deltas), replace=True).mean() for _ in range(iters)
    ])
    return float(deltas.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


CSV_FIELDS = [
    "target", "class0", "class1", "model", "aucMean_b1_unpadded", "aucMean_b2_padded",
    "deltaLeakage", "ciLow", "ciHigh", "ciExcludesZero", "interpretation", "nSeedsPaired",
]


def run(b1: List[dict], b2: List[dict], seeds: int, models: List[str],
        csv_path: Optional[Path] = None) -> List[Dict]:
    X1, g1, lab1 = build_feature_matrix(b1)
    X2, g2, lab2 = build_feature_matrix(b2)
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    rows = []

    # Checkpoint each row to disk as it is computed, so an interrupted run keeps
    # its completed contrasts.
    writer = None
    csv_file = None
    if csv_path is not None:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        csv_file = open(csv_path, "w", newline="")
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()
        csv_file.flush()

    for target in TARGET_ATTRS:
        classes = sorted(set(lab1[target].tolist()) & set(lab2[target].tolist()))
        for c0, c1 in itertools.combinations(classes, 2):
            m1 = (lab1[target] == c0) | (lab1[target] == c1)
            m2 = (lab2[target] == c0) | (lab2[target] == c1)
            y1 = (lab1[target][m1] == c1).astype(int)
            y2 = (lab2[target][m2] == c1).astype(int)

            for model in models:
                a1 = per_seed_aucs(X1[m1], y1, g1[m1], seeds, model)
                a2 = per_seed_aucs(X2[m2], y2, g2[m2], seeds, model)
                shared = sorted(set(a1) & set(a2))
                # Leakage = advantage = |AUC - 0.5| (distance from chance).
                deltas = np.array([abs(a1[s] - 0.5) - abs(a2[s] - 0.5) for s in shared], dtype=float)
                mean_delta, ci_lo, ci_hi = bootstrap_delta_ci(deltas, BOOTSTRAP_ITERS, rng)
                excludes_zero = (
                    len(shared) > 0 and not np.isnan(ci_lo) and (ci_lo > 0 or ci_hi < 0)
                )
                if excludes_zero:
                    interp = "padding_reduces_leakage" if mean_delta > 0 else "padding_increases_leakage"
                else:
                    interp = "no_detectable_incremental_effect"
                row = {
                    "target": target, "class0": c0, "class1": c1, "model": model,
                    "aucMean_b1_unpadded": float(np.mean(list(a1.values()))) if a1 else None,
                    "aucMean_b2_padded": float(np.mean(list(a2.values()))) if a2 else None,
                    "deltaLeakage": mean_delta,
                    "ciLow": ci_lo, "ciHigh": ci_hi,
                    "ciExcludesZero": bool(excludes_zero),
                    "interpretation": interp,
                    "nSeedsPaired": len(shared),
                }
                rows.append(row)
                if writer is not None:
                    writer.writerow(row)
                    csv_file.flush()
                flag = "*" if excludes_zero else " "
                print(f"  [{flag}] {target}: {c0}/{c1:12} {model} "
                      f"b1={row['aucMean_b1_unpadded']:.3f} b2={row['aucMean_b2_padded']:.3f} "
                      f"delta={mean_delta:+.3f} CI=[{ci_lo:+.3f},{ci_hi:+.3f}] {interp}", flush=True)
    if csv_file is not None:
        csv_file.close()
    return rows


def main():
    parser = argparse.ArgumentParser(description="Supervised gas-padding ablation cross-check")
    parser.add_argument("--ablation-dir", type=Path, default=DEFAULT_ABLATION_DIR,
                        help="Dir containing b1_unpadded/ and b2_padded/")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=30)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1,
                        help="Parallel processes over seeds (-1 = all cores).")
    args = parser.parse_args()

    global JOBS
    JOBS = args.jobs

    b1_path = find_spp_dataset(args.ablation_dir / "b1_unpadded")
    b2_path = find_spp_dataset(args.ablation_dir / "b2_padded")
    if not b1_path or not b2_path:
        print(f"Missing b1_unpadded/b2_padded spp_dataset.json under {args.ablation_dir}")
        return
    print(f"b1_unpadded: {b1_path}\nb2_padded:   {b2_path}\n")
    b1, b2 = load_json(b1_path), load_json(b2_path)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / "spp_ablation_deltaLeakage.csv"
    rows = run(b1, b2, args.seeds, args.models, csv_path=csv_path)

    reduces = sum(r["interpretation"] == "padding_reduces_leakage" for r in rows)
    increases = sum(r["interpretation"] == "padding_increases_leakage" for r in rows)
    print(f"\n{len(rows)} contrast-model rows: {reduces} padding_reduces_leakage, "
          f"{increases} padding_increases_leakage, "
          f"{len(rows) - reduces - increases} no_detectable_incremental_effect.")
    print(f"Ablation deltaLeakage -> {csv_path}")


if __name__ == "__main__":
    main()
