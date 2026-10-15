"""Sensitivity of the PASS/FAIL double criterion to its two thresholds.

The of-record verdict fails a task iff AUC_mean > 0.55 AND the fraction of
seeds whose permutation test rejects at alpha = 0.05 is >= 0.5 (see
``common.analyze_contrast``).  This script re-evaluates every gating task of
PCH, SPP and PI under a grid of alternative thresholds, using the per-seed AUCs
and p-values that the verdict files record (``models.<m>.perSeed``), and also
under each single leg on its own.  Nothing is re-trained; the of-record
verdicts are untouched.

With ``--null-replicates N`` it additionally estimates the criterion's
false-positive rate: the two gas features (the only non-constant observables)
are replaced by fresh policy-independent draws from the same padding bands and
the full protocol (``analyze_contrast``) is rerun N times on PCH and SPP.

Usage:
    .venv/bin/python -m experiments.analysis.supervised.criterion_sensitivity \
        [--null-replicates 10 --jobs -1]
"""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path
from typing import Dict, List, Sequence

import numpy as np

from experiments.analysis.paths import CAPTURE_DATA_DIR, SUPERVISED_RESULTS_DIR

from .common import (
    AUC_MAX,
    DEFAULT_SEEDS,
    DEFAULT_SPLIT_CANDIDATES,
    PERM_ALPHA,
    PERM_ITERS,
    SIG_FRACTION_MAX,
    analyze_contrast,
    find_json,
    load_json,
)
from . import pch_supervised, spp_supervised

EXPERIMENTS = ("pch", "spp", "pi")
AUC_GRID = (0.52, 0.55, 0.58, 0.60)
SIG_GRID = (0.3, 0.4, 0.5, 0.6, 0.7)
# Gas bands of the of-record capture (tps/server.js pad base 1.05M +-10%,
# data_generator.js commit pad base 300k +-10%; access sits ~4.7k above target).
NULL_ACCESS_BAND = (945_000 + 4_700, 1_155_000 + 4_700)
NULL_COMMIT_BAND = (270_000, 330_000)


def gating_tasks(verdict: Dict) -> List[Dict]:
    return [t for t in verdict.get("tasks", []) if not t.get("nonGating") and t.get("passed") is not None]


def fails_under(task: Dict, auc_max: float, sig_max: float, legs: str = "both") -> bool:
    """Re-apply the criterion to one task from its per-seed records."""
    for model in task["models"].values():
        per_seed = model.get("perSeed")
        if not per_seed:
            raise SystemExit(f"{task['key']}: verdict has no perSeed records; rerun npm run analysis:supervised")
        auc_mean = float(np.mean(per_seed["auc"]))
        sig_fraction = float(np.mean([p < PERM_ALPHA for p in per_seed["pval"]]))
        auc_leg = auc_mean > auc_max
        sig_leg = sig_fraction >= sig_max
        if legs == "both" and auc_leg and sig_leg:
            return True
        if legs == "auc" and auc_leg:
            return True
        if legs == "sig" and sig_leg:
            return True
    return False


def threshold_grid(verdicts: Dict[str, Dict]) -> Dict:
    out = {"aucGrid": list(AUC_GRID), "sigGrid": list(SIG_GRID), "cells": [], "singleLeg": {}}
    for auc_max in AUC_GRID:
        for sig_max in SIG_GRID:
            cell = {"aucMax": auc_max, "sigMax": sig_max, "fails": {}, "failedKeys": {}}
            for exp, verdict in verdicts.items():
                failed = [t["key"] for t in gating_tasks(verdict) if fails_under(t, auc_max, sig_max)]
                cell["fails"][exp] = len(failed)
                cell["failedKeys"][exp] = failed
            out["cells"].append(cell)
    for exp, verdict in verdicts.items():
        tasks = gating_tasks(verdict)
        out["singleLeg"][exp] = {
            "tasks": len(tasks),
            "aucOnly": {str(a): sum(fails_under(t, a, 0.0, "auc") for t in tasks) for a in AUC_GRID},
            "sigOnly": {str(s): sum(fails_under(t, 0.0, s, "sig") for t in tasks) for s in SIG_GRID},
        }
    return out


def null_simulation(replicates: int, seeds: int, jobs: int, perm_iters: int, split_candidates: int) -> Dict:
    datasets = {
        "pch": (load_json(find_json(CAPTURE_DATA_DIR, "pch_dataset.json")), pch_supervised.build_tasks),
        "spp": (load_json(find_json(CAPTURE_DATA_DIR, "spp_dataset.json")), spp_supervised.build_tasks),
    }
    out = {"replicates": replicates, "perReplicate": [], "perTaskFalsePositive": {}}
    counts: Dict[str, Dict[str, int]] = {exp: {} for exp in datasets}
    for rep in range(replicates):
        rng = np.random.default_rng(1000 + rep)
        record = {"replicate": rep, "fails": {}}
        for exp, (rows, build_tasks) in datasets.items():
            synthetic = copy.deepcopy(rows)
            for row in synthetic:
                features = row["features"]
                features["accessGasUsed"] = str(int(rng.uniform(*NULL_ACCESS_BAND)))
                features["commitGasUsed"] = str(int(rng.uniform(*NULL_COMMIT_BAND)))
            failed = []
            for task in build_tasks(synthetic):
                key = task["key"]
                res = analyze_contrast(task["X"], task["y"], task["groups"], seeds, ["lr", "rf"], jobs=jobs,
                                       perm_iters=perm_iters, task_key=key, split_candidates=split_candidates)
                counts[exp].setdefault(key, 0)
                if not res["passed"]:
                    failed.append(key)
                    counts[exp][key] += 1
            record["fails"][exp] = failed
            print(f"[null {rep}] {exp}: {len(failed)} FAIL -> {failed}", flush=True)
        out["perReplicate"].append(record)
    for exp, per_task in counts.items():
        out["perTaskFalsePositive"][exp] = {k: v / replicates for k, v in per_task.items()}
        total = sum(per_task.values())
        out["perTaskFalsePositive"][exp]["_meanRate"] = total / (replicates * len(per_task)) if per_task else None
    out["replicatesWithAnyFail"] = sum(1 for r in out["perReplicate"] if any(r["fails"].values()))
    return out


