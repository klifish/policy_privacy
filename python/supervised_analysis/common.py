"""Shared sklearn supervised-privacy utilities.

This module mirrors the JavaScript ``experiments/core/multiseed_criterion.js``
verdict semantics for Python cross-check scripts.  The JS reports remain the
source of record; these helpers keep the Python PCH/PI/SPP checks aligned with
that source rather than each script growing its own threshold logic.
"""
from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence

import numpy as np
from joblib import Parallel, delayed
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
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
DEFAULT_SPLIT_CANDIDATES = 512
MIN_CLASS_TRAIN_GROUPS_WARNING = 10
MIN_CLASS_TEST_GROUPS_WARNING = 5

CSV_FIELDS = [
    "dataset", "target", "class0", "class1", "model", "aucMean", "aucStd",
    "advantageMean", "sigFraction", "medianTestN", "majorityBaselineAcc",
    "nSeeds", "passed", "nonGating",
    "invalidSeeds", "powerWarning",
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


def _json_hash(payload) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def split_task_hash(y, groups) -> str:
    """Hash group/label counts so a manifest cannot be reused on different data."""
    y = np.asarray(y)
    groups = np.asarray(groups, dtype=object)
    classes = sorted(np.unique(y).tolist(), key=str)
    rows = []
    for group in sorted(np.unique(groups).tolist(), key=str):
        mask = groups == group
        counts = {str(cls): int(np.sum(y[mask] == cls)) for cls in classes}
        rows.append({"group": str(group), "counts": counts})
    return _json_hash(rows)


def split_group_hash(groups) -> str:
    return _json_hash(sorted({str(group) for group in groups}))


def _split_diagnostics(y, groups, train_idx, test_idx) -> Dict:
    y = np.asarray(y)
    groups = np.asarray(groups, dtype=object)
    classes = sorted(np.unique(y).tolist(), key=str)

    def side(indices):
        return {
            "rows": {str(cls): int(np.sum(y[indices] == cls)) for cls in classes},
            "groups": {
                str(cls): int(len(np.unique(groups[indices][y[indices] == cls])))
                for cls in classes
            },
            "totalRows": int(len(indices)),
            "totalGroups": int(len(np.unique(groups[indices]))),
        }

    return {"train": side(train_idx), "test": side(test_idx)}


def repeated_stratified_group_holdout(
    y,
    groups,
    seed: int,
    *,
    test_ratio: float = TEST_RATIO,
    candidates: int = DEFAULT_SPLIT_CANDIDATES,
    test_groups: Optional[Sequence[str]] = None,
) -> Optional[Dict]:
    """Choose a deterministic policy-disjoint holdout with near-stratified labels.

    Candidate selection operates on whole groups and supports mixed-label groups
    (needed by PI, where one policy can occur on both pair sides).  The score is
    lexicographic: worst per-class test-ratio error, mean class error, overall row
    ratio error, group-ratio error, candidate index.
    """
    y = np.asarray(y)
    groups = np.asarray(groups, dtype=object)
    unique_groups = np.array(sorted({str(g) for g in groups}), dtype=object)
    if len(unique_groups) < 2 or len(np.unique(y)) < 2:
        return None

    group_strings = np.array([str(g) for g in groups], dtype=object)
    n_test_groups = min(
        len(unique_groups) - 1,
        max(1, int(round(len(unique_groups) * test_ratio))),
    )
    classes = sorted(np.unique(y).tolist(), key=str)

    def evaluate(selected, candidate_index):
        selected = {str(g) for g in selected}
        is_test = np.array([g in selected for g in group_strings], dtype=bool)
        test_idx = np.flatnonzero(is_test)
        train_idx = np.flatnonzero(~is_test)
        if not len(train_idx) or not len(test_idx):
            return None
        if len(np.unique(y[train_idx])) < len(classes) or len(np.unique(y[test_idx])) < len(classes):
            return None
        class_errors = []
        for cls in classes:
            total = int(np.sum(y == cls))
            class_errors.append(abs(float(np.sum(y[test_idx] == cls)) / total - test_ratio))
        score = (
            max(class_errors),
            float(np.mean(class_errors)),
            abs(len(test_idx) / len(y) - test_ratio),
            abs(len(selected) / len(unique_groups) - test_ratio),
            candidate_index,
        )
        return {
            "trainIndex": train_idx,
            "testIndex": test_idx,
            "testGroups": sorted(selected),
            "score": [float(v) if isinstance(v, (float, np.floating)) else int(v) for v in score],
        }

    def finalize(result):
        if result is None:
            return None
        result["diagnostics"] = _split_diagnostics(
            y, group_strings, result["trainIndex"], result["testIndex"]
        )
        result["splitHash"] = _json_hash({
            "seed": int(seed), "testGroups": result["testGroups"]
        })
        return result

    if test_groups is not None:
        if not set(map(str, test_groups)).issubset(set(unique_groups.tolist())):
            return None
        return finalize(evaluate(test_groups, -1))

    if candidates < 1:
        raise ValueError("split candidates must be >= 1")
    best = None
    for candidate in range(candidates):
        rng = np.random.default_rng(np.random.SeedSequence([int(seed), candidate, 0x53504C49]))
        selected = rng.choice(unique_groups, size=n_test_groups, replace=False)
        current = evaluate(selected, candidate)
        if current is not None and (best is None or tuple(current["score"]) < tuple(best["score"])):
            best = current
    return finalize(best)


def new_split_manifest(test_ratio: float = TEST_RATIO, candidates: int = DEFAULT_SPLIT_CANDIDATES) -> Dict:
    return {
        "schemaVersion": 1,
        "splitter": {
            "name": "repeated_stratified_group_holdout",
            "testRatio": test_ratio,
            "candidates": candidates,
        },
        "tasks": {},
    }


def load_split_manifest(path: Optional[Path]) -> Optional[Dict]:
    return load_json(path) if path is not None else None


def write_split_manifest(path: Optional[Path], manifest: Optional[Dict]) -> None:
    if path is None or manifest is None:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2)


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
    split_plan: Optional[Dict] = None,
    split_candidates: int = DEFAULT_SPLIT_CANDIDATES,
) -> Optional[Dict]:
    """One stratified group holdout; returns model metrics and split diagnostics."""
    split = split_plan or repeated_stratified_group_holdout(
        y, groups, seed, test_ratio=test_ratio, candidates=split_candidates
    )
    if split is None:
        return None
    tr_idx, te_idx = split["trainIndex"], split["testIndex"]
    X_tr, X_te = X[tr_idx], X[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]

    if len(np.unique(y_tr)) < 2 or len(np.unique(y_te)) < 2:
        return None

    keep = X_tr.var(axis=0) > 0
    X_tr, X_te = X_tr[:, keep], X_te[:, keep]

    counts = np.bincount(y_te.astype(int))
    out = {
        "testN": len(y_te),
        "majorityAcc": float(np.max(counts) / len(y_te)),
        "split": {
            "testGroups": split["testGroups"],
            "score": split["score"],
            "diagnostics": split["diagnostics"],
            "splitHash": split["splitHash"],
        },
    }

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
    task_key: Optional[str] = None,
    split_candidates: int = DEFAULT_SPLIT_CANDIDATES,
    split_manifest_in: Optional[Dict] = None,
    split_manifest_out: Optional[Dict] = None,
) -> Dict:
    """Aggregate one binary contrast under the JS double criterion."""
    key = task_key or "unnamed-task"
    data_hash = split_task_hash(y, groups)
    input_task = ((split_manifest_in or {}).get("tasks") or {}).get(key)
    if input_task is not None and input_task.get("taskDataHash") != data_hash:
        raise ValueError(f"split manifest data hash mismatch for task {key}")
    if input_task is not None and input_task.get("groupUniverseHash") not in (None, split_group_hash(groups)):
        raise ValueError(f"split manifest group hash mismatch for task {key}")

    split_plans = []
    for seed in range(seeds):
        stored = ((input_task or {}).get("seeds") or {}).get(str(seed))
        plan = repeated_stratified_group_holdout(
            y,
            groups,
            seed,
            test_ratio=test_ratio,
            candidates=split_candidates,
            test_groups=stored.get("testGroups") if stored else None,
        )
        if stored is not None and (plan is None or plan["splitHash"] != stored.get("splitHash")):
            raise ValueError(f"invalid split manifest entry for task {key}, seed {seed}")
        split_plans.append(plan)

    rf_n_jobs = -1 if jobs == 1 else 1
    if jobs == 1:
        per_seed = [
            evaluate_seed(
                X, y, groups, s, models, rf_n_jobs, test_ratio, perm_iters,
                split_plan=split_plans[s], split_candidates=split_candidates,
            )
            for s in range(seeds)
        ]
    else:
        per_seed = Parallel(n_jobs=jobs)(
            delayed(evaluate_seed)(
                X, y, groups, s, models, rf_n_jobs, test_ratio, perm_iters,
                split_plan=split_plans[s], split_candidates=split_candidates,
            )
            for s in range(seeds)
        )
    valid_per_seed = [r for r in per_seed if r is not None]

    if split_manifest_out is not None:
        task_entry = {
            "taskDataHash": data_hash,
            "groupUniverseHash": split_group_hash(groups),
            "seeds": {},
        }
        for seed, result in enumerate(per_seed):
            if result is not None:
                task_entry["seeds"][str(seed)] = result["split"]
        split_manifest_out.setdefault("tasks", {})[key] = task_entry

    result = {
        "nSeeds": len(valid_per_seed),
        "invalidSeeds": seeds - len(valid_per_seed),
        "models": {},
    }
    if not valid_per_seed:
        result.update({
            "medianTestN": None,
            "majorityAcc": None,
            "nonGating": True,
            "passed": None,
            "powerWarning": True,
            "powerWarningReasons": ["no valid stratified group split"],
        })
        return result

    test_ns = [r["testN"] for r in valid_per_seed]
    median_test_n = float(np.median(test_ns))
    result["medianTestN"] = median_test_n
    result["majorityAcc"] = float(np.mean([r["majorityAcc"] for r in valid_per_seed]))
    result["nonGating"] = median_test_n < MIN_TEST_SAMPLES

    classes = sorted({key for r in valid_per_seed for key in r["split"]["diagnostics"]["test"]["rows"]}, key=str)
    class_summary = {}
    warning_reasons = []
    for cls in classes:
        train_rows = [r["split"]["diagnostics"]["train"]["rows"][cls] for r in valid_per_seed]
        test_rows = [r["split"]["diagnostics"]["test"]["rows"][cls] for r in valid_per_seed]
        train_groups = [r["split"]["diagnostics"]["train"]["groups"][cls] for r in valid_per_seed]
        test_groups = [r["split"]["diagnostics"]["test"]["groups"][cls] for r in valid_per_seed]
        class_summary[cls] = {
            "medianTrainRows": float(np.median(train_rows)),
            "medianTestRows": float(np.median(test_rows)),
            "minTrainGroups": int(min(train_groups)),
            "minTestGroups": int(min(test_groups)),
            "medianTrainGroups": float(np.median(train_groups)),
            "medianTestGroups": float(np.median(test_groups)),
        }
        if min(train_groups) < MIN_CLASS_TRAIN_GROUPS_WARNING:
            warning_reasons.append(
                f"class {cls} has <{MIN_CLASS_TRAIN_GROUPS_WARNING} training policies in at least one seed"
            )
        if min(test_groups) < MIN_CLASS_TEST_GROUPS_WARNING:
            warning_reasons.append(
                f"class {cls} has <{MIN_CLASS_TEST_GROUPS_WARNING} test policies in at least one seed"
            )
    if len(valid_per_seed) < seeds:
        warning_reasons.append(f"{seeds - len(valid_per_seed)} seed(s) had no valid split")
    result["splitDiagnostics"] = {
        "splitter": "repeated_stratified_group_holdout",
        "candidates": split_candidates,
        "validSeeds": len(valid_per_seed),
        "invalidSeeds": seeds - len(valid_per_seed),
        "classes": class_summary,
    }
    result["powerWarning"] = bool(warning_reasons)
    result["powerWarningReasons"] = warning_reasons

    any_leg_fails = False
    for m in models:
        aucs = [r[m]["auc"] for r in valid_per_seed]
        advs = [r[m]["advantage"] for r in valid_per_seed]
        pvals = [r[m]["pval"] for r in valid_per_seed]
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
                "invalidSeeds": c.get("invalidSeeds"),
                "powerWarning": c.get("powerWarning"),
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
