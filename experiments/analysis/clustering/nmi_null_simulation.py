"""Finite-sample NMI and ARI of K-Means under a null with no class signal.

Every class is drawn from the same N(0, I_d), so the class labels (assigned by
construction order) carry no information about the samples. The clustering
mirrors the evaluation (clustering_stats.py): standardized features, K-Means
with K equal to the number of classes and n_init=10.

Table rows run one K-Means fit per trial and report trial means, as in
paper_mdpi/sec_nmi_sensitivity.tex. The matched configuration reproduces the
ICD-10 clustering of the evaluation: the observed per-chapter execution counts
and, per trial, the mean over the same number of K-Means seeds as the observed
statistic, so the observed NMI can be placed in its null distribution.

Usage: .venv/bin/python experiments/analysis/clustering/nmi_null_simulation.py
"""
from __future__ import annotations

import argparse
import csv
import json
import time
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = ROOT / "experiments" / "results" / "clustering" / "null"
ICD10_CLUSTERING = ROOT / "experiments" / "results" / "clustering" / "pch" / "pch_global_icd10_clustering.csv"

# Executions per ICD-10 chapter in the evaluated corpus (paper Table 7, ch0..ch9).
ICD10_CHAPTER_SIZES = [131, 49, 62, 55, 70, 63, 135, 77, 62, 66]

CONFIGS = [
    ("PI-like", [3] * 2),
    ("PI-like", [10] * 2),
    ("PI-like", [50] * 2),
    ("PI-like", [100] * 2),
    ("5-class", [3] * 5),
    ("5-class", [10] * 5),
    ("5-class", [100] * 5),
    ("10-class", [3] * 10),
    ("10-class", [10] * 10),
    ("10-class", [77] * 10),
    ("ICD-10 sizes", ICD10_CHAPTER_SIZES),
]

# Values printed in the submitted and revised manuscript, for the reproduction check.
PUBLISHED = {
    ("PI-like", 3): (0.1808, -0.0190), ("PI-like", 10): (0.0404, -0.0020),
    ("PI-like", 50): (0.0066, -0.0011), ("PI-like", 100): (0.0038, 0.0002),
    ("5-class", 3): (0.4168, 0.0005), ("5-class", 10): (0.1249, 0.0018),
    ("5-class", 100): (0.0105, -0.0000),
}


def run_trial(sizes, dim: int, seed: int, kmeans_seeds: int):
    rng = np.random.default_rng(seed)
    X = StandardScaler().fit_transform(rng.standard_normal((sum(sizes), dim)))
    y = np.repeat(np.arange(len(sizes)), sizes)
    nmi, ari = [], []
    for kmeans_seed in range(kmeans_seeds):
        pred = KMeans(n_clusters=len(sizes), n_init=10, random_state=kmeans_seed).fit_predict(X)
        nmi.append(normalized_mutual_info_score(y, pred))
        ari.append(adjusted_rand_score(y, pred))
    return float(np.mean(nmi)), float(np.mean(ari))


def simulate(sizes, dim: int, trials: int, kmeans_seeds: int, base_seed: int):
    values = [run_trial(sizes, dim, base_seed + t, kmeans_seeds) for t in range(trials)]
    nmi = np.array([v[0] for v in values])
    ari = np.array([v[1] for v in values])
    return nmi, ari


