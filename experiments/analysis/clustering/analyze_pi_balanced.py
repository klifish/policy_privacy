#!/usr/bin/env python3
"""
平衡 PI 配对的聚类 + 去偏分析 (聚类口径的干净判定).

读 data/polygonAmoy/pi_pairs_balanced.json (由 build_balanced_pi_pairs.py 生成,
每对两边各 30 样本 → 平衡)。对每对:
  1. StandardScaler + KMeans(K=2), 多 seed 平均 → observed ARI/NMI;
  2. label-permutation baseline: 打乱标签 N_PERM 次重跑 KMeans (打乱后标签与 gas 无关,
     真泄露=0) → 纯偏差零分布;
  3. debiased_nmi = observed_mean - baseline_mean; 单边经验 p 值 = P(baseline >= observed)。
p<0.05 才说明该对在 gas 上真可区分 (隐私泄露)。

复用 analyze_pi_clustering 的特征提取, 复用 pch_icd10_debias 的去偏范式 (K 固定为 2)。
"""
import argparse
import json
import numpy as np
import pandas as pd
from joblib import Parallel, delayed
from pathlib import Path
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (
    adjusted_rand_score,
    normalized_mutual_info_score,
)

from experiments.analysis.paths import CLUSTERING_RESULTS_DIR
from .analyze_pi_clustering import extract_data_from_pair, DEFAULT_DATA_DIR
from .clustering_stats import (
    DEFAULT_BOOTSTRAPS,
    DEFAULT_KMEANS_SEEDS,
    DEFAULT_PERMUTATIONS,
    benjamini_hochberg,
    ensemble_permutation_analysis,
    write_metadata,
)

OUTPUT_DIR = CLUSTERING_RESULTS_DIR / "pi"

N_SEEDS = DEFAULT_KMEANS_SEEDS
N_PERM = DEFAULT_PERMUTATIONS


def km_metrics(X_scaled, y, seed):
    pred = KMeans(n_clusters=2, random_state=seed, n_init=10).fit_predict(X_scaled)
    return (adjusted_rand_score(y, pred), normalized_mutual_info_score(y, pred))


def debias_pair(pair, rng, *, kmeans_seeds=N_SEEDS, permutations=N_PERM):
    X, y, names = extract_data_from_pair(pair)
    if X is None or len(X) < 4 or len(set(y)) < 2:
        return None
    analysis = ensemble_permutation_analysis(
        X, y, 2, kmeans_seeds=kmeans_seeds, permutations=permutations,
        random_seed=int(rng.integers(0, 2**31 - 1)),
    )
    obs_ari = analysis["observed"]["ari"]
    obs_nmi = analysis["observed"]["nmi"]
    base_mean = analysis["nullNmi"]["mean"]
    p_value = analysis["nullNmi"]["pValue"]

    return {
        "pair_id": pair.get("pairId"),
        "mode": pair.get("mode"),
        "pair_type": pair.get("pairType"),
        "policy_a": names[0],
        "policy_b": names[1],
        "n_samples": len(X),
        "n0": int(np.sum(y == 0)),
        "n1": int(np.sum(y == 1)),
        "observed_ari": round(obs_ari, 4),
        "observed_nmi": round(obs_nmi, 4),
        "baseline_nmi": round(base_mean, 4),
        "baseline_p95": round(analysis["nullNmi"]["p95"], 4),
        "debiased_nmi": round(obs_nmi - base_mean, 4),
        "p_value": p_value,
        "significant": p_value < 0.05,
    }


def debias_pair_seeded(pair, random_seed, *, kmeans_seeds=N_SEEDS, permutations=N_PERM):
    return debias_pair(
        pair, np.random.default_rng(random_seed),
        kmeans_seeds=kmeans_seeds, permutations=permutations,
    )


def policy_weighted_bootstrap(df, iterations, seed):
    """Pigeonhole bootstrap: pair weight is multiplicity(policy A)*multiplicity(B)."""
    policies = sorted(set(df["policy_a"]) | set(df["policy_b"]))
    rng = np.random.default_rng(seed)
    means = []
    for _ in range(iterations):
        sampled = rng.choice(policies, size=len(policies), replace=True)
        counts = dict(zip(*np.unique(sampled, return_counts=True)))
        weights = np.array([
            counts.get(a, 0) * counts.get(b, 0)
            for a, b in zip(df["policy_a"], df["policy_b"])
        ], dtype=float)
        if weights.sum() > 0:
            means.append(float(np.average(df["debiased_nmi"], weights=weights)))
    return {
        "mean": float(df["debiased_nmi"].mean()),
        "ci95": [float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))],
        "iterations": len(means),
        "uniquePolicies": len(policies),
    }


