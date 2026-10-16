#!/usr/bin/env python3
"""
Rebuild the authoritative Polygon Amoy clustering results.

The pipeline deliberately excludes the legacy unbalanced PI analysis. It reads
the committed capture directly, writes regenerable intermediates to
``experiments/.work/``, clears stale clustering outputs, and runs only the
analyses used by the current evaluation:

* PCH global DUO and ICD-10 clustering, plus ICD-10 permutation debiasing
* PI balanced 30-vs-30 pair construction and permutation-debiased clustering
* SPP clustering for the four structural/parameter targets
* PI and SPP summary figures
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import pandas as pd

from experiments.analysis.paths import (
    CAPTURE_DATA_DIR,
    CLUSTERING_RESULTS_DIR,
    CLUSTERING_WORK_DIR,
)

MODULE_PREFIX = "experiments.analysis.clustering"
DEFAULT_SOURCE_DIR = CAPTURE_DATA_DIR
DEFAULT_WORK_DIR = CLUSTERING_WORK_DIR
DEFAULT_RESULTS_DIR = CLUSTERING_RESULTS_DIR

DATASET_FILES = ("pch_dataset.json", "pi_dataset.json", "spp_dataset.json")
RESULT_SUBDIRS = {
    "pch": "pch",
    "pi": "pi",
    "spp": "spp",
}


def load_json(path: Path):
    with path.open() as handle:
        return json.load(handle)


def validate_dataset_files(source_dir: Path):
    for name in DATASET_FILES:
        source = source_dir / name
        if not source.exists():
            raise FileNotFoundError(f"Missing Polygon Amoy dataset: {source}")


def reset_results(results_dir: Path):
    for subdir in RESULT_SUBDIRS.values():
        path = results_dir / subdir
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)
        print(f"Reset {path}")


def run_script(script_name: str, args, env):
    module_name = f"{MODULE_PREFIX}.{Path(script_name).stem}"
    command = [sys.executable, "-m", module_name, *map(str, args)]
    print(f"\n{'=' * 72}")
    print("Running:", " ".join(command))
    print(f"{'=' * 72}")
    subprocess.run(command, check=True, env=env)


def validate_inputs(data_dir: Path):
    from .analyze_pch_clustering import extract_data_global
    from .analyze_spp_clustering import TARGETS, extract_data_for_target
    from .build_balanced_pi_pairs import aggregate_policies

    pch = load_json(data_dir / "pch_dataset.json")
    pi = load_json(data_dir / "pi_dataset.json")
    spp = load_json(data_dir / "spp_dataset.json")

    duo = extract_data_global(pch, use_icd10=False)
    icd = extract_data_global(pch, use_icd10=True)
    if duo is None or len(duo["X"]) < 20 or duo["n_classes"] < 2:
        raise ValueError("PCH DUO input is too small or has fewer than two classes")
    if icd is None or len(icd["X"]) < 20 or icd["n_classes"] < 2:
        raise ValueError("PCH ICD-10 input is too small or has fewer than two classes")

    designed = {entry["piPair"]["pairId"] for entry in pi if entry.get("piPair")}
    if designed:
        pi_summary = f"{len(designed)} designed pairs"
    else:
        policies = aggregate_policies(pi)
        high_execution = sum(len(record["runs"]) >= 30 for record in policies.values())
        if high_execution < 2:
            raise ValueError("PI requires designed pairs or at least two policies with 30 executions")
        pi_summary = f"{high_execution} policies with >=30 executions"

    for target, classes in TARGETS.items():
        data = extract_data_for_target(spp, target, classes)
        if data is None or len(data["X"]) < 20 or data["n_classes"] < 2:
            found = None if data is None else (len(data["X"]), data["n_classes"])
            raise ValueError(
                f"SPP {target} input is too small or has fewer than two classes; "
                f"found {found}"
            )

    print("Input validation passed:")
    print(f"  PCH DUO: {len(duo['X'])} samples / {duo['n_classes']} classes")
    print(f"  PCH ICD-10: {len(icd['X'])} samples / {icd['n_classes']} classes")
    print(f"  PI: {pi_summary}")
    print("  SPP: all targets have >=20 samples and >=2 classes")


def validate_outputs(work_dir: Path, results_dir: Path):
    expected = [
        results_dir / RESULT_SUBDIRS["pch"] / "pch_global_duo_clustering.csv",
        results_dir / RESULT_SUBDIRS["pch"] / "pch_global_icd10_clustering.csv",
        results_dir / RESULT_SUBDIRS["pch"] / "pch_icd10_debiased.csv",
        results_dir / RESULT_SUBDIRS["pi"] / "pi_balanced_debiased.csv",
        results_dir / RESULT_SUBDIRS["pi"] / "pi_analysis_by_type.png",
        results_dir / RESULT_SUBDIRS["spp"] / "spp_clustering_summary.csv",
        results_dir / RESULT_SUBDIRS["spp"] / "spp_detailed_analysis.png",
        work_dir / "pi_pairs_balanced.json",
    ]
    missing = [str(path) for path in expected if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing clustering outputs:\n" + "\n".join(missing))

    for csv_path in [path for path in expected if path.suffix == ".csv"]:
        frame = pd.read_csv(csv_path)
        if frame.empty:
            raise ValueError(f"Empty clustering result: {csv_path}")
        if frame.isna().any().any():
            raise ValueError(f"NaN found in clustering result: {csv_path}")

    pairs_payload = load_json(work_dir / "pi_pairs_balanced.json")
    pairs = pairs_payload.get("pairs", [])
    if not pairs:
        raise ValueError("No balanced PI pairs were generated")
    for pair in pairs:
        counts = [len(policy.get("features", [])) for policy in pair.get("policies", [])]
        if len(counts) != 2 or counts[0] != counts[1] or counts[0] < 2:
            raise ValueError(f"Unbalanced PI pair {pair.get('pairId')}: {counts}")

    pi_frame = pd.read_csv(
        results_dir / RESULT_SUBDIRS["pi"] / "pi_balanced_debiased.csv"
    )
    if len(pi_frame) != len(pairs):
        raise ValueError(
            f"Expected one PI result per pair ({len(pairs)}); found {len(pi_frame)}"
        )
    if not (pi_frame["n0"] == pi_frame["n1"]).all():
        raise ValueError("PI result CSV contains an unbalanced pair")
    if int(pi_frame["significant"].sum()) != int(
        (pi_frame["p_value"] < 0.05).sum()
    ):
        raise ValueError("PI significant column disagrees with p_value < 0.05")

    print("\nOutput validation passed.")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(line_buffering=True)
    parser = argparse.ArgumentParser(
        description="Rebuild authoritative Polygon Amoy clustering results"
    )
    parser.add_argument("--source-dir", type=Path, default=DEFAULT_SOURCE_DIR)
    parser.add_argument("--work-dir", type=Path, default=DEFAULT_WORK_DIR)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--kmeans-seeds", type=int, default=20)
    parser.add_argument("--permutations", type=int, default=200)
    parser.add_argument("--bootstraps", type=int, default=500)
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    work_dir = args.work_dir.resolve()
    results_dir = args.results_dir.resolve()
    work_dir.mkdir(parents=True, exist_ok=True)
    mpl_cache = work_dir / ".matplotlib"
    mpl_cache.mkdir(parents=True, exist_ok=True)
    xdg_cache = work_dir / ".cache"
    xdg_cache.mkdir(parents=True, exist_ok=True)
    os.environ["MPLCONFIGDIR"] = str(mpl_cache)
    os.environ.setdefault("MPLBACKEND", "Agg")
    os.environ["XDG_CACHE_HOME"] = str(xdg_cache)
    os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 1))
    env = os.environ.copy()

    validate_dataset_files(source_dir)
    # Granted and denied executions are analysed together; o carries no
    # information about the policy.
    run_pipeline(policy_sources(source_dir, work_dir), work_dir, results_dir, args, env)
    print("\nAll authoritative clustering analyses completed.")


def first_submitted(rows):
    """One execution per policy: the one submitted first in the capture.

    The submission order is shuffled with a fixed seed, independently of the
    labels and outcomes; the per-policy execution ids are not (the first
    executions of a repeatedly executed policy are all granted).
    """
    chosen = {}
    for row in rows:
        key = row["policyId"]
        rank = (row.get("executionSequence", float("inf")), row.get("executionId", 0))
        if key not in chosen or rank < chosen[key][0]:
            chosen[key] = (rank, row)
    return [row for _, row in sorted(chosen.values(), key=lambda item: item[0])]


def policy_sources(source_dir: Path, work_dir: Path) -> Path:
    """Inputs with one execution per policy for the PCH and SPP clustering.

    PCH and SPP compare policies, and executions of one policy share its label
    and nearly all of its observables, so clustering every execution would let
    repeatedly executed policies dominate and a row-level label permutation
    would count their executions as independent. Both analyses use the same
    executions, taken from the full PCH dataset. PI clusters the executions
    of each designed pair, which are its units, so its dataset is unchanged.
    """
    target = work_dir / "source"
    target.mkdir(parents=True, exist_ok=True)
    rows = first_submitted(load_json(source_dir / "pch_dataset.json"))
    for name in ("pch_dataset.json", "spp_dataset.json"):
        (target / name).write_text(json.dumps(rows), encoding="utf-8")
    shutil.copyfile(source_dir / "pi_dataset.json", target / "pi_dataset.json")
    print(f"Clustering inputs: {len(rows)} executions (one per policy) for PCH and SPP")
    return target


def run_pipeline(source_dir: Path, work_dir: Path, results_dir: Path, args, env):
    pch_output = results_dir / RESULT_SUBDIRS["pch"]
    pi_output = results_dir / RESULT_SUBDIRS["pi"]
    spp_output = results_dir / RESULT_SUBDIRS["spp"]
    work_dir.mkdir(parents=True, exist_ok=True)
    reset_results(results_dir)
    validate_inputs(source_dir)

    run_script(
        "analyze_pch_clustering.py",
        ["--data-dir", source_dir, "--output-dir", pch_output,
         "--global-analysis", "--plot", "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps],
        env,
    )
    run_script(
        "analyze_pch_clustering.py",
        ["--data-dir", source_dir, "--output-dir", pch_output,
         "--global-analysis", "--icd10", "--plot", "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps],
        env,
    )
    run_script(
        "pch_icd10_debias.py",
        ["--data-dir", source_dir, "--output-dir", pch_output, "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations],
        env,
    )
    balanced_pairs = work_dir / "pi_pairs_balanced.json"
    run_script(
        "build_balanced_pi_pairs.py",
        ["--data-dir", source_dir, "--output", balanced_pairs, "--seed", args.seed],
        env,
    )
    run_script(
        "analyze_pi_balanced.py",
        ["--data-dir", source_dir, "--pairs-file", balanced_pairs,
         "--output-dir", pi_output, "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps, "--jobs", -1],
        env,
    )
    run_script(
        "analyze_spp_clustering.py",
        ["--data-dir", source_dir, "--output-dir", spp_output, "--plot", "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps],
        env,
    )
    run_script(
        "pi_analysis_by_type.py",
        ["--input", pi_output / "pi_balanced_debiased.csv",
         "--output", pi_output / "pi_analysis_by_type.png"],
        env,
    )
    run_script(
        "spp_detailed_analysis.py",
        ["--input", spp_output / "spp_clustering_summary.csv",
         "--output", spp_output / "spp_detailed_analysis.png"],
        env,
    )

    validate_outputs(work_dir, results_dir)


if __name__ == "__main__":
    main()
