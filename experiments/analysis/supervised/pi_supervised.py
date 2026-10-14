#!/usr/bin/env python3
"""Supervised Policy Indistinguishability (PI) attack using scikit-learn.

The PI attacker knows the two candidate policies P0 and P1 of a pair and can
deploy and run each of them, so it trains on executions of the pair itself
and classifies held-out executions.  Every execution commits its own policy
instance (fresh randomizer), so training and test executions never share a
commitment.  The decision o is public; executions are compared within the
same outcome.

Per seed and pair, each (side, outcome) cell is split half train / half test,
one classifier is trained per pair on both outcomes (o is an input), and the
test AUC is computed within each (pair, outcome) cell.  A pair type's
statistic is the mean cell AUC over its pairs; its permutation null shuffles
the test labels within cells on fixed scores.  The verdict per type uses the
shared double criterion (mean AUC over seeds > 0.55 and >= 50% of seeds with
p < 0.05, for either classifier).

Positive control: the same attack with one synthetic column added, N(0, 1)
shifted by ``control_shift`` on side 1.  A type whose control is not detected
is INCONCLUSIVE.  The JS ``pi_report.json`` is an independent implementation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np
from joblib import Parallel, delayed

from experiments.analysis.paths import CAPTURE_DATA_DIR, SUPERVISED_RESULTS_DIR
from .common import (
    AUC_MAX,
    DEFAULT_SEEDS,
    MIN_TEST_SAMPLES,
    OUTCOMES,
    PERM_ALPHA,
    PERM_ITERS,
    SIG_FRACTION_MAX,
    _auc_from_ranks,
    _average_ranks,
    checkpoint_rows,
    feature_row,
    file_sha256,
    find_json,
    fit_predict_proba,
    load_json,
    outcome_of,
    verdict_to_rows,
)

DEFAULT_DATA_DIR = CAPTURE_DATA_DIR
OUTPUT_DIR = SUPERVISED_RESULTS_DIR
PAIR_TYPES = ("semantic_equivalent", "weak_equivalent", "controlled_difference")
CONTROL_SHIFT = 0.75
TEST_FRACTION = 0.5


def stable_int(*parts) -> int:
    digest = hashlib.sha256("|".join(map(str, parts)).encode("utf-8")).digest()
    return int.from_bytes(digest[:8], "big")


def load_pairs(dataset: List[dict]) -> Dict[str, Dict]:
    """pairId -> {pairType, X, y (side), o (1 granted / 0 denied)}."""
    rows = defaultdict(list)
    types = {}
    for entry in dataset:
        pair = entry.get("piPair")
        if not pair:
            continue
        outcome = outcome_of(entry)
        if outcome not in OUTCOMES:
            raise SystemExit(f"execution {entry.get('policyId')}#{entry.get('executionId')} has no outcome")
        rows[pair["pairId"]].append((feature_row(entry), int(pair["side"]), int(outcome == "granted")))
        types[pair["pairId"]] = pair["pairType"]
    if not rows:
        raise SystemExit("pi_dataset.json has no designed PI pairs (piPair); capture with a piLayer config")
    pairs = {}
    for pair_id in sorted(rows):
        X = np.array([r[0] for r in rows[pair_id]], dtype=float)
        y = np.array([r[1] for r in rows[pair_id]], dtype=int)
        o = np.array([r[2] for r in rows[pair_id]], dtype=int)
        pairs[pair_id] = {"pairType": types[pair_id], "X": X, "y": y, "o": o}
    return pairs


def split_pair(y, o, seed: int, pair_id: str) -> np.ndarray:
    """Boolean test mask: half of every (side, outcome) cell, at least one row each way."""
    rng = np.random.default_rng(stable_int("pi-split", seed, pair_id))
    test = np.zeros(len(y), dtype=bool)
    for side in (0, 1):
        for outcome in (0, 1):
            idx = np.flatnonzero((y == side) & (o == outcome))
            if len(idx) < 2:
                raise ValueError(f"pair {pair_id}: cell side={side} o={outcome} has {len(idx)} executions")
            n_test = min(len(idx) - 1, max(1, int(round(len(idx) * TEST_FRACTION))))
            test[rng.choice(idx, size=n_test, replace=False)] = True
    return test


def control_column(y, seed_parts, shift: float) -> np.ndarray:
    rng = np.random.default_rng(stable_int("pi-control", *seed_parts))
    return rng.normal(0.0, 1.0, len(y)) + shift * y


def score_pair(X, y, o, test, model: str, seed: int):
    """Test scores of one pair, from a classifier trained on its other executions."""
    features = np.column_stack([X, o])
    train = ~test
    keep = features[train].var(axis=0) > 0
    if not keep.any():
        return np.full(int(test.sum()), 0.5)
    return fit_predict_proba(model, features[train][:, keep], y[train], features[test][:, keep], seed, rf_n_jobs=1)


def cell_aucs(scores, y_test, o_test, perm_iters: int, rng):
    """Observed AUC and permuted AUCs of each outcome cell of one pair."""
    observed, null = [], []
    for outcome in (0, 1):
        mask = o_test == outcome
        labels = y_test[mask]
        ranks = _average_ranks(np.asarray(scores[mask], dtype=float))
        n_pos = int(labels.sum())
        n_neg = len(labels) - n_pos
        observed.append(_auc_from_ranks(labels, ranks, n_pos, n_neg))
        perms = np.argsort(rng.random((perm_iters, len(labels))), axis=1)
        permuted = labels[perms]
        null.append(((permuted * ranks).sum(axis=1) - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg))
    return observed, null


def evaluate_type_seed(pairs: Dict[str, Dict], seed: int, models: Sequence[str], perm_iters: int,
                       control_shift: Optional[float]) -> Dict:
    """One seed of one pair type: mean cell AUC and its within-cell permutation p-value per model."""
    out = {"testN": 0, "pairAuc": {}}
    per_model = {m: {"observed": [], "null": []} for m in models}
    for pair_id, pair in pairs.items():
        X, y, o = pair["X"], pair["y"], pair["o"]
        if control_shift is not None:
            X = np.column_stack([X, control_column(y, (seed, pair_id), control_shift)])
        test = split_pair(y, o, seed, pair_id)
        out["testN"] += int(test.sum())
        for m in models:
            rng = np.random.default_rng(stable_int("pi-perm", seed, pair_id, m))
            scores = score_pair(X, y, o, test, m, seed)
            observed, null = cell_aucs(scores, y[test], o[test], perm_iters, rng)
            per_model[m]["observed"].extend(observed)
            per_model[m]["null"].extend(null)
            out["pairAuc"].setdefault(m, {})[pair_id] = float(np.mean(observed))
    for m in models:
        stat = float(np.mean(per_model[m]["observed"]))
        null = np.mean(np.vstack(per_model[m]["null"]), axis=0)
        out[m] = {"auc": stat, "advantage": abs(stat - 0.5),
                  "pval": float((1 + np.sum(null >= stat - 1e-12)) / (perm_iters + 1))}
    return out


def summarize(per_seed: List[Dict], models: Sequence[str]) -> Dict:
    result = {"nSeeds": len(per_seed), "models": {}}
    result["medianTestN"] = float(np.median([r["testN"] for r in per_seed]))
    result["nonGating"] = result["medianTestN"] < MIN_TEST_SAMPLES
    any_leg_fails = False
    for m in models:
        aucs = [r[m]["auc"] for r in per_seed]
        pvals = [r[m]["pval"] for r in per_seed]
        auc_mean = float(np.mean(aucs))
        sig_fraction = float(np.mean([p < PERM_ALPHA for p in pvals]))
        leg_fails = auc_mean > AUC_MAX and sig_fraction >= SIG_FRACTION_MAX
        any_leg_fails = any_leg_fails or leg_fails
        pair_ids = sorted(per_seed[0]["pairAuc"][m])
        result["models"][m] = {
            "aucMean": auc_mean,
            "aucStd": float(np.std(aucs)),
            "advantageMean": float(np.mean([abs(a - 0.5) for a in aucs])),
            "sigFraction": sig_fraction,
            "aucHigh": auc_mean > AUC_MAX,
            "sigHigh": sig_fraction >= SIG_FRACTION_MAX,
            "legFails": leg_fails,
            "perSeed": {"auc": [float(a) for a in aucs], "pval": [float(p) for p in pvals]},
            "perPairAucMean": {pid: float(np.mean([r["pairAuc"][m][pid] for r in per_seed])) for pid in pair_ids},
        }
    # Underpowered types are reported but not judged, as in the JS aggregator.
    result["passed"] = None if result["nonGating"] else not any_leg_fails
    return result


def run_type(pairs, seeds, models, perm_iters, jobs, control_shift):
    def seeds_for(shift):
        if jobs == 1:
            return [evaluate_type_seed(pairs, s, models, perm_iters, shift) for s in range(seeds)]
        return Parallel(n_jobs=jobs)(
            delayed(evaluate_type_seed)(pairs, s, models, perm_iters, shift) for s in range(seeds)
        )
    result = summarize(seeds_for(None), models)
    control = summarize(seeds_for(control_shift), models)
    result["positiveControl"] = {
        "shift": control_shift,
        "detected": control["passed"] is False,
        "models": {m: {k: control["models"][m][k] for k in ("aucMean", "sigFraction", "legFails")}
                   for m in models},
    }
    if result["passed"] is None:
        result["status"] = "NOT JUDGED"
    elif not result["passed"]:
        result["status"] = "FAIL"
    else:
        result["status"] = "PASS" if result["positiveControl"]["detected"] else "INCONCLUSIVE"
    return result


def build_pi_verdict(dataset_tag: str, seeds: int, tasks: List[Dict], perm_iters: int, control_shift: float) -> Dict:
    judged = [t for t in tasks if not t.get("nonGating")]
    if any(t["status"] == "FAIL" for t in judged):
        overall = False
    elif judged and all(t["status"] == "PASS" for t in judged):
        overall = True
    else:
        overall = None
    return {
        "dataset": dataset_tag,
        "criterion": {
            "seeds": seeds,
            "aucMax": AUC_MAX,
            "permAlpha": PERM_ALPHA,
            "sigFractionMax": SIG_FRACTION_MAX,
            "minTestSamples": MIN_TEST_SAMPLES,
            "permIters": perm_iters,
            "testRatio": TEST_FRACTION,
            "split": "within pair, half of every (side, outcome) cell",
            "controlShift": control_shift,
        },
        "overallPassed": overall,
        "tasks": tasks,
    }


def run_pairs(dataset: List[dict], seeds: int, models: Sequence[str], dataset_tag: str, jobs: int,
              csv_path: Optional[Path] = None, json_path: Optional[Path] = None,
              perm_iters: int = PERM_ITERS, control_shift: float = CONTROL_SHIFT) -> Dict:
    pairs = load_pairs(dataset)
    if csv_path is not None and csv_path.exists():
        csv_path.unlink()
    tasks = []
    for pair_type in PAIR_TYPES:
        subset = {pid: p for pid, p in pairs.items() if p["pairType"] == pair_type}
        if not subset:
            continue
        res = run_type(subset, seeds, models, perm_iters, jobs, control_shift)
        res.update({
            "dataset": dataset_tag,
            "key": pair_type,
            "target": "pairSide",
            "class0": "P0",
            "class1": "P1",
            "nPairs": len(subset),
        })
        tasks.append(res)
        parts = [f"{m} AUC={res['models'][m]['aucMean']:.3f} sig={res['models'][m]['sigFraction']:.2f}"
                 for m in models]
        ctl = res["positiveControl"]
        ctl_parts = [f"{m} {ctl['models'][m]['aucMean']:.3f}" for m in models]
        print(f"  [{res['status']:12}] {pair_type:16} pairs={len(subset):3d} medN={res['medianTestN']:.0f} "
              + " | ".join(parts) + f" | control({' '.join(ctl_parts)}) "
              + ("detected" if ctl["detected"] else "NOT detected"))
        checkpoint_rows(csv_path, verdict_to_rows({"dataset": dataset_tag, "tasks": [res]}, models), append=True)
        if json_path is not None:
            json_path.parent.mkdir(parents=True, exist_ok=True)
            json_path.write_text(json.dumps(build_pi_verdict(dataset_tag, seeds, tasks, perm_iters, control_shift),
                                            indent=2), encoding="utf-8")
    return build_pi_verdict(dataset_tag, seeds, tasks, perm_iters, control_shift)


def main() -> None:
    parser = argparse.ArgumentParser(description="Supervised within-pair PI attack (sklearn)")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--tag", type=str, default=None)
    parser.add_argument("--permutation-iterations", type=int, default=PERM_ITERS)
    parser.add_argument("--control-shift", type=float, default=CONTROL_SHIFT)
    args = parser.parse_args()

    dataset_path = find_json(args.data_dir, "pi_dataset.json")
    if dataset_path is None:
        raise SystemExit(f"No pi_dataset.json found under {args.data_dir}")
    dataset = load_json(dataset_path)
    tag = args.tag or dataset_path.parent.name
    print(f"Loading {dataset_path} (tag={tag})...")
    counts = defaultdict(set)
    for entry in dataset:
        if entry.get("piPair"):
            counts[entry["piPair"]["pairType"]].add(entry["piPair"]["pairId"])
    print(f"{len(dataset)} executions; pairs: { {t: len(v) for t, v in counts.items()} }\n")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / "pi_supervised_summary.csv"
    json_path = args.output_dir / "pi_supervised_verdict.json"
    verdict = run_pairs(dataset, args.seeds, args.models, tag, args.jobs, csv_path, json_path,
                        perm_iters=args.permutation_iterations, control_shift=args.control_shift)
    verdict["dataSource"] = {"path": str(dataset_path), "sha256": file_sha256(dataset_path)}
    json_path.write_text(json.dumps(verdict, indent=2), encoding="utf-8")

    overall = verdict["overallPassed"]
    print(f"\nOverall PI supervised verdict [{tag}]: "
          f"{'PASS' if overall else ('FAIL' if overall is False else 'INCONCLUSIVE')}")
    print(f"Summary -> {csv_path}")
    print(f"Verdict -> {json_path}")


if __name__ == "__main__":
    main()