def main():
    ap = argparse.ArgumentParser(description="Balanced PI clustering + de-bias")
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--pairs-file", type=Path, default=None)
    ap.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--kmeans-seeds", type=int, default=N_SEEDS)
    ap.add_argument("--permutations", type=int, default=N_PERM)
    ap.add_argument("--bootstraps", type=int, default=DEFAULT_BOOTSTRAPS)
    ap.add_argument("--jobs", type=int, default=-1)
    args = ap.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    pairs_file = args.pairs_file or (
        list(args.data_dir.glob("**/pi_pairs_balanced.json"))[0]
    )
    print(f"Loading {pairs_file} ...")
    data = json.load(open(pairs_file))
    pairs = data.get("pairs", [])
    print(f"{len(pairs)} balanced pairs\n")

    rng = np.random.default_rng(args.seed)
    pair_seeds = rng.integers(0, 2**31 - 1, size=len(pairs))
    rows = Parallel(n_jobs=args.jobs)(
        delayed(debias_pair_seeded)(
            pair, int(pair_seed), kmeans_seeds=args.kmeans_seeds,
            permutations=args.permutations,
        )
        for pair, pair_seed in zip(pairs, pair_seeds)
    )
    rows = [row for row in rows if row]
    df = pd.DataFrame(rows)
    df["q_value"] = benjamini_hochberg(df["p_value"].to_numpy())
    df["significant_fdr"] = df["q_value"] < 0.05

    out = args.output_dir / "pi_balanced_debiased.csv"
    df.to_csv(out, index=False)
    bootstrap = policy_weighted_bootstrap(df, args.bootstraps, args.seed + 1)
    summary_path = args.output_dir / "pi_balanced_summary.json"
    summary_path.write_text(json.dumps({"policyWeightedBootstrap": bootstrap}, indent=2))
    write_metadata(
        args.output_dir / "pi_clustering_metadata.json",
        source=pairs_file, feature_keys=["commitGasUsed", "accessGasUsed"],
        kmeansSeeds=args.kmeans_seeds, permutations=args.permutations,
        bootstraps=args.bootstraps, randomSeed=args.seed,
    )

    pd.set_option("display.width", 160)
    print("=== 平衡后逐对 (前 15 行) ===")
    cols = ["pair_id", "mode", "pair_type", "n_samples",
            "observed_nmi", "baseline_nmi", "debiased_nmi", "p_value", "significant"]
    show = df.copy()
    show["pair_id"] = show["pair_id"].str.slice(0, 28)
    print(show[cols].head(15).to_string(index=False))

    print("\n=== 按 mode 汇总 ===")
    g = df.groupby("mode").agg(
        n=("pair_id", "size"),
        obs_nmi=("observed_nmi", "mean"),
        base_nmi=("baseline_nmi", "mean"),
        debiased=("debiased_nmi", "mean"),
        n_sig=("significant", "sum"),
    )
    print(g.to_string())

    print("\n=== 按 pair_type 汇总 ===")
    g2 = df.groupby("pair_type").agg(
        n=("pair_id", "size"),
        obs_nmi=("observed_nmi", "mean"),
        base_nmi=("baseline_nmi", "mean"),
        debiased=("debiased_nmi", "mean"),
        n_sig=("significant", "sum"),
    )
    print(g2.to_string())

    n_sig = int(df["significant"].sum())
    print(f"\n=== 干净判定 ===")
    print(f"平衡对总数: {len(df)} (全部 30v30)")
    print(f"原始观测平均 NMI: {df['observed_nmi'].mean():.4f}")
    print(f"小样本 baseline 平均 NMI: {df['baseline_nmi'].mean():.4f}")
    print(f"去偏后平均 NMI: {df['debiased_nmi'].mean():.4f}")
    print(f"显著可区分的对 (p<0.05): {n_sig}/{len(df)}")
    if n_sig == 0:
        print("→ 平衡 + 去偏后无任何对显著: 聚类口径确认 PI 不可区分 "
              "(且不再受 1:30 退化污染)。")
    else:
        sig = df[df["significant"]][["pair_id", "pair_type", "debiased_nmi", "p_value"]]
        print("→ 以下对去偏后仍显著可区分:")
        print(sig.to_string(index=False))
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    main()
