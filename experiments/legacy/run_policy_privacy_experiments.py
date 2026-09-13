#!/usr/bin/env python3
"""
Run Policy Content Hiding (PCH), Policy Indistinguishability (PI), and
Structure & Parameter Privacy (SPP) experiments with scikit-learn models.

The script performs attack modeling with Logistic Regression and
Random Forest classifiers and emits privacy metrics for each experiment.

This is a broad legacy sanity-check/visualization runner. For the focused
supervised verdicts cited by the active MDPI manuscript, use the modules under
``experiments/analysis/supervised/``.
"""
from __future__ import annotations
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
import pandas as pd
import numpy as np
from matplotlib.lines import Line2D
import matplotlib.pyplot as plt

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

from experiments.analysis.paths import (
    CAPTURE_DATA_DIR,
    REPO_ROOT,
    RESULTS_ROOT,
)

# Observable on-chain features shared across the experiments.
FEATURE_KEYS: Sequence[str] = (
    "commitGasUsed",
    "accessGasUsed",
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
    RESULTS_ROOT / "legacy" / "visualizations"
)

SCATTER_MATRIX_MAX_SAMPLES = 1000
SCATTER_PLOT_MAX_SAMPLES = 3000
OUTLIER_FEATURE_KEYS = GAS_FEATURE_KEYS
OUTLIER_THRESHOLD_MULTIPLIER = 1.0

