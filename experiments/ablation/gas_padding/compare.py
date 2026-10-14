#!/usr/bin/env python3
"""Paired B1/B2 gas-padding ablation analysis."""

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
from sklearn.preprocessing import StandardScaler


EXPERIMENT_REPORTS = {
    "pch": "evaluation_report.json",
    "pi": "pi_report.json",
    "spp": "report.json",
}


def load_json(path):
    with open(path) as handle:
        return json.load(handle)


def execution_key(record):
    return str(record.get("policyId")), str(record.get("executionId"))


def align_execution_rows(b1, b2, dataset_name):
    """Align paired profiles by stable execution identity, never by row number."""
    def index(rows):
        result = {}
        for row in rows:
            key = execution_key(row)
            if key in result:
                raise ValueError(f"Duplicate {dataset_name} execution key: {key}")
            result[key] = row
        return result

    left, right = index(b1), index(b2)
    if set(left) != set(right):
        raise ValueError(
            f"{dataset_name} execution keys differ; "
            f"onlyB1={len(set(left)-set(right))}, onlyB2={len(set(right)-set(left))}"
        )
    keys = sorted(left)
    label_fields = [
        "duoTerm", "ontologyNamespace", "ontologyValue", "logicStructure",
        "nestingDepth", "predicateCount", "setSize",
    ]
    for key in keys:
        for field in label_fields:
            if left[key].get(field) != right[key].get(field):
                raise ValueError(f"{dataset_name} label mismatch at {key}: {field}")
        if left[key].get("semantics") != right[key].get("semantics"):
            raise ValueError(f"{dataset_name} semantics mismatch at {key}")
    return [left[key] for key in keys], [right[key] for key in keys]


def bootstrap_mean_ci(values, rng, iterations):
    values = np.asarray(values, dtype=float)
    if len(values) == 0:
        return {"mean": None, "ci95": [None, None], "n": 0}
    draws = np.array([
        np.mean(rng.choice(values, size=len(values), replace=True))
        for _ in range(iterations)
    ])
    return {
        "mean": float(np.mean(values)),
        "ci95": [float(np.percentile(draws, 2.5)), float(np.percentile(draws, 97.5))],
        "n": int(len(values)),
    }


def bootstrap_distribution_summary(observed, values):
    values = np.asarray(values, dtype=float)
    if len(values) == 0:
        return {"mean": float(observed), "ci95": [None, None], "n": 0}
    return {
        "mean": float(observed),
        "ci95": [
            float(np.percentile(values, 2.5)),
            float(np.percentile(values, 97.5)),
        ],
        "n": int(len(values)),
    }


def record_id(record):
    classifier = record.get("classifier") or "combined"
    return record.get("key"), classifier


def flatten_seed_records(report):
    verdict = report.get("multiseedVerdict") or {}
    seed_records = verdict.get("seedRecords")
    if not seed_records:
        raise ValueError("Report lacks multiseedVerdict.seedRecords; rerun with --include-seed-records")
    flattened = {}
    for seed in seed_records:
        seed_index = seed["seedIndex"]
        for record in seed.get("records", []):
            if not isinstance(record.get("auc"), (int, float)):
                continue
            flattened[(seed_index, *record_id(record))] = record
    return flattened


