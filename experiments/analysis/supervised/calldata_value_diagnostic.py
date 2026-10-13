"""Calldata-value diagnostic: what an observer learns by reading values, not sizes.

The of-record attacks use transaction sizes and gas only.  The public view of
Section 3 also contains values carried in calldata.  This diagnostic scores
three of them directly, for every supervised task of the main Amoy capture and
of the B1 (unpadded) / B2 (padded) ablation captures:

* ``pseudonymZeroPrefix``: 1 when the 32-byte ``id_req`` word starts with at
  least 16 zero bytes.  The evaluated generator encoded ``id_req`` as a 128-bit
  random value for policies without the DUO profile slot (predicate type 9 in
  slot 10) and as ``Poseidon(holderSecret)`` otherwise, so the indicator equals
  ``not usesProfile``.  A sampled decode of access calldata on Amoy confirms the
  rule for all three captures (60 transactions, no violation).
* ``ppMultiplicity``: number of distinct policies in the same capture whose
  public parameter commitment ``pp`` equals this one.  ``pp`` is a Poseidon
  chain over the predicate parameters without blinding randomness, so equal
  parameter sets give equal commitments; the observer counts them without
  labels.
* ``policyId``: the on-chain policy identifier.  Its order reflects the order
  in which the evaluation harness committed policies, not the protocol.

Each feature is used as a score, and the AUC is computed exactly on the full
task, with every policy (PI: every pair side) weighted equally across its
executions.  No model is trained and no split is drawn.  For a binary feature
this AUC is the best any attacker using that feature alone can reach.  The
reported of-record gas AUCs (mean over 30 splits) are copied for reference.

Usage:
    .venv/bin/python -m experiments.analysis.supervised.calldata_value_diagnostic
"""

from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, List

import numpy as np

from experiments.analysis.paths import ABLATION_DIR, CAPTURE_DATA_DIR, SUPERVISED_RESULTS_DIR

from .common import load_json
from .pad_residual_diagnostic import build_spp_tasks_with_indices
from .pch_supervised import build_tasks as build_pch_tasks
from .run_ablation_supervised import align_records

DUO_PROFILE_SLOT = 10
DUO_PROFILE_TYPE = 9
FEATURES = ("pseudonymZeroPrefix", "ppMultiplicity", "policyId")
CAPTURES = {
    "main": {
        "dir": CAPTURE_DATA_DIR,
        "pairs": SUPERVISED_RESULTS_DIR / "pi_pairs_generated.json",
    },
    "b1": {
        "dir": ABLATION_DIR / "b1_unpadded",
        "pairs": SUPERVISED_RESULTS_DIR / "pairs" / "b1_unpadded" / "pi_pairs_generated.json",
    },
    "b2": {
        "dir": ABLATION_DIR / "b2_padded",
        "pairs": SUPERVISED_RESULTS_DIR / "pairs" / "b2_padded" / "pi_pairs_generated.json",
    },
}


def weighted_auc(scores: np.ndarray, y: np.ndarray, w: np.ndarray) -> float:
    """P(score_pos > score_neg) + 0.5 P(tie), with positives and negatives drawn by weight."""
    pos, neg = y == 1, y == 0
    sp, wp, sn, wn = scores[pos], w[pos], scores[neg], w[neg]
    order = np.argsort(sn, kind="mergesort")
    sn, wn = sn[order], wn[order]
    cum = np.concatenate([[0.0], np.cumsum(wn)])
    below = cum[np.searchsorted(sn, sp, side="left")]
    upto = cum[np.searchsorted(sn, sp, side="right")]
    num = np.sum(wp * (below + 0.5 * (upto - below)))
    return float(num / (wp.sum() * wn.sum()))


def value_features(record: dict, pp_multiplicity: Dict[str, int]) -> List[float]:
    uses_profile = int(record["predicateParameters"]["predicateTypes"][DUO_PROFILE_SLOT]) == DUO_PROFILE_TYPE
    return [
        0.0 if uses_profile else 1.0,
        float(pp_multiplicity[str(record["paramsCommitment"])]),
        float(int(record["blockchainPolicyId"])),
    ]


