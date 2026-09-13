#!/usr/bin/env python3
"""Compare an MDPI Python supervised verdict with the independent JS report."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Dict

from experiments.analysis.paths import CROSSCHECK_RESULTS_DIR, SUPERVISED_RESULTS_DIR

DEFAULT_JS_REPORTS = {
    "pch": CROSSCHECK_RESULTS_DIR / "pch" / "polygonAmoy" / "evaluation_report.json",
    "pi": CROSSCHECK_RESULTS_DIR / "pi" / "polygonAmoy" / "pi_report.json",
    "spp": CROSSCHECK_RESULTS_DIR / "spp" / "polygonAmoy" / "report.json",
}
DEFAULT_PY_VERDICTS = {
    "pch": SUPERVISED_RESULTS_DIR / "pch_supervised_verdict.json",
    "pi": SUPERVISED_RESULTS_DIR / "pi_supervised_verdict.json",
    "spp": SUPERVISED_RESULTS_DIR / "spp_supervised_verdict.json",
}
EXPECTED_TASK_COUNTS = {"pch": 16, "pi": 5, "spp": 28}


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def task_map(verdict: Dict) -> Dict[str, Dict]:
    tasks = verdict.get("tasks") or verdict.get("contrasts") or []
    return {str(t.get("key") or f"{t.get('target')}:{t.get('class0')}/{t.get('class1')}"): t for t in tasks}


def normalize_criterion(c: Dict) -> Dict:
    return {
        "seeds": c.get("seeds"),
        "aucMax": c.get("aucMax"),
        "permAlpha": c.get("permAlpha"),
        "sigFractionMax": c.get("sigFractionMax"),
        "minTestSamples": c.get("minTestSamples"),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare MDPI Python verdict with independent JS report")
    parser.add_argument("--experiment", choices=["pch", "pi", "spp"], required=True)
    parser.add_argument("--python-verdict", type=Path, default=None)
    parser.add_argument("--js-report", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()

    py_path = args.python_verdict or DEFAULT_PY_VERDICTS[args.experiment]
    js_path = args.js_report or DEFAULT_JS_REPORTS[args.experiment]
    out_path = args.output or SUPERVISED_RESULTS_DIR / f"{args.experiment}_js_comparison.json"

    py = load_json(py_path)
    js_report = load_json(js_path)
    js = js_report.get("multiseedVerdict")
    if not js:
        raise SystemExit(f"No multiseedVerdict in {js_path}")

    py_tasks = task_map(py)
    js_tasks = task_map(js)
    shared = sorted(set(py_tasks) & set(js_tasks))
    only_python = sorted(set(py_tasks) - set(js_tasks))
    only_js = sorted(set(js_tasks) - set(py_tasks))

    task_diffs = []
    for key in shared:
        p = py_tasks[key]
        j = js_tasks[key]
        diffs = {}
        # Splits are independently implemented, so sample counts/AUCs are diagnostic.
        # The strict cross-check is on verdict status and gating status.
        for field in ["passed", "nonGating"]:
            if p.get(field) != j.get(field):
                diffs[field] = {"python": p.get(field), "js": j.get(field)}
        if diffs:
            task_diffs.append({"key": key, "diffs": diffs})

    comparison = {
        "experiment": args.experiment,
        "pythonVerdict": str(py_path),
        "jsReport": str(js_path),
        "overall": {"python": py.get("overallPassed"), "js": js.get("overallPassed")},
        "criterion": {
            "python": normalize_criterion(py.get("criterion", {})),
            "js": normalize_criterion(js.get("criterion", {})),
        },
        "taskCounts": {"python": len(py_tasks), "js": len(js_tasks), "shared": len(shared)},
        "expectedTaskCount": EXPECTED_TASK_COUNTS[args.experiment],
        "onlyPython": only_python,
        "onlyJs": only_js,
        "taskDiffs": task_diffs,
        "matches": (
            py.get("overallPassed") == js.get("overallPassed")
            and normalize_criterion(py.get("criterion", {})) == normalize_criterion(js.get("criterion", {}))
            and len(py_tasks) == EXPECTED_TASK_COUNTS[args.experiment]
            and len(js_tasks) == EXPECTED_TASK_COUNTS[args.experiment]
            and not only_python
            and not only_js
            and not task_diffs
        ),
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(comparison, handle, indent=2)
    print(json.dumps(comparison, indent=2))
    print(f"Comparison -> {out_path}")


if __name__ == "__main__":
    main()
