"""Shared sklearn supervised-privacy utilities.

This module mirrors the JavaScript ``experiments/core/multiseed_criterion.js``
verdict semantics for Python cross-check scripts.  The JS reports remain the
source of record; these helpers keep the Python PCH/PI/SPP checks aligned with
that source rather than each script growing its own threshold logic.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

import numpy as np
from joblib import Parallel, delayed
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# 9 observable public-chain features used by the JS attack modules.  Off-chain
# timing fields (proof*Time) and blockDifference are intentionally excluded.
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
)

DEFAULT_SEEDS = 30
AUC_MAX = 0.55
PERM_ALPHA = 0.05
SIG_FRACTION_MAX = 0.5
MIN_TEST_SAMPLES = 20
PERM_ITERS = 500
TEST_RATIO = 0.3

CSV_FIELDS = [
    "dataset", "target", "class0", "class1", "model", "aucMean", "aucStd",
    "advantageMean", "sigFraction", "medianTestN", "majorityBaselineAcc",
    "nSeeds", "passed", "nonGating",
]


def ensure_numeric(value) -> float:
    """Parse a feature value to float; None/missing -> 0.0 (matches JS `value || 0`)."""
    if value is None:
        return 0.0
    if isinstance(value, str):
        if value.startswith("0x"):
            try:
                return float(int(value, 16))
            except ValueError:
                return 0.0
        try:
            return float(value)
        except ValueError:
            return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def find_json(data_dir: Path, filename: str) -> Optional[Path]:
    candidates = sorted(data_dir.glob(f"**/{filename}"))
    return candidates[0] if candidates else None


def feature_row(entry: dict, feature_keys: Sequence[str] = FEATURE_KEYS) -> List[float]:
    features = entry.get("features", {}) if isinstance(entry, dict) else {}
    return [ensure_numeric(features.get(k)) for k in feature_keys]


def fit_predict_proba(name: str, X_tr, y_tr, X_te, seed: int, rf_n_jobs: int = -1) -> np.ndarray:
    """Train a classifier and return P(class=1) on X_te."""
    if name == "rf":
        clf = RandomForestClassifier(
            n_estimators=50,
            max_depth=10,
            class_weight="balanced",
            random_state=seed,
            n_jobs=rf_n_jobs,
        )
        clf.fit(X_tr, y_tr)
        return clf.predict_proba(X_te)[:, 1]
    if name == "lr":
        clf = make_pipeline(
            StandardScaler(),
            LogisticRegression(class_weight="balanced", max_iter=1000, random_state=seed),
        )
        clf.fit(X_tr, y_tr)
        return clf.predict_proba(X_te)[:, 1]
    raise ValueError(f"unknown classifier {name}")


def _average_ranks(values: np.ndarray) -> np.ndarray:
    """Return 1-based average ranks, matching AUC tie handling."""
    order = np.argsort(values, kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    sorted_values = values[order]
    i = 0
    while i < len(values):
        j = i + 1
        while j < len(values) and sorted_values[j] == sorted_values[i]:
            j += 1
        avg_rank = (i + 1 + j) / 2.0
        ranks[order[i:j]] = avg_rank
        i = j
    return ranks


def _auc_from_ranks(y_true: np.ndarray, ranks: np.ndarray, n_pos: int, n_neg: int) -> float:
    pos_rank_sum = float(ranks[y_true == 1].sum())
    return (pos_rank_sum - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def permutation_pvalue(
    y_true: np.ndarray,
    proba: np.ndarray,
    actual_auc: float,
    iters: int,
    rng: np.random.Generator,
) -> float:
    """Label-shuffle permutation p-value on fixed probabilities.

    The probability ranking is fixed for every shuffle, so precomputing average
    ranks avoids thousands of expensive roc_auc_score calls in full 30-seed runs.
    """
    y = y_true.astype(int).copy()
    n_pos = int(y.sum())
    n_neg = int(len(y) - n_pos)
    if n_pos == 0 or n_neg == 0:
        return 1.0
    ranks = _average_ranks(np.asarray(proba, dtype=float))
    count = 0
    for _ in range(iters):
        rng.shuffle(y)
        perm_auc = _auc_from_ranks(y, ranks, n_pos, n_neg)
        if perm_auc >= actual_auc:
            count += 1
    return (count + 1) / (iters + 1)


def evaluate_seed(
    X,
    y,
    groups,
    seed: int,
    models: Sequence[str],
    rf_n_jobs: int = -1,
    test_ratio: float = TEST_RATIO,
    perm_iters: int = PERM_ITERS,
) -> Optional[Dict]:
    """One group-disjoint split; returns per-model AUC/p-value/testN or None."""
    gss = GroupShuffleSplit(n_splits=1, test_size=test_ratio, random_state=seed)
    tr_idx, te_idx = next(gss.split(X, y, groups))
    X_tr, X_te = X[tr_idx], X[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]

    if len(np.unique(y_tr)) < 2 or len(np.unique(y_te)) < 2:
        return None

    keep = X_tr.var(axis=0) > 0
    X_tr, X_te = X_tr[:, keep], X_te[:, keep]

    counts = np.bincount(y_te.astype(int))
    out = {"testN": len(y_te), "majorityAcc": float(np.max(counts) / len(y_te))}

    for m in models:
        rng = np.random.default_rng(seed * 1009 + (17 if m == "lr" else 53))
        if X_tr.shape[1] == 0:
            auc, pval = 0.5, 1.0
        else:
            proba = fit_predict_proba(m, X_tr, y_tr, X_te, seed, rf_n_jobs)
            auc = roc_auc_score(y_te, proba)
            pval = permutation_pvalue(y_te, proba, auc, perm_iters, rng)
        out[m] = {"auc": auc, "advantage": abs(auc - 0.5), "pval": pval}
    return out


def _mean_std(vals: Iterable[float]):
    arr = np.asarray(list(vals), dtype=float)
    return (float(arr.mean()), float(arr.std())) if len(arr) else (float("nan"), float("nan"))


def analyze_contrast(
    X,
    y,
    groups,
    seeds: int,
    models: Sequence[str],
    jobs: int = 1,
    test_ratio: float = TEST_RATIO,
    perm_iters: int = PERM_ITERS,
) -> Dict:
    """Aggregate one binary contrast under the JS double criterion."""
    rf_n_jobs = -1 if jobs == 1 else 1
    if jobs == 1:
        per_seed = [
            evaluate_seed(X, y, groups, s, models, rf_n_jobs, test_ratio, perm_iters)
            for s in range(seeds)
        ]
    else:
        per_seed = Parallel(n_jobs=jobs)(
            delayed(evaluate_seed)(X, y, groups, s, models, rf_n_jobs, test_ratio, perm_iters)
            for s in range(seeds)
        )
    per_seed = [r for r in per_seed if r is not None]

    result = {"nSeeds": len(per_seed), "models": {}}
    if not per_seed:
        result.update({"medianTestN": None, "majorityAcc": None, "nonGating": True, "passed": None})
        return result

    test_ns = [r["testN"] for r in per_seed]
    median_test_n = float(np.median(test_ns))
    result["medianTestN"] = median_test_n
    result["majorityAcc"] = float(np.mean([r["majorityAcc"] for r in per_seed]))
    result["nonGating"] = median_test_n < MIN_TEST_SAMPLES

    any_leg_fails = False
    for m in models:
        aucs = [r[m]["auc"] for r in per_seed]
        advs = [r[m]["advantage"] for r in per_seed]
        pvals = [r[m]["pval"] for r in per_seed]
        auc_mean, auc_std = _mean_std(aucs)
        sig_fraction = float(np.mean([p < PERM_ALPHA for p in pvals]))
        auc_high = auc_mean > AUC_MAX
        sig_high = sig_fraction >= SIG_FRACTION_MAX
        leg_fails = auc_high and sig_high
        any_leg_fails = any_leg_fails or leg_fails
        result["models"][m] = {
            "aucMean": auc_mean,
            "aucStd": auc_std,
            "advantageMean": _mean_std(advs)[0],
            "sigFraction": sig_fraction,
            "aucHigh": auc_high,
            "sigHigh": sig_high,
            "legFails": leg_fails,
        }

    result["passed"] = not any_leg_fails
    return result


def build_verdict(dataset_tag: str, seeds: int, tasks: List[Dict], *, perm_iters: int = PERM_ITERS) -> Dict:
    judged = [c for c in tasks if not c.get("nonGating") and c.get("passed") is not None]
    overall = all(c["passed"] for c in judged) if judged else None
    return {
        "dataset": dataset_tag,
        "criterion": {
            "seeds": seeds,
            "aucMax": AUC_MAX,
            "permAlpha": PERM_ALPHA,
            "sigFractionMax": SIG_FRACTION_MAX,
            "minTestSamples": MIN_TEST_SAMPLES,
            "permIters": perm_iters,
            "testRatio": TEST_RATIO,
        },
        "overallPassed": overall,
        "tasks": tasks,
        # Backward-compatible alias for the original SPP CSV/verdict wording.
        "contrasts": tasks,
    }


def verdict_to_rows(verdict: Dict, models: Sequence[str]) -> List[Dict]:
    rows = []
    for c in verdict.get("tasks", verdict.get("contrasts", [])):
        for m in models:
            md = c.get("models", {}).get(m)
            rows.append({
                "dataset": c.get("dataset", verdict.get("dataset")),
                "target": c.get("target", c.get("key")),
                "class0": c.get("class0"),
                "class1": c.get("class1"),
                "model": m,
                "aucMean": md.get("aucMean") if md else None,
                "aucStd": md.get("aucStd") if md else None,
                "advantageMean": md.get("advantageMean") if md else None,
                "sigFraction": md.get("sigFraction") if md else None,
                "medianTestN": c.get("medianTestN"),
                "majorityBaselineAcc": c.get("majorityAcc"),
                "nSeeds": c.get("nSeeds"),
                "passed": c.get("passed"),
                "nonGating": c.get("nonGating"),
            })
    return rows


def checkpoint_rows(csv_path: Optional[Path], rows: List[Dict], *, append: bool = False) -> None:
    if csv_path is None:
        return
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if append and csv_path.exists() else "w"
    with csv_path.open(mode, newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
        if mode == "w":
            writer.writeheader()
        for row in rows:
            writer.writerow(row)
