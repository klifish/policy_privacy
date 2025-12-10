#!/usr/bin/env python3
"""
Run Policy Content Hiding (PCH), Policy Indistinguishability (PI), and
Structure & Parameter Privacy (SPP) experiments with scikit-learn models.

The script performs attack modeling with Logistic Regression and
Random Forest classifiers and emits privacy metrics for each experiment.
"""
from __future__ import annotations

import argparse
import json
import math
import random
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

# Observable on-chain features shared across the experiments.
FEATURE_KEYS: Sequence[str] = (
    "commitGasUsed",
    "commitCalldataLength",
    "accessGasUsed",
    "accessCalldataLength",
    "proofSize",
    "commitLogsCount",
    "commitLogsSize",
    "accessLogsCount",
    "accessLogsSize",
    "blockDifference",
)

GAS_FEATURE_KEYS: Sequence[str] = tuple(
    key for key in FEATURE_KEYS if "gas" in key.lower()
)

RAW_DISTRIBUTION_FEATURES: Sequence[str] = (
    "accessGasUsed",
    "commitGasUsed",
)

DEFAULT_THRESHOLDS = {
    "auc_max": 0.55,
    "advantage_max": 0.05,
}

DEFAULT_VISUALIZATION_DIR = (
    Path(__file__).resolve().parent / "results" / "visualizations"
)

SCATTER_MATRIX_MAX_SAMPLES = 1000
SCATTER_PLOT_MAX_SAMPLES = 3000
OUTLIER_FEATURE_KEYS = GAS_FEATURE_KEYS
OUTLIER_THRESHOLD_MULTIPLIER = 1.5

REPO_ROOT = Path(__file__).resolve().parents[1]
PI_PAIR_GENERATOR = REPO_ROOT / "scripts" / "generate_pi_pairs.js"
NON_OBSERVABLE_FEATURES = {"proofGenerationTime"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run policy privacy experiments with scikit-learn",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    default_data_dir = Path(__file__).parent / "data"
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=default_data_dir,
        help="Directory that contains dataset folders (each with *_dataset.json)",
    )
    parser.add_argument(
        "--pi-pairs",
        type=Path,
        default=None,
        help="Optional path to pi_pairs.json (defaults to <data-dir>/pi_pairs.json)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).parent / "results" /
        "policy_privacy_report.json",
        help="Where to store the aggregated metrics report",
    )
    parser.add_argument(
        "--test-size",
        type=float,
        default=0.3,
        help="Test split size for the classifiers",
    )
    parser.add_argument(
        "--random-state",
        type=int,
        default=42,
        help="Random seed used for deterministic splits",
    )
    parser.add_argument(
        "--skip-auto-pairs",
        action="store_true",
        help="Disable automatic PI pair generation when pi_pairs.json is missing",
    )
    parser.add_argument(
        "--visualizations-dir",
        type=Path,
        default=DEFAULT_VISUALIZATION_DIR,
        help="Directory where dataset visualizations are stored",
    )
    parser.add_argument(
        "--skip-visualizations",
        action="store_true",
        help="Disable dataset visualization rendering",
    )
    return parser.parse_args()


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_numeric(value) -> Optional[float]:
    """Best-effort conversion to float. Returns None when conversion fails."""
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        stripped = value.strip()
        if stripped.startswith("0x"):
            try:
                return float(int(stripped, 16))
            except ValueError:
                return None
        try:
            return float(stripped)
        except ValueError:
            return None
    return None


def extract_feature_row(feature_bag: Dict[str, object]) -> Optional[Dict[str, float]]:
    row: Dict[str, float] = {}
    for key in FEATURE_KEYS:
        numeric_value = ensure_numeric(feature_bag.get(key))
        if numeric_value is None:
            return None
        row[key] = numeric_value
    return row


def strip_non_observable_features(feature_map: Optional[dict]) -> bool:
    if not isinstance(feature_map, dict):
        return False
    removed = False
    for key in NON_OBSERVABLE_FEATURES:
        if key in feature_map:
            feature_map.pop(key, None)
            removed = True
    return removed


def sanitize_dataset_entry(entry: dict) -> bool:
    return strip_non_observable_features(entry.get("features"))


def sanitize_pi_pair(pair: dict) -> bool:
    changed = False
    policies = pair.get("policies") or []
    for policy in policies:
        feature_runs = policy.get("features") or []
        for run in feature_runs:
            changed |= strip_non_observable_features(run.get("features"))
        raw_execs = policy.get("rawExecutions") or []
        for exec_record in raw_execs:
            changed |= strip_non_observable_features(exec_record.get("features"))
    return changed


def discover_dataset_dirs(base_dir: Path) -> List[Path]:
    if base_dir.is_file():
        raise ValueError(f"{base_dir} is a file; expected directory")
    if (base_dir / "pch_dataset.json").exists():
        return [base_dir]
    dirs: List[Path] = []
    if base_dir.exists():
        for entry in sorted(base_dir.iterdir()):
            if entry.is_dir() and (entry / "pch_dataset.json").exists():
                dirs.append(entry)
    return dirs


