"""Pad-target residual diagnostic for the PCH and SPP supervised verdicts.

This is an *explanatory* companion to the frozen evaluation protocol in
``common.analyze_contrast``: it neither changes the of-record verdicts nor the
features an attacker sees.  It answers one question per task: how much of the
attacker's separability survives once the policy-independent gas-pad target is
removed from ``accessGasUsed``?

The TPS draws every access pad target from ``crypto.randomBytes`` (see
``tps/server.js``) and logs it as ``access gas pad target = N`` immediately
before ``Submitted proof on-chain for policyId=N``.  The capture log therefore
lets us reconstruct, for every execution, the target the adversary never sees.
``residual = accessGasUsed - target`` is the part of the gas that depends on the
transaction itself; on Amoy it is a near-constant (~4.7k) because the on-chain
padding loop stops exactly at the target.

For every PCH task and SPP contrast we report row-level AUCs of gas, target and
residual.  For the tasks the of-record verdict marked FAIL we additionally rerun
``analyze_contrast`` itself (same seeds, models, permutation test and double
criterion) on three feature sets: the of-record features (must reproduce the
verdict), the target alone, and the of-record features with ``accessGasUsed``
replaced by the residual.

Usage:
    .venv/bin/python -m experiments.analysis.supervised.pad_residual_diagnostic \
        --seeds 30 --jobs -1
"""

from __future__ import annotations

import argparse
import glob
import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import numpy as np

from experiments.analysis.paths import CAPTURE_DATA_DIR, SUPERVISED_RESULTS_DIR

from .common import (
    DEFAULT_SEEDS,
    DEFAULT_SPLIT_CANDIDATES,
    FEATURE_KEYS,
    PERM_ITERS,
    _average_ranks,
    analyze_contrast,
    find_json,
    load_json,
)
from . import pch_supervised, spp_supervised
from experiments.analysis.clustering.clustering_stats import ensemble_permutation_analysis

TARGET_LINE = re.compile(r"access gas pad target = (\d+)")
SUBMIT_LINE = re.compile(r"Submitted proof on-chain for policyId=(\d+)")
GAS_INDEX = FEATURE_KEYS.index("accessGasUsed")


