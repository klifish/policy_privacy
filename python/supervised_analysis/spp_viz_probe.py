#!/usr/bin/env python3
"""SPP adapter for the visualization framework (viz_common.run_probe).

Builds the same within-attribute pairwise binary contrasts as
``spp_supervised.py`` (structureType / predicateCombo / paramType / nestingDepth), but tags each
task with its original dataset ``indices`` so the dashboard's raw-row panel and
training-data inspection line up.  Never touches the of-record outputs.
"""
from __future__ import annotations

import argparse
import itertools
from typing import Dict, List

import numpy as np

from common import FEATURE_KEYS, feature_row, load_json
from spp_supervised import (
    DEFAULT_DATA_DIR,
    TARGET_ATTRS,
    TARGET_CLASS_ORDER,
    find_spp_dataset,
)
from viz_common import add_common_args, run_probe


def build_tasks(dataset: List[dict]) -> List[Dict]:
    """All within-attribute pairwise contrasts, each carrying dataset indices."""
    X = np.array([feature_row(e) for e in dataset], dtype=float)
    groups = np.array([str(e.get("policyId", i)) for i, e in enumerate(dataset)])
    labels_by_target = {
        t: np.array([str(e.get(t)) for e in dataset], dtype=object) for t in TARGET_ATTRS
    }
    all_idx = np.arange(len(dataset), dtype=int)

    tasks = []
    for target in TARGET_ATTRS:
        labels = labels_by_target[target]
        present = set(labels.tolist())
        ordered = [v for v in TARGET_CLASS_ORDER.get(target, []) if v in present]
        ordered.extend(sorted(present - set(ordered)))
        for c0, c1 in itertools.combinations(ordered, 2):
            mask = (labels == c0) | (labels == c1)
            y = (labels[mask] == c1).astype(int)
            if len(np.unique(y)) < 2:
                continue
            tasks.append({
                "key": f"{target}: {c0}/{c1}",
                "target": target,
                "class0": c0,
                "class1": c1,
                "X": X[mask],
                "y": y,
                "groups": groups[mask],
                "indices": all_idx[mask],
            })
    return tasks


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Emit SPP protocol visualization data (does not touch of-record outputs)")
    add_common_args(parser, DEFAULT_DATA_DIR)
    args = parser.parse_args()

    dataset_path = find_spp_dataset(args.data_dir)
    if dataset_path is None:
        raise SystemExit(f"No spp_dataset.json found under {args.data_dir}")
    dataset = load_json(dataset_path)
    print(f"Loading {dataset_path}: {len(dataset)} executions, "
          f"{len(set(e.get('policyId') for e in dataset))} policies.")

    run_probe(
        experiment="SPP",
        dataset=dataset,
        dataset_tag=dataset_path.parent.name,
        build_tasks=build_tasks,
        args=args,
        out_name="viz_data_spp.json",
    )


if __name__ == "__main__":
    main()