def aggregate_json_arrays(dataset_dirs: Sequence[Path], filename: str) -> List[dict]:
    combined: List[dict] = []
    for directory in dataset_dirs:
        file_path = directory / filename
        if not file_path.exists():
            print(f"[warn] {file_path} missing; skipping")
            continue
        data = load_json(file_path)
        changed = False
        if isinstance(data, list):
            for entry in data:
                if isinstance(entry, dict):
                    if sanitize_dataset_entry(entry):
                        changed = True
                    combined.append(entry)
                else:
                    combined.append(entry)
        else:
            print(f"[warn] {file_path} is not a JSON array; skipping")
            continue
        if changed:
            file_path.write_text(json.dumps(data, indent=2))
    return combined


def load_pi_pairs(path: Path) -> List[dict]:
    data = load_json(path)
    changed = False
    if isinstance(data, dict) and "pairs" in data:
        raw_pairs = list(data["pairs"])
        for pair in raw_pairs:
            if isinstance(pair, dict) and sanitize_pi_pair(pair):
                changed = True
        if changed:
            data["pairs"] = raw_pairs
            path.write_text(json.dumps(data, indent=2))
        return raw_pairs
    elif isinstance(data, list):
        for pair in data:
            if isinstance(pair, dict) and sanitize_pi_pair(pair):
                changed = True
        if changed:
            path.write_text(json.dumps(data, indent=2))
        return data
    else:
        raise ValueError(f"Unrecognized PI pairs format at {path}")


def aggregate_pi_pairs(dataset_dirs: Sequence[Path]) -> Tuple[List[dict], List[str]]:
    pairs: List[dict] = []
    sources: List[str] = []
    for directory in dataset_dirs:
        file_path = directory / "pi_pairs.json"
        if not file_path.exists():
            print(f"[warn] {file_path} missing; skipping PI pairs")
            continue
        try:
            data = load_pi_pairs(file_path)
        except ValueError as exc:
            print(f"[warn] {exc}")
            continue
        pairs.extend(data)
        sources.append(str(file_path))
    return pairs, sources


def auto_generate_pi_pairs(
    directory: Path,
    random_state: Optional[int],
) -> bool:
    pair_file = directory / "pi_pairs.json"
    if pair_file.exists():
        return True

    dataset_path = directory / "pi_dataset.json"
    if not dataset_path.exists():
        print(
            f"[warn] Cannot generate PI pairs for {directory}: "
            "pi_dataset.json is missing"
        )
        return False

    if not PI_PAIR_GENERATOR.exists():
        print(
            "[warn] PI pair generator script not found at "
            f"{PI_PAIR_GENERATOR}. Skipping auto-generation."
        )
        return False

    cmd = [
        "node",
        str(PI_PAIR_GENERATOR),
        "--dataset-dir",
        str(directory),
    ]
    if random_state is not None:
        cmd.extend(["--seed", str(random_state)])

    print(f"Generating PI pairs for {directory} ...")
    try:
        subprocess.run(cmd, check=True, cwd=str(REPO_ROOT))
    except FileNotFoundError:
        print("[warn] Node.js is not available; cannot auto-generate PI pairs")
        return False
    except subprocess.CalledProcessError as exc:
        print(f"[warn] Failed to generate PI pairs for {directory}: {exc}")
        return False

    if pair_file.exists():
        return True

    print(f"[warn] Expected PI pairs at {pair_file} but file was not created")
    return False


def prepare_dataframe(
    records: Iterable[dict],
    label_getter,
) -> pd.DataFrame:
    rows: List[Dict[str, object]] = []
    dropped = 0
    for idx, record in enumerate(records):
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            dropped += 1
            continue
        label = label_getter(record)
        if label is None:
            dropped += 1
            continue
        row = {
            "label": label,
            "_record_index": idx,
        }
        row.update(features)
        rows.append(row)

    if not rows:
        raise ValueError("No usable records found for dataframe construction")

    df = pd.DataFrame(rows)
    if dropped:
        print(
            f"[warn] Dropped {dropped} records due to missing features/labels")
    return df


def build_stratified_split(
    X: np.ndarray,
    y: np.ndarray,
    test_size: float,
    random_state: int,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    classes = np.unique(y)
    stratify = y if len(classes) > 1 else None
    return train_test_split(
        X,
        y,
        test_size=test_size,
        stratify=stratify,
        random_state=random_state,
    )


def build_models(num_classes: int) -> Dict[str, Pipeline]:
    classifier_map: Dict[str, Pipeline] = {}
    logistic = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            (
                "clf",
                LogisticRegression(
                    max_iter=2000,
                    class_weight="balanced" if num_classes > 2 else None,
                ),
            ),
        ]
    )
    forest = Pipeline(
        steps=[
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=400,
                    class_weight="balanced",
                    random_state=0,
                ),
            )
        ]
    )
    classifier_map["logistic_regression"] = logistic
    classifier_map["random_forest"] = forest
    return classifier_map


