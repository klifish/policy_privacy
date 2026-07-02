#!/usr/bin/env python3
"""
Supervised Structure & Parameter Privacy (SPP) cross-check using scikit-learn.

Independent Python mirror of the JavaScript supervised attack in
``experiments/structure_and_parameter_privacy/attacks.js`` (task structure and
verdict) with mature sklearn models (calibrated RandomForest + standardized
LogisticRegression) playing the strongest-attacker role. This complements the
label-free clustering cross-check in ``python/clustering_analysis``; it is NOT a
source of record for the paper tables.

Framing (mirrors the JS pipeline):
  * Targets: structureType, predicateCombo, paramType.
  * All pairwise binary contrasts within each target (i<j over the classes).
  * Policy-disjoint train/test split (grouped by policyId), 30 seeds.
  * Metric: AUC + 500-shuffle permutation test (no retraining).
  * Double criterion per (contrast, model): legFails = (aucMean > 0.55) AND
    (sigFraction >= 0.5). A contrast FAILs if either model's leg fails; a
    contrast with medianTestN < 20 is non-gating (underpowered).
  * Overall PASS iff all gating contrasts pass and at least one is judgeable.
"""
import argparse
import csv
import json
import itertools
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
from joblib import Parallel, delayed
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

# --- Configuration mirroring the JS SPP attack --------------------------------

# 9 observable features (attacks.js:15-27). blockDifference and all proof*Time
# are excluded (confounded harness artifact / off-chain, not a real channel).
FEATURE_KEYS = [
    "commitGasUsed",
    "commitCalldataLength",
    "accessGasUsed",
    "accessCalldataLength",
    "proofSize",
    "commitLogsCount",
    "commitLogsSize",
    "accessLogsCount",
    "accessLogsSize",
]

TARGET_ATTRS = ["structureType", "predicateCombo", "paramType"]

# Verdict thresholds (multiseed_criterion.js:35-54).
DEFAULT_SEEDS = 30
AUC_MAX = 0.55            # "advantage is large"
PERM_ALPHA = 0.05         # per-seed permutation significance level
SIG_FRACTION_MAX = 0.5    # "advantage is statistically real" (>=50% of seeds)
MIN_TEST_SAMPLES = 20     # below this median test size -> non-gating
PERM_ITERS = 500
TEST_RATIO = 0.3

DEFAULT_DATA_DIR = Path(__file__).parents[1] / "data"
OUTPUT_DIR = Path(__file__).parents[1] / "results" / "supervised_analysis"

# Parallelism (set from CLI). The 30 seeds per contrast are independent, so we
# parallelize the seed loop across processes. When the outer loop is parallel
# (JOBS != 1) each RandomForest fits single-threaded to avoid oversubscription;
# when serial (JOBS == 1) a single fit may use all cores. rf_n_jobs is passed
# explicitly into workers (a runtime-set module global would not survive the
# process fork under joblib's loky backend).
JOBS = 1


# --- Data loading -------------------------------------------------------------

def ensure_numeric(value) -> float:
    """Parse a feature value to float; None/missing -> 0.0 (matches JS `value || 0`)."""
    if value is None:
        return 0.0
    if isinstance(value, str):
        if value.startswith("0x"):
            return float(int(value, 16))
        try:
            return float(value)
        except ValueError:
            return 0.0
    return float(value)


def load_json(path: Path):
    with open(path, "r") as f:
        return json.load(f)


def find_spp_dataset(data_dir: Path) -> Optional[Path]:
    candidates = sorted(data_dir.glob("**/spp_dataset.json"))
    return candidates[0] if candidates else None


def build_feature_matrix(dataset: List[dict]):
    """Return (X, groups, labels_by_target) for the whole dataset."""
    X = np.array(
        [[ensure_numeric(e.get("features", {}).get(k)) for k in FEATURE_KEYS] for e in dataset],
        dtype=float,
    )
    groups = np.array([str(e.get("policyId", i)) for i, e in enumerate(dataset)])
    labels_by_target = {
        t: np.array([str(e.get(t)) for e in dataset], dtype=object) for t in TARGET_ATTRS
    }
    return X, groups, labels_by_target


# --- Modeling -----------------------------------------------------------------

def fit_predict_proba(name: str, X_tr, y_tr, X_te, seed: int, rf_n_jobs: int = -1) -> np.ndarray:
    """Train a classifier and return P(class=1) on X_te."""
    if name == "rf":
        # Uncalibrated RF vote fractions, as in the JS pipeline. AUC is rank-based
        # and Platt/sigmoid calibration is monotonic, so calibration barely changes
        # AUC while tripling the fit cost (its internal 3-fold CV) -- omitted here.
        clf = RandomForestClassifier(
            n_estimators=200,
            max_depth=None,
            class_weight="balanced",
            random_state=seed,
            n_jobs=rf_n_jobs,
        )
        clf.fit(X_tr, y_tr)
        return clf.predict_proba(X_te)[:, 1]
    elif name == "lr":
        clf = make_pipeline(
            StandardScaler(),
            LogisticRegression(class_weight="balanced", max_iter=1000, random_state=seed),
        )
        clf.fit(X_tr, y_tr)
        return clf.predict_proba(X_te)[:, 1]
    raise ValueError(f"unknown classifier {name}")


