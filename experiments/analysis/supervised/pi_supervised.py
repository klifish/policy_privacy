#!/usr/bin/env python3
"""Supervised Policy Indistinguishability (PI) attack using scikit-learn.

Produces the active MDPI manuscript's PI single-sample verdict scopes (overall
plus pair types) with a policy-pair-disjoint multi-seed classifier check. The JS
``pi_report.json`` is an independent implementation of the shared AUC +
permutation double criterion.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from experiments.analysis.paths import CAPTURE_DATA_DIR, REPO_ROOT, SUPERVISED_RESULTS_DIR
from .common import (
    DEFAULT_SPLIT_CANDIDATES,
    DEFAULT_SEEDS,
    PERM_ITERS,
    TEST_RATIO,
    analyze_contrast,
    build_verdict,
    checkpoint_rows,
    feature_row,
    find_json,
    load_json,
    load_split_manifest,
    new_split_manifest,
    verdict_to_rows,
    write_split_manifest,
)

DEFAULT_DATA_DIR = CAPTURE_DATA_DIR
OUTPUT_DIR = SUPERVISED_RESULTS_DIR
PAIR_GENERATOR = REPO_ROOT / "scripts" / "generate_pi_pairs.js"
PAIR_TYPES = ("semantic_equivalent", "structural_variant", "weak_equivalent", "controlled_difference")


def load_pi_pairs(path: Path) -> List[dict]:
    data = load_json(path)
    if isinstance(data, dict) and "pairs" in data:
        return list(data["pairs"])
    if isinstance(data, list):
        return data
    raise ValueError(f"Unrecognized PI pairs format at {path}")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def find_or_generate_pairs(data_dir: Path, output_dir: Path, seed: int) -> Tuple[Path, List[dict]]:
    existing = find_json(data_dir, "pi_pairs.json")
    if existing is not None:
        return existing, load_pi_pairs(existing)

    dataset_path = find_json(data_dir, "pi_dataset.json")
    if dataset_path is None:
        raise SystemExit(f"No pi_pairs.json or pi_dataset.json found under {data_dir}")
    if not PAIR_GENERATOR.exists():
        raise SystemExit(f"PI pair generator not found at {PAIR_GENERATOR}")

    output_dir.mkdir(parents=True, exist_ok=True)
    generated = output_dir / "pi_pairs_generated.json"
    cmd = [
        "node",
        str(PAIR_GENERATOR),
        "--dataset",
        str(dataset_path),
        "--output",
        str(generated),
        "--seed",
        str(seed),
        "--min",
        "0",
        "--target",
        "100",
        "--max",
        "100",
    ]
    print(f"Generating PI pairs from {dataset_path} -> {generated}")
    subprocess.run(cmd, cwd=REPO_ROOT, check=True)
    return generated, load_pi_pairs(generated)


def _policy_feature_runs(policy: dict) -> List[dict]:
    """Execution runs for one PI policy side.

    Uses only ``policy.features`` — matching the of-record JS attack
    (attacks.js reads ``policy.features`` exclusively).  ``rawExecutions`` is the
    same executions stored a second time (identical feature vectors, gas as
    strings), so including it double-counts every run and leaks the test set into
    training.  Every policy side across all pairs files carries ``features``, so
    this drops no data.
    """
    runs = []
    for run in policy.get("features") or []:
        if isinstance(run, dict):
            if "features" in run:
                runs.append(run)
            else:
                runs.append({"features": run, "policyId": policy.get("policyId")})
    return runs


def build_scope_arrays(pairs: Sequence[dict], scope: Optional[str] = None):
    rows = []
    for pair in pairs:
        pair_type = pair.get("pairType") or "unspecified"
        if scope not in (None, "overall") and pair_type != scope:
            continue
        pair_id = str(pair.get("pairId") or f"pair-{len(rows)}")
        policies = pair.get("policies") or []
        if len(policies) != 2:
            continue
        for side, policy in enumerate(policies):
            group = str(policy.get("policyId") or f"{pair_id}:{side}")
            for run_index, run in enumerate(_policy_feature_runs(policy)):
                rows.append({
                    "x": feature_row(run),
                    "y": side,
                    # Match the JS Level-I split: group by policyId so executions
                    # from the same policy never span train and test.
                    "group": group,
                    # Identify the execution behind the row: a policy in several
                    # pairs repeats the same executions, and the per-seed
                    # one-execution-per-policy subsample keeps every copy of the
                    # chosen execution.
                    "exec": f"{group}#{run.get('executionId', run_index)}",
                    "pairType": pair_type,
                })
    if not rows:
        return None
    X = np.array([row["x"] for row in rows], dtype=float)
    y = np.array([row["y"] for row in rows], dtype=int)
    groups = np.array([row["group"] for row in rows], dtype=object)
    exec_ids = np.array([row["exec"] for row in rows], dtype=object)
    if len(np.unique(y)) < 2 or len(np.unique(groups)) < 2:
        return None
    return X, y, groups, exec_ids


def run_pairs(
    pairs: List[dict],
    seeds: int,
    models: Sequence[str],
    dataset_tag: str,
    jobs: int,
    csv_path: Optional[Path] = None,
    json_path: Optional[Path] = None,
    split_candidates: int = DEFAULT_SPLIT_CANDIDATES,
    split_manifest_in: Optional[Dict] = None,
    split_manifest_out: Optional[Dict] = None,
    perm_iters: int = PERM_ITERS,
) -> Dict:
    tasks = []
    if csv_path is not None and csv_path.exists():
        csv_path.unlink()

    scopes = ["overall"] + [pair_type for pair_type in PAIR_TYPES if any(p.get("pairType") == pair_type for p in pairs)]
    for scope in scopes:
        arrays = build_scope_arrays(pairs, scope)
        if arrays is None:
            res = {
                "dataset": dataset_tag,
                "key": scope,
                "target": "pairScope",
                "class0": "policy0",
                "class1": "policy1",
                "nSeeds": 0,
                "models": {},
                "medianTestN": None,
                "majorityAcc": None,
                "nonGating": True,
                "passed": None,
                "skipped": True,
            }
        else:
            X, y, groups, exec_ids = arrays
            res = analyze_contrast(
                X, y, groups, seeds, models, jobs=jobs,
                perm_iters=perm_iters, task_key=scope,
                split_candidates=split_candidates,
                split_manifest_in=split_manifest_in,
                split_manifest_out=split_manifest_out,
                exec_ids=exec_ids,
            )
            res.update({
                "dataset": dataset_tag,
                "key": scope,
                "target": "pairScope",
                "class0": "policy0",
                "class1": "policy1",
                "skipped": False,
            })
        if scope == "controlled_difference":
            res["diagnostic"] = True
            res["nonGating"] = True
        tasks.append(res)

        parts = [
            f"{m} AUC={res['models'][m]['aucMean']:.3f} sig={res['models'][m]['sigFraction']:.2f}"
            for m in models if m in res.get("models", {})
        ]
        tag = "non-gating" if res.get("nonGating") else ("PASS" if res.get("passed") else "FAIL")
        n = res.get("medianTestN")
        print(f"  [{tag:10}] {scope:24} medN={n if n is not None else 'NA'} " + " | ".join(parts))

        partial = build_verdict(dataset_tag, seeds, tasks, perm_iters=perm_iters)
        checkpoint_rows(csv_path, verdict_to_rows({"dataset": dataset_tag, "tasks": [res]}, models), append=True)
        if json_path is not None:
            json_path.parent.mkdir(parents=True, exist_ok=True)
            with json_path.open("w", encoding="utf-8") as handle:
                json.dump(partial, handle, indent=2)

    return build_verdict(dataset_tag, seeds, tasks, perm_iters=perm_iters)


def main() -> None:
    parser = argparse.ArgumentParser(description="Supervised PI privacy cross-check (sklearn)")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--pairs", type=Path, default=None)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--tag", type=str, default=None)
    parser.add_argument("--pair-seed", type=str, default="pi-experiment")
    parser.add_argument("--permutation-iterations", type=int, default=PERM_ITERS)
    parser.add_argument("--split-candidates", type=int, default=DEFAULT_SPLIT_CANDIDATES)
    parser.add_argument("--split-manifest-in", type=Path, default=None)
    parser.add_argument("--split-manifest-out", type=Path, default=None)
    args = parser.parse_args()

    if args.pairs is not None:
        pairs_path = args.pairs
        pairs = load_pi_pairs(pairs_path)
    else:
        pairs_path, pairs = find_or_generate_pairs(args.data_dir, args.output_dir, args.pair_seed)
    tag = args.tag or pairs_path.parent.name
    print(f"Loading {pairs_path} (tag={tag})...")
    pair_hash = file_sha256(pairs_path)
    counts = defaultdict(int)
    for pair in pairs:
        counts[pair.get("pairType") or "unspecified"] += 1
    print(f"{len(pairs)} pairs: {dict(counts)}\n")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    csv_path = args.output_dir / "pi_supervised_summary.csv"
    json_path = args.output_dir / "pi_supervised_verdict.json"
    manifest_in = load_split_manifest(args.split_manifest_in)
    manifest_out = new_split_manifest(TEST_RATIO, args.split_candidates)
    manifest_out["dataset"] = {"path": str(pairs_path), "sha256": pair_hash}
    verdict = run_pairs(
        pairs, args.seeds, args.models, tag, args.jobs, csv_path, json_path,
        split_candidates=args.split_candidates,
        split_manifest_in=manifest_in,
        split_manifest_out=manifest_out,
        perm_iters=args.permutation_iterations,
    )
    verdict["pairSource"] = {"path": str(pairs_path), "sha256": pair_hash, "seed": args.pair_seed}
    with json_path.open("w", encoding="utf-8") as handle:
        json.dump(verdict, handle, indent=2)
    manifest_path = args.split_manifest_out or (args.output_dir / "pi_split_manifest.json")
    write_split_manifest(manifest_path, manifest_out)

    print(f"\nOverall PI supervised verdict [{tag}]: "
          f"{'PASS' if verdict['overallPassed'] else verdict['overallPassed']}")
    print(f"Summary -> {csv_path}")
    print(f"Verdict -> {json_path}")


if __name__ == "__main__":
    main()