def compute_advantages(
    accuracy: float,
    y_train: np.ndarray,
    num_classes: int,
) -> Dict[str, float]:
    random_baseline = 1.0 / max(num_classes, 1)
    counts = Counter(y_train.tolist())
    total = sum(counts.values())
    majority = max((count / total for count in counts.values()), default=1.0)
    return {
        "vs_random": accuracy - random_baseline,
        "vs_majority": accuracy - majority,
    }


def evaluate_predictions(
    model_name: str,
    estimator: Pipeline,
    X_train: np.ndarray,
    X_test: np.ndarray,
    y_train: np.ndarray,
    y_test: np.ndarray,
    num_classes: int,
) -> Dict[str, object]:
    estimator.fit(X_train, y_train)
    predictions = estimator.predict(X_test)
    accuracy = accuracy_score(y_test, predictions)
    macro_f1 = f1_score(y_test, predictions, average="macro")
    advantages = compute_advantages(accuracy, y_train, num_classes)

    result: Dict[str, object] = {
        "model": model_name,
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "advantage_vs_random": advantages["vs_random"],
        "advantage_vs_majority": advantages["vs_majority"],
        "passed": advantages["vs_random"] <= DEFAULT_THRESHOLDS["advantage_max"],
    }

    # Try to compute ROC-AUC when probabilistic output is available.
    try:
        probabilities = estimator.predict_proba(X_test)
        if num_classes == 2:
            auc = roc_auc_score(y_test, probabilities[:, 1])
        else:
            auc = roc_auc_score(
                y_test,
                probabilities,
                multi_class="ovr",
            )
        result["auc"] = auc
        result["auc_passed"] = auc <= DEFAULT_THRESHOLDS["auc_max"]
        result["passed"] = result["passed"] and result["auc_passed"]
    except Exception:
        result["auc"] = None

    return result


def run_pch_experiment(
    records: Sequence[dict],
    test_size: float,
    random_state: int,
) -> Dict[str, object]:
    rows: List[Dict[str, object]] = []
    dropped = 0
    for record in records:
        features = extract_feature_row(record.get("features", {}))
        duo_terms = record.get("duoTermCodes") or []
        if features is None or not duo_terms:
            dropped += 1
            continue
        for term in duo_terms:
            row = {"label": term}
            row.update(features)
            rows.append(row)

    if not rows:
        raise ValueError("No usable PCH records found")
    if dropped:
        print(
            f"[warn] Dropped {dropped} PCH records due to missing features/duo terms")

    df = pd.DataFrame(rows)
    df, removed_outliers = remove_outliers_from_df(
        df,
        OUTLIER_FEATURE_KEYS,
        "PCH",
    )
    if df.empty:
        raise ValueError("All PCH samples removed during outlier filtering")
    X = df[list(FEATURE_KEYS)].to_numpy()
    y = df["label"].to_numpy()
    X_train, X_test, y_train, y_test = build_stratified_split(
        X,
        y,
        test_size,
        random_state,
    )

    models = build_models(num_classes=len(np.unique(y_train)))
    evaluations = [
        evaluate_predictions(
            name,
            estimator,
            X_train,
            X_test,
            y_train,
            y_test,
            num_classes=len(np.unique(y_train)),
        )
        for name, estimator in models.items()
    ]

    label_counts = Counter(df["label"])
    return {
        "samples": len(df),
        "class_distribution": dict(label_counts),
        "evaluations": evaluations,
    }


