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
import random
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

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

DEFAULT_THRESHOLDS = {
    "auc_max": 0.55,
    "advantage_max": 0.05,
}

REPO_ROOT = Path(__file__).resolve().parents[1]
PI_PAIR_GENERATOR = REPO_ROOT / "scripts" / "generate_pi_pairs.js"


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
        if isinstance(data, list):
            combined.extend(data)
        else:
            print(f"[warn] {file_path} is not a JSON array; skipping")
    return combined


def load_pi_pairs(path: Path) -> List[dict]:
    data = load_json(path)
    if isinstance(data, dict) and "pairs" in data:
        return list(data["pairs"])
    if isinstance(data, list):
        return data
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
    for record in records:
        features = extract_feature_row(record.get("features", {}))
        if features is None:
            dropped += 1
            continue
        label = label_getter(record)
        if label is None:
            dropped += 1
            continue
        row = {"label": label}
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
    X = df[list(FEATURE_KEYS)].to_numpy()
    results: Dict[str, object] = {}
    targets = ["logicStructure", "nestingDepth",
               "predicateCount", "setSize", "rangeWidth"]

    for target in targets:
        labels = [item.get(target) for item in records]
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

        y = df_target["label"].to_numpy()
        X_target = df_target[list(FEATURE_KEYS)].to_numpy()
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
            "samples": len(df_target),
            "class_distribution": dict(Counter(df_target["label"])),
            "evaluations": evaluations,
        }

    return results

def build_pi_samples(pairs: List[dict]) -> List[dict]:
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
    return samples


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