def compare_supervised(root, rng, iterations):
    output = {}
    base = root / "comparison" / "supervised"
    for experiment, report_name in EXPERIMENT_REPORTS.items():
        b1_report = load_json(base / "b1_unpadded" / experiment / report_name)
        b2_report = load_json(base / "b2_padded" / experiment / report_name)
        b1 = flatten_seed_records(b1_report)
        b2 = flatten_seed_records(b2_report)
        # A seed whose test split holds no positive policy yields no AUC in one
        # profile (small classes such as ICD ch0 with 8 policies). Pair only
        # the seeds valid in both profiles and report how many were dropped,
        # so the paired estimate never mixes a seed from one profile with a
        # different seed from the other.
        dropped = defaultdict(int)
        for seed_index, key, classifier in set(b1) ^ set(b2):
            dropped[(key, classifier)] += 1
        if dropped:
            print(f"[{experiment}] seeds without a paired AUC (dropped): "
                  + ", ".join(f"{k} {c}: {n}" for (k, c), n in sorted(dropped.items())))

        grouped = defaultdict(list)
        for (seed_index, key, classifier), b1_record in b1.items():
            if (seed_index, key, classifier) not in b2:
                continue
            b2_record = b2[(seed_index, key, classifier)]
            grouped[(key, classifier)].append({
                "seed": seed_index,
                "b1_auc": b1_record["auc"],
                "b2_auc": b2_record["auc"],
                "delta_leakage": abs(b1_record["auc"] - 0.5) - abs(b2_record["auc"] - 0.5),
                "b1_significant": b1_record.get("permPValue", 1) < 0.05,
                "b2_significant": b2_record.get("permPValue", 1) < 0.05,
            })

        tasks = []
        for (key, classifier), rows in sorted(grouped.items()):
            effect = bootstrap_mean_ci([row["delta_leakage"] for row in rows], rng, iterations)
            tasks.append({
                "task": key,
                "classifier": classifier,
                "b1AucMean": float(np.mean([row["b1_auc"] for row in rows])),
                "b2AucMean": float(np.mean([row["b2_auc"] for row in rows])),
                "b1SignificantSeedFraction": float(np.mean([row["b1_significant"] for row in rows])),
                "b2SignificantSeedFraction": float(np.mean([row["b2_significant"] for row in rows])),
                "deltaLeakage": effect,
                "interpretation": interpret_ci(effect["ci95"]),
                "pairedSeeds": len(rows),
                "droppedSeeds": dropped.get((key, classifier), 0),
            })
        output[experiment] = {
            "tasks": tasks,
        }
    return output


def interpret_ci(ci):
    low, high = ci
    if low is None:
        return "unavailable"
    if low > 0:
        return "padding_reduces_leakage"
    if high < 0:
        return "padding_increases_leakage"
    return "no_detectable_incremental_effect"


def gas_comparison(root, rng, iterations):
    b1 = load_json(root / "b1_unpadded" / "executed_dataset.json")
    b2 = load_json(root / "b2_padded" / "executed_dataset.json")
    b1, b2 = align_execution_rows(b1, b2, "executed_dataset.json")
    result = {}
    for key in ["commitGasUsed", "accessGasUsed"]:
        b1_values = np.array([float(row["features"][key]) for row in b1])
        b2_values = np.array([float(row["features"][key]) for row in b2])
        delta = b2_values - b1_values
        stats = bootstrap_mean_ci(delta, rng, iterations)
        stats.update({
            "b1Mean": float(np.mean(b1_values)),
            "b2Mean": float(np.mean(b2_values)),
            "percentIncrease": float(np.mean(delta) / np.mean(b1_values) * 100),
        })
        result[key] = stats
    return result


def label_for(record, target):
    if target == "pch_duo":
        return record.get("duoTerm")
    if target == "pch_icd10":
        scope = (record.get("semantics") or {}).get("icd10Scope")
        return None if scope is None else scope.get("id")
    return record.get(target)


def paired_cluster_metrics(b1, b2, indices, target):
    labels = [label_for(b1[index], target) for index in indices]
    valid = [i for i, label in zip(indices, labels) if label is not None]
    labels = [label_for(b1[index], target) for index in valid]
    classes = sorted(set(map(str, labels)))
    if len(classes) < 2 or len(valid) < 20:
        return None
    encoding = {label: index for index, label in enumerate(classes)}
    y = np.array([encoding[str(label)] for label in labels])
    metrics = []
    for rows in [b1, b2]:
        X = np.array([
            [float(rows[index]["features"]["commitGasUsed"]),
             float(rows[index]["features"]["accessGasUsed"])]
            for index in valid
        ])
        X = StandardScaler().fit_transform(X)
        pred = KMeans(n_clusters=len(classes), random_state=42, n_init=10).fit_predict(X)
        metrics.append({
            "ari": adjusted_rand_score(y, pred),
            "nmi": normalized_mutual_info_score(y, pred),
        })
    return metrics