def run_spp_experiment(
    records: Sequence[dict],
    test_size: float,
    random_state: int,
) -> Dict[str, object]:
    df = prepare_dataframe(records, label_getter=lambda _: "placeholder")
    df, _ = remove_outliers_from_df(df, OUTLIER_FEATURE_KEYS, "SPP")
    if df.empty:
        raise ValueError("All SPP samples removed during outlier filtering")
    df["_record_index"] = df["_record_index"].astype(int)
    X = df[list(FEATURE_KEYS)].to_numpy()
    results: Dict[str, object] = {}
    targets = ["logicStructure", "nestingDepth",
               "predicateCount", "setSize", "rangeWidth"]

    for target in targets:
        labels = [
            records[idx].get(target)
            for idx in df["_record_index"].tolist()
        ]
        unique = {label for label in labels if label is not None}
        if len(unique) < 2:
            results[target] = {
                "samples": 0,
                "skipped": True,
                "reason": "insufficient label diversity",
            }
            continue

        df_target = df.copy()
        df_target["label"] = labels
        mask = df_target["label"].notna()
        df_target = df_target.loc[mask]

        label_counts = Counter(df_target["label"])
        min_count = min(label_counts.values())
        target_seed_base = random_state or 0
        balanced_groups = []
        for label_value, group in df_target.groupby("label"):
            if len(group) > min_count:
                seed = (target_seed_base + abs(hash((target, label_value)))) % (2**32 - 1)
                balanced_groups.append(group.sample(
                    n=min_count,
                    random_state=seed
                ))
            else:
                balanced_groups.append(group)
        df_target_balanced = pd.concat(balanced_groups, ignore_index=True)

        y = df_target_balanced["label"].to_numpy()
        X_target = df_target_balanced[list(FEATURE_KEYS)].to_numpy()
        X_train, X_test, y_train, y_test = build_stratified_split(
            X_target,
            y,
            test_size,
            random_state,
        )
        num_classes = len(np.unique(y_train))
        models = build_models(num_classes)
        evaluations = [
            evaluate_predictions(
                name,
                estimator,
                X_train,
                X_test,
                y_train,
                y_test,
                num_classes=num_classes,
            )
            for name, estimator in models.items()
        ]

        results[target] = {
            "samples": len(df_target_balanced),
            "class_distribution": dict(Counter(df_target_balanced["label"])),
            "evaluations": evaluations,
        }

    return results


def build_pi_samples(
    pairs: List[dict],
    drop_outliers: bool = True,
) -> List[dict]:
    samples: List[dict] = []
    for pair in pairs:
        pair_id = pair.get("pairId")
        pair_type = pair.get("pairType")
        policies = pair.get("policies") or []
        if len(policies) != 2:
            continue

        for policy_index, policy in enumerate(policies):
            executions = policy.get("features") or []
            for execution in executions:
                feature_bag = execution.get("features", {})
                features = extract_feature_row(feature_bag)
                if features is None:
                    continue
                samples.append(
                    {
                        "pairId": pair_id,
                        "pairType": pair_type,
                        "label": policy_index,
                        "features": features,
                    }
                )
    if drop_outliers:
        samples = drop_outlier_samples(samples, "PI")
    return samples


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def auto_bins(count: int) -> int:
    if count <= 0:
        return 1
    return min(60, max(5, int(math.sqrt(count))))


def compute_iqr_bounds(values: np.ndarray) -> Tuple[float, float]:
    if values.size == 0:
        return 0.0, 0.0
    if values.size < 4:
        lower = float(np.min(values))
        upper = float(np.max(values))
        return lower, upper
    q1 = float(np.percentile(values, 25))
    q3 = float(np.percentile(values, 75))
    iqr = q3 - q1
    if iqr == 0.0:
        padding = max(1.0, abs(q1) * 0.05)
        return q1 - padding, q3 + padding
    spread = iqr * OUTLIER_THRESHOLD_MULTIPLIER
    return q1 - spread, q3 + spread


def remove_outliers_from_df(
    df: pd.DataFrame,
    feature_names: Sequence[str],
    context: str,
) -> Tuple[pd.DataFrame, int]:
    if df.empty:
        return df, 0
    mask = pd.Series(True, index=df.index)
    for feature in feature_names:
        if feature not in df.columns:
            continue
        series = pd.to_numeric(df[feature], errors="coerce")
        series = series.replace([np.inf, -np.inf], np.nan)
        valid = series.dropna()
        if valid.empty:
            continue
        lower, upper = compute_iqr_bounds(valid.to_numpy())
        mask &= series.between(lower, upper, inclusive="both")
    mask = mask.fillna(False)
    kept = df.loc[mask]
    dropped = len(df) - len(kept)
    if dropped and kept.empty:
        return df, 0
    if dropped:
        print(
            f"[info] Removed {dropped} {context} samples due to gas outliers")
    return kept.reset_index(drop=True), dropped


def drop_outlier_samples(
    samples: List[dict],
    context: str,
) -> List[dict]:
    rows: List[Dict[str, object]] = []
    for idx, sample in enumerate(samples):
        features = sample.get("features", {})
        if not isinstance(features, dict):
            continue
        row = {"__row_id": idx}
        for key in OUTLIER_FEATURE_KEYS:
            if key in features:
                row[key] = features[key]
        rows.append(row)
    if not rows:
        return samples
    df = pd.DataFrame(rows)
    filtered, dropped = remove_outliers_from_df(
        df,
        OUTLIER_FEATURE_KEYS,
        context,
    )
    if not dropped:
        return samples
    keep_ids = set(filtered["__row_id"].astype(int).tolist())
    filtered_samples = [
        sample for idx, sample in enumerate(samples) if idx in keep_ids
    ]
    print(
        f"[info] Retained {len(filtered_samples)} {context} samples "
        "after outlier removal"
    )
    return filtered_samples


