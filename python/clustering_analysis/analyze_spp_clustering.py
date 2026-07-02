#!/usr/bin/env python3
"""
Analyze Structure & Parameter Privacy (SPP) using Clustering Algorithms.

Goal: Determine if an attacker can infer structural properties (Logic, Depth, etc.)
purely based on Gas costs.

Targets:
1. Logic Structure (5 classes: and_only, and_or_mixed, negation_heavy, or_only, trivial)
2. Nesting Depth (4 classes: deep, flat, medium, shallow)
3. Predicate Count (4 classes: few, many, none, single)
4. Set Size (4 classes: large, medium, none, small)
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

# Configuration
FEATURE_KEYS = ["commitGasUsed", "accessGasUsed"]
DEFAULT_DATA_DIR = Path(__file__).parents[1] / "data"
OUTPUT_DIR = Path(__file__).parents[1] / "results" / "spp_clustering_analysis"

# Target Definitions based on user input and report
TARGETS = {
    "logicStructure": ["and_only", "and_or_mixed", "negation_heavy", "or_only", "trivial"],
    "nestingDepth": ["deep", "flat", "medium", "shallow"],
    "predicateCount": ["few", "many", "none", "single"],
    "setSize": ["large", "medium", "none", "small"]
}


def ensure_numeric(value):
    if isinstance(value, str):
        if value.startswith("0x"):
            return int(value, 16)
        return float(value)
    return value


def load_json(path: Path):
    with open(path, 'r') as f:
        return json.load(f)


def find_spp_dataset(data_dir: Path) -> Optional[Path]:
    candidates = list(data_dir.glob("**/spp_dataset.json"))
    if candidates:
        return candidates[0]
    return None


def extract_data_for_target(dataset: List[dict], target_name: str, valid_classes: List[str]) -> Dict:
    """
    Extract data for a specific SPP target (e.g., logicStructure).
    """
    rows = []
    labels = []

    # Helper to find the target value in the nested structure
    # The dataset structure might vary, so we need to be flexible.
    # Based on report, these seem to be derived features or specific fields.
    # Let's look at the dataset sample provided earlier.
    # It seems 'layer' maps to logicStructure? Or is there a specific field?
    # The report shows "spp": { "logicStructure": ... }
    # But the raw dataset has "layer", "structure": {...}

    # We need to map dataset fields to these targets.
    # Assuming the dataset has these fields directly or we infer them.
    # For now, let's try to find keys that match the target name or
    # use a mapping if we know it.

    # MAPPING STRATEGY (Hypothetical based on standard SPP generation):
    # logicStructure -> often 'layer' or derived from it
    # nestingDepth -> 'structure.policyDepth' or similar?
    # predicateCount -> 'semantics.predicateCount'
    # setSize -> 'structure.whitelistSize'

    for entry in dataset:
        # 1. Extract Features
        features = entry.get("features", {})
        if not features:
            # Fallback to top level
            features = entry

        row = {}
        valid_feat = True
        for k in FEATURE_KEYS:
            val = ensure_numeric(features.get(k))
            if val is None:
                valid_feat = False
            row[k] = val

        if not valid_feat:
            continue

        # 2. Extract Label
        label = None

        # Direct lookup first (if the dataset was pre-processed to have these keys)
        if target_name in entry:
            label = entry[target_name]

        # Fallback: Try to infer from known paths
        if label is None:
            if target_name == "logicStructure":
                # Map 'layer' to logic structure categories if possible
                # Or maybe the dataset already has 'logicStructure' key
                label = entry.get("logicStructure")
                if not label:
                    # Fallback: use 'layer' if it matches one of the valid classes
                    l = entry.get("layer")
                    if l in valid_classes:
                        label = l

            elif target_name == "nestingDepth":
                label = entry.get("nestingDepth")

            elif target_name == "predicateCount":
                label = entry.get("predicateCount")
                # Or map numeric count to category?
                # The report says classes are "few", "many", "none", "single"
                # This implies the dataset has these string labels.

            elif target_name == "setSize":
                label = entry.get("setSize")

        # If we still don't have a label, or it's not in our valid list, skip
        if label is None or str(label) not in valid_classes:
            continue

        rows.append(row)
        labels.append(str(label))

    if len(rows) < 10:
        return None

    X = pd.DataFrame(rows)

    # Encode labels
    unique_labels = sorted(list(set(labels)))
    label_map = {lbl: i for i, lbl in enumerate(unique_labels)}
    y = np.array([label_map[lbl] for lbl in labels])

    return {
        "X": X,
        "y": y,
        "term_labels": unique_labels,
        "n_classes": len(unique_labels)
    }


def analyze_target(target_name: str, data: Dict):
    X = data["X"]
    y = data["y"]
    n_classes = data["n_classes"]

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    results = {
        "target": target_name,
        "n_samples": len(X),
        "n_classes": n_classes
    }

    # K-Means
    kmeans = KMeans(n_clusters=n_classes, random_state=42, n_init=10)
    y_pred_km = kmeans.fit_predict(X_scaled)
    results["kmeans_ari"] = adjusted_rand_score(y, y_pred_km)
    results["kmeans_nmi"] = normalized_mutual_info_score(y, y_pred_km)

    return results, X, y_pred_km


def plot_cluster_result(X: pd.DataFrame, y_true: np.ndarray, y_pred: np.ndarray,
                        title: str, save_path: Path):
    plt.figure(figsize=(10, 5))

    plt.subplot(1, 2, 1)
    plt.scatter(X['commitGasUsed'], X['accessGasUsed'],
                c=y_true, cmap='viridis', alpha=0.6, edgecolors='k')
    plt.title("Ground Truth")
    plt.xlabel("Commit Gas")
    plt.ylabel("Access Gas")

    plt.subplot(1, 2, 2)
    plt.scatter(X['commitGasUsed'], X['accessGasUsed'],
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
        description="Run clustering analysis on SPP dataset")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--plot", action="store_true", help="Generate plots")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = find_spp_dataset(args.data_dir)
    if not dataset_path:
        print(f"No spp_dataset.json found in {args.data_dir}")
        return

    print(f"Loading dataset from {dataset_path}...")
    dataset = load_json(dataset_path)

    all_results = []

    for target, classes in TARGETS.items():
        print(f"Analyzing target: {target}...")
        data = extract_data_for_target(dataset, target, classes)

        if not data:
            print(
                f"  Skipping {target}: Insufficient data or labels not found.")
            continue

        res, X_df, y_pred = analyze_target(target, data)
        all_results.append(res)

        print(
            f"  Target: {target:15} | Classes: {res['n_classes']} | K-Means ARI: {res['kmeans_ari']:.4f} | NMI: {res['kmeans_nmi']:.4f}")

        if args.plot:
            plot_path = args.output_dir / f"{target}_kmeans.png"
            plot_cluster_result(X_df, data["y"], y_pred,
                                f"Target: {target}\nARI: {res['kmeans_ari']:.4f}, NMI: {res['kmeans_nmi']:.4f}",
                                plot_path)

    if all_results:
        df_res = pd.DataFrame(all_results)
        csv_path = args.output_dir / "spp_clustering_summary.csv"
        df_res.to_csv(csv_path, index=False)
        print(f"\nAnalysis complete. Summary saved to {csv_path}")


if __name__ == "__main__":
    main()