def render_markdown(report: Dict) -> str:
    grid = report["thresholdGrid"]
    lines = [
        "# Criterion sensitivity",
        "",
        f"Of-record criterion: FAIL iff AUC_mean > {AUC_MAX} and significant-seed fraction >= {SIG_FRACTION_MAX} "
        f"(alpha = {PERM_ALPHA}, {report['seeds']} seeds). Cells give the number of gating tasks that would FAIL "
        "under each alternative pair of thresholds, recomputed from the per-seed AUCs and p-values of the of-record run.",
        "",
        "| AUC_max \\ sig_min | " + " | ".join(str(s) for s in grid["sigGrid"]) + " |",
        "|---|" + "---|" * len(grid["sigGrid"]),
    ]
    for auc_max in grid["aucGrid"]:
        cells = [c for c in grid["cells"] if c["aucMax"] == auc_max]
        row = f"| {auc_max} | " + " | ".join(
            "/".join(str(c["fails"][e]) for e in EXPERIMENTS) for c in cells) + " |"
        lines.append(row)
    lines += ["", "Cell format: PCH/SPP/PI failures (gating tasks: " +
              ", ".join(f"{e} {grid['singleLeg'][e]['tasks']}" for e in EXPERIMENTS) + ").", "",
              "## Single-leg criteria", ""]
    for exp in EXPERIMENTS:
        leg = grid["singleLeg"][exp]
        lines.append(f"- {exp.upper()}: AUC leg alone -> " +
                     ", ".join(f"{a}: {n}" for a, n in leg["aucOnly"].items()) +
                     "; significance leg alone -> " +
                     ", ".join(f"{s}: {n}" for s, n in leg["sigOnly"].items()))
    lines += ["", "## Tasks that fail at the of-record thresholds", ""]
    ofrec = next(c for c in grid["cells"] if c["aucMax"] == AUC_MAX and c["sigMax"] == SIG_FRACTION_MAX)
    for exp in EXPERIMENTS:
        lines.append(f"- {exp.upper()}: {', '.join(ofrec['failedKeys'][exp]) or 'none'}")
    null = report.get("nullSimulation")
    if null:
        lines += ["", "## Null simulation", "",
                  f"{null['replicates']} replicates with the two gas features replaced by policy-independent uniform draws "
                  f"from the padding bands; the full protocol is rerun on PCH and SPP.",
                  f"Replicates with at least one FAIL: {null['replicatesWithAnyFail']}/{null['replicates']}.", ""]
        for exp in ("pch", "spp"):
            rates = null["perTaskFalsePositive"][exp]
            mean = rates.get("_meanRate")
            hits = {k: v for k, v in rates.items() if k != "_meanRate" and v > 0}
            lines.append(f"- {exp.upper()}: mean per-task false-positive rate {mean:.3f}; tasks hit: " +
                         (", ".join(f"{k} ({v:.1f})" for k, v in sorted(hits.items())) or "none"))
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--results-dir", type=Path, default=SUPERVISED_RESULTS_DIR)
    parser.add_argument("--null-replicates", type=int, default=0)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--permutation-iterations", type=int, default=PERM_ITERS)
    parser.add_argument("--split-candidates", type=int, default=DEFAULT_SPLIT_CANDIDATES)
    args = parser.parse_args()

    verdicts = {exp: load_json(args.results_dir / f"{exp}_supervised_verdict.json") for exp in EXPERIMENTS}
    report = {
        "seeds": verdicts["pch"]["criterion"]["seeds"],
        "ofRecord": {"aucMax": AUC_MAX, "sigFractionMax": SIG_FRACTION_MAX, "permAlpha": PERM_ALPHA},
        "thresholdGrid": threshold_grid(verdicts),
    }
    if args.null_replicates > 0:
        report["nullSimulation"] = null_simulation(
            args.null_replicates, args.seeds, args.jobs, args.permutation_iterations, args.split_candidates)

    args.results_dir.mkdir(parents=True, exist_ok=True)
    (args.results_dir / "criterion_sensitivity.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    markdown = render_markdown(report)
    (args.results_dir / "criterion_sensitivity.md").write_text(markdown, encoding="utf-8")
    print(markdown)


if __name__ == "__main__":
    main()