def plot_bar_chart(
    counter: Counter,
    title: str,
    xlabel: str,
    ylabel: str,
    output_path: Path,
    rotation: int = 45,
) -> None:
    if not counter:
        return
    labels_counts = sorted(
        ((str(label), value) for label, value in counter.items()),
        key=lambda item: (-item[1], item[0]),
    )
    labels = [item[0] for item in labels_counts]
    counts = [item[1] for item in labels_counts]
    fig_width = max(6.0, min(16.0, 0.6 * len(labels)))
    fig, ax = plt.subplots(figsize=(fig_width, 4.5))
    ax.bar(range(len(labels)), counts, color="#2563eb")
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_xticks(range(len(labels)))
    ax.set_xticklabels(labels, rotation=rotation, ha="right")
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200)
    plt.close(fig)
    print(f"[viz] Saved {output_path}")


def plot_histogram(
    values: Sequence[float],
    title: str,
    xlabel: str,
    output_path: Path,
) -> None:
    if not values:
        return
    bins = auto_bins(len(values))
    fig, ax = plt.subplots(figsize=(6.5, 4.5))
    ax.hist(values, bins=bins, color="#0f766e",
            edgecolor="black", alpha=0.8)
    ax.set_title(title)
    ax.set_xlabel(xlabel)
    ax.set_ylabel("Count")
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200)
    plt.close(fig)
    print(f"[viz] Saved {output_path}")


def collect_raw_feature_values(
    records: Sequence[dict],
    feature_names: Sequence[str],
) -> Dict[str, List[float]]:
    values: Dict[str, List[float]] = defaultdict(list)
    for record in records:
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            continue
        for feature in feature_names:
            if feature in features:
                values[feature].append(features[feature])
    return {key: vals for key, vals in values.items() if vals}


def visualize_raw_feature_histograms(
    records: Sequence[dict],
    output_dir: Path,
    prefix: str,
    feature_names: Sequence[str],
) -> None:
    if not feature_names:
        return
    values_map = collect_raw_feature_values(records, feature_names)
    if not values_map:
        return
    for feature_name, values in values_map.items():
        if len(values) < 2:
            continue
        plot_histogram(
            values,
            title=f"{prefix.upper()} {feature_name} raw distribution",
            xlabel=feature_name,
            output_path=output_dir / f"{prefix}_{feature_name}_raw_hist.png",
        )


def collect_feature_values(
    records: Sequence[dict],
    feature_names: Sequence[str],
    context: str,
) -> Dict[str, List[float]]:
    rows: List[Dict[str, object]] = []
    for record in records:
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            continue
        rows.append(features)
    if not rows:
        return {}
    df = pd.DataFrame(rows)
    df, _ = remove_outliers_from_df(df, feature_names, context)
    values: Dict[str, List[float]] = {}
    for feature in feature_names:
        if feature in df.columns:
            values[feature] = df[feature].tolist()
    return values


def build_feature_dataframe(
    records: Sequence[dict],
    label_extractor,
) -> Optional[pd.DataFrame]:
    rows: List[Dict[str, object]] = []
    for record in records:
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            continue
        labels = label_extractor(record)
        if labels is None:
            continue
        if isinstance(labels, Iterable) and not isinstance(labels, (str, bytes, dict)):
            label_values = list(labels)
        else:
            label_values = [labels]
        for label in label_values:
            if label is None:
                continue
            row = dict(features)
            row["label"] = label
            rows.append(row)
    if not rows:
        return None
    return pd.DataFrame(rows)


def visualize_feature_histograms(
    records: Sequence[dict],
    output_dir: Path,
    prefix: str,
    feature_names: Sequence[str] = FEATURE_KEYS,
) -> None:
    if not feature_names:
        return
    values_map = collect_feature_values(
        records,
        feature_names=feature_names,
        context=f"{prefix.upper()} histogram",
    )

    for feature_name, values in values_map.items():
        if len(values) < 2:
            continue
        plot_histogram(
            values,
            title=f"{prefix.upper()} {feature_name} distribution",
            xlabel=feature_name,
            output_path=output_dir / f"{prefix}_{feature_name}_hist.png",
        )