def bootstrap_cluster_targets(root, rng, iterations):
    output = {}
    dataset_targets = {
        "pch_dataset.json": ["pch_duo", "pch_icd10"],
        "spp_dataset.json": [
            "logicStructure", "nestingDepth", "predicateCount", "setSize"
        ],
    }
    for dataset_name, targets in dataset_targets.items():
        b1 = load_json(root / "b1_unpadded" / dataset_name)
        b2 = load_json(root / "b2_padded" / dataset_name)
        b1, b2 = align_execution_rows(b1, b2, dataset_name)
        groups = defaultdict(list)
        for index, row in enumerate(b1):
            groups[str(row.get("policyIndex", row.get("policyId")))].append(index)
        group_keys = sorted(groups)
        for target in targets:
            observed = paired_cluster_metrics(b1, b2, list(range(len(b1))), target)
            if observed is None:
                continue
            deltas = {"ari": [], "nmi": []}
            for _ in range(iterations):
                sampled = rng.choice(group_keys, size=len(group_keys), replace=True)
                indices = [index for key in sampled for index in groups[key]]
                metrics = paired_cluster_metrics(b1, b2, indices, target)
                if metrics is None:
                    continue
                for metric in deltas:
                    deltas[metric].append(metrics[0][metric] - metrics[1][metric])
            output[target] = {
                "b1": observed[0],
                "b2": observed[1],
                "deltaB1MinusB2": {
                    metric: bootstrap_distribution_summary(
                        observed[0][metric] - observed[1][metric],
                        values,
                    )
                    for metric, values in deltas.items()
                },
            }
    return output


def load_pi_clustering(profile_dir):
    """PI clustering rows of one profile; per-outcome result directories are concatenated."""
    single = profile_dir / "results" / "pi" / "pi_balanced_debiased.csv"
    if single.exists():
        return pd.read_csv(single).set_index("pair_id")
    frames = []
    for outcome in ("granted", "denied"):
        frame = pd.read_csv(profile_dir / "results" / outcome / "pi" / "pi_balanced_debiased.csv")
        frame["pair_id"] = frame["pair_id"].astype(str) + "@" + outcome
        frames.append(frame)
    return pd.concat(frames).set_index("pair_id")


def compare_pi_clustering(root, rng, iterations):
    base = root / "comparison" / "clustering"
    b1 = load_pi_clustering(base / "b1_unpadded")
    b2 = load_pi_clustering(base / "b2_padded")
    if set(b1.index) != set(b2.index):
        raise ValueError("PI clustering pair IDs differ between B1 and B2")
    common = sorted(b1.index)
    output = {}
    for metric in ["observed_ari", "observed_nmi", "debiased_nmi"]:
        delta = b1.loc[common, metric].to_numpy() - b2.loc[common, metric].to_numpy()
        output[metric] = bootstrap_mean_ci(delta, rng, iterations)
    if {"policy_a", "policy_b"}.issubset(b1.columns) and {"policy_a", "policy_b"}.issubset(b2.columns):
        policies = sorted(set(b1["policy_a"]) | set(b1["policy_b"]))
        weighted = []
        delta = b1.loc[common, "debiased_nmi"] - b2.loc[common, "debiased_nmi"]
        for _ in range(iterations):
            sampled = rng.choice(policies, size=len(policies), replace=True)
            counts = dict(zip(*np.unique(sampled, return_counts=True)))
            weights = np.array([
                counts.get(a, 0) * counts.get(b, 0)
                for a, b in zip(b1.loc[common, "policy_a"], b1.loc[common, "policy_b"])
            ], dtype=float)
            if weights.sum() > 0:
                weighted.append(float(np.average(delta, weights=weights)))
        output["policyWeightedDebiasedNmi"] = bootstrap_distribution_summary(
            float(delta.mean()), weighted
        )
    output["pairs"] = len(common)
    return output


