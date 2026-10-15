#!/usr/bin/env python3
"""Paired sklearn gas-padding ablation for PCH, PI, and SPP."""
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np
from joblib import Parallel, delayed

from experiments.analysis.paths import ABLATION_DIR, SUPERVISED_RESULTS_DIR
from .common import (
    DEFAULT_SPLIT_CANDIDATES,
    evaluate_seed,
    one_execution_per_group,
    new_split_manifest,
    repeated_stratified_group_holdout,
    split_group_hash,
    split_task_hash,
    write_split_manifest,
)
from .pch_supervised import build_tasks as build_pch_tasks
from .pi_supervised import PAIR_TYPES, evaluate_type_seed, load_pairs
from .spp_supervised import build_tasks as build_spp_tasks


DEFAULT_ABLATION_DIR = ABLATION_DIR
OUTPUT_DIR = SUPERVISED_RESULTS_DIR
BOOTSTRAP_ITERS = 500
BOOTSTRAP_SEED = 12345
JOBS = 1

CSV_FIELDS = [
    "experiment", "target", "class0", "class1", "model",
    "aucMean_b1_unpadded", "aucMean_b2_padded", "deltaLeakage",
    "ciLow", "ciHigh", "ciExcludesZero", "interpretation",
    "nSeedsPaired", "intervalType",
]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def record_key(record: dict) -> Tuple[str, str]:
    return str(record.get("policyId")), str(record.get("executionId"))


def align_records(b1: List[dict], b2: List[dict], dataset_name: str) -> Tuple[List[dict], List[dict]]:
    """Align by policyId+executionId and reject semantic or label drift."""
    def index(rows):
        out = {}
        for row in rows:
            key = record_key(row)
            if key in out:
                raise ValueError(f"duplicate {dataset_name} execution key {key}")
            out[key] = row
        return out

    left, right = index(b1), index(b2)
    if set(left) != set(right):
        raise ValueError(
            f"{dataset_name} execution keys differ: "
            f"onlyB1={len(set(left)-set(right))}, onlyB2={len(set(right)-set(left))}"
        )
    keys = sorted(left)
    label_fields = (
        "duoTerm", "duoTermCodes", "ontologyNamespace", "ontologyValue",
        "structureType", "predicateCombo", "paramType", "nestingDepth",
        "logicStructure", "predicateCount", "setSize",
    )
    for key in keys:
        a, b = left[key], right[key]
        for field in label_fields:
            if a.get(field) != b.get(field):
                raise ValueError(f"{dataset_name} label mismatch at {key}: {field}")
        if a.get("semantics") != b.get("semantics") or a.get("policy") != b.get("policy"):
            raise ValueError(f"{dataset_name} semantic mismatch at {key}")
    return [left[key] for key in keys], [right[key] for key in keys]


def _task_map(builder, rows: List[dict]) -> Dict[str, dict]:
    """Tasks keyed as in the verdicts (all policies, outcomes pooled)."""
    return {task["key"]: task for task in builder(rows)}


def load_aligned_tasks(root: Path):
    output = {}
    for experiment, filename, builder in (
        ("pch", "pch_dataset.json", build_pch_tasks),
        ("spp", "spp_dataset.json", build_spp_tasks),
    ):
        b1 = load_json(root / "b1_unpadded" / filename)
        b2 = load_json(root / "b2_padded" / filename)
        b1, b2 = align_records(b1, b2, filename)
        output[experiment] = (_task_map(builder, b1), _task_map(builder, b2))

    b1 = load_json(root / "b1_unpadded" / "pi_dataset.json")
    b2 = load_json(root / "b2_padded" / "pi_dataset.json")
    b1, b2 = align_records(b1, b2, "pi_dataset.json")
    pairs1, pairs2 = load_pairs(b1), load_pairs(b2)
    for pair_id in pairs1:
        p1, p2 = pairs1[pair_id], pairs2.get(pair_id)
        if p2 is None or p1["pairType"] != p2["pairType"] or not (
                np.array_equal(p1["y"], p2["y"]) and np.array_equal(p1["o"], p2["o"])):
            raise ValueError(f"PI pair {pair_id} differs between B1 and B2")
    output["pi"] = (pairs1, pairs2)
    return output


