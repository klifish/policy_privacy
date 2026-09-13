#!/usr/bin/env python3
"""PI adapter for the visualization framework (viz_common.run_probe).

Policy Indistinguishability differs from PCH/SPP: the "dataset" is a list of
policy *pairs*, and each binary task asks whether an attacker can tell which side
of a pair an execution came from (label = side 0/1), grouped by policyId to match
the JS Level-I split. Scopes are ``overall`` plus each pairType;
``controlled_difference`` is diagnostic (non-gating) in both implementations.

Rows don't map one-per-top-level-record, so this adapter builds its own flattened
row pool (one entry per pair-side execution) and passes it to ``run_probe``.
Never touches the of-record outputs.
"""
from __future__ import annotations

import argparse
from pathlib import Path
from typing import Dict, List, Sequence

import numpy as np

from .common import FEATURE_KEYS, feature_row, load_json
from .pi_supervised import (
    DEFAULT_DATA_DIR,
    PAIR_TYPES,
    find_or_generate_pairs,
    load_pi_pairs,
    _policy_feature_runs,
)
from .viz_common import add_common_args, policy_logic, probe_task, run_probe

# PI policies carry structure metadata under these keys (nestingDepth may be absent).
PI_STRUCT_KEYS = ("structureType", "predicateCombo", "paramType", "nestingDepth")


def _struct_meta(policy: dict) -> Dict:
    """Structure metadata for a PI policy (falls back through semantics/structure)."""
    sem = policy.get("semantics") or {}
    out = {}
    for k in PI_STRUCT_KEYS:
        out[k] = policy.get(k, sem.get(k))
    return out


def build_pi_pool_and_tasks(pairs: Sequence[dict]):
    """Flatten pair-side executions into a row pool + build per-scope tasks.

    Returns (row_pool, tasks).  Each pool row is one execution tagged with its
    side, pairType, policyId, and the policy's logic expression.  Tasks reference
    pool indices; ``overall`` uses every row, each pairType scope its subset.
    """
    pool: List[Dict] = []
    # Parallel arrays aligned with pool rows, for fast task assembly.
    x_rows: List[List[float]] = []
    sides: List[int] = []
    groups: List[str] = []
    ptypes: List[str] = []

    for pair in pairs:
        pair_type = pair.get("pairType") or "unspecified"
        pair_id = str(pair.get("pairId") or f"pair-{len(pool)}")
        policies = pair.get("policies") or []
        if len(policies) != 2:
            continue
        for side, policy in enumerate(policies):
            logic = policy_logic(policy)
            struct = _struct_meta(policy)
            group = str(policy.get("policyId") or f"{pair_id}:{side}")
            for run in _policy_feature_runs(policy):
                feats = run.get("features") if isinstance(run, dict) else None
                feats = feats if isinstance(feats, dict) else {}
                pool.append({
                    "policyId": policy.get("policyId"),
                    "executionId": run.get("executionId") if isinstance(run, dict) else None,
                    "logic": logic,
                    "features": {k: feats.get(k) for k in FEATURE_KEYS},
                    "struct": struct,
                    # PI-specific context: which pair/side/type this row belongs to.
                    "pairId": pair_id,
                    "side": side,
                    "pairType": pair_type,
                })
                x_rows.append(feature_row(run))
                sides.append(side)
                groups.append(group)
                ptypes.append(pair_type)

    X = np.array(x_rows, dtype=float)
    y = np.array(sides, dtype=int)
    grp = np.array(groups, dtype=object)
    pt = np.array(ptypes, dtype=object)
    all_idx = np.arange(len(pool), dtype=int)

    present_types = [t for t in PAIR_TYPES if (pt == t).any()]
    scopes = ["overall"] + present_types

    tasks = []
    for scope in scopes:
        mask = np.ones(len(pool), dtype=bool) if scope == "overall" else (pt == scope)
        if mask.sum() == 0:
            continue
        y_s = y[mask]
        grp_s = grp[mask]
        if len(np.unique(y_s)) < 2 or len(np.unique(grp_s)) < 2:
            continue
        task = {
            "key": scope,
            "target": "pairScope",
            "class0": "policy0",
            "class1": "policy1",
            "X": X[mask],
            "y": y_s,
            "groups": grp_s,
            "indices": all_idx[mask],
        }
        # controlled_difference is a positive control: diagnostic, non-gating.
        if scope == "controlled_difference":
            task["diagnostic"] = True
        tasks.append(task)
    return pool, tasks


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Emit PI protocol visualization data (does not touch of-record outputs)")
    add_common_args(parser, DEFAULT_DATA_DIR)
    parser.add_argument("--pairs", type=Path, default=None,
                        help="explicit pi_pairs.json (else auto-find/generate)")
    parser.add_argument("--pair-seed", type=str, default="pi-experiment")
    args = parser.parse_args()

    if args.pairs is not None:
        pairs_path = args.pairs
        pairs = load_pi_pairs(pairs_path)
    else:
        pairs_path, pairs = find_or_generate_pairs(args.data_dir, args.output_dir, args.pair_seed)
    print(f"Loading {pairs_path}: {len(pairs)} pairs.")

    pool, tasks = build_pi_pool_and_tasks(pairs)
    print(f"{len(pool)} pair-side executions, {len(tasks)} scope tasks.")

    # run_probe calls build_tasks(dataset); hand it the prebuilt tasks + pool.
    run_probe(
        experiment="PI",
        dataset=pairs,
        dataset_tag=pairs_path.parent.name,
        build_tasks=lambda _dataset: tasks,
        args=args,
        out_name="viz_data_pi.json",
        struct_keys=PI_STRUCT_KEYS,
        row_pool=pool,
    )


if __name__ == "__main__":
    main()