def parse_pad_targets(data_dir: Path) -> Dict[int, int]:
    """Map on-chain policyId -> access pad target from every capture log.

    Later logs win, which matches checkpoint/resume: an execution that was
    re-attempted after a crash appears once per attempt and only the last
    submission produced the receipt stored in the dataset.
    """
    targets: Dict[int, int] = {}
    logs = sorted(glob.glob(str(data_dir / "**" / "*.log"), recursive=True))
    for log_path in logs:
        pending: Optional[int] = None
        with open(log_path, "r", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                match = TARGET_LINE.search(line)
                if match:
                    pending = int(match.group(1))
                    continue
                match = SUBMIT_LINE.search(line)
                if match and pending is not None:
                    targets[int(match.group(1))] = pending
                    pending = None
    return targets


def row_auc(scores: np.ndarray, y: np.ndarray) -> float:
    """Rank-based AUC (ties averaged), same convention as the protocol."""
    ranks = _average_ranks(np.asarray(scores, dtype=float))
    n_pos = int(y.sum())
    n_neg = int(len(y) - n_pos)
    if n_pos == 0 or n_neg == 0:
        return float("nan")
    return float((ranks[y == 1].sum() - n_pos * (n_pos + 1) / 2) / (n_pos * n_neg))


def cohen_d(x: np.ndarray, y: np.ndarray) -> float:
    a, b = x[y == 1], x[y == 0]
    if len(a) < 2 or len(b) < 2:
        return float("nan")
    pooled = np.sqrt((a.var(ddof=1) + b.var(ddof=1)) / 2)
    return float((a.mean() - b.mean()) / pooled) if pooled > 0 else 0.0


def policy_level(values: np.ndarray, y: np.ndarray, groups: np.ndarray):
    """Collapse executions to one mean per policy (labels are constant within a policy)."""
    per_policy: Dict[str, List[float]] = {}
    label: Dict[str, int] = {}
    for v, lab, g in zip(values, y, groups):
        per_policy.setdefault(str(g), []).append(float(v))
        label[str(g)] = int(lab)
    keys = sorted(per_policy)
    return (np.array([np.mean(per_policy[k]) for k in keys]),
            np.array([label[k] for k in keys], dtype=int))


def _target_vectors(dataset: List[dict], indices: np.ndarray, targets: Dict[int, int]) -> np.ndarray:
    out = []
    for i in indices:
        pid = dataset[int(i)].get("blockchainPolicyId")
        if pid is None or int(pid) not in targets:
            raise SystemExit(f"No pad target logged for blockchainPolicyId={pid} (row {i})")
        out.append(targets[int(pid)])
    return np.array(out, dtype=float)


def task_rows(dataset: List[dict], tasks: List[dict], targets: Dict[int, int]) -> List[Dict]:
    rows = []
    for task in tasks:
        X, y, groups = task["X"], task["y"], task["groups"]
        indices = task.get("indices")
        if indices is None:
            indices = task["_indices"]
        target = _target_vectors(dataset, indices, targets)
        gas = X[:, GAS_INDEX]
        residual = gas - target
        p_gas, p_y = policy_level(gas, y, groups)
        p_target, _ = policy_level(target, y, groups)
        p_res, _ = policy_level(residual, y, groups)
        rows.append({
            "key": task["key"],
            "nRows": int(len(y)),
            "nPolicies": int(len(np.unique(groups))),
            "nPositivePolicies": int(p_y.sum()),
            "constantFeatures": int(sum(1 for j in range(X.shape[1]) if len(np.unique(X[:, j])) == 1)),
            "residualMin": float(residual.min()),
            "residualMax": float(residual.max()),
            "rowAuc": {"gas": row_auc(gas, y), "target": row_auc(target, y), "residual": row_auc(residual, y)},
            "policyD": {"gas": cohen_d(p_gas, p_y), "target": cohen_d(p_target, p_y), "residual": cohen_d(p_res, p_y)},
        })
    return rows


def protocol_variants(dataset, task, targets, seeds, models, jobs, perm_iters, split_candidates) -> Dict:
    X, y, groups = task["X"], task["y"], task["groups"]
    indices = task.get("indices", task.get("_indices"))
    target = _target_vectors(dataset, indices, targets)
    residual_X = X.copy()
    residual_X[:, GAS_INDEX] = X[:, GAS_INDEX] - target
    variants = {
        "ofRecord": X,
        "targetOnly": target.reshape(-1, 1),
        "residualSubstituted": residual_X,
    }
    out = {}
    for name, features in variants.items():
        res = analyze_contrast(features, y, groups, seeds, models, jobs=jobs, perm_iters=perm_iters,
                               task_key=task["key"], split_candidates=split_candidates)
        out[name] = {
            "passed": bool(res["passed"]),
            "models": {m: {k: res["models"][m][k] for k in ("aucMean", "aucStd", "sigFraction")}
                       for m in models if m in res["models"]},
        }
    return out


def build_spp_tasks_with_indices(dataset: List[dict]) -> List[dict]:
    X, groups, labels_by_target = spp_supervised.build_feature_matrix(dataset)
    tasks = spp_supervised.build_tasks(dataset)
    all_idx = np.arange(len(dataset))
    for task in tasks:
        labels = labels_by_target[task["target"]]
        mask = (labels == task["class0"]) | (labels == task["class1"])
        task["_indices"] = all_idx[mask]
    return tasks


def clustering_variants(dataset: List[dict], targets: Dict[int, int], labels_by_axis: Dict[str, np.ndarray],
                        kmeans_seeds: int = 20, permutations: int = 200) -> Dict:
    """K-Means (as in the clustering cross-check) on [commit gas, access gas] versus
    [commit gas, access gas - target], per labelled axis, with the same
    permutation-debiased ARI/NMI scoring as experiments/analysis/clustering."""
    indices = np.arange(len(dataset))
    target = _target_vectors(dataset, indices, targets)
    commit = np.array([float(row["features"]["commitGasUsed"]) for row in dataset])
    gas = np.array([float(row["features"]["accessGasUsed"]) for row in dataset])
    out = {}
    for axis, labels in labels_by_axis.items():
        mask = np.array([lab is not None for lab in labels])
        y = np.array([str(lab) for lab in labels[mask]])
        k = len(set(y.tolist()))
        if k < 2:
            continue
        out[axis] = {"n": int(mask.sum()), "classes": k}
        for name, feature in (("gas", gas), ("residual", gas - target)):
            X = np.column_stack([commit[mask], feature[mask]])
            res = ensemble_permutation_analysis(X, y, k, kmeans_seeds=kmeans_seeds, permutations=permutations)
            out[axis][name] = {"ari": res["observed"]["ari"], "ariP": res["nullAri"]["pValue"],
                               "nmi": res["observed"]["nmi"], "nmiDebiased": res["nullNmi"]["debiased"],
                               "nmiP": res["nullNmi"]["pValue"]}
    return out


def failed_keys(verdict_path: Path) -> List[str]:
    if not verdict_path.exists():
        return []
    verdict = load_json(verdict_path)
    entries = verdict.get("tasks") or verdict.get("contrasts") or []
    return [t["key"] for t in entries if not t.get("passed", True) and not t.get("nonGating")]


def render_markdown(report: Dict) -> str:
    lines = [
        "# Pad-target residual diagnostic",
        "",
        f"Dataset: `{report['dataset']}` — {report['targetsParsed']} pad targets parsed from the capture logs.",
        "",
        "`residual = accessGasUsed − pad target`. The pad target is drawn by the TPS from a CSPRNG, "
        "independently of the policy; the adversary never observes it. Row-level AUCs are rank-based "
        "(ties averaged); policy-level d is Cohen's d after collapsing executions to one mean per policy.",
        "",
    ]
    for exp, block in report["experiments"].items():
        lines += [f"## {exp.upper()}", "",
                  "| task | policies (+) | const. feat. | residual range | AUC gas | AUC target | AUC residual | d gas | d target | d residual | of-record |",
                  "|---|---|---|---|---|---|---|---|---|---|---|"]
        for r in block["tasks"]:
            verdict = "FAIL" if r["key"] in block["failedKeys"] else "PASS"
            lines.append(
                f"| {r['key']} | {r['nPolicies']} ({r['nPositivePolicies']}) | {r['constantFeatures']}/{len(FEATURE_KEYS)} "
                f"| {int(r['residualMin'])}–{int(r['residualMax'])} | {r['rowAuc']['gas']:.3f} | {r['rowAuc']['target']:.3f} "
                f"| {r['rowAuc']['residual']:.3f} | {r['policyD']['gas']:.2f} | {r['policyD']['target']:.2f} "
                f"| {r['policyD']['residual']:.2f} | {verdict} |")
        lines.append("")
        if block["protocolReruns"]:
            lines += ["### Protocol reruns on FAIL tasks", "",
                      "Same `analyze_contrast` (seeds, split selection, LR+RF, permutation test, double criterion) "
                      "on three feature sets.", "",
                      "| task | features | LR AUC / sig | RF AUC / sig | verdict |", "|---|---|---|---|---|"]
            for key, variants in block["protocolReruns"].items():
                for name, v in variants.items():
                    lr, rf = v["models"].get("lr"), v["models"].get("rf")
                    fmt = lambda m: f"{m['aucMean']:.3f} / {m['sigFraction']:.2f}" if m else "—"
                    lines.append(f"| {key} | {name} | {fmt(lr)} | {fmt(rf)} | {'PASS' if v['passed'] else 'FAIL'} |")
            lines.append("")
        if block.get("clustering"):
            lines += ["### Clustering companion", "",
                      "K-Means with K = number of classes on [commit gas, access gas] versus "
                      "[commit gas, access gas − target]; ARI/NMI with the permutation null of the clustering cross-check.", "",
                      "| axis | n | classes | ARI gas (p) | ARI residual (p) | NMI gas (debiased, p) | NMI residual (debiased, p) |",
                      "|---|---|---|---|---|---|---|"]
            for axis, c in block["clustering"].items():
                g, r = c["gas"], c["residual"]
                lines.append(f"| {axis} | {c['n']} | {c['classes']} | {g['ari']:.4f} ({g['ariP']:.3f}) | {r['ari']:.4f} ({r['ariP']:.3f}) "
                             f"| {g['nmi']:.4f} ({g['nmiDebiased']:.4f}, {g['nmiP']:.3f}) | {r['nmi']:.4f} ({r['nmiDebiased']:.4f}, {r['nmiP']:.3f}) |")
            lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--data-dir", type=Path, default=CAPTURE_DATA_DIR)
    parser.add_argument("--output-dir", type=Path, default=SUPERVISED_RESULTS_DIR)
    parser.add_argument("--experiments", nargs="+", default=["pch", "spp"], choices=["pch", "spp"])
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["lr", "rf"], choices=["rf", "lr"])
    parser.add_argument("--jobs", type=int, default=1)
    parser.add_argument("--permutation-iterations", type=int, default=PERM_ITERS)
    parser.add_argument("--split-candidates", type=int, default=DEFAULT_SPLIT_CANDIDATES)
    parser.add_argument("--rerun", nargs="*", default=None,
                        help="Task keys to rerun under the protocol (default: the tasks the of-record verdict failed)")
    args = parser.parse_args()

    targets = parse_pad_targets(args.data_dir)
    if not targets:
        raise SystemExit(f"No 'access gas pad target' lines found in logs under {args.data_dir}")

    report = {"dataset": None, "targetsParsed": len(targets), "seeds": args.seeds, "experiments": {}}
    for exp in args.experiments:
        if exp == "pch":
            path = find_json(args.data_dir, "pch_dataset.json")
            dataset = load_json(path)
            tasks = pch_supervised.build_tasks(dataset)
            verdict_path = args.output_dir / "pch_supervised_verdict.json"
        else:
            path = find_json(args.data_dir, "spp_dataset.json")
            dataset = load_json(path)
            tasks = build_spp_tasks_with_indices(dataset)
            verdict_path = args.output_dir / "spp_supervised_verdict.json"
        report["dataset"] = report["dataset"] or path.parent.name
        rows = task_rows(dataset, tasks, targets)
        failed = failed_keys(verdict_path)
        rerun_keys = failed if args.rerun is None else args.rerun
        reruns = {}
        for task in tasks:
            if task["key"] in rerun_keys:
                print(f"[{exp}] protocol rerun: {task['key']}")
                reruns[task["key"]] = protocol_variants(
                    dataset, task, targets, args.seeds, args.models, args.jobs,
                    args.permutation_iterations, args.split_candidates)
        if exp == "pch":
            labels_by_axis = {
                "primaryDuoTerm": np.array([(r.get("semantics") or {}).get("primaryDuoTerm") for r in dataset], dtype=object),
                "icd10Chapter": np.array([pch_supervised._icd_chapter(r) for r in dataset], dtype=object),
            }
        else:
            labels_by_axis = {axis: np.array([r.get(axis) for r in dataset], dtype=object)
                              for axis in spp_supervised.TARGET_ATTRS}
        print(f"[{exp}] clustering companion")
        clustering = clustering_variants(dataset, targets, labels_by_axis)
        report["experiments"][exp] = {"datasetPath": str(path), "failedKeys": failed,
                                       "tasks": rows, "protocolReruns": reruns, "clustering": clustering}
        for r in rows:
            print(f"[{exp}] {r['key']:34s} AUC gas={r['rowAuc']['gas']:.3f} target={r['rowAuc']['target']:.3f} "
                  f"residual={r['rowAuc']['residual']:.3f}  residual∈[{int(r['residualMin'])},{int(r['residualMax'])}]")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "pad_residual_diagnostic.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    (args.output_dir / "pad_residual_diagnostic.md").write_text(render_markdown(report), encoding="utf-8")
    print(f"Wrote {args.output_dir / 'pad_residual_diagnostic.md'}")


if __name__ == "__main__":
    main()
