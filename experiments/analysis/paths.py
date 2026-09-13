"""Stable repository paths shared by the Python experiment modules."""
from __future__ import annotations

from pathlib import Path


def _find_repo_root(start: Path) -> Path:
    for candidate in (start, *start.parents):
        if (candidate / "package.json").is_file() and (candidate / "experiments").is_dir():
            return candidate
    raise RuntimeError(f"Could not locate repository root from {start}")


REPO_ROOT = _find_repo_root(Path(__file__).resolve().parent)
EXPERIMENTS_ROOT = REPO_ROOT / "experiments"
CAPTURE_DATA_DIR = EXPERIMENTS_ROOT / "data" / "polygonAmoy"
RESULTS_ROOT = EXPERIMENTS_ROOT / "results"
SUPERVISED_RESULTS_DIR = RESULTS_ROOT / "supervised"
CLUSTERING_RESULTS_DIR = RESULTS_ROOT / "clustering"
CROSSCHECK_RESULTS_DIR = RESULTS_ROOT / "crosscheck"
WORK_ROOT = EXPERIMENTS_ROOT / ".work"
CLUSTERING_WORK_DIR = WORK_ROOT / "clustering" / "polygonAmoy"
ABLATION_DIR = EXPERIMENTS_ROOT / "ablation" / "gas_padding" / "polygonAmoy"