def permutation_pvalue(y_true: np.ndarray, proba: np.ndarray, actual_auc: float,
                       iters: int, rng: np.random.Generator) -> float:
    """Label-shuffle permutation p-value on fixed probabilities (evaluator.js:96-111)."""
    y = y_true.copy()
    count = 0
    for _ in range(iters):
        rng.shuffle(y)
        if len(np.unique(y)) < 2:
            perm_auc = 0.5
        else:
            perm_auc = roc_auc_score(y, proba)
        if perm_auc >= actual_auc:
            count += 1
    return (count + 1) / (iters + 1)


def evaluate_seed(X, y, groups, seed: int, models: List[str], rf_n_jobs: int = -1) -> Optional[Dict]:
    """One policy-disjoint split; returns per-model AUC/p-value/testN or None if degenerate."""
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_RATIO, random_state=seed)
    tr_idx, te_idx = next(gss.split(X, y, groups))
    X_tr, X_te = X[tr_idx], X[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]

    # Degenerate split: a class is missing from train or test.
    if len(np.unique(y_tr)) < 2 or len(np.unique(y_te)) < 2:
        return None

    # Drop zero-variance columns based on the training fold.
    var = X_tr.var(axis=0)
    keep = var > 0
    X_tr, X_te = X_tr[:, keep], X_te[:, keep]

    rng = np.random.default_rng(seed)
    out = {"testN": len(y_te), "majorityAcc": float(np.max(np.bincount(y_te)) / len(y_te))}

    for m in models:
        if X_tr.shape[1] == 0:
            # No informative feature survived -> attacker cannot do better than chance.
            auc, pval = 0.5, 1.0
        else:
            proba = fit_predict_proba(m, X_tr, y_tr, X_te, seed, rf_n_jobs)
            auc = roc_auc_score(y_te, proba)
            pval = permutation_pvalue(y_te, proba, auc, PERM_ITERS, rng)
        out[m] = {"auc": auc, "advantage": abs(auc - 0.5), "pval": pval}
    return out


CSV_FIELDS = [
    "dataset", "target", "class0", "class1", "model", "aucMean", "aucStd",
    "advantageMean", "sigFraction", "medianTestN", "majorityBaselineAcc",
    "nSeeds", "passed", "nonGating",
]

# --- Multi-seed aggregation & verdict -----------------------------------------

def _mean_std(vals):
    a = np.asarray(vals, dtype=float)
    return (float(a.mean()), float(a.std())) if len(a) else (float("nan"), float("nan"))


def analyze_contrast(X, y, groups, seeds: int, models: List[str]) -> Dict:
    # Single RF fit uses all cores when serial; single-threaded when the seed
    # loop is process-parallel (avoids core oversubscription).
    rf_n_jobs = -1 if JOBS == 1 else 1
    if JOBS == 1:
        per_seed = [evaluate_seed(X, y, groups, s, models, rf_n_jobs) for s in range(seeds)]
    else:
        per_seed = Parallel(n_jobs=JOBS)(
            delayed(evaluate_seed)(X, y, groups, s, models, rf_n_jobs) for s in range(seeds)
        )
    per_seed = [r for r in per_seed if r is not None]

    result = {"nSeeds": len(per_seed), "models": {}}
    if not per_seed:
        result["medianTestN"] = None
        result["nonGating"] = True
        result["passed"] = None
        return result

    test_ns = [r["testN"] for r in per_seed]
    median_test_n = float(np.median(test_ns))
    result["medianTestN"] = median_test_n
    result["majorityAcc"] = float(np.mean([r["majorityAcc"] for r in per_seed]))
    non_gating = median_test_n < MIN_TEST_SAMPLES
    result["nonGating"] = non_gating

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

    # A contrast passes if no gating model leg fires. Non-gating contrasts do not
    # decide the overall verdict but still report passed for transparency.
    result["passed"] = not any_leg_fails
    return result


def _build_verdict(dataset_tag: str, seeds: int, contrasts: List[Dict]) -> Dict:
    judged = [c for c in contrasts if not c["nonGating"] and c["passed"] is not None]
    overall = all(c["passed"] for c in judged) if judged else None
    return {
        "dataset": dataset_tag,
        "criterion": {
            "seeds": seeds,
            "aucMax": AUC_MAX,
            "permAlpha": PERM_ALPHA,
            "sigFractionMax": SIG_FRACTION_MAX,
            "minTestSamples": MIN_TEST_SAMPLES,
            "permIters": PERM_ITERS,
            "testRatio": TEST_RATIO,
        },
        "overallPassed": overall,
        "contrasts": contrasts,
    }