def observed_icd10():
    with ICD10_CLUSTERING.open() as handle:
        row = next(csv.DictReader(handle))
    return {
        "n": int(row["n_samples"]),
        "classes": int(row["n_classes"]),
        "nmi": float(row["kmeans_nmi"]),
        "ari": float(row["kmeans_ari"]),
        "permutationBaselineNmi": float(row["baseline_nmi"]),
        "debiasedNmi": float(row["debiased_nmi"]),
        "permutationNmiP": float(row["nmi_p_value"]),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--trials", type=int, default=1000)
    parser.add_argument("--dim", type=int, default=2, help="feature dimension; the clustering uses the two gas features")
    parser.add_argument("--matched-kmeans-seeds", type=int, default=20, help="K-Means seeds averaged per trial, as in the evaluation")
    parser.add_argument("--seed", type=int, default=20260923)
    args = parser.parse_args()

    observed = observed_icd10()
    if observed["n"] != sum(ICD10_CHAPTER_SIZES) or observed["classes"] != len(ICD10_CHAPTER_SIZES):
        raise SystemExit("ICD-10 chapter sizes do not match the evaluated clustering")

    started = time.time()
    rows = []
    for index, (label, sizes) in enumerate(CONFIGS):
        nmi, ari = simulate(sizes, args.dim, args.trials, 1, args.seed + 100_000 * index)
        row = {
            "structure": label,
            "classes": len(sizes),
            "perClass": sizes[0] if len(set(sizes)) == 1 else f"{min(sizes)}-{max(sizes)}",
            "n": sum(sizes),
            "nmiMean": float(nmi.mean()),
            "nmiP95": float(np.quantile(nmi, 0.95)),
            "ariMean": float(ari.mean()),
        }
        published = PUBLISHED.get((label, sizes[0])) if len(set(sizes)) == 1 else None
        if published:
            row["published"] = {"nmi": published[0], "ari": published[1]}
        rows.append(row)
        print(f"{label:13s} C={len(sizes):2d} n={row['perClass']!s:7s} N={row['n']:4d}  NMI {row['nmiMean']:.4f} (p95 {row['nmiP95']:.4f})  ARI {row['ariMean']:+.4f}"
              + (f"   published NMI {published[0]:.4f} ARI {published[1]:+.4f}" if published else ""))

    matched_nmi, matched_ari = simulate(ICD10_CHAPTER_SIZES, args.dim, args.trials, args.matched_kmeans_seeds, args.seed + 9_000_000)
    exceed = int((matched_nmi >= observed["nmi"]).sum())
    matched = {
        "sizes": ICD10_CHAPTER_SIZES,
        "kmeansSeedsPerTrial": args.matched_kmeans_seeds,
        "nmiMean": float(matched_nmi.mean()),
        "nmiP95": float(np.quantile(matched_nmi, 0.95)),
        "ariMean": float(matched_ari.mean()),
        "observedNmi": observed["nmi"],
        "trialsAtOrAboveObserved": exceed,
        "empiricalP": (exceed + 1) / (args.trials + 1),
    }
    print(f"matched ICD-10 null ({args.matched_kmeans_seeds} seeds/trial): NMI mean {matched['nmiMean']:.4f}, p95 {matched['nmiP95']:.4f}; "
          f"observed {observed['nmi']:.4f} -> p = {matched['empiricalP']:.3f}")

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "null": "all classes i.i.d. N(0, I_d); labels by construction order",
        "clustering": "StandardScaler, KMeans(K = classes, n_init=10)",
        "dim": args.dim,
        "trials": args.trials,
        "seed": args.seed,
        "rows": rows,
        "matchedIcd10": matched,
        "observedIcd10": observed,
        "runtimeSeconds": round(time.time() - started, 1),
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "nmi_null_simulation.json").write_text(json.dumps(report, indent=2) + "\n")

    lines = [
        "# Finite-sample NMI/ARI under a null with no class signal", "",
        f"Null: every class i.i.d. N(0, I_{args.dim}); labels by construction order. "
        f"Clustering: standardized features, K-Means (K = classes, n_init=10). {args.trials} trials per row.", "",
        "| Structure | n per class | C | N | mean NMI | NMI p95 | mean ARI |", "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for row in rows:
        lines.append(f"| {row['structure']} | {row['perClass']} | {row['classes']} | {row['n']} | "
                     f"{row['nmiMean']:.4f} | {row['nmiP95']:.4f} | {row['ariMean']:+.4f} |")
    lines += [
        "",
        f"Matched ICD-10 configuration (observed chapter sizes, mean over {args.matched_kmeans_seeds} K-Means seeds per trial, "
        f"as in the evaluation): null NMI mean {matched['nmiMean']:.4f}, 95th percentile {matched['nmiP95']:.4f}. "
        f"Observed ICD-10 NMI {observed['nmi']:.4f}: {exceed} of {args.trials} null trials at or above it, empirical p = {matched['empiricalP']:.3f}. "
        f"Label permutation on the observed clusters (of record): baseline NMI {observed['permutationBaselineNmi']:.4f}, "
        f"debiased {observed['debiasedNmi']:.4f}, p = {observed['permutationNmiP']:.3f}.",
        "",
    ]
    (OUT_DIR / "nmi_null_simulation.md").write_text("\n".join(lines))


if __name__ == "__main__":
    main()
