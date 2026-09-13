#!/usr/bin/env python3
"""
Analyze Policy Indistinguishability (PI) using Clustering Algorithms.

This script treats the privacy problem as an unsupervised learning task:
Can an attacker distinguish between two policies in a pair without having
labeled training data, simply by observing the natural grouping of gas costs?

Algorithms:
1. K-Means (K=2): Forces data into 2 clusters. High ARI means data is separable.
2. DBSCAN: Finds density-based clusters. If it finds 1 cluster, privacy is good.
"""
import argparse
import json
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from sklearn.cluster import KMeans, DBSCAN
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import adjusted_rand_score, silhouette_score, normalized_mutual_info_score

from experiments.analysis.paths import CAPTURE_DATA_DIR, CLUSTERING_RESULTS_DIR

# Configuration
FEATURE_KEYS = ["commitGasUsed", "accessGasUsed"]
DEFAULT_DATA_DIR = CAPTURE_DATA_DIR
OUTPUT_DIR = CLUSTERING_RESULTS_DIR / "pi"


def ensure_numeric(value):
    if isinstance(value, str):
        if value.startswith("0x"):
            return int(value, 16)
        return float(value)
    return value


def load_json(path: Path):
    with open(path, 'r') as f:
        return json.load(f)


def get_pi_pairs_files(data_dir: Path) -> List[Path]:
    """Find all pi_pairs.json files in subdirectories."""
    files = []
    if data_dir.exists():
        for entry in data_dir.iterdir():
            if entry.is_dir() and (entry / "pi_pairs.json").exists():
                files.append(entry / "pi_pairs.json")
    return files


def extract_data_from_pair(pair: dict) -> Tuple[pd.DataFrame, np.ndarray, List[str]]:
    """
    Extract features and labels from a PI pair.
    Returns: (X, y, policy_names)
    """
    data_rows = []
    labels = []
    policy_names = []

    policies = pair.get("policies", [])
    if len(policies) < 2:
        return None, None, None

    for idx, policy in enumerate(policies):
        p_name = policy.get("name", f"Policy_{idx}")
        policy_names.append(p_name)

        # Extract from 'features' list (aggregated runs) or 'rawExecutions'
        runs = policy.get("features", [])

        # If features is a dict (single run summary), wrap it
        if isinstance(runs, dict):
            runs = [runs]

        for run in runs:
            # Sometimes the run itself is the dict, sometimes it has a 'features' key
            feats = run.get("features", run) if isinstance(
                run, dict) and "features" in run else run

            row = {}
            valid = True
            for k in FEATURE_KEYS:
                val = ensure_numeric(feats.get(k))
                if val is None:
                    valid = False
                    break
                row[k] = val

            if valid:
                data_rows.append(row)
                labels.append(idx)  # 0 or 1

    if not data_rows:
        return None, None, None

    X = pd.DataFrame(data_rows)
    y = np.array(labels)
    return X, y, policy_names


def analyze_pair(X: pd.DataFrame, y: np.ndarray, policy_names: List[str], pair_id: str):
    """Run clustering analysis on a single pair."""

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    results = {
        "pair_id": pair_id,
        "n_samples": len(X),
        "policy_names": policy_names
    }

    # --- 1. K-Means (K=2) ---
    # Assumption: Attacker knows there are 2 policies
    kmeans = KMeans(n_clusters=2, random_state=42, n_init=10)
    y_pred_km = kmeans.fit_predict(X_scaled)

    ari_km = adjusted_rand_score(y, y_pred_km)
    nmi_km = normalized_mutual_info_score(y, y_pred_km)
    try:
        sil_km = silhouette_score(X_scaled, y_pred_km)
    except:
        sil_km = -1.0  # Error if only 1 cluster found (unlikely for K=2)

    results["kmeans_ari"] = ari_km
    results["kmeans_nmi"] = nmi_km
    results["kmeans_silhouette"] = sil_km

    # --- 2. DBSCAN ---
    # Assumption: Attacker doesn't know K, looks for density
    # eps=0.5 is standard for scaled data (z-score)
    dbscan = DBSCAN(eps=0.5, min_samples=5)
    y_pred_db = dbscan.fit_predict(X_scaled)

    # DBSCAN labels: -1 is noise. We treat noise as a separate cluster or ignore?
    # For ARI, we just compare raw labels.
    ari_db = adjusted_rand_score(y, y_pred_db)
    n_clusters_db = len(set(y_pred_db)) - (1 if -1 in y_pred_db else 0)

    results["dbscan_ari"] = ari_db
    results["dbscan_n_clusters"] = n_clusters_db

    return results, X, y_pred_km