def plot_feature_scatter_matrix(
    df: Optional[pd.DataFrame],
    title: str,
    output_path: Path,
    feature_names: Sequence[str] = FEATURE_KEYS,
) -> None:
    if df is None or df.empty or not feature_names:
        return
    selected_features = [
        column for column in feature_names if column in df.columns
    ]
    if len(selected_features) < 2:
        return
    if len(df) > SCATTER_MATRIX_MAX_SAMPLES:
        df = df.sample(
            n=SCATTER_MATRIX_MAX_SAMPLES,
            random_state=0,
        ).reset_index(drop=True)
    unique_labels = sorted(df["label"].unique(), key=lambda value: str(value))
    if not unique_labels:
        return
    cmap = plt.get_cmap("tab20")
    color_positions = np.linspace(
        0,
        1,
        num=max(2, len(unique_labels)),
        endpoint=True,
    )
    label_to_color = {
        label: cmap(color_positions[idx])
        for idx, label in enumerate(unique_labels)
    }
    colors = [label_to_color.get(label, (0.5, 0.5, 0.5, 0.5))
              for label in df["label"]]
    hist_bins = auto_bins(len(df))
    axes = pd.plotting.scatter_matrix(
        df[selected_features],
        figsize=(10, 10),
        alpha=0.6,
        diagonal="hist",
        hist_kwds={
            "bins": hist_bins,
            "color": "#94a3b8",
        },
        c=colors,
        range_padding=0.05,
    )
    fig = axes[0, 0].figure
    fig.suptitle(title, y=0.99, fontsize=14)
    legend_elements = [
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            label=str(label),
            markerfacecolor=label_to_color[label],
            markersize=6,
        )
        for label in unique_labels
    ]
    fig.legend(
        handles=legend_elements,
        loc="upper center",
        bbox_to_anchor=(0.5, 0.04),
        ncol=min(4, len(legend_elements)),
        fontsize=8,
        frameon=False,
    )
    fig.tight_layout(rect=[0, 0.06, 1, 1])
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200)
    plt.close(fig)
    print(f"[viz] Saved {output_path}")


def plot_commit_access_scatter(
    df: Optional[pd.DataFrame],
    title: str,
    output_path: Path,
) -> None:
    if df is None or df.empty:
        return
    required = {"commitGasUsed", "accessGasUsed"}
    if not required.issubset(df.columns):
        return
    if len(df) > SCATTER_PLOT_MAX_SAMPLES:
        df = df.sample(
            n=SCATTER_PLOT_MAX_SAMPLES,
            random_state=1,
        ).reset_index(drop=True)

    unique_labels = sorted(df["label"].unique(), key=lambda value: str(value))
    if not unique_labels:
        return
    cmap = plt.get_cmap("tab20")
    label_to_color = {
        label: cmap(float(idx) / max(1, len(unique_labels) - 1))
        for idx, label in enumerate(unique_labels)
    }
    colors = [label_to_color.get(label, (0.4, 0.4, 0.4, 0.6))
              for label in df["label"]]
    fig, ax = plt.subplots(figsize=(6.5, 5.5))
    ax.scatter(
        df["commitGasUsed"],
        df["accessGasUsed"],
        c=colors,
        s=12,
        alpha=0.7,
        edgecolors="none",
    )
    ax.set_title(title)
    ax.set_xlabel("commitGasUsed")
    ax.set_ylabel("accessGasUsed")
    legend_elements = [
        Line2D(
            [0],
            [0],
            marker="o",
            color="w",
            label=str(label),
            markerfacecolor=label_to_color[label],
            markersize=6,
        )
        for label in unique_labels
    ]
    ax.legend(
        handles=legend_elements,
        loc="upper right",
        fontsize=8,
        frameon=True,
    )
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=200)
    plt.close(fig)
    print(f"[viz] Saved {output_path}")


def visualize_pch_data(records: Sequence[dict], output_dir: Path) -> None:
    ensure_dir(output_dir)
    duo_counter: Counter = Counter()
    for record in records:
        duo_codes = record.get("duoTermCodes") or []
        for code in duo_codes:
            duo_counter[str(code)] += 1
    if duo_counter:
        plot_bar_chart(
            duo_counter,
            title="PCH Duo term distribution",
            xlabel="DUO term",
            ylabel="Occurrences",
            output_path=output_dir / "pch_duo_terms.png",
        )

    visualize_raw_feature_histograms(
        records,
        output_dir,
        prefix="pch",
        feature_names=RAW_DISTRIBUTION_FEATURES,
    )

    visualize_feature_histograms(
        records,
        output_dir,
        prefix="pch",
        feature_names=GAS_FEATURE_KEYS,
    )

    df = build_feature_dataframe(
        records,
        label_extractor=lambda entry: entry.get("duoTermCodes") or [],
    )
    if df is not None:
        df, _ = remove_outliers_from_df(
            df,
            OUTLIER_FEATURE_KEYS,
            "PCH visualization",
        )
    # plot_feature_scatter_matrix(
    #     df,
    #     title="PCH gas feature scatter matrix",
    #     output_path=output_dir / "pch_gas_feature_scatter.png",
    #     feature_names=GAS_FEATURE_KEYS,
    # )

    plot_commit_access_scatter(
        df,
        title="PCH commit vs access gas",
        output_path=output_dir / "pch_commit_vs_access.png",
    )


