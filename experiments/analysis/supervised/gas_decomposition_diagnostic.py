#!/usr/bin/env python3
"""Gas decomposition diagnostic for an unpadded capture.

Without gas padding, each gasUsed is 21,000 plus the calldata cost (EIP-2028:
16 gas per non-zero byte, 4 per zero byte) plus the execution cost.  The
calldata cost is a function of the public calldata values, which the calldata
value gate tests one by one; the execution cost is what the contract does with
them.  The supervised attacks see only the sum.

For every PCH and SPP task this script reports, over one execution per policy
(the first), the AUC and two-sided permutation p-value of the commit and access
gasUsed, calldata cost and execution cost.  It then reruns the of-record
protocol (``analyze_contrast``: same tasks, seeds, splits and criterion) with
the two gas features replaced by their execution cost.  A task that passes this
``executionOnly`` rerun has no signal left once the calldata cost is removed, so
whatever the attack picks up on it is carried by calldata values.

``scripts/verify_evaluation_provenance.js`` uses this to explain a JS
cross-check FAIL on a task the Python of-record verdict passes: the mismatch
is accepted only if the ``executionOnly`` rerun passes and the calldata value
gate passes on the same capture.  The diagnostic never changes a verdict.

Usage:
    .venv/bin/python -m experiments.analysis.supervised.gas_decomposition_diagnostic \
        [--data-dir experiments/data/polygonAmoy] [--jobs -1]
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Dict, List

import numpy as np
from sklearn.metrics import roc_auc_score

from experiments.analysis.paths import CAPTURE_DATA_DIR, SUPERVISED_RESULTS_DIR

from .common import AUC_MAX, PERM_ALPHA, PERM_ITERS, SIG_FRACTION_MAX, analyze_contrast, file_sha256, load_json
from .pad_residual_diagnostic import build_spp_tasks_with_indices
from .pch_supervised import build_tasks as build_pch_tasks

BASE_GAS = 21_000
GAS_FEATURES = {"commit": "commitGasUsed", "access": "accessGasUsed"}
UNIVARIATE_PERMUTATIONS = 2000


def calldata_cost(row: dict, kind: str) -> int:
    tx = (row.get("transactions") or {}).get(kind, {}).get("tx") or {}
    data = tx.get("data") or tx.get("input") or "0x"
    raw = bytes.fromhex(data[2:])
    zeros = raw.count(0)
    return 16 * (len(raw) - zeros) + 4 * zeros


def gas_parts(row: dict, kind: str) -> Dict[str, int]:
    gas = int(row["features"][GAS_FEATURES[kind]])
    cost = calldata_cost(row, kind)
    return {"gasUsed": gas, "calldataCost": cost, "executionCost": gas - BASE_GAS - cost}


def execution_only(dataset: List[dict]) -> List[dict]:
    """The dataset with each gas feature replaced by its execution cost."""
    out = copy.deepcopy(dataset)
    for row in out:
        for kind, feature in GAS_FEATURES.items():
            row["features"][feature] = str(gas_parts(row, kind)["executionCost"])
    return out


def univariate(values: np.ndarray, y: np.ndarray, rng: np.random.Generator) -> Dict:
    if len(set(values.tolist())) < 2:
        return {"auc": 0.5, "p": 1.0}
    auc = float(roc_auc_score(y, values))
    null = np.array([roc_auc_score(rng.permutation(y), values) for _ in range(UNIVARIATE_PERMUTATIONS)])
    p = float((1 + np.sum(np.abs(null - 0.5) >= abs(auc - 0.5) - 1e-12)) / (UNIVARIATE_PERMUTATIONS + 1))
    return {"auc": auc, "p": p}


def first_execution_per_policy(indices, groups) -> np.ndarray:
    seen, keep = set(), []
    for position, (i, g) in enumerate(zip(indices, groups)):
        if g not in seen:
            seen.add(g)
            keep.append(position)
    return np.array(keep, dtype=int)


def summarize(res: Dict) -> Dict:
    return {
        "passed": res["passed"],
        "models": {m: {"aucMean": r["aucMean"], "sigFraction": r["sigFraction"]} for m, r in res["models"].items()},
    }


def run_experiment(name: str, dataset: List[dict], builder, seeds: int, jobs: int, perm_iters: int,
                   of_record: Dict[str, bool], seed: int) -> Dict:
    rng = np.random.default_rng(seed)
    exec_tasks = {t["key"]: t for t in builder(execution_only(dataset))}
    tasks = {}
    for task in builder(dataset):
        key = task["key"]
        idx = np.asarray(task.get("indices", task.get("_indices")))
        keep = first_execution_per_policy(idx, task["groups"])
        y = np.asarray(task["y"])[keep]
        rows = [dataset[int(i)] for i in idx[keep]]
        parts = {}
        for kind in GAS_FEATURES:
            values = [gas_parts(r, kind) for r in rows]
            parts[kind] = {part: univariate(np.array([v[part] for v in values], dtype=float), y, rng)
                           for part in ("gasUsed", "calldataCost", "executionCost")}
        e = exec_tasks[key]
        rerun = analyze_contrast(e["X"], e["y"], e["groups"], seeds, ["lr", "rf"], jobs=jobs,
                                 perm_iters=perm_iters, task_key=key)
        tasks[key] = {
            "policies": int(len(y)),
            "univariate": parts,
            "ofRecordPassed": of_record.get(key),
            "executionOnly": summarize(rerun),
        }
        print(f"[{name}] {key}: of-record {of_record.get(key)} | executionOnly "
              f"{'PASS' if rerun['passed'] else 'FAIL'}", flush=True)
    return {"tasks": tasks}


def write_markdown(path: Path, report: Dict) -> None:
    lines = [
        "# Gas decomposition diagnostic",
        "",
        "Unpadded gasUsed = 21,000 + calldata cost (EIP-2028) + execution cost. Univariate AUCs "
        f"use one execution per policy with {UNIVARIATE_PERMUTATIONS} two-sided permutations; "
        "`executionOnly` reruns the of-record protocol with both gas features replaced by their "
        "execution cost. No verdict is changed.",
        "",
        "| Task | Of-record | executionOnly | commit gas / calldata / exec AUC (p) | access gas / calldata / exec AUC (p) |",
        "|---|---|---|---|---|",
    ]
    for name, exp in report["experiments"].items():
        for key, t in exp["tasks"].items():
            cells = []
            for kind in GAS_FEATURES:
                u = t["univariate"][kind]
                cells.append(" / ".join(f"{u[p]['auc']:.3f} ({u[p]['p']:.3f})"
                                        for p in ("gasUsed", "calldataCost", "executionCost")))
            of_record = {True: "PASS", False: "FAIL", None: "n/a"}[t["ofRecordPassed"]]
            exec_only = "PASS" if t["executionOnly"]["passed"] else "FAIL"
            lines.append(f"| {name.upper()} {key} | {of_record} | {exec_only} | {cells[0]} | {cells[1]} |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, default=CAPTURE_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=SUPERVISED_RESULTS_DIR)
    parser.add_argument("--seeds", type=int, default=30)
    parser.add_argument("--perm-iters", type=int, default=PERM_ITERS)
    parser.add_argument("--jobs", type=int, default=-1)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    report = {
        "dataDir": str(args.data_dir),
        "criterion": {"seeds": args.seeds, "aucMax": AUC_MAX, "permAlpha": PERM_ALPHA,
                      "sigFractionMax": SIG_FRACTION_MAX, "permIters": args.perm_iters},
        "univariatePermutations": UNIVARIATE_PERMUTATIONS,
        "experiments": {},
    }
    for name, filename, builder in (("pch", "pch_dataset.json", build_pch_tasks),
                                    ("spp", "spp_dataset.json", build_spp_tasks_with_indices)):
        path = args.data_dir / filename
        dataset = load_json(path)
        verdict = load_json(args.output_dir / f"{name}_supervised_verdict.json")
        of_record = {t["key"]: t["passed"] for t in verdict["tasks"]}
        report["experiments"][name] = {"dataset": str(path), "datasetSha256": file_sha256(path),
                                       **run_experiment(name, dataset, builder, args.seeds, args.jobs,
                                                        args.perm_iters, of_record, args.seed)}
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "gas_decomposition_diagnostic.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_markdown(args.output_dir / "gas_decomposition_diagnostic.md", report)
    print(f"Wrote {args.output_dir / 'gas_decomposition_diagnostic.json'}")


if __name__ == "__main__":
    main()
