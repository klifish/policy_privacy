#!/usr/bin/env python3
"""
Analyze Policy Content Hiding (PCH) using Clustering Algorithms.

Goal: Determine if an attacker can distinguish between different policy contents
(specifically DUO Terms or ICD10 scopes) within the same structural layer, purely based on Gas costs.

Method:
1. Group data by 'layer' (e.g., flat_singleton, structural_variants).
2. Within each layer, treat 'duoTerm' or 'icd10Scope' as the hidden class label.
3. Apply K-Means (K = number of unique terms) and DBSCAN.
4. Calculate ARI to measure leakage.
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
# Read the authoritative unified export directly (not the derived python/data
# copy, which can lag behind dataset regenerations such as the trivial split).
# pch_icd10_debias.py imports this DEFAULT_DATA_DIR, so it inherits the change.
DEFAULT_DATA_DIR = (
    Path(__file__).resolve().parents[2]
    / "experiments" / "unified" / "artifacts_data" / "polygonAmoy"
)
OUTPUT_DIR = Path(__file__).parents[1] / "results" / "pch_clustering_analysis"


def ensure_numeric(value):
    if isinstance(value, str):
        if value.startswith("0x"):
            return int(value, 16)
        return float(value)
    return value


def load_json(path: Path):
    with open(path, 'r') as f:
        return json.load(f)


def find_pch_dataset(data_dir: Path) -> Optional[Path]:
    """Find pch_dataset.json in subdirectories."""
    # Check specific known path first or search
    candidates = list(data_dir.glob("**/pch_dataset.json"))
    if candidates:
        return candidates[0]  # Return the first one found
    return None


def extract_data_by_layer(dataset: List[dict], use_icd10: bool = False) -> Dict[str, Dict]:
    """
    Group dataset by layer.

    Args:
        dataset: List of data entries
        use_icd10: If True, cluster by ICD10 scope instead of DUO terms

    Returns: {
        "layer_name": {
            "X": DataFrame,
            "y": array,
            "term_labels": list of str (for legend),
            "n_classes": int
        }
    }
    """
    grouped = {}

    for entry in dataset:
        layer = entry.get("layer", "unknown")

        # Extract Features
        features = entry.get("features", {})
        # Sometimes features are at top level or inside 'execution'
        if not features and "execution" in entry:
            # In some datasets, gas might be in 'execution' or 'features'
            # Let's look for keys in the entry itself if features is missing
            pass

        # If features is empty, try to find gas keys in the entry directly
        row = {}
        valid = True

        # Source 1: 'features' dict
        if features:
            for k in FEATURE_KEYS:
                val = ensure_numeric(features.get(k))
                if val is None:
                    valid = False
                row[k] = val
        else:
            # Source 2: Top level keys
            for k in FEATURE_KEYS:
                val = ensure_numeric(entry.get(k))
                if val is None:
                    valid = False
                row[k] = val

        if not valid:
            continue

        # Extract Label
        if use_icd10:
            # Extract ICD10 scope
            semantics = entry.get("semantics", {})
            icd10_scope = semantics.get("icd10Scope")
            if icd10_scope is None:
                continue

            # Use ICD10 scope ID as label
            term_str = icd10_scope.get("id", "UNKNOWN")
        else:
            # Extract DUO Term
            # duoTerm can be an int or string.
            # duoTermCodes is a list, usually we want the primary one.
            term = entry.get("duoTerm")
            if term is None:
                # Try duoTerms list
                terms = entry.get("duoTerms", [])
                if terms:
                    term = terms[0]
                else:
                    continue
            term_str = str(term)

        if layer not in grouped:
            grouped[layer] = {"rows": [], "labels": []}

        grouped[layer]["rows"].append(row)
        grouped[layer]["labels"].append(term_str)

    # Convert to numpy/pandas
    final_grouped = {}
    for layer, data in grouped.items():
        if len(data["rows"]) < 5:
            continue

        X = pd.DataFrame(data["rows"])

        # Encode labels to integers 0..N-1
        unique_labels = sorted(list(set(data["labels"])))
        label_map = {lbl: i for i, lbl in enumerate(unique_labels)}
        y = np.array([label_map[lbl] for lbl in data["labels"]])

        final_grouped[layer] = {
            "X": X,
            "y": y,
            "term_labels": unique_labels,
            "n_classes": len(unique_labels)
        }

    return final_grouped


def analyze_layer(layer_name: str, data: Dict):
    X = data["X"]
    y = data["y"]
    n_classes = data["n_classes"]

    # Standardize
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    results = {
        "layer": layer_name,
        "n_samples": len(X),
        "n_classes": n_classes
    }

    # --- 1. K-Means ---
    # We assume attacker knows how many terms exist (K = n_classes)
    # If n_classes < 2, clustering is meaningless (ARI = 1.0 trivially or 0.0)
    if n_classes < 2:
        results["kmeans_ari"] = 0.0
        results["kmeans_nmi"] = 0.0
        return results, X, np.zeros(len(X))

    kmeans = KMeans(n_clusters=n_classes, random_state=42, n_init=10)
    y_pred_km = kmeans.fit_predict(X_scaled)

    ari_km = adjusted_rand_score(y, y_pred_km)
    nmi_km = normalized_mutual_info_score(y, y_pred_km)
    results["kmeans_ari"] = ari_km
    results["kmeans_nmi"] = nmi_km

    # --- 2. DBSCAN ---
    dbscan = DBSCAN(eps=0.5, min_samples=5)
    y_pred_db = dbscan.fit_predict(X_scaled)
    ari_db = adjusted_rand_score(y, y_pred_db)
    results["dbscan_ari"] = ari_db

    return results, X, y_pred_km


def plot_cluster_result(X: pd.DataFrame, y_true: np.ndarray, y_pred: np.ndarray,
                        title: str, save_path: Path):
    plt.figure(figsize=(10, 5))

    # Plot 1: Ground Truth
    plt.subplot(1, 2, 1)
    plt.scatter(X['commitGasUsed'], X['accessGasUsed'],
                c=y_true, cmap='tab10', alpha=0.6, edgecolors='k')
    plt.title(f"Ground Truth ({len(set(y_true))} Terms)")
    plt.xlabel("Commit Gas")
    plt.ylabel("Access Gas")

    # Plot 2: Clustering Result
    plt.subplot(1, 2, 2)
    plt.scatter(X['commitGasUsed'], X['accessGasUsed'],
                c=y_pred, cmap='tab10', alpha=0.6, edgecolors='k')
    plt.title("Clustering Result (K-Means)")
    plt.xlabel("Commit Gas")
    plt.ylabel("Access Gas")

    plt.suptitle(title)
    plt.tight_layout()
    plt.savefig(save_path)
    plt.close()


def extract_data_global(dataset: List[dict], use_icd10: bool = False) -> Dict:
    """
    Extract all data for global clustering on DUO terms or ICD10 scopes.
    Ignores 'layer' structure.

    Args:
        dataset: List of data entries
        use_icd10: If True, cluster by ICD10 scope instead of DUO terms
    """
    rows = []
    labels = []

    for entry in dataset:
        # Extract Features
        features = entry.get("features", {})
        if not features and "execution" in entry:
            pass

        row = {}
        valid = True

        # Source 1: 'features' dict
        if features:
            for k in FEATURE_KEYS:
                val = ensure_numeric(features.get(k))
                if val is None:
                    valid = False
                row[k] = val
        else:
            # Source 2: Top level keys
            for k in FEATURE_KEYS:
                val = ensure_numeric(entry.get(k))
                if val is None:
                    valid = False
                row[k] = val

        if not valid:
            continue

        # Extract Label
        if use_icd10:
            # Extract ICD10 scope
            semantics = entry.get("semantics", {})
            icd10_scope = semantics.get("icd10Scope")
            if icd10_scope is None:
                continue

            # Use ICD10 scope ID as label
            term_str = icd10_scope.get("id", "UNKNOWN")
        else:
            # Extract DUO Term
            term = entry.get("duoTerm")
            if term is None:
                terms = entry.get("duoTerms", [])
                if terms:
                    term = terms[0]
                else:
                    continue
            term_str = str(term)

        labels.append(term_str)
        rows.append(row)

    if len(rows) < 5:
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


def main():
    parser = argparse.ArgumentParser(
        description="Run clustering analysis on PCH dataset")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--plot", action="store_true", help="Generate plots")
    parser.add_argument("--global-analysis", action="store_true",
                        help="Run global analysis ignoring layers")
    parser.add_argument("--icd10", action="store_true",
                        help="Cluster by ICD10 scope instead of DUO terms")
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    dataset_path = find_pch_dataset(args.data_dir)
    if not dataset_path:
        print(f"No pch_dataset.json found in {args.data_dir}")
        return

    print(f"Loading dataset from {dataset_path}...")
    dataset = load_json(dataset_path)

    # Determine clustering target
    target_label = "ICD10 Scopes" if args.icd10 else "DUO Terms"
    file_suffix = "icd10" if args.icd10 else "duo"

    if args.global_analysis:
        print(f"Running Global Analysis on {target_label} (Ignoring Layers)...")
        data = extract_data_global(dataset, use_icd10=args.icd10)
        if data:
            res, X_df, y_pred = analyze_layer(f"Global_All_{file_suffix.upper()}", data)
            print(
                f"Global Analysis | Classes: {res['n_classes']:2} | K-Means ARI: {res['kmeans_ari']:.4f} | NMI: {res['kmeans_nmi']:.4f}")

            if args.plot:
                plot_path = args.output_dir / f"global_{file_suffix}_kmeans.png"
                plot_cluster_result(X_df, data["y"], y_pred,
                                    f"Global Analysis ({target_label})\nARI: {res['kmeans_ari']:.4f}, NMI: {res['kmeans_nmi']:.4f}",
                                    plot_path)

            # Save single result
            pd.DataFrame([res]).to_csv(args.output_dir /
                                       f"pch_global_{file_suffix}_clustering.csv", index=False)
        else:
            print(f"No valid data found for {target_label} clustering.")
        return

    print(f"Grouping data by layer (target: {target_label})...")
    grouped_data = extract_data_by_layer(dataset, use_icd10=args.icd10)

    all_results = []

    print(f"Analyzing {len(grouped_data)} layers...")

    for layer, data in grouped_data.items():
        res, X_df, y_pred = analyze_layer(layer, data)
        all_results.append(res)

        print(
            f"Layer: {layer:25} | Classes: {res['n_classes']:2} | K-Means ARI: {res['kmeans_ari']:.4f} | NMI: {res['kmeans_nmi']:.4f}")

        if args.plot and res['n_classes'] > 1:
            plot_path = args.output_dir / f"{layer}_{file_suffix}_kmeans.png"
            plot_cluster_result(X_df, data["y"], y_pred,
                                f"Layer: {layer} ({target_label})\nARI: {res['kmeans_ari']:.4f}, NMI: {res['kmeans_nmi']:.4f}",
                                plot_path)

    # Save Summary
    if all_results:
        df_res = pd.DataFrame(all_results)
        csv_path = args.output_dir / f"pch_{file_suffix}_clustering_summary.csv"
        df_res.to_csv(csv_path, index=False)
        print(f"\nAnalysis complete. Summary saved to {csv_path}")

        avg_ari = df_res['kmeans_ari'].mean()
        avg_nmi = df_res['kmeans_nmi'].mean()
        print(f"Average K-Means ARI across all layers: {avg_ari:.4f}")
        print(f"Average K-Means NMI across all layers: {avg_nmi:.4f}")
    else:
        print(f"No valid data found for {target_label} clustering.")


if __name__ == "__main__":
    main()