def _paired_pi_seed(pairs1, pairs2, seed, model):
    """Within-pair attack on both profiles; the split depends only on (seed, pair, labels)."""
    r1 = evaluate_type_seed(pairs1, seed, [model], 1, None)
    r2 = evaluate_type_seed(pairs2, seed, [model], 1, None)
    return {"seed": seed, "b1": r1[model]["auc"], "b2": r2[model]["auc"]}


def _subsample(task, seed):
    """One execution per policy for this seed (same rule as analyze_contrast)."""
    keep = one_execution_per_group(task["groups"], seed, task.get("execIds"))
    return (np.asarray(task["X"])[keep], np.asarray(task["y"])[keep],
            np.asarray(task["groups"], dtype=object)[keep])


def _paired_seed(task1, task2, seed, model, candidates):
    if split_task_hash(task1["y"], task1["groups"]) != split_task_hash(task2["y"], task2["groups"]):
        raise ValueError(f"B1/B2 task data mismatch: {task1['key']}")
    X1, y1, g1 = _subsample(task1, seed)
    X2, y2, g2 = _subsample(task2, seed)
    plan1 = repeated_stratified_group_holdout(y1, g1, seed, candidates=candidates)
    if plan1 is None:
        return None
    plan2 = repeated_stratified_group_holdout(
        y2, g2, seed, candidates=candidates, test_groups=plan1["testGroups"],
    )
    if plan2 is None:
        raise ValueError(f"shared B1/B2 split cannot be replayed: {task1['key']} seed {seed}")
    # One permutation is enough here because the ablation consumes AUC only.
    r1 = evaluate_seed(X1, y1, g1, seed, [model], 1,
                       perm_iters=1, split_plan=plan1, split_candidates=candidates)
    r2 = evaluate_seed(X2, y2, g2, seed, [model], 1,
                       perm_iters=1, split_plan=plan2, split_candidates=candidates)
    return {"seed": seed, "b1": r1[model]["auc"], "b2": r2[model]["auc"], "split": r1["split"]}