def run_dataset(dataset: List[dict], seeds: int, models: List[str], dataset_tag: str,
                 csv_path: Optional[Path] = None, json_path: Optional[Path] = None) -> Dict:
    """Run all SPP contrasts, checkpointing to csv_path/json_path after each one
    so an interrupted run keeps its completed contrasts (mirrors the ablation
    driver's incremental checkpointing)."""
    X, groups, labels_by_target = build_feature_matrix(dataset)
    contrasts = []

    writer = None
    csv_file = None
    if csv_path is not None:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        csv_file = open(csv_path, "w", newline="")
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()

    for target in TARGET_ATTRS:
        labels = labels_by_target[target]
        classes = sorted(set(labels.tolist()))
        for c0, c1 in itertools.combinations(classes, 2):
            mask = (labels == c0) | (labels == c1)
            y = (labels[mask] == c1).astype(int)
            res = analyze_contrast(X[mask], y, groups[mask], seeds, models)
            res.update({"dataset": dataset_tag, "target": target, "class0": c0, "class1": c1})
            contrasts.append(res)
            _print_contrast(res, models)

            if writer is not None:
                for row in verdict_to_rows({"contrasts": [res]}, models):
                    writer.writerow(row)
                csv_file.flush()
            if json_path is not None:
                with open(json_path, "w") as f:
                    json.dump(_build_verdict(dataset_tag, seeds, contrasts), f, indent=2)

    if csv_file is not None:
        csv_file.close()

    return _build_verdict(dataset_tag, seeds, contrasts)


def _print_contrast(res: Dict, models: List[str]):
    tag = "non-gating" if res["nonGating"] else ("PASS" if res["passed"] else "FAIL")
    label = f"{res['target']}: {res['class0']}/{res['class1']}"
    parts = []
    for m in models:
        md = res["models"].get(m)
        if md:
            parts.append(f"{m} AUC={md['aucMean']:.3f} sig={md['sigFraction']:.2f}")
    n = res.get("medianTestN")
    n_str = f"medN={n:.0f}" if n is not None else "medN=NA"
    print(f"  [{tag:10}] {label:38} {n_str:8} " + " | ".join(parts))


# --- Output -------------------------------------------------------------------

def verdict_to_rows(verdict: Dict, models: List[str]) -> List[Dict]:
    rows = []
    for c in verdict["contrasts"]:
        for m in models:
            md = c["models"].get(m)
            rows.append({
                "dataset": c["dataset"],
                "target": c["target"],
                "class0": c["class0"],
                "class1": c["class1"],
                "model": m,
                "aucMean": md["aucMean"] if md else None,
                "aucStd": md["aucStd"] if md else None,
                "advantageMean": md["advantageMean"] if md else None,
                "sigFraction": md["sigFraction"] if md else None,
                "medianTestN": c.get("medianTestN"),
                "majorityBaselineAcc": c.get("majorityAcc"),
                "nSeeds": c.get("nSeeds"),
                "passed": c["passed"],
                "nonGating": c["nonGating"],
            })
    return rows


def main():
    parser = argparse.ArgumentParser(description="Supervised SPP privacy cross-check (sklearn)")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR,
                        help="Directory containing spp_dataset.json (searched recursively)")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1,
                        help="Parallel processes over seeds (-1 = all cores). "
                             "RF fits single-threaded when >1 to avoid oversubscription.")
    parser.add_argument("--tag", type=str, default=None,
                        help="Dataset tag for output rows (default: parent dir name)")
    args = parser.parse_args()

    global JOBS
    JOBS = args.jobs

    dataset_path = find_spp_dataset(args.data_dir)
    if not dataset_path:
        print(f"No spp_dataset.json found under {args.data_dir}")
        return
    tag = args.tag or dataset_path.parent.name
    print(f"Loading {dataset_path} (tag={tag})...")
    dataset = load_json(dataset_path)
    print(f"{len(dataset)} executions, {len(set(e.get('policyId') for e in dataset))} policies.\n")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / "spp_supervised_summary.csv"
    json_path = args.output_dir / "spp_supervised_verdict.json"
    verdict = run_dataset(dataset, args.seeds, args.models, tag,
                           csv_path=csv_path, json_path=json_path)

    print(f"\nOverall SPP supervised verdict [{tag}]: "
          f"{'PASS' if verdict['overallPassed'] else verdict['overallPassed']}")
    print(f"Summary -> {csv_path}")
    print(f"Verdict -> {json_path}")


if __name__ == "__main__":
    main()