def is_numeric_value(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def visualize_spp_data(records: Sequence[dict], output_dir: Path) -> None:
    ensure_dir(output_dir)
    visualize_raw_feature_histograms(
        records,
        output_dir,
        prefix="spp",
        feature_names=RAW_DISTRIBUTION_FEATURES,
    )
    targets = ["logicStructure", "nestingDepth",
               "predicateCount", "setSize", "rangeWidth"]
    for target in targets:
        values = [record.get(target)
                  for record in records if record.get(target) is not None]
        if not values:
            continue
        output_path = output_dir / f"spp_{target}_distribution.png"
        if all(is_numeric_value(value) for value in values):
            numeric_values = [float(value) for value in values]
            plot_histogram(
                numeric_values,
                title=f"SPP {target} distribution",
                xlabel=target,
                output_path=output_path,
            )
        else:
            counter = Counter(str(value) for value in values)
            plot_bar_chart(
                counter,
                title=f"SPP {target} distribution",
                xlabel=target,
                ylabel="Occurrences",
                output_path=output_path,
                rotation=30,
            )
        df_target = build_feature_dataframe(
            records,
            label_extractor=lambda entry, key=target: entry.get(key),
        )
        if df_target is not None:
            df_target, _ = remove_outliers_from_df(
                df_target,
                OUTLIER_FEATURE_KEYS,
                f"SPP {target} visualization",
            )
        plot_feature_scatter_matrix(
            df_target,
            title=f"SPP {target} gas feature scatter matrix",
            output_path=output_dir / f"spp_{target}_gas_feature_scatter.png",
            feature_names=GAS_FEATURE_KEYS,
        )
        plot_commit_access_scatter(
            df_target,
            title=f"SPP {target} commit vs access gas",
            output_path=output_dir / f"spp_{target}_commit_vs_access.png",
        )
    visualize_feature_histograms(
        records,
        output_dir,
        prefix="spp",
        feature_names=GAS_FEATURE_KEYS,
    )


def visualize_pi_data(pairs: Sequence[dict], output_dir: Path) -> None:
    ensure_dir(output_dir)
    pair_type_counter: Counter = Counter()
    for pair in pairs:
        pair_type = pair.get("pairType") or "unspecified"
        pair_type_counter[str(pair_type)] += 1
    if pair_type_counter:
        plot_bar_chart(
            pair_type_counter,
            title="PI pair type distribution",
            xlabel="Pair type",
            ylabel="Pairs",
            output_path=output_dir / "pi_pair_types.png",
        )

    raw_samples = build_pi_samples(list(pairs), drop_outliers=False)
    visualize_raw_feature_histograms(
        raw_samples,
        output_dir,
        prefix="pi",
        feature_names=RAW_DISTRIBUTION_FEATURES,
    )
    samples = drop_outlier_samples(list(raw_samples), "PI")
    label_counter = Counter(str(sample["label"]) for sample in samples)
    if label_counter:
        plot_bar_chart(
            label_counter,
            title="PI policy label distribution",
            xlabel="Policy label",
            ylabel="Samples",
            output_path=output_dir / "pi_policy_labels.png",
        )
    visualize_feature_histograms(
        samples,
        output_dir,
        prefix="pi",
        feature_names=GAS_FEATURE_KEYS,
    )
    df = build_feature_dataframe(
        samples,
        label_extractor=lambda row: row.get("label"),
    )
    if df is not None:
        df, _ = remove_outliers_from_df(
            df,
            OUTLIER_FEATURE_KEYS,
            "PI visualization",
        )
    plot_feature_scatter_matrix(
        df,
        title="PI gas feature scatter matrix",
        output_path=output_dir / "pi_gas_feature_scatter.png",
        feature_names=GAS_FEATURE_KEYS,
    )
    plot_commit_access_scatter(
        df,
        title="PI commit vs access gas",
        output_path=output_dir / "pi_commit_vs_access.png",
    )


def generate_dataset_visualizations(
    pch_records: Sequence[dict],
    spp_records: Sequence[dict],
    pi_pairs: Sequence[dict],
    output_dir: Path,
) -> None:
    base_dir = ensure_dir(output_dir)
    print(f"[viz] Writing visualizations to {base_dir}")
    visualize_pch_data(pch_records, base_dir / "pch")
    visualize_spp_data(spp_records, base_dir / "spp")
    visualize_pi_data(pi_pairs, base_dir / "pi")


def split_pi_samples(
    samples: Sequence[dict],
    test_size: float,
    random_state: int,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    if not samples:
        raise ValueError("PI experiment requires at least one sample")

    pair_ids = sorted({sample["pairId"] for sample in samples})
    rng = random.Random(random_state)
    rng.shuffle(pair_ids)
    split_idx = max(1, int(len(pair_ids) * (1 - test_size)))
    train_ids = set(pair_ids[:split_idx])
    if not train_ids:
        train_ids = {pair_ids[0]}
    test_ids = set(pair_ids[split_idx:])
    if not test_ids:
        test_ids = {pair_ids[-1]}

    def samples_to_df(selected_ids: set) -> pd.DataFrame:
        rows = []
        for sample in samples:
            if sample["pairId"] not in selected_ids:
                continue
            row = {"label": sample["label"]}
            row.update(sample["features"])
            rows.append(row)
        return pd.DataFrame(rows)

    return samples_to_df(train_ids), samples_to_df(test_ids)


def evaluate_pi_scope(
    samples: List[dict],
    test_size: float,
    random_state: int,
) -> Optional[Dict[str, object]]:
    if not samples:
        return None
    train_df, test_df = split_pi_samples(samples, test_size, random_state)
    if train_df.empty or test_df.empty:
        return None

    y_train = train_df["label"].to_numpy()
    y_test = test_df["label"].to_numpy()
    X_train = train_df[list(FEATURE_KEYS)].to_numpy()
    X_test = test_df[list(FEATURE_KEYS)].to_numpy()
    num_classes = len(np.unique(y_train))
    if num_classes < 2:
        return None

    models = build_models(num_classes=2)
    evaluations = [
        evaluate_predictions(
            name,
            estimator,
            X_train,
            X_test,
            y_train,
            y_test,
            num_classes=2,
        )
        for name, estimator in models.items()
    ]

    return {
        "samples": len(samples),
        "train_pairs": len(train_df) // 2,
        "test_pairs": len(test_df) // 2,
        "evaluations": evaluations,
    }


def run_pi_experiment(
    pairs: Sequence[dict],
    test_size: float,
    random_state: int,
) -> Dict[str, object]:
    samples = build_pi_samples(list(pairs))
    scopes = defaultdict(list)
    for sample in samples:
        scopes["overall"].append(sample)
        scopes[sample["pairType"]].append(sample)

    results: Dict[str, object] = {}
    for scope, scoped_samples in scopes.items():
        evaluation = evaluate_pi_scope(scoped_samples, test_size, random_state)
        if evaluation is None:
            results[scope] = {
                "samples": len(scoped_samples),
                "skipped": True,
                "reason": "insufficient samples for binary classification",
            }
        else:
            results[scope] = evaluation
    return results


def main() -> None:
    args = parse_args()
    data_dir = args.data_dir
    if not data_dir.exists():
        raise SystemExit(f"Data directory {data_dir} does not exist")

    dataset_dirs = discover_dataset_dirs(data_dir)
    if not dataset_dirs:
        raise SystemExit(
            f"No dataset folders found under {data_dir}. "
            "Ensure at least one directory contains pch_dataset.json."
        )

    print("Using dataset directories:")
    for directory in dataset_dirs:
        print(f" - {directory}")

    if not args.pi_pairs and not args.skip_auto_pairs:
        for directory in dataset_dirs:
            auto_generate_pi_pairs(directory, args.random_state)
    elif args.skip_auto_pairs:
        print("[info] Automatic PI pair generation disabled by flag")

    pch_records = aggregate_json_arrays(dataset_dirs, "pch_dataset.json")
    if not pch_records:
        raise SystemExit("No PCH records found across dataset directories")

    spp_records = aggregate_json_arrays(dataset_dirs, "spp_dataset.json")
    if not spp_records:
        raise SystemExit("No SPP records found across dataset directories")

    if args.pi_pairs:
        pi_pairs = load_pi_pairs(args.pi_pairs)
        pi_pair_sources = [str(args.pi_pairs)]
    else:
        pi_pairs, pi_pair_sources = aggregate_pi_pairs(dataset_dirs)
    if not pi_pairs:
        raise SystemExit(
            "No PI pairs found. Provide --pi-pairs or add pi_pairs.json to "
            "each dataset directory."
        )

    if args.skip_visualizations:
        print("[info] Dataset visualization generation skipped via flag")
    else:
        generate_dataset_visualizations(
            pch_records,
            spp_records,
            pi_pairs,
            args.visualizations_dir,
        )

    print("Running Policy Content Hiding experiment…")
    pch_results = run_pch_experiment(
        pch_records,
        test_size=args.test_size,
        random_state=args.random_state,
    )

    print("Running Structure & Parameter Privacy experiment…")
    spp_results = run_spp_experiment(
        spp_records,
        test_size=args.test_size,
        random_state=args.random_state,
    )

    print("Running Policy Indistinguishability experiment…")
    pi_results = run_pi_experiment(
        pi_pairs,
        test_size=args.test_size,
        random_state=args.random_state,
    )

    report = {
        "data_root": str(data_dir),
        "data_sources": [str(path) for path in dataset_dirs],
        "pi_pair_sources": pi_pair_sources,
        "test_size": args.test_size,
        "random_state": args.random_state,
        "thresholds": DEFAULT_THRESHOLDS,
        "pch": pch_results,
        "spp": spp_results,
        "pi": pi_results,
    }

    output_path = args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print(f"Wrote results to {output_path}")


if __name__ == "__main__":
    main()