def pp_multiplicity_of(executed: List[dict]) -> Dict[str, int]:
    policies = defaultdict(set)
    for row in executed:
        policies[str(row["paramsCommitment"])].add(str(row["policyId"]))
    return {pp: len(ids) for pp, ids in policies.items()}


def score_task(V: np.ndarray, y: np.ndarray, units: np.ndarray) -> Dict:
    counts = Counter(units.tolist())
    w = np.array([1.0 / counts[u] for u in units])
    out = {"nRows": int(len(y)), "nUnits": int(len(counts)),
           "nPositiveUnits": int(len({u for u, lab in zip(units, y) if lab == 1}))}
    for j, name in enumerate(FEATURES):
        out[name] = weighted_auc(V[:, j], y, w)
    return out


def row_tasks(dataset: List[dict], tasks: List[dict], pp_mult: Dict[str, int], experiment: str) -> Dict[str, Dict]:
    V_all = np.array([value_features(r, pp_mult) for r in dataset], dtype=float)
    out = {}
    for task in tasks:
        idx = task.get("indices", task.get("_indices"))
        out[f"{experiment}|{task['key']}"] = score_task(V_all[idx], np.asarray(task["y"]), np.asarray(task["groups"]))
    return out


def pi_tasks(pairs: List[dict], executed: List[dict], pp_mult: Dict[str, int]) -> Dict[str, Dict]:
    by_policy = defaultdict(list)
    for row in executed:
        by_policy[str(row["policyId"])].append(row)
    scopes = ["overall"] + [t for t in ("semantic_equivalent", "structural_variant", "weak_equivalent",
                                         "controlled_difference") if any(p.get("pairType") == t for p in pairs)]
    out = {}
    for scope in scopes:
        V, y, units = [], [], []
        for pair in pairs:
            if scope != "overall" and pair.get("pairType") != scope:
                continue
            for side, policy in enumerate(pair["policies"]):
                for row in by_policy[str(policy["policyId"])]:
                    V.append(value_features(row, pp_mult))
                    y.append(side)
                    units.append(f"{pair['pairId']}#{side}")
        out[f"pi|{scope}"] = score_task(np.array(V, dtype=float), np.array(y), np.array(units, dtype=object))
    return out


def capture_tasks(name: str, cfg: Dict) -> Dict[str, Dict]:
    executed = load_json(cfg["dir"] / "executed_dataset.json")
    pp_mult = pp_multiplicity_of(executed)
    pch = load_json(cfg["dir"] / "pch_dataset.json")
    spp = load_json(cfg["dir"] / "spp_dataset.json")
    if name in ("b1", "b2"):
        # Same record order as run_ablation_supervised, so task keys and rows match.
        other = "b2_padded" if name == "b1" else "b1_unpadded"
        pch_other = load_json(ABLATION_DIR / other / "pch_dataset.json")
        spp_other = load_json(ABLATION_DIR / other / "spp_dataset.json")
        pch = align_records(pch, pch_other, "pch_dataset.json")[0] if name == "b1" else \
            align_records(pch_other, pch, "pch_dataset.json")[1]
        spp = align_records(spp, spp_other, "spp_dataset.json")[0] if name == "b1" else \
            align_records(spp_other, spp, "spp_dataset.json")[1]
    pairs_data = load_json(cfg["pairs"])
    pairs = pairs_data["pairs"] if isinstance(pairs_data, dict) else pairs_data
    out = {}
    out.update(row_tasks(pch, build_pch_tasks(pch), pp_mult, "pch"))
    out.update(row_tasks(spp, build_spp_tasks_with_indices(spp), pp_mult, "spp"))
    out.update(pi_tasks(pairs, executed, pp_mult))
    return out


