#!/usr/bin/env python3
"""PCH adapter for the visualization framework (viz_common.run_probe).

Emits intermediate quantities the self-contained dashboard reads: per-seed AUC
spread, a permutation null histogram, training-data inspection, and the shared
raw-row pool.  Task construction (DUO / ICD one-vs-rest) is delegated to
``pch_supervised.build_tasks``; everything task-agnostic lives in
``viz_common``.  Never touches the of-record outputs.
"""
from __future__ import annotations

import argparse

from .common import load_json
from .pch_supervised import DEFAULT_DATA_DIR, build_tasks, find_pch_dataset
from .viz_common import add_common_args, run_probe


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Emit PCH protocol visualization data (does not touch of-record outputs)")
    add_common_args(parser, DEFAULT_DATA_DIR)
    args = parser.parse_args()

    dataset_path = find_pch_dataset(args.data_dir)
    if dataset_path is None:
        raise SystemExit(f"No pch_dataset.json found under {args.data_dir}")
    dataset = load_json(dataset_path)
    print(f"Loading {dataset_path}: {len(dataset)} executions, "
          f"{len(set(e.get('policyId') for e in dataset))} policies.")

    run_probe(
        experiment="PCH",
        dataset=dataset,
        dataset_tag=dataset_path.parent.name,
        build_tasks=build_tasks,
        args=args,
        out_name="viz_data.json",
    )


if __name__ == "__main__":
    main()