def bootstrap_delta_ci(deltas: np.ndarray, iters: int, rng: np.random.Generator):
    if len(deltas) == 0:
        return float("nan"), float("nan"), float("nan")
    means = np.array([
        rng.choice(deltas, size=len(deltas), replace=True).mean() for _ in range(iters)
    ])
    return float(deltas.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def run(tasks, seeds: int, models: Sequence[str], candidates: int,
        bootstrap_iters: int, manifest: Dict) -> List[Dict]:
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    rows = []

    jobs = []
    for experiment in ("pch", "pi", "spp"):
        b1_tasks, b2_tasks = tasks[experiment]
        if experiment == "pi":
            for pair_type in PAIR_TYPES:
                sub1 = {pid: p for pid, p in b1_tasks.items() if p["pairType"] == pair_type}
                sub2 = {pid: b2_tasks[pid] for pid in sub1}
                if sub1:
                    jobs.append((experiment, pair_type, {"class0": "P0", "class1": "P1"}, sub1, sub2))
            continue
        if set(b1_tasks) != set(b2_tasks):
            raise ValueError(f"{experiment} B1/B2 task sets differ")
        for key in b1_tasks:
            jobs.append((experiment, key, b1_tasks[key], b1_tasks[key], b2_tasks[key]))

    for experiment, key, meta, task1, task2 in jobs:
        for model in models:
            if experiment == "pi":
                fn, extra = _paired_pi_seed, ()
            else:
                fn, extra = _paired_seed, (candidates,)
            if JOBS == 1:
                results = [fn(task1, task2, seed, model, *extra) for seed in range(seeds)]
            else:
                results = Parallel(n_jobs=JOBS)(
                    delayed(fn)(task1, task2, seed, model, *extra) for seed in range(seeds)
                )
            results = [result for result in results if result is not None]
            if experiment != "pi":
                entry = manifest.setdefault("tasks", {}).setdefault(
                    f"{experiment}:{key}",
                    {
                        "taskDataHash": split_task_hash(task1["y"], task1["groups"]),
                        "groupUniverseHash": split_group_hash(task1["groups"]),
                        "seeds": {},
                    },
                )
                for result in results:
                    entry["seeds"][str(result["seed"])] = result["split"]
            a1 = np.array([result["b1"] for result in results])
            a2 = np.array([result["b2"] for result in results])
            deltas = np.abs(a1 - 0.5) - np.abs(a2 - 0.5)
            mean_delta, ci_lo, ci_hi = bootstrap_delta_ci(deltas, bootstrap_iters, rng)
            excludes = bool(len(deltas) and (ci_lo > 0 or ci_hi < 0))
            interpretation = (
                "padding_reduces_leakage" if excludes and mean_delta > 0 else
                "padding_increases_leakage" if excludes else
                "no_detectable_incremental_effect"
            )
            row = {
                "experiment": experiment,
                "target": key,
                "class0": meta.get("class0"),
                "class1": meta.get("class1"),
                "model": model,
                "aucMean_b1_unpadded": float(a1.mean()) if len(a1) else None,
                "aucMean_b2_padded": float(a2.mean()) if len(a2) else None,
                "deltaLeakage": mean_delta,
                "ciLow": ci_lo,
                "ciHigh": ci_hi,
                "ciExcludesZero": excludes,
                "interpretation": interpretation,
                "nSeedsPaired": len(deltas),
                "intervalType": "repeated-split stability interval",
            }
            rows.append(row)
            if not len(deltas):
                print(f"[{experiment.upper()}] {key} {model}: no valid split")
                continue
            print(
                f"[{experiment.upper()}] {key} {model}: "
                f"B1={row['aucMean_b1_unpadded']:.3f} B2={row['aucMean_b2_padded']:.3f} "
                f"delta={mean_delta:+.3f} [{ci_lo:+.3f},{ci_hi:+.3f}]"
            )
    return rows


def write_csv(path: Path, rows: Sequence[Dict], fields=CSV_FIELDS):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description="Paired Python gas-padding ablation")
    parser.add_argument("--ablation-dir", type=Path, default=DEFAULT_ABLATION_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=30)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--split-candidates", type=int, default=DEFAULT_SPLIT_CANDIDATES)
    parser.add_argument("--bootstrap-iterations", type=int, default=BOOTSTRAP_ITERS)
    args = parser.parse_args()

    global JOBS
    JOBS = args.jobs
    root = args.ablation_dir.resolve()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    tasks = load_aligned_tasks(root)
    manifest = new_split_manifest(candidates=args.split_candidates)
    rows = run(
        tasks, args.seeds, args.models, args.split_candidates,
        args.bootstrap_iterations, manifest,
    )
    output = args.output_dir / "gas_padding_supervised_deltaLeakage.csv"
    write_csv(output, rows)
    write_split_manifest(args.output_dir / "gas_padding_split_manifest.json", manifest)

    # Backward-compatible SPP-only CSV name used by existing local workflows.
    spp_rows = [row for row in rows if row["experiment"] == "spp"]
    write_csv(args.output_dir / "spp_ablation_deltaLeakage.csv", spp_rows)
    metadata = {
        "effectDefinition": "abs(AUC_B1 - 0.5) - abs(AUC_B2 - 0.5)",
        "intervalType": "repeated-split stability interval",
        "nonContemporaneousProfiles": True,
        "piPairs": "designed pairs from pi_dataset.json (piPair); within-pair split",
        "rows": len(rows),
    }
    (args.output_dir / "gas_padding_supervised_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(f"\nAblation results -> {output}")


if __name__ == "__main__":
    main()