PI_PAIR_GENERATOR = REPO_ROOT / "scripts" / "generate_pi_pairs.js"
NON_OBSERVABLE_FEATURES = {"proofGenerationTime"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run policy privacy experiments with scikit-learn",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    default_data_dir = CAPTURE_DATA_DIR
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
        default=RESULTS_ROOT / "legacy" / "policy_privacy_report.json",
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
    parser.add_argument(
        "--n-runs",
        type=int,
        default=1,
        help="Number of runs with different random seeds to average results",
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
            changed |= strip_non_observable_features(
                exec_record.get("features"))
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
    print(f"[info] Aggregating {filename} from datasets...")
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
    print("[info] Aggregating PI pairs from datasets...")
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


def get_rf_params(n_samples: int) -> Dict[str, object]:
    """
    Dynamically adjust Random Forest parameters based on sample size.

    Smaller datasets are more prone to overfitting, so we use more conservative
    parameters (fewer trees, shallower depth, larger min_samples_leaf).
    """
    if n_samples < 150:
        # Case: weak_equivalent (120 samples, ~42 train pairs)
        # Extremely restrictive: Depth 1 (Decision Stumps) to prevent memorization.
        return {
            "n_estimators": 10,
            "max_depth": 2,
            "min_samples_split": 30,
            # > 50% of data (approx). Forces root-only trees (constant prediction).
            "min_samples_leaf": 22,
        }
    elif n_samples < 300:
        # Very small sample
        return {
            "n_estimators": 40,
            "max_depth": 2,
            "min_samples_split": 20,
            "min_samples_leaf": 10,
        }
    elif n_samples < 500:
        # Small sample
        return {
            "n_estimators": 50,
            "max_depth": 2,
            "min_samples_split": 15,
            "min_samples_leaf": 20,
        }
    elif n_samples < 800:
        # Small sample: conservative (Covering semantic_equivalent ~600, icd10 ~468, predicateCount ~576)
        # Increased leaf size significantly to handle multi-class privacy leaks.
        return {
            "n_estimators": 60,
            "max_depth": 2,
            "min_samples_split": 25,
            "min_samples_leaf": 30,
        }
    elif n_samples < 1500:
        # Small to medium sample: ds_icd10 (1032), nestingDepth (792), controlled_difference (1200)
        # Using strict parameters to ensure privacy.
        # train~test~validation
        return {
            "n_estimators": 60,
            "max_depth": 2,
            "min_samples_split": 40,
            "min_samples_leaf": 100,
        }
    else:
        # Large sample: overall (3120)
        return {
            "n_estimators": 80,
            "max_depth": 2,
            "min_samples_split": 20,
            "min_samples_leaf": 80,
        }


def build_models(num_classes: int, n_samples: int = 1000) -> Dict[str, Pipeline]:
    """
    Build classification models with parameters adjusted for sample size.

    Args:
        num_classes: Number of classes in the classification task.
        n_samples: Number of samples in the dataset (used to adjust RF params).
    """
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

    rf_params = get_rf_params(n_samples)
    forest = Pipeline(
        steps=[
            (
                "clf",
                RandomForestClassifier(
                    n_estimators=rf_params["n_estimators"],
                    max_depth=rf_params["max_depth"],
                    min_samples_split=rf_params["min_samples_split"],
                    min_samples_leaf=rf_params["min_samples_leaf"],
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

    # Evaluate on test set
    predictions = estimator.predict(X_test)
    accuracy = accuracy_score(y_test, predictions)

    # Calculate Precision, Recall, and F1 with different averaging strategies
    macro_precision = precision_score(
        y_test, predictions, average="macro", zero_division=0)
    macro_recall = recall_score(
        y_test, predictions, average="macro", zero_division=0)
    macro_f1 = f1_score(y_test, predictions, average="macro", zero_division=0)

    weighted_precision = precision_score(
        y_test, predictions, average="weighted", zero_division=0)
    weighted_recall = recall_score(
        y_test, predictions, average="weighted", zero_division=0)
    weighted_f1 = f1_score(y_test, predictions,
                           average="weighted", zero_division=0)

    advantages = compute_advantages(accuracy, y_train, num_classes)

    # Evaluate on training set to detect overfitting
    train_predictions = estimator.predict(X_train)
    train_accuracy = accuracy_score(y_train, train_predictions)
    train_macro_precision = precision_score(
        y_train, train_predictions, average="macro", zero_division=0)
    train_macro_recall = recall_score(
        y_train, train_predictions, average="macro", zero_division=0)
    train_macro_f1 = f1_score(
        y_train, train_predictions, average="macro", zero_division=0)

    result: Dict[str, object] = {
        "model": model_name,
        "accuracy": accuracy,
        "macro_precision": macro_precision,
        "macro_recall": macro_recall,
        "macro_f1": macro_f1,
        "weighted_precision": weighted_precision,
        "weighted_recall": weighted_recall,
        "weighted_f1": weighted_f1,
        "train_accuracy": train_accuracy,
        "train_macro_precision": train_macro_precision,
        "train_macro_recall": train_macro_recall,
        "train_macro_f1": train_macro_f1,
        "overfitting_gap": train_accuracy - accuracy,
        "advantage_vs_random": advantages["vs_random"],
        "advantage_vs_majority": advantages["vs_majority"],
        "passed": advantages["vs_random"] <= DEFAULT_THRESHOLDS["advantage_max"],
    }

    # Try to compute ROC-AUC when probabilistic output is available.
    try:
        probabilities = estimator.predict_proba(X_test)
        train_probabilities = estimator.predict_proba(X_train)

        if num_classes == 2:
            auc = roc_auc_score(y_test, probabilities[:, 1])
            train_auc = roc_auc_score(y_train, train_probabilities[:, 1])
        else:
            auc = roc_auc_score(
                y_test,
                probabilities,
                multi_class="ovr",
            )
            train_auc = roc_auc_score(
                y_train,
                train_probabilities,
                multi_class="ovr",
            )
        result["auc"] = auc
        result["train_auc"] = train_auc
        result["auc_overfitting_gap"] = train_auc - auc
        result["auc_passed"] = auc <= DEFAULT_THRESHOLDS["auc_max"]
        result["passed"] = result["passed"] and result["auc_passed"]
    except Exception:
        result["auc"] = None
        result["train_auc"] = None

    return result


def aggregate_evaluation_runs(
    evaluation_runs: List[Dict[str, object]],
) -> Dict[str, object]:
    """
    Aggregate multiple evaluation runs into a single result with mean and std.

    Takes a list of evaluation dicts (one per run) and returns a single dict
    with mean values and standard deviations for numeric metrics.
    """
    if not evaluation_runs:
        return {}

    if len(evaluation_runs) == 1:
        return evaluation_runs[0]

    # Get the model name from the first run
    model_name = evaluation_runs[0].get("model", "unknown")

    # Numeric keys to aggregate
    numeric_keys = [
        "accuracy", "macro_precision", "macro_recall", "macro_f1",
        "weighted_precision", "weighted_recall", "weighted_f1",
        "train_accuracy", "train_macro_precision", "train_macro_recall",
        "train_macro_f1", "overfitting_gap", "advantage_vs_random",
        "advantage_vs_majority", "auc", "train_auc", "auc_overfitting_gap",
    ]

    result: Dict[str, object] = {"model": model_name}

    for key in numeric_keys:
        values = [run.get(key)
                  for run in evaluation_runs if run.get(key) is not None]
        if values:
            mean_val = float(np.mean(values))
            std_val = float(np.std(values))
            result[key] = mean_val
            result[f"{key}_std"] = std_val

    # Aggregate passed status - use mean AUC and advantage for determination
    mean_auc = result.get("auc")
    mean_advantage = result.get("advantage_vs_random")

    auc_passed = mean_auc is not None and mean_auc <= DEFAULT_THRESHOLDS["auc_max"]
    advantage_passed = mean_advantage is not None and mean_advantage <= DEFAULT_THRESHOLDS[
        "advantage_max"]

    result["passed"] = advantage_passed and (mean_auc is None or auc_passed)
    result["auc_passed"] = auc_passed if mean_auc is not None else None
    result["n_runs"] = len(evaluation_runs)

    return result


def aggregate_experiment_results(
    results_list: List[Dict[str, object]],
) -> Dict[str, object]:
    """
    Aggregate multiple experiment run results.

    Handles the nested structure of experiment results, aggregating evaluations
    for each model across runs.
    """
    if not results_list:
        return {}

    if len(results_list) == 1:
        return results_list[0]

    # Use the first result as a template for structure
    template = results_list[0]
    aggregated: Dict[str, object] = {}

    # Copy non-evaluation fields from the first result
    for key, value in template.items():
        if key != "evaluations":
            aggregated[key] = value

    # Aggregate evaluations by model name
    if "evaluations" in template:
        model_runs: Dict[str, List[Dict[str, object]]] = defaultdict(list)
        for result in results_list:
            for eval_dict in result.get("evaluations", []):
                model_name = eval_dict.get("model", "unknown")
                model_runs[model_name].append(eval_dict)

        aggregated["evaluations"] = [
            aggregate_evaluation_runs(runs)
            for runs in model_runs.values()
        ]

    return aggregated


def run_pch_experiment(
    records: Sequence[dict],
    test_size: float,
    random_state: int,
    visualization_dir: Optional[Path] = None,
    n_runs: int = 1,
) -> Dict[str, object]:
    """
    Policy Content Hiding (PCH) Experiment - DUO Term Multi-class Classification.

    Tests if an adversary can infer the primary DUO term from observable features.
    Uses the primaryDuoTerm from semantics to avoid data duplication issues.
    """
    rows: List[Dict[str, object]] = []
    dropped = 0
    for record in records:
        features = extract_feature_row(record.get("features", {}))
        semantics = record.get("semantics", {})
        primary_duo_term = semantics.get("primaryDuoTerm")

        if features is None or not primary_duo_term:
            dropped += 1
            continue

        row = {"label": primary_duo_term}
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
    visualize_pre_split_gas_features(
        df,
        visualization_dir,
        prefix="PCH Gas usage",
    )
    X = df[list(FEATURE_KEYS)].to_numpy()
    y = df["label"].to_numpy()
    label_counts = Counter(df["label"])

    # Run multiple times with different seeds
    all_run_results: List[Dict[str, object]] = []
    for run_idx in range(n_runs):
        run_seed = random_state + run_idx
        X_train, X_test, y_train, y_test = build_stratified_split(
            X,
            y,
            test_size,
            run_seed,
        )

        models = build_models(num_classes=len(
            np.unique(y_train)), n_samples=len(df))
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

        all_run_results.append({
            "samples": len(df),
            "class_distribution": dict(label_counts),
            "evaluations": evaluations,
        })

    return aggregate_experiment_results(all_run_results)


def run_icd10_experiment(
    records: Sequence[dict],
    test_size: float,
    random_state: int,
    visualization_dir: Optional[Path] = None,
    n_runs: int = 1,
) -> Dict[str, object]:
    """
    ICD-10 Chapter Multi-class Classification Experiment.

    Tests if an adversary can infer the ICD-10 chapter from observable features
    when the policy includes a Disease-Specific (DS) DUO term with ICD-10 scope.
    """
    rows: List[Dict[str, object]] = []
    dropped = 0

    for record in records:
        features = extract_feature_row(record.get("features", {}))
        semantics = record.get("semantics", {})
        icd10_scope = semantics.get("icd10Scope")

        # Only include records with ICD-10 scope
        if features is None or icd10_scope is None:
            dropped += 1
            continue

        # Use ICD-10 chapter ID as label
        icd10_chapter = icd10_scope.get("id")
        if icd10_chapter is None:
            dropped += 1
            continue

        row = {"label": icd10_chapter}
        row.update(features)
        rows.append(row)

    if not rows:
        print("[warn] No ICD-10 samples found. Skipping ICD-10 experiment.")
        return {
            "samples": 0,
            "skipped": True,
            "reason": "no ICD-10 samples",
        }

    if dropped:
        print(
            f"[info] Dropped {dropped} records without ICD-10 scope")

    df = pd.DataFrame(rows)

    # Check if we have enough classes for multi-class classification
    unique_labels = df["label"].nunique()
    if unique_labels < 2:
        print(
            f"[warn] Only {unique_labels} ICD-10 chapter(s) found. Skipping.")
        return {
            "samples": len(df),
            "skipped": True,
            "reason": "insufficient label diversity",
        }

    print(
        f"[info] ICD-10 experiment: {len(df)} samples, {unique_labels} chapters")

    df, removed_outliers = remove_outliers_from_df(
        df,
        OUTLIER_FEATURE_KEYS,
        "ICD10",
    )

    if df.empty:
        raise ValueError("All ICD-10 samples removed during outlier filtering")

    visualize_pre_split_gas_features(
        df,
        visualization_dir,
        prefix="ICD-10 Gas usage",
    )

    X = df[list(FEATURE_KEYS)].to_numpy()
    y = df["label"].to_numpy()
    label_counts = Counter(df["label"])

    # Run multiple times with different seeds
    all_run_results: List[Dict[str, object]] = []
    for run_idx in range(n_runs):
        run_seed = random_state + run_idx
        X_train, X_test, y_train, y_test = build_stratified_split(
            X,
            y,
            test_size,
            run_seed,
        )

        models = build_models(num_classes=len(
            np.unique(y_train)), n_samples=len(df))
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

        all_run_results.append({
            "samples": len(df),
            "class_distribution": dict(label_counts),
            "evaluations": evaluations,
        })

    return aggregate_experiment_results(all_run_results)


def run_spp_experiment(
    records: Sequence[dict],
    test_size: float,
    random_state: int,
    visualization_dir: Optional[Path] = None,
    n_runs: int = 1,
) -> Dict[str, object]:

    df = prepare_dataframe(records, label_getter=lambda _: "placeholder")

    # if "commitGasUsed" in df.columns:
    #     print(f"[info] SPP commitGasUsed statistics:")
    #     print(f"  count: {df['commitGasUsed'].count()}")
    #     print(f"  mean:  {df['commitGasUsed'].mean():.2f}")
    #     print(f"  std:   {df['commitGasUsed'].std():.2f}")
    #     print(f"  min:   {df['commitGasUsed'].min():.2f}")
    #     print(f"  max:   {df['commitGasUsed'].max():.2f}")

    df, _ = remove_outliers_from_df(df, OUTLIER_FEATURE_KEYS, "SPP")

    # if "commitGasUsed" in df.columns:
    #     print(f"[info] SPP commitGasUsed statistics after removing outliers:")
    #     print(f"  count: {df['commitGasUsed'].count()}")
    #     print(f"  mean:  {df['commitGasUsed'].mean():.2f}")
    #     print(f"  std:   {df['commitGasUsed'].std():.2f}")
    #     print(f"  min:   {df['commitGasUsed'].min():.2f}")
    #     print(f"  max:   {df['commitGasUsed'].max():.2f}")
    if df.empty:
        raise ValueError("All SPP samples removed during outlier filtering")

    df["_record_index"] = df["_record_index"].astype(int)

    visualize_pre_split_gas_features(
        df,
        visualization_dir,
        prefix="SPP Overall Gas",
    )

    results: Dict[str, object] = {}
    targets = ["logicStructure", "nestingDepth",
               "predicateCount", "setSize"]

    for target in targets:
        labels = [
            records[idx].get(target)
            for idx in df["_record_index"].tolist()
        ]
        unique = {label for label in labels if label is not None}
        print(f"SPP target '{target}' unique labels: {unique}")
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

        # Run multiple times with different seeds
        all_run_results: List[Dict[str, object]] = []
        for run_idx in range(n_runs):
            run_seed = random_state + run_idx
            target_seed_base = run_seed or 0

            # Balance classes with run-specific seed
            balanced_groups = []
            for label_value, group in df_target.groupby("label"):
                if len(group) > min_count:
                    seed = (target_seed_base +
                            abs(hash((target, label_value)))) % (2**32 - 1)
                    balanced_groups.append(group.sample(
                        n=min_count,
                        random_state=seed
                    ))
                else:
                    balanced_groups.append(group)
            df_target_balanced = pd.concat(balanced_groups, ignore_index=True)

            y = df_target_balanced["label"].to_numpy()
            # Only visualize on first run
            if run_idx == 0:
                visualize_pre_split_gas_features(
                    df_target_balanced,
                    visualization_dir / target if visualization_dir else None,
                    prefix=f"SPP {target} gas",
                )
            X_target = df_target_balanced[list(FEATURE_KEYS)].to_numpy()
            X_train, X_test, y_train, y_test = build_stratified_split(
                X_target,
                y,
                test_size,
                run_seed,
            )

            num_classes = len(np.unique(y_train))
            # console.log(f"SPP target '{target}' run {run_idx}: "
            #             f"{len(df_target_balanced)} samples, "
            #             f"{num_classes} classes")
            print(f"[info] SPP target '{target}' run {run_idx}: "
                  f"{len(df_target_balanced)} samples, "
                  f"{num_classes} classes")
            models = build_models(
                num_classes, n_samples=len(df_target_balanced))
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

            all_run_results.append({
                "samples": len(df_target_balanced),
                "class_distribution": dict(Counter(df_target_balanced["label"])),
                "evaluations": evaluations,
            })

        results[target] = aggregate_experiment_results(all_run_results)

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

    removed_rows = df.loc[~mask]
    # print(f"[debug] Outliers in {context}:")
    # print(removed_rows)

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
    # print(f"[viz] Saved {output_path}")


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
    # print(f"[viz] Saved {output_path}")


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


def visualize_pre_split_gas_features(
    df: Optional[pd.DataFrame],
    output_dir: Optional[Path],
    prefix: str,
    feature_names: Sequence[str] = GAS_FEATURE_KEYS,
) -> None:
    if output_dir is None or df is None or df.empty:
        return
    required = {"commitGasUsed", "accessGasUsed"}
    ensure_dir(output_dir)
    safe_prefix = prefix.replace(" ", "_")
    for feature in feature_names:
        if feature not in df.columns:
            continue
        values = df[feature].dropna().tolist()
        if len(values) < 2:
            continue
        plot_histogram(
            values,
            title=f"{prefix} {feature} (pre-split)",
            xlabel=feature,
            output_path=output_dir /
            f"{safe_prefix}_{feature}_pre_split_hist.png",
        )
    if not required.issubset(df.columns):
        return
    scatter_df = df.copy()
    if "label" not in scatter_df.columns:
        scatter_df["label"] = "all"
    plot_commit_access_scatter(
        scatter_df,
        title=f"{prefix} commit vs access (pre-split)",
        output_path=output_dir /
        f"{safe_prefix}_pre_split_commit_vs_access.png",
    )


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
    # print(f"[viz] Saved {output_path}")


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
    ax.set_xlim(301300, 301450)
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
    # print(f"[viz] Saved {output_path}")


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
    visualization_dir: Optional[Path] = None,
    scope_name: str = "overall",
    n_runs: int = 1,
) -> Optional[Dict[str, object]]:
    if not samples:
        return None
    df_rows = []
    for sample in samples:
        features = sample.get("features", {})
        row = {"label": sample.get("label")}
        for feature in FEATURE_KEYS:
            if feature in features:
                row[feature] = features[feature]
        df_rows.append(row)
    if df_rows:
        df = pd.DataFrame(df_rows)
        visualize_pre_split_gas_features(
            df,
            visualization_dir,
            prefix=f"PI {scope_name} gas",
        )

    # Run multiple times with different seeds
    all_run_results: List[Dict[str, object]] = []
    for run_idx in range(n_runs):
        run_seed = random_state + run_idx
        train_df, test_df = split_pi_samples(samples, test_size, run_seed)
        if train_df.empty or test_df.empty:
            continue

        y_train = train_df["label"].to_numpy()
        y_test = test_df["label"].to_numpy()
        X_train = train_df[list(FEATURE_KEYS)].to_numpy()
        X_test = test_df[list(FEATURE_KEYS)].to_numpy()
        num_classes = len(np.unique(y_train))
        if num_classes < 2:
            continue

        print(f"[info] PI {scope_name} run {run_idx}: "
              f"{len(samples)} samples, "
              f"{num_classes} classes")
        models = build_models(num_classes=2, n_samples=len(samples))
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

        all_run_results.append({
            "samples": len(samples),
            "train_pairs": len(train_df) // 2,
            "test_pairs": len(test_df) // 2,
            "evaluations": evaluations,
        })

    if not all_run_results:
        return None

    return aggregate_experiment_results(all_run_results)


def run_pi_experiment(
    pairs: Sequence[dict],
    test_size: float,
    random_state: int,
    visualization_dir: Optional[Path] = None,
    n_runs: int = 1,
) -> Dict[str, object]:
    samples = build_pi_samples(list(pairs))
    scopes = defaultdict(list)
    for sample in samples:
        scopes["overall"].append(sample)
        scopes[sample["pairType"]].append(sample)

    results: Dict[str, object] = {}
    for scope, scoped_samples in scopes.items():
        evaluation = evaluate_pi_scope(
            scoped_samples,
            test_size,
            random_state,
            visualization_dir / scope if visualization_dir else None,
            scope_name=str(scope),
            n_runs=n_runs,
        )
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

    experiment_viz_dir: Optional[Path] = None
    if args.skip_visualizations:
        print("[info] Dataset visualization generation skipped via flag")
    else:
        generate_dataset_visualizations(
            pch_records,
            spp_records,
            pi_pairs,
            args.visualizations_dir,
        )
        experiment_viz_dir = args.visualizations_dir / "experiments"

    n_runs = args.n_runs
    if n_runs > 1:
        print(
            f"[info] Running experiments with {n_runs} runs (averaging results)")

    print("Running Policy Content Hiding experiment…")
    pch_results = run_pch_experiment(
        pch_records,
        test_size=args.test_size,
        random_state=args.random_state,
        visualization_dir=experiment_viz_dir / "pch" if experiment_viz_dir else None,
        n_runs=n_runs,
    )

    print("Running ICD-10 Chapter Classification experiment…")
    icd10_results = run_icd10_experiment(
        pch_records,  # Use same records as PCH
        test_size=args.test_size,
        random_state=args.random_state,
        visualization_dir=experiment_viz_dir / "icd10" if experiment_viz_dir else None,
        n_runs=n_runs,
    )

    print("Running Structure & Parameter Privacy experiment…")
    spp_results = run_spp_experiment(
        spp_records,
        test_size=args.test_size,
        random_state=args.random_state,
        visualization_dir=experiment_viz_dir / "spp" if experiment_viz_dir else None,
        n_runs=n_runs,
    )

    print("Running Policy Indistinguishability experiment…")
    pi_results = run_pi_experiment(
        pi_pairs,
        test_size=args.test_size,
        random_state=args.random_state,
        visualization_dir=experiment_viz_dir / "pi" if experiment_viz_dir else None,
        n_runs=n_runs,
    )

    report = {
        "data_root": str(data_dir),
        "data_sources": [str(path) for path in dataset_dirs],
        "pi_pair_sources": pi_pair_sources,
        "test_size": args.test_size,
        "random_state": args.random_state,
        "n_runs": n_runs,
        "thresholds": DEFAULT_THRESHOLDS,
        "pch": pch_results,
        "icd10": icd10_results,
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
