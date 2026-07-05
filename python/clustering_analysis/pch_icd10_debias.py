#!/usr/bin/env python3
"""
ICD10 聚类泄露的去偏校正 (De-biasing).

问题: PCH-ICD10 分层聚类里，小样本层 (每类 3-4 个样本) 的 NMI 高达 0.50，
但 verify_sample_size_bias.py 已证明: 在「零真实泄露」(标签与 gas 无关) 的零假设下，
小样本 KMeans 仍会产生很高的虚假 NMI。所以原始 NMI 不能直接当泄露读。

本脚本对每个 layer 做去偏:
  1. 多 seed 平均 observed NMI (减少单次 KMeans 初始化的方差)。
  2. 构造 permutation baseline: 在同一 X 上, 把标签 y 随机打乱 N_PERM 次,
     每次重跑 KMeans 算 NMI。打乱后标签与 gas 必然无关 (真泄露=0),
     所以这组 NMI 的分布就是「纯小样本偏差」的经验零分布。
  3. 去偏泄露 = observed_mean_NMI - baseline_mean_NMI。
  4. 单边经验 p 值 = P(baseline_NMI >= observed_NMI), 即 observed 落在零分布里的概率。
     p 小 (<0.05) 才说明 observed 显著高于纯噪声, 即存在真实泄露。

复用 analyze_pch_clustering.py 的数据提取逻辑, 保证方法一致。
"""
import argparse
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import normalized_mutual_info_score, adjusted_rand_score

from analyze_pch_clustering import (
    load_json,
    find_pch_dataset,
    extract_data_by_layer,
    DEFAULT_DATA_DIR,
)

OUTPUT_DIR = Path(__file__).parents[1] / "results" / "pch_clustering_analysis"

N_SEEDS = 20      # observed NMI 的多 seed 平均次数
N_PERM = 200      # permutation baseline 的打乱次数


def kmeans_nmi(X_scaled: np.ndarray, y: np.ndarray, k: int, seed: int) -> float:
    km = KMeans(n_clusters=k, random_state=seed, n_init=10)
    pred = km.fit_predict(X_scaled)
    return normalized_mutual_info_score(y, pred)


def debias_layer(layer: str, data: dict, rng: np.random.Generator) -> dict:
    X = data["X"]
    y = data["y"]
    k = data["n_classes"]

    X_scaled = StandardScaler().fit_transform(X)

    # --- 1. observed: 多 seed 平均 (真标签) ---
    obs = [kmeans_nmi(X_scaled, y, k, seed) for seed in range(N_SEEDS)]
    obs_mean = float(np.mean(obs))
    obs_std = float(np.std(obs))

    # --- 2. permutation baseline (打乱标签 -> 真泄露=0) ---
    base = []
    for _ in range(N_PERM):
        y_perm = rng.permutation(y)
        # 每次用单一 seed 即可, 打乱本身已经引入随机性
        base.append(kmeans_nmi(X_scaled, y_perm, k, seed=0))
    base = np.array(base)
    base_mean = float(base.mean())
    base_std = float(base.std())
    base_p95 = float(np.percentile(base, 95))

    # --- 3. 去偏 & 显著性 ---
    debiased = obs_mean - base_mean
    # 单边经验 p 值: 零分布里 >= observed 的比例 (+1 平滑)
    p_value = float((np.sum(base >= obs_mean) + 1) / (N_PERM + 1))

    return {
        "layer": layer,
        "n_samples": len(X),
        "n_classes": k,
        "samples_per_class": round(len(X) / k, 1),
        "observed_nmi": round(obs_mean, 4),
        "observed_nmi_std": round(obs_std, 4),
        "baseline_nmi": round(base_mean, 4),
        "baseline_nmi_std": round(base_std, 4),
        "baseline_p95": round(base_p95, 4),
        "debiased_nmi": round(debiased, 4),
        "p_value": round(p_value, 4),
        "significant": p_value < 0.05,
    }


def main():
    ap = argparse.ArgumentParser(description="ICD10 聚类泄露去偏校正")
    ap.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    ap.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    ds_path = find_pch_dataset(args.data_dir)
    if not ds_path:
        print(f"No pch_dataset.json under {args.data_dir}")
        return
    print(f"Loading {ds_path} ...")
    dataset = load_json(ds_path)

    grouped = extract_data_by_layer(dataset, use_icd10=True)
    # 只对 >=2 类的层做 (K<2 聚类无意义)
    grouped = {l: d for l, d in grouped.items() if d["n_classes"] >= 2}

    rng = np.random.default_rng(args.seed)
    print(f"De-biasing {len(grouped)} ICD10 layers "
          f"({N_SEEDS} seeds, {N_PERM} permutations each)...\n")

    rows = [debias_layer(l, d, rng) for l, d in grouped.items()]
    df = pd.DataFrame(rows).sort_values("samples_per_class").reset_index(drop=True)

    cols = ["layer", "n_samples", "n_classes", "samples_per_class",
            "observed_nmi", "baseline_nmi", "baseline_p95",
            "debiased_nmi", "p_value", "significant"]
    print(df[cols].to_string(index=False))

    out = args.output_dir / "pch_icd10_debiased.csv"
    df.to_csv(out, index=False)
    print(f"\nSaved -> {out}")

    # 汇总
    n_sig = int(df["significant"].sum())
    print("\n=== 解读 ===")
    print(f"原始(单 seed)平均 NMI : {df['observed_nmi'].mean():.4f}")
    print(f"纯小样本 baseline 平均: {df['baseline_nmi'].mean():.4f}")
    print(f"去偏后平均 NMI       : {df['debiased_nmi'].mean():.4f}")
    print(f"显著泄露的层 (p<0.05): {n_sig}/{len(df)}")
    if n_sig == 0:
        print("→ 所有层的 observed NMI 都落在「零泄露」零分布内, "
              "ICD10 的高 NMI 可完全由小样本偏差解释, 无真实内容泄露证据。")
    else:
        sig = df[df["significant"]]["layer"].tolist()
        print(f"→ 以下层去偏后仍显著, 需进一步关注: {sig}")


if __name__ == "__main__":
    main()
