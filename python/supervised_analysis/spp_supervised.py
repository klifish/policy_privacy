#!/usr/bin/env python3
"""Supervised Structure & Parameter Privacy (SPP) cross-check using scikit-learn.

Independent Python mirror of the JavaScript supervised attack in
``experiments/structure_and_parameter_privacy/attacks.js`` (task structure and
verdict) with sklearn RandomForest and LogisticRegression attackers.  JS reports
remain authoritative; this script is a cross-check.
"""
from __future__ import annotations

import argparse
import csv
import json
import itertools
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np

from common import (
    CSV_FIELDS,
    DEFAULT_SPLIT_CANDIDATES,
    DEFAULT_SEEDS,
    FEATURE_KEYS,
    PERM_ITERS,
    TEST_RATIO,
    analyze_contrast,
    build_verdict,
    feature_row,
    file_sha256,
    find_json,
    load_json,
    load_split_manifest,
    new_split_manifest,
    verdict_to_rows,
    evaluate_seed,
    write_split_manifest,
)

TARGET_ATTRS = ["structureType", "predicateCombo", "paramType", "nestingDepth"]
TARGET_CLASS_ORDER = {
    "structureType": ["trivial", "or_only", "and_only", "negation_heavy", "and_or_mixed"],
    "predicateCombo": ["none", "single", "few", "many"],
    "paramType": ["none", "small", "medium", "large"],
    "nestingDepth": ["flat", "shallow", "medium", "deep"],
}
DEFAULT_DATA_DIR = (
    Path(__file__).resolve().parents[2]
    / "experiments" / "unified" / "artifacts_data" / "polygonAmoy"
)
OUTPUT_DIR = Path(__file__).parents[1] / "results" / "supervised_analysis"
# Kept for run_ablation_supervised.py compatibility; common.analyze_contrast takes
# an explicit jobs argument, so this module-level value only reflects CLI state.
JOBS = 1


def find_spp_dataset(data_dir: Path) -> Optional[Path]:
    return find_json(data_dir, "spp_dataset.json")


def build_feature_matrix(dataset: List[dict]):
    """Return (X, groups, labels_by_target) for the whole SPP dataset."""
    X = np.array([feature_row(e) for e in dataset], dtype=float)
    groups = np.array([str(e.get("policyId", i)) for i, e in enumerate(dataset)])
    labels_by_target = {
        t: np.array([str(e.get(t)) for e in dataset], dtype=object) for t in TARGET_ATTRS
    }
    return X, groups, labels_by_target


def build_tasks(dataset: List[dict]):
    X, groups, labels_by_target = build_feature_matrix(dataset)
    tasks = []
    for target in TARGET_ATTRS:
        labels = labels_by_target[target]
        present = set(labels.tolist())
        ordered = [value for value in TARGET_CLASS_ORDER.get(target, []) if value in present]
        ordered.extend(sorted(present - set(ordered)))
        for c0, c1 in itertools.combinations(ordered, 2):
            mask = (labels == c0) | (labels == c1)
            tasks.append({
                "key": f"{target}: {c0}/{c1}",
                "target": target,
                "class0": c0,
                "class1": c1,
                "X": X[mask],
                "y": (labels[mask] == c1).astype(int),
                "groups": groups[mask],
            })
    return tasks


def run_dataset(
    dataset: List[dict],
    seeds: int,
    models: Sequence[str],
    dataset_tag: str,
    csv_path: Optional[Path] = None,
    json_path: Optional[Path] = None,
    jobs: int = 1,
    split_candidates: int = DEFAULT_SPLIT_CANDIDATES,
    split_manifest_in: Optional[Dict] = None,
    split_manifest_out: Optional[Dict] = None,
    perm_iters: int = PERM_ITERS,
) -> Dict:
    """Run all SPP contrasts, checkpointing after each contrast."""
    tasks = []

    writer = None
    csv_file = None
    if csv_path is not None:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        csv_file = csv_path.open("w", newline="", encoding="utf-8")
        writer = csv.DictWriter(csv_file, fieldnames=CSV_FIELDS)
        writer.writeheader()

    for task in build_tasks(dataset):
        target, c0, c1 = task["target"], task["class0"], task["class1"]
        task_key = task["key"]
        res = analyze_contrast(
            task["X"], task["y"], task["groups"], seeds, models, jobs=jobs,
            perm_iters=perm_iters, task_key=task_key,
            split_candidates=split_candidates,
            split_manifest_in=split_manifest_in,
            split_manifest_out=split_manifest_out,
        )
        res.update({
            "dataset": dataset_tag,
            "key": task_key,
            "target": target,
            "class0": c0,
            "class1": c1,
        })
        tasks.append(res)
        _print_contrast(res, models)

        if writer is not None:
            for row in verdict_to_rows({"dataset": dataset_tag, "tasks": [res]}, models):
                writer.writerow(row)
            csv_file.flush()
        if json_path is not None:
            with json_path.open("w", encoding="utf-8") as handle:
                json.dump(build_verdict(dataset_tag, seeds, tasks, perm_iters=perm_iters), handle, indent=2)

    if csv_file is not None:
        csv_file.close()

    return build_verdict(dataset_tag, seeds, tasks, perm_iters=perm_iters)


def _print_contrast(res: Dict, models: Sequence[str]):
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Supervised SPP privacy cross-check (sklearn)")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR,
                        help="Directory containing spp_dataset.json (searched recursively)")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1,
                        help="Parallel processes over seeds (-1 = all cores).")
    parser.add_argument("--tag", type=str, default=None,
                        help="Dataset tag for output rows (default: parent dir name)")
    parser.add_argument("--permutation-iterations", type=int, default=PERM_ITERS)
    parser.add_argument("--split-candidates", type=int, default=DEFAULT_SPLIT_CANDIDATES)
    parser.add_argument("--split-manifest-in", type=Path, default=None)
    parser.add_argument("--split-manifest-out", type=Path, default=None)
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
    manifest_in = load_split_manifest(args.split_manifest_in)
    manifest_out = new_split_manifest(TEST_RATIO, args.split_candidates)
    manifest_out["dataset"] = {"path": str(dataset_path), "sha256": file_sha256(dataset_path)}
    verdict = run_dataset(
        dataset, args.seeds, args.models, tag,
        csv_path=csv_path, json_path=json_path, jobs=args.jobs,
        split_candidates=args.split_candidates,
        split_manifest_in=manifest_in,
        split_manifest_out=manifest_out,
        perm_iters=args.permutation_iterations,
    )
    manifest_path = args.split_manifest_out or (args.output_dir / "spp_split_manifest.json")
    write_split_manifest(manifest_path, manifest_out)

    print(f"\nOverall SPP supervised verdict [{tag}]: "
          f"{'PASS' if verdict['overallPassed'] else verdict['overallPassed']}")
    print(f"Summary -> {csv_path}")
    print(f"Verdict -> {json_path}")


if __name__ == "__main__":
    main()
