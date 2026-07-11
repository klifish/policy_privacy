#!/usr/bin/env python3
"""
Rebuild the authoritative Polygon Amoy clustering results.

The pipeline deliberately excludes the legacy unbalanced PI analysis. It copies
the committed Amoy datasets into python/data/polygonAmoy, clears stale clustering
outputs, and runs only the analyses used by the current evaluation:

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


SCRIPT_DIR = Path(__file__).resolve().parent
PYTHON_DIR = SCRIPT_DIR.parent
REPO_ROOT = PYTHON_DIR.parent
DEFAULT_SOURCE_DIR = (
    REPO_ROOT / "experiments" / "unified" / "artifacts_data" / "polygonAmoy"
)
DEFAULT_DATA_DIR = PYTHON_DIR / "data" / "polygonAmoy"
DEFAULT_RESULTS_DIR = PYTHON_DIR / "results"

DATASET_FILES = ("pch_dataset.json", "pi_dataset.json", "spp_dataset.json")
RESULT_SUBDIRS = {
    "pch": "pch_clustering_analysis",
    "pi": "pi_clustering_analysis",
    "spp": "spp_clustering_analysis",
}


def load_json(path: Path):
    with path.open() as handle:
        return json.load(handle)


def copy_datasets(source_dir: Path, data_dir: Path):
    data_dir.mkdir(parents=True, exist_ok=True)
    for name in DATASET_FILES:
        source = source_dir / name
        if not source.exists():
            raise FileNotFoundError(f"Missing Polygon Amoy dataset: {source}")
        shutil.copy2(source, data_dir / name)
        print(f"Copied {source} -> {data_dir / name}")


def reset_results(results_dir: Path):
    for subdir in RESULT_SUBDIRS.values():
        path = results_dir / subdir
        if path.exists():
            shutil.rmtree(path)
        path.mkdir(parents=True, exist_ok=True)
        print(f"Reset {path}")


def run_script(script_name: str, args, env):
    script_path = SCRIPT_DIR / script_name
    command = [sys.executable, str(script_path), *map(str, args)]
    print(f"\n{'=' * 72}")
    print("Running:", " ".join(command))
    print(f"{'=' * 72}")
    subprocess.run(command, check=True, env=env)


def validate_inputs(data_dir: Path):
    sys.path.insert(0, str(SCRIPT_DIR))
    from analyze_pch_clustering import extract_data_global
    from analyze_spp_clustering import TARGETS, extract_data_for_target
    from build_balanced_pi_pairs import aggregate_policies

    pch = load_json(data_dir / "pch_dataset.json")
    pi = load_json(data_dir / "pi_dataset.json")
    spp = load_json(data_dir / "spp_dataset.json")

    duo = extract_data_global(pch, use_icd10=False)
    icd = extract_data_global(pch, use_icd10=True)
    if duo is None or len(duo["X"]) < 20 or duo["n_classes"] < 2:
        raise ValueError("PCH DUO input is too small or has fewer than two classes")
    if icd is None or len(icd["X"]) < 20 or icd["n_classes"] < 2:
        raise ValueError("PCH ICD-10 input is too small or has fewer than two classes")

    policies = aggregate_policies(pi)
    high_execution = sum(len(record["runs"]) >= 30 for record in policies.values())
    if high_execution < 2:
        raise ValueError("PI requires at least two policies with 30 executions")

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
    print(f"  PI: {high_execution} policies with >=30 executions")
    print("  SPP: all targets have >=20 samples and >=2 classes")


def validate_outputs(data_dir: Path, results_dir: Path):
    expected = [
        results_dir / RESULT_SUBDIRS["pch"] / "pch_global_duo_clustering.csv",
        results_dir / RESULT_SUBDIRS["pch"] / "pch_global_icd10_clustering.csv",
        results_dir / RESULT_SUBDIRS["pch"] / "pch_icd10_debiased.csv",
        results_dir / RESULT_SUBDIRS["pi"] / "pi_balanced_debiased.csv",
        results_dir / RESULT_SUBDIRS["pi"] / "pi_analysis_by_type.png",
        results_dir / RESULT_SUBDIRS["spp"] / "spp_clustering_summary.csv",
        results_dir / RESULT_SUBDIRS["spp"] / "spp_detailed_analysis.png",
        data_dir / "pi_pairs_balanced.json",
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

    pairs_payload = load_json(data_dir / "pi_pairs_balanced.json")
    pairs = pairs_payload.get("pairs", [])
    if not pairs:
        raise ValueError("No balanced PI pairs were generated")
    for pair in pairs:
        counts = [len(policy.get("features", [])) for policy in pair.get("policies", [])]
        if counts != [30, 30]:
            raise ValueError(f"Unbalanced PI pair {pair.get('pairId')}: {counts}")

    pi_frame = pd.read_csv(
        results_dir / RESULT_SUBDIRS["pi"] / "pi_balanced_debiased.csv"
    )
    if len(pi_frame) != len(pairs):
        raise ValueError(
            f"Expected one PI result per pair ({len(pairs)}); found {len(pi_frame)}"
        )
    if not ((pi_frame["n0"] == 30) & (pi_frame["n1"] == 30)).all():
        raise ValueError("PI result CSV contains a non-30-vs-30 pair")
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
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    parser.add_argument("--results-dir", type=Path, default=DEFAULT_RESULTS_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--kmeans-seeds", type=int, default=20)
    parser.add_argument("--permutations", type=int, default=200)
    parser.add_argument("--bootstraps", type=int, default=500)
    args = parser.parse_args()

    source_dir = args.source_dir.resolve()
    data_dir = args.data_dir.resolve()
    results_dir = args.results_dir.resolve()
    pch_output = results_dir / RESULT_SUBDIRS["pch"]
    pi_output = results_dir / RESULT_SUBDIRS["pi"]
    spp_output = results_dir / RESULT_SUBDIRS["spp"]

    mpl_cache = results_dir / ".matplotlib"
    mpl_cache.mkdir(parents=True, exist_ok=True)
    xdg_cache = results_dir / ".cache"
    xdg_cache.mkdir(parents=True, exist_ok=True)
    os.environ["MPLCONFIGDIR"] = str(mpl_cache)
    os.environ.setdefault("MPLBACKEND", "Agg")
    os.environ["XDG_CACHE_HOME"] = str(xdg_cache)
    os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 1))
    env = os.environ.copy()

    copy_datasets(source_dir, data_dir)
    reset_results(results_dir)
    validate_inputs(data_dir)

    run_script(
        "analyze_pch_clustering.py",
        ["--data-dir", data_dir, "--output-dir", pch_output,
         "--global-analysis", "--plot", "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps],
        env,
    )
    run_script(
        "analyze_pch_clustering.py",
        ["--data-dir", data_dir, "--output-dir", pch_output,
         "--global-analysis", "--icd10", "--plot", "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps],
        env,
    )
    run_script(
        "pch_icd10_debias.py",
        ["--data-dir", data_dir, "--output-dir", pch_output, "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations],
        env,
    )
    balanced_pairs = data_dir / "pi_pairs_balanced.json"
    run_script(
        "build_balanced_pi_pairs.py",
        ["--data-dir", data_dir, "--output", balanced_pairs, "--seed", args.seed],
        env,
    )
    run_script(
        "analyze_pi_balanced.py",
        ["--data-dir", data_dir, "--pairs-file", balanced_pairs,
         "--output-dir", pi_output, "--seed", args.seed,
         "--kmeans-seeds", args.kmeans_seeds, "--permutations", args.permutations,
         "--bootstraps", args.bootstraps, "--jobs", -1],
        env,
    )
    run_script(
        "analyze_spp_clustering.py",
        ["--data-dir", data_dir, "--output-dir", spp_output, "--plot", "--seed", args.seed,
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

    validate_outputs(data_dir, results_dir)
    print("\nAll authoritative Polygon Amoy clustering analyses completed.")


if __name__ == "__main__":
    main()
