#!/usr/bin/env python3
"""Supervised Policy Content Hiding (PCH) cross-check using scikit-learn.

This is an independent Python mirror of the JS PCH source-of-record verdict: it
runs DUO one-vs-rest and ICD-10 chapter one-vs-rest tasks over policy-disjoint
splits, then applies the same multi-seed AUC + permutation double criterion used
by ``experiments/core/multiseed_criterion.js``.  JS reports remain authoritative;
this script is a cross-check.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from common import (
    DEFAULT_SEEDS,
    FEATURE_KEYS,
    TEST_RATIO,
    analyze_contrast,
    build_verdict,
    checkpoint_rows,
    feature_row,
    find_json,
    load_json,
    verdict_to_rows,
)

DUO_TERM_ORDER: Sequence[Tuple[int, str]] = (
    (0, "GR"),
    (1, "DS"),
    (2, "RS"),
    (3, "POA"),
    (4, "GS"),
    (5, "CC"),
)

DEFAULT_DATA_DIR = (
    Path(__file__).resolve().parents[2]
    / "experiments" / "unified" / "artifacts_data" / "polygonAmoy"
)
OUTPUT_DIR = Path(__file__).parents[1] / "results" / "supervised_analysis"


def find_pch_dataset(data_dir: Path) -> Optional[Path]:
    return find_json(data_dir, "pch_dataset.json")


def _duo_codes(record: dict) -> set:
    codes = {str(c) for c in record.get("duoTermCodes") or []}
    semantics = record.get("semantics") or {}
    codes.update(str(c) for c in semantics.get("duoTerms") or [])
    primary = semantics.get("primaryDuoTerm")
    if primary:
        codes.add(str(primary))
    return codes


def _duo_ids(record: dict) -> set:
    ids = set()
    for value in record.get("duoTerms") or []:
        try:
            ids.add(int(value))
        except (TypeError, ValueError):
            pass
    value = record.get("duoTerm")
    try:
        if value is not None:
            ids.add(int(value))
    except (TypeError, ValueError):
        pass
    semantics = record.get("semantics") or {}
    for value in semantics.get("duoTermValues") or []:
        try:
            ids.add(int(value))
        except (TypeError, ValueError):
            pass
    value = semantics.get("primaryDuoTermValue")
    try:
        if value is not None:
            ids.add(int(value))
    except (TypeError, ValueError):
        pass
    return ids


def _icd_chapter(record: dict):
    semantics = record.get("semantics") or {}
    scope = semantics.get("icd10Scope")
    if isinstance(scope, dict):
        return scope.get("id")
    if record.get("icd10Chapter") is not None:
        return record.get("icd10Chapter")
    if record.get("ontologyNamespace") == "ICD10":
        return record.get("ontologyValue")
    return None


def build_base_arrays(dataset: List[dict]):
    X = np.array([feature_row(entry) for entry in dataset], dtype=float)
    groups = np.array([str(entry.get("policyId", i)) for i, entry in enumerate(dataset)])
    return X, groups


def build_tasks(dataset: List[dict]):
    X, groups = build_base_arrays(dataset)
    tasks = []
    all_indices = np.arange(len(dataset), dtype=int)

    for term_id, code in DUO_TERM_ORDER:
        y_values = []
        for record in dataset:
            present = code in _duo_codes(record) or term_id in _duo_ids(record)
            y_values.append(1 if present else 0)
        y = np.array(y_values, dtype=int)
        if len(np.unique(y)) < 2:
            continue
        tasks.append({
            "key": f"DUO {code}",
            "target": "duoTermPresence",
            "class0": f"not_{code}",
            "class1": code,
            "X": X,
            "y": y,
            "groups": groups,
            # Original dataset row indices for this task (diagnostics only; the
            # of-record pipeline ignores this key).
            "indices": all_indices,
        })

    icd_rows = [(i, _icd_chapter(record)) for i, record in enumerate(dataset)]
    icd_rows = [(i, ch) for i, ch in icd_rows if ch is not None]
    if icd_rows:
        indices = np.array([i for i, _ in icd_rows], dtype=int)
        chapters = sorted({ch for _, ch in icd_rows}, key=lambda value: str(value))
        chapter_to_js_index = {chapter: idx for idx, chapter in enumerate(chapters)}
        labels = {i: ch for i, ch in icd_rows}
        for chapter in chapters:
            js_index = chapter_to_js_index[chapter]
            y = np.array([1 if labels[int(i)] == chapter else 0 for i in indices], dtype=int)
            if len(np.unique(y)) < 2:
                continue
            tasks.append({
                # JS normalizes ICD chapters to numeric ids and reports ICD ch0..ch9.
                "key": f"ICD ch{js_index}",
                "target": "icd10Chapter",
                "class0": f"not_ch{js_index}",
                "class1": f"ch{js_index}:{chapter}",
                "X": X[indices],
                "y": y,
                "groups": groups[indices],
                "indices": indices,
            })
    return tasks


def run_dataset(
    dataset: List[dict],
    seeds: int,
    models: Sequence[str],
    dataset_tag: str,
    jobs: int,
    csv_path: Optional[Path] = None,
    json_path: Optional[Path] = None,
) -> Dict:
    results = []
    if csv_path is not None and csv_path.exists():
        csv_path.unlink()

    for task in build_tasks(dataset):
        res = analyze_contrast(task["X"], task["y"], task["groups"], seeds, models, jobs=jobs)
        res.update({
            "dataset": dataset_tag,
            "key": task["key"],
            "target": task["target"],
            "class0": task["class0"],
            "class1": task["class1"],
        })
        results.append(res)
        parts = [
            f"{m} AUC={res['models'][m]['aucMean']:.3f} sig={res['models'][m]['sigFraction']:.2f}"
            for m in models if m in res.get("models", {})
        ]
        tag = "non-gating" if res.get("nonGating") else ("PASS" if res.get("passed") else "FAIL")
        n = res.get("medianTestN")
        print(f"  [{tag:10}] {task['key']:16} medN={n if n is not None else 'NA'} " + " | ".join(parts))

        partial = build_verdict(dataset_tag, seeds, results)
        checkpoint_rows(csv_path, verdict_to_rows({"dataset": dataset_tag, "tasks": [res]}, models), append=True)
        if json_path is not None:
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with json_path.open("w", encoding="utf-8") as handle:
                json.dump(partial, handle, indent=2)

    return build_verdict(dataset_tag, seeds, results)


def main() -> None:
    parser = argparse.ArgumentParser(description="Supervised PCH privacy cross-check (sklearn)")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--tag", type=str, default=None)
    args = parser.parse_args()

    dataset_path = find_pch_dataset(args.data_dir)
    if dataset_path is None:
        raise SystemExit(f"No pch_dataset.json found under {args.data_dir}")
    dataset = load_json(dataset_path)
    tag = args.tag or dataset_path.parent.name
    print(f"Loading {dataset_path} (tag={tag})...")
    print(f"{len(dataset)} executions, {len(set(e.get('policyId') for e in dataset))} policies.\n")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / "pch_supervised_summary.csv"
    json_path = args.output_dir / "pch_supervised_verdict.json"
    verdict = run_dataset(dataset, args.seeds, args.models, tag, args.jobs, csv_path, json_path)

    print(f"\nOverall PCH supervised verdict [{tag}]: "
          f"{'PASS' if verdict['overallPassed'] else verdict['overallPassed']}")
    print(f"Summary -> {csv_path}")
    print(f"Verdict -> {json_path}")


if __name__ == "__main__":
    main()