def gas_reference() -> Dict[str, Dict[str, Dict[str, float]]]:
    """Of-record mean gas AUC per task and model: main from the verdicts, B1/B2 from the ablation CSV."""
    ref: Dict[str, Dict[str, Dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    for experiment in ("pch", "spp", "pi"):
        verdict = load_json(SUPERVISED_RESULTS_DIR / f"{experiment}_supervised_verdict.json")
        entries = verdict.get("tasks") or verdict.get("contrasts") or []
        for entry in entries:
            for model, stats in entry["models"].items():
                ref[f"{experiment}|{entry['key']}"]["main"][model] = stats["aucMean"]
    with (SUPERVISED_RESULTS_DIR / "gas_padding_supervised_deltaLeakage.csv").open() as handle:
        for row in csv.DictReader(handle):
            key = f"{row['experiment']}|{row['target']}"
            ref[key]["b1"][row["model"]] = float(row["aucMean_b1_unpadded"])
            ref[key]["b2"][row["model"]] = float(row["aucMean_b2_padded"])
    return ref


def dev(auc: float) -> float:
    return abs(auc - 0.5)


def write_markdown(path: Path, results: Dict[str, Dict[str, Dict]], ref) -> None:
    keys = list(results["main"])
    lines = [
        "# Calldata-value diagnostic",
        "",
        "Exact AUC of each calldata value used as a score, every policy (PI: pair side) weighted equally.",
        "Gas columns copy the of-record mean AUC over 30 splits (RF / LR). AUC below 0.5 is equally informative.",
        "",
        "| Task | main pseudonym | main pp | main policyId | B1 pseudonym | B1 pp | B1 policyId "
        "| B2 pseudonym | B2 pp | B2 policyId | main gas RF/LR | B1 gas RF/LR | B2 gas RF/LR |",
        "|---|" + "---:|" * 12,
    ]
    for key in keys:
        cells = [key]
        for cap in ("main", "b1", "b2"):
            r = results[cap].get(key)
            cells += [f"{r[f]:.3f}" if r else "–" for f in FEATURES]
        for cap in ("main", "b1", "b2"):
            g = ref.get(key, {}).get(cap, {})
            cells.append(f"{g['rf']:.3f} / {g['lr']:.3f}" if g else "–")
        lines.append("| " + " | ".join(cells) + " |")
    lines += ["", "## Tasks with |AUC - 0.5| > 0.15 (of 45)", "",
              "| Capture | pseudonym | pp | policyId | gas RF | gas LR |", "|---|---:|---:|---:|---:|---:|"]
    for cap in ("main", "b1", "b2"):
        n = [sum(dev(results[cap][k][f]) > 0.15 for k in keys) for f in FEATURES]
        n += [sum(dev(ref[k][cap][m]) > 0.15 for k in keys) for m in ("rf", "lr")]
        lines.append(f"| {cap} | " + " | ".join(str(x) for x in n) + " |")
    lines += ["", "## Largest |AUC - 0.5| per feature", ""]
    for cap in ("main", "b1", "b2"):
        for f in FEATURES:
            best = max(results[cap].items(), key=lambda kv: dev(kv[1][f]))
            lines.append(f"- {cap} {f}: {best[0]} AUC {best[1][f]:.3f}")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--output-dir", type=Path, default=SUPERVISED_RESULTS_DIR)
    args = parser.parse_args()

    results = {name: capture_tasks(name, cfg) for name, cfg in CAPTURES.items()}
    counts = {name: len(tasks) for name, tasks in results.items()}
    if set(counts.values()) != {45} or not (set(results["main"]) == set(results["b1"]) == set(results["b2"])):
        raise SystemExit(f"Expected the same 45 tasks in every capture, got {counts}")
    ref = gas_reference()
    missing = [k for k in results["main"] if not all(ref.get(k, {}).get(c) for c in ("main", "b1", "b2"))]
    if missing:
        raise SystemExit(f"No of-record gas AUC for {missing}")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    payload = {
        "features": list(FEATURES),
        "weighting": "each policy (PI: each pair side) has total weight 1 across its executions",
        "pseudonymRuleCheck": "60 sampled access transactions (10 per class per capture) decoded on Amoy; "
                              "leading zero bytes >= 16 iff the DUO profile slot is unused; 0 violations",
        "results": results,
        "gasReference": {k: {c: dict(v) for c, v in ref[k].items()} for k in results["main"]},
    }
    (args.output_dir / "calldata_value_diagnostic.json").write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    write_markdown(args.output_dir / "calldata_value_diagnostic.md", results, ref)
    print(f"Wrote {args.output_dir}/calldata_value_diagnostic.{{json,md}}")


if __name__ == "__main__":
    main()