def render_markdown(report):
    lines = [
        "# B1/B2 Gas Padding Ablation",
        "",
        "Positive Δleakage means B2 padding reduced |AUC−0.5| relative to B1.",
        "Supervised 95% intervals are repeated-split stability intervals; seeded holdouts overlap and are not independent samples.",
        "",
        "## Supervised attacks",
        "",
        "| Experiment | Task | Classifier | B1 AUC | B2 AUC | Δleakage (95% CI) | Interpretation |",
        "|---|---|---:|---:|---:|---:|---|",
    ]
    for experiment, experiment_result in report["supervised"].items():
        for task in experiment_result["tasks"]:
            effect = task["deltaLeakage"]
            ci = effect["ci95"]
            lines.append(
                f"| {experiment.upper()} | {task['task']} | {task['classifier']} | "
                f"{task['b1AucMean']:.3f} | {task['b2AucMean']:.3f} | "
                f"{effect['mean']:.3f} [{ci[0]:.3f}, {ci[1]:.3f}] | "
                f"{task['interpretation']} |"
            )
    lines.extend(["", "## Gas overhead", ""])
    for key, value in report["gas"].items():
        lines.append(
            f"- {key}: B1 {value['b1Mean']:.0f}, B2 {value['b2Mean']:.0f}, "
            f"increase {value['percentIncrease']:.1f}%."
        )
    lines.extend(["", "## Clustering", ""])
    for target, value in report["clustering"]["policyGroupBootstrap"].items():
        effect = value["deltaB1MinusB2"]["nmi"]
        ci = effect["ci95"]
        lines.append(
            f"- {target}: NMI B1−B2 {effect['mean']:.4f} "
            f"[{ci[0]:.4f}, {ci[1]:.4f}] (policy-group bootstrap)."
        )
    pi_effect = report["clustering"]["piBalancedPairs"]["debiased_nmi"]
    pi_ci = pi_effect["ci95"]
    lines.append(
        f"- PI balanced pairs: debiased NMI B1−B2 {pi_effect['mean']:.4f} "
        f"[{pi_ci[0]:.4f}, {pi_ci[1]:.4f}] across "
        f"{report['clustering']['piBalancedPairs']['pairs']} pairs."
    )
    lines.extend([
        "",
        "## Limitation",
        "",
        "B2 reuses the existing Polygon Amoy run and was not executed contemporaneously with B1. "
        "EVM gasUsed is deterministic for the same execution/state path, and blockDifference remains excluded from modeling.",
        "",
    ])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root-dir", type=Path, required=True)
    parser.add_argument("--bootstrap-iterations", type=int, default=500)
    parser.add_argument("--seed", type=int, default=20260625)
    args = parser.parse_args()
    root = args.root_dir.resolve()
    rng = np.random.default_rng(args.seed)
    report = {
        "schemaVersion": 1,
        "bootstrapIterations": args.bootstrap_iterations,
        "bootstrapSeed": args.seed,
        "effectDefinition": "abs(AUC_B1 - 0.5) - abs(AUC_B2 - 0.5)",
        "supervisedIntervalType": "repeated-split stability interval",
        "supervised": compare_supervised(root, rng, args.bootstrap_iterations),
        "clustering": {
            "policyGroupBootstrap": bootstrap_cluster_targets(
                root, rng, args.bootstrap_iterations
            ),
            "piBalancedPairs": compare_pi_clustering(
                root, rng, args.bootstrap_iterations
            ),
        },
        "gas": gas_comparison(root, rng, args.bootstrap_iterations),
        "limitation": (
            "B2 reuses the existing Polygon Amoy run; B1/B2 are non-contemporaneous. "
            "blockDifference is excluded from every attack model."
        ),
    }
    output_dir = root / "comparison"
    output_dir.mkdir(parents=True, exist_ok=True)
    with open(output_dir / "ablation_report.json", "w") as handle:
        json.dump(report, handle, indent=2)
    with open(output_dir / "ablation_report.md", "w") as handle:
        handle.write(render_markdown(report))
    print(f"Saved {output_dir / 'ablation_report.json'}")
    print(f"Saved {output_dir / 'ablation_report.md'}")


if __name__ == "__main__":
    main()