def plot_cluster_result(X: pd.DataFrame, y_true: np.ndarray, y_pred: np.ndarray,
                        title: str, save_path: Path):
    plt.figure(figsize=(10, 5))

    # Plot 1: Ground Truth
    plt.subplot(1, 2, 1)
    scatter1 = plt.scatter(X['commitGasUsed'], X['accessGasUsed'],
                           c=y_true, cmap='viridis', alpha=0.6, edgecolors='k')
    plt.title("Ground Truth (Real Labels)")
    plt.xlabel("Commit Gas")
    plt.ylabel("Access Gas")

    # Plot 2: Clustering Result
    plt.subplot(1, 2, 2)
    scatter2 = plt.scatter(X['commitGasUsed'], X['accessGasUsed'],
                           c=y_pred, cmap='coolwarm', alpha=0.6, edgecolors='k')
    plt.title("Clustering Result (K-Means)")
    plt.xlabel("Commit Gas")
    plt.ylabel("Access Gas")

    plt.suptitle(title)
    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()


def main():
    parser = argparse.ArgumentParser(
        description="Run clustering analysis on PI pairs")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--plot", action="store_true",
                        help="Generate plots for each pair")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    pair_files = get_pi_pairs_files(args.data_dir)
    if not pair_files:
        print(f"No pi_pairs.json found in {args.data_dir}")
        return

    all_results = []

    print(f"Found {len(pair_files)} pair files. Starting analysis...")

    for p_file in pair_files:
        print(f"Processing {p_file.parent.name}...")
        try:
            pairs_data = load_json(p_file)
            # Handle different json structures (list vs dict with 'pairs')
            pairs_list = pairs_data.get("pairs", []) if isinstance(
                pairs_data, dict) else pairs_data

            for i, pair in enumerate(pairs_list):
                pair_id = f"{p_file.parent.name}_pair_{i}"
                pair_type = pair.get("pairType", "unknown")
                X, y, names = extract_data_from_pair(pair)

                if X is None or len(X) < 4:
                    print(
                        f"  Skipping pair {i}: Insufficient data ({len(X) if X is not None else 0} samples)")
                    continue

                # Run Analysis
                res, X_df, y_pred_km = analyze_pair(X, y, names, pair_id)
                res["pair_type"] = pair_type
                all_results.append(res)

                print(
                    f"  Pair {i} [{pair_type}] ({names[0]} vs {names[1]}): K-Means ARI = {res['kmeans_ari']:.4f}, NMI = {res['kmeans_nmi']:.4f}")

                if args.plot:
                    plot_path = args.output_dir / f"{pair_id}_kmeans.png"
                    plot_cluster_result(X_df, y, y_pred_km,
                                        f"Pair {i} [{pair_type}]: {names[0]} vs {names[1]}\nARI: {res['kmeans_ari']:.4f}, NMI: {res['kmeans_nmi']:.4f}",
                                        plot_path)

        except Exception as e:
            print(f"Error processing {p_file}: {e}")

    # Save Summary
    if all_results:
        df_res = pd.DataFrame(all_results)
        csv_path = args.output_dir / "clustering_summary.csv"
        df_res.to_csv(csv_path, index=False)
        print(f"\nAnalysis complete. Summary saved to {csv_path}")

        avg_ari = df_res['kmeans_ari'].mean()
        avg_nmi = df_res['kmeans_nmi'].mean()
        print(f"Average K-Means ARI across all pairs: {avg_ari:.4f}")
        print(f"Average K-Means NMI across all pairs: {avg_nmi:.4f}")

        print("\n=== Results by Pair Type ===")
        grouped = df_res.groupby("pair_type")
        for name, group in grouped:
            mean_ari = group['kmeans_ari'].mean()
            mean_nmi = group['kmeans_nmi'].mean()
            max_ari = group['kmeans_ari'].max()
            count = len(group)
            print(
                f"Type: {name:25} | Count: {count:3} | Avg ARI: {mean_ari:.4f} | Avg NMI: {mean_nmi:.4f} | Max ARI: {max_ari:.4f}")

        print("\n  (0.0 = Perfect Privacy, 1.0 = No Privacy)")


if __name__ == "__main__":
    main()
