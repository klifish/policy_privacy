"""Calldata-value gate: no public value may separate the supervised task labels.

The supervised attacks read transaction sizes and gas.  The public view also
contains the values carried in calldata, event logs and transaction fields.
Before a capture is used, this gate decodes every such value and checks that
none of them separates any of the PCH, SPP or PI task labels.

Each execution's commit, resource-registration and access transactions are
decoded with the contract ABI (one field per 32-byte argument word), and every
log topic, log data word and transaction field (nonce, gas limit, block
number) is added.  Each field is encoded four ways: its numeric value, its
zero-byte count, its leading-zero-byte count, and the number of distinct
policies in the capture that share the value.  For every PCH and SPP task the
AUC of each encoded field is computed over one execution per policy, separately
for granted and denied executions (the decision o is public).  For every PI
pair type the statistic is the mean |AUC - 0.5| over its (pair, outcome)
cells, each comparing the executions of the pair's two policies; it is
reported as 0.5 + that mean.

Positive control: a synthetic field reproduces the legacy pseudonym encoding
(128-bit random without the DUO profile slot, 254-bit random with it).  The
gate must detect it; otherwise the verdict is INCONCLUSIVE.

Decision (Westfall-Young min-p): for each task, the statistic is the largest
|AUC - 0.5| over all fields and encodings, and its null distribution comes
from permuting the labels across the task's policies (PI: within cells).  Each task's p-value is
taken against its own null, so tasks with small classes, whose maximum is
large by chance, do not mask the others; the smallest p-value over tasks is
then compared with its permutation distribution.  The gate passes when this
family-wise p-value exceeds alpha.  A deterministic encoding (pseudonym width,
shared pp, layer-ordered IDs) gives a family-wise p-value at the resolution
limit.

Usage:
    .venv/bin/python -m experiments.analysis.supervised.calldata_value_gate \
        --data-dir experiments/data/localhost --output-dir <dir>
"""

from __future__ import annotations

import argparse
import json
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from experiments.analysis.paths import REPO_ROOT

from .common import load_json, outcome_of, outcome_strata, stratum_key
from .pad_residual_diagnostic import build_spp_tasks_with_indices
from .pch_supervised import build_tasks as build_pch_tasks

DEFAULT_ABI = REPO_ROOT / "build" / "protocol" / "v3.0.0-rc2" / "PolicyPrivacy.abi.json"
CONTROL_FIELD = "control.legacyPseudonym"
DUO_PROFILE_SLOT, DUO_PROFILE_TYPE = 10, 9
TX_KINDS = ("commit", "resource", "access")
ENCODINGS = ("value", "zeroBytes", "leadingZeroBytes", "multiplicity")
WORD = 32


# ---------------------------------------------------------------------------
# Decoding
# ---------------------------------------------------------------------------

def function_layouts(abi_path: Path) -> Dict[str, Tuple[str, List[Tuple[str, str]]]]:
    """selector -> (function name, [(input name, solidity type)]), selectors from ethers."""
    script = (
        "const {ethers}=require('ethers');const fs=require('fs');"
        "const i=new ethers.Interface(JSON.parse(fs.readFileSync(process.argv[1],'utf8')));"
        "const o={};i.forEachFunction(f=>{o[f.selector]=[f.name,f.inputs.map(x=>[x.name,x.type])]});"
        "process.stdout.write(JSON.stringify(o));"
    )
    out = subprocess.run(["node", "-e", script, str(abi_path)], cwd=REPO_ROOT, check=True,
                         capture_output=True, text=True).stdout
    return {sel: (name, [tuple(x) for x in inputs]) for sel, (name, inputs) in json.loads(out).items()}


def _static_words(sol_type: str) -> Optional[int]:
    """Number of head words for a static type; None for dynamic types."""
    if sol_type in ("string", "bytes") or sol_type.endswith("[]"):
        return None
    words = 1
    base = sol_type
    while base.endswith("]"):
        base, _, dim = base[:-1].rpartition("[")
        words *= int(dim)
    return words


def decode_calldata(data: str, layouts) -> Dict[str, int]:
    """Decode calldata into {field: uint value}; dynamic arguments contribute every tail word."""
    raw = bytes.fromhex(data[2:] if data.startswith("0x") else data)
    selector = "0x" + raw[:4].hex()
    if selector not in layouts:
        raise ValueError(f"unknown function selector {selector}")
    name, inputs = layouts[selector]
    body = raw[4:]
    words = [int.from_bytes(body[i:i + WORD], "big") for i in range(0, len(body) - len(body) % WORD, WORD)]
    fields: Dict[str, int] = {"selector": int(selector, 16)}
    head = 0
    for arg_name, sol_type in inputs:
        n = _static_words(sol_type)
        if n is None:
            offset = words[head] // WORD
            length = words[offset]
            fields[f"{arg_name}.length"] = length
            for j in range((length + WORD - 1) // WORD):
                fields[f"{arg_name}.word{j}"] = words[offset + 1 + j]
            head += 1
        else:
            for j in range(n):
                fields[arg_name if n == 1 else f"{arg_name}[{j}]"] = words[head + j]
            head += n
    return {f"{name}.{k}": v for k, v in fields.items()}


def _int(value) -> Optional[int]:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value)
    return int(text, 16) if text.startswith("0x") else int(text)


def execution_fields(row: dict, layouts) -> Dict[str, int]:
    out: Dict[str, int] = {}
    txs = row.get("transactions") or {}
    for kind in TX_KINDS:
        record = txs.get(kind)
        if not record:
            raise SystemExit(f"execution {row.get('policyId')}#{row.get('executionId')} has no {kind} transaction; "
                             "capture with the current harness")
        tx, receipt = record["tx"], record.get("receipt") or {}
        if not tx.get("data"):
            raise SystemExit("capture has no raw transaction input (tx.data); capture with the current harness")
        for field, value in decode_calldata(tx["data"], layouts).items():
            out[f"{kind}.{field}"] = value
        for field in ("from", "nonce", "gasLimit"):
            if tx.get(field) is not None:
                out[f"{kind}.tx.{field}"] = _int(tx[field])
        if receipt.get("blockNumber") is not None:
            out[f"{kind}.blockNumber"] = int(receipt["blockNumber"])
        contract = (tx.get("to") or "").lower()
        own_logs = [log for log in receipt.get("logs") or [] if (log.get("address") or "").lower() == contract]
        out[f"{kind}.logCount"] = len(own_logs)
        for i, log in enumerate(own_logs):
            for j, topic in enumerate(log.get("topics") or []):
                out[f"{kind}.log{i}.topic{j}"] = _int(topic)
            data = (log.get("data") or "0x")[2:]
            for j in range(len(data) // 64):
                out[f"{kind}.log{i}.data{j}"] = int(data[64 * j:64 * (j + 1)], 16)
    if row.get("executionSequence") is not None:
        out["executionSequence"] = int(row["executionSequence"])
    return out


def encode(value: int) -> Tuple[float, float, float]:
    raw = value.to_bytes(WORD, "big") if value < 1 << 256 else value.to_bytes((value.bit_length() + 7) // 8, "big")
    zero = sum(1 for b in raw if b == 0)
    leading = len(raw) - len(raw.lstrip(b"\x00"))
    return float(value), float(zero), float(leading)


# ---------------------------------------------------------------------------
# Feature matrix per policy
# ---------------------------------------------------------------------------

def legacy_pseudonym(row: dict, rng: np.random.Generator) -> int:
    uses_profile = int(row["predicateParameters"]["predicateTypes"][DUO_PROFILE_SLOT]) == DUO_PROFILE_TYPE
    bits = 254 if uses_profile else 128
    return int.from_bytes(rng.bytes(32), "big") >> (256 - bits)


def execution_features(executed: List[dict], layouts, exclude: Sequence[str], rng) -> Tuple[np.ndarray, List[str]]:
    """Encoded field matrix (one row per execution, aligned with ``executed``) and column names."""
    per_exec = []
    for row in executed:
        fields = {k: v for k, v in execution_fields(row, layouts).items()
                  if not any(k == e or k.startswith(e + ".") for e in exclude)}
        fields[CONTROL_FIELD] = legacy_pseudonym(row, rng)
        per_exec.append((row, fields))
    names = sorted({k for _, f in per_exec for k in f})
    sharing: Dict[str, Dict[int, set]] = defaultdict(lambda: defaultdict(set))
    for row, fields in per_exec:
        for k, v in fields.items():
            sharing[k][v].add(str(row["policyId"]))
    columns = [f"{n}|{e}" for n in names for e in ENCODINGS]
    matrix = np.full((len(per_exec), len(columns)), np.nan)
    for i, (_, fields) in enumerate(per_exec):
        vec = []
        for n in names:
            if n not in fields:
                vec += [np.nan] * len(ENCODINGS)
                continue
            value = fields[n]
            vec += [*encode(value), float(len(sharing[n][value]))]
        matrix[i] = vec
    return matrix, columns


# ---------------------------------------------------------------------------
# Tasks.  PCH/SPP: units are policies, one execution each, per outcome.
# PI: units are the executions of each designed pair, compared within
# (pair, outcome) cells.
# ---------------------------------------------------------------------------

def _first_execution_rows(executed: List[dict]) -> Dict[Tuple[str, Optional[str]], int]:
    """(policyId, outcome) -> row index of that policy's first execution with that outcome."""
    first: Dict[Tuple[str, Optional[str]], Tuple[int, int]] = {}
    for i, row in enumerate(executed):
        key = (str(row["policyId"]), outcome_of(row))
        eid = int(row.get("executionId", 0))
        if key not in first or eid < first[key][0]:
            first[key] = (eid, i)
    return {k: v[1] for k, v in first.items()}


def policy_task_units(data_dir: Path, executed: List[dict]) -> List[Tuple[str, np.ndarray, np.ndarray]]:
    """[(task key, row indices into executed, labels)] for the PCH and SPP tasks."""
    first = _first_execution_rows(executed)
    out = []
    for prefix, filename, builder in (("pch", "pch_dataset.json", build_pch_tasks),
                                      ("spp", "spp_dataset.json", build_spp_tasks_with_indices)):
        dataset = load_json(data_dir / filename)
        for outcome, rows in outcome_strata(dataset):
            for task in builder(rows):
                idx = task.get("indices", task.get("_indices"))
                label_of = {}
                for i, lab in zip(idx, task["y"]):
                    row = rows[int(i)]
                    label_of[(str(row["policyId"]), outcome_of(row))] = int(lab)
                units = sorted(label_of)
                out.append((f"{prefix}|{stratum_key(outcome, task['key'])}",
                            np.array([first[u] for u in units]),
                            np.array([label_of[u] for u in units])))
    return out


def pi_cells(executed: List[dict]) -> Dict[str, List[Tuple[np.ndarray, np.ndarray]]]:
    """pair type -> [(row indices, side labels)] for every (pair, outcome) cell."""
    cells: Dict[Tuple[str, str, Optional[str]], List[Tuple[int, int]]] = defaultdict(list)
    for i, row in enumerate(executed):
        pair = row.get("piPair")
        if pair:
            cells[(pair["pairType"], pair["pairId"], outcome_of(row))].append((i, int(pair["side"])))
    by_type: Dict[str, List[Tuple[np.ndarray, np.ndarray]]] = defaultdict(list)
    for (pair_type, _, _), members in sorted(cells.items()):
        idx = np.array([m[0] for m in members])
        side = np.array([m[1] for m in members])
        if len(set(side.tolist())) == 2:
            by_type[pair_type].append((idx, side))
    return dict(by_type)


def _ranks(X: np.ndarray) -> np.ndarray:
    """Column-wise average ranks (1-based); NaN (field absent) ranks as a tie at the bottom."""
    X = np.where(np.isnan(X), -np.inf, X)
    R = np.empty_like(X, dtype=float)
    for j in range(X.shape[1]):
        col = X[:, j]
        order = np.argsort(col, kind="mergesort")
        sorted_col = col[order]
        ranks = np.empty(len(col))
        i = 0
        while i < len(col):
            k = i
            while k + 1 < len(col) and sorted_col[k + 1] == sorted_col[i]:
                k += 1
            ranks[order[i:k + 1]] = (i + k + 2) / 2
            i = k + 1
        R[:, j] = ranks
    return R


def task_auc(R: np.ndarray, Y: np.ndarray) -> np.ndarray:
    """AUC for each label row of Y (P x n) and rank column of R (n x F) -> P x F."""
    n1 = Y.sum(axis=1, keepdims=True)
    n0 = Y.shape[1] - n1
    return (Y @ R - n1 * (n1 + 1) / 2) / (n1 * n0)


def cell_deviation(matrix: np.ndarray, cells, P: int, rng) -> Tuple[np.ndarray, np.ndarray]:
    """Mean |AUC - 0.5| over a pair type's cells, observed (F) and under P within-cell permutations (P x F).

    The attacker trains within each pair, so the direction of a field may differ
    between pairs; the deviation, not the signed AUC, is averaged.
    """
    observed = np.zeros(matrix.shape[1])
    null = np.zeros((P, matrix.shape[1]))
    for idx, side in cells:
        R = _ranks(matrix[idx])
        observed += np.abs(task_auc(R, side[None, :].astype(float))[0] - 0.5)
        Yp = np.vstack([rng.permutation(side) for _ in range(P)]).astype(float)
        null += np.abs(task_auc(R, Yp) - 0.5)
    return observed / len(cells), null / len(cells)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--abi", type=Path, default=DEFAULT_ABI)
    parser.add_argument("--permutations", type=int, default=1000)
    parser.add_argument("--alpha", type=float, default=0.05)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--exclude", default="", help="comma-separated fields (or prefixes) to leave out, e.g. "
                        "access.tx.gasLimit for an unpadded capture, where it is the gas estimate")
    args = parser.parse_args()
    exclude = [e for e in args.exclude.split(",") if e]

    layouts = function_layouts(args.abi)
    executed = load_json(args.data_dir / "executed_dataset.json")
    rng = np.random.default_rng(args.seed)
    matrix, columns = execution_features(executed, layouts, exclude, rng)
    real = np.array([not c.startswith(CONTROL_FIELD) for c in columns])

    P = args.permutations
    observed = []
    task_p, control_p, null_p = [], [], []

    def record(key, deviation, null_dev, signed=None):
        values = signed if signed is not None else deviation + 0.5
        observed.extend((key, col, float(a)) for col, a in zip(columns, values))
        null_t = null_dev[:, real].max(axis=1)
        obs_t = deviation[real].max()
        ctl_t = deviation[~real].max()
        task_p.append((1 + np.sum(null_t >= obs_t - 1e-12)) / (P + 1))
        control_p.append((1 + np.sum(null_t >= ctl_t - 1e-12)) / (P + 1))
        # Null p-value of each permutation against the same task's null.
        sorted_null = np.sort(null_t)
        null_p.append((P - np.searchsorted(sorted_null, null_t - 1e-12, side="left")) / P)

    for key, rows, y in policy_task_units(args.data_dir, executed):
        if len(set(y.tolist())) < 2:
            continue
        R = _ranks(matrix[rows])
        auc = task_auc(R, y[None, :].astype(float))[0]
        Yp = np.vstack([rng.permutation(y) for _ in range(P)]).astype(float)
        record(key, np.abs(auc - 0.5), np.abs(task_auc(R, Yp) - 0.5), signed=auc)
    for pair_type, cells in sorted(pi_cells(executed).items()):
        deviation, null_dev = cell_deviation(matrix, cells, P, rng)
        record(f"pi|{pair_type}", deviation, null_dev)
    min_null_p = np.min(np.vstack(null_p), axis=0)

    def familywise(p_tasks):
        return float((1 + np.sum(min_null_p <= min(p_tasks) + 1e-12)) / (P + 1))

    observed.sort(key=lambda t: -abs(t[2] - 0.5))
    control = [t for t in observed if t[1].startswith(CONTROL_FIELD)]
    observed = [t for t in observed if not t[1].startswith(CONTROL_FIELD)]
    obs_max = abs(observed[0][2] - 0.5)
    control_max = abs(control[0][2] - 0.5)
    gate_p = familywise(task_p)
    control_gate_p = familywise(control_p)
    control_detected = control_gate_p <= args.alpha
    passed = gate_p > args.alpha
    threshold = gate_p
    verdict = "PASS" if passed and control_detected else ("FAIL" if not passed else "INCONCLUSIVE")
    per_field: Dict[str, Tuple[float, str, str]] = {}
    for key, col, a in observed:
        field, enc = col.split("|")
        if field not in per_field or abs(a - 0.5) > abs(per_field[field][0] - 0.5):
            per_field[field] = (a, enc, key)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    report = {
        "dataDir": str(args.data_dir),
        "verdict": verdict,
        "passed": bool(passed),
        "excluded": exclude,
        "positiveControl": {"field": CONTROL_FIELD, "maxDeviation": control_max,
                            "detected": bool(control_detected), "task": control[0][0]},
        "observedMaxDeviation": obs_max,
        "familywiseP": gate_p,
        "controlFamilywiseP": control_gate_p,
        "alpha": args.alpha,
        "permutations": args.permutations,
        "tasks": len(task_p),
        "fields": len(columns) // len(ENCODINGS),
        "top": [{"task": k, "feature": c, "auc": a} for k, c, a in observed[:25]],
        "perField": {f: {"auc": a, "encoding": e, "task": k} for f, (a, e, k) in sorted(per_field.items())},
    }
    (args.output_dir / "calldata_value_gate.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    lines = [
        "# Calldata-value gate", "",
        f"**{verdict}**: max |AUC - 0.5| = {obs_max:.3f} over {report['fields'] - 1} fields x "
        f"{len(ENCODINGS)} encodings x {len(task_p)} tasks; family-wise permutation p = {gate_p:.3f} "
        f"(alpha {args.alpha}); positive control {CONTROL_FIELD} max = {control_max:.3f}, p = {control_gate_p:.3f} "
        f"({'detected' if control_detected else 'NOT detected'}).",
        "", "| Field | max \\|AUC-0.5\\| | AUC | encoding | task |", "|---|---:|---:|---|---|",
    ]
    for f, (a, e, k) in sorted(per_field.items(), key=lambda kv: -abs(kv[1][0] - 0.5)):
        lines.append(f"| {f} | {abs(a - 0.5):.3f} | {a:.3f} | {e} | {k} |")
    (args.output_dir / "calldata_value_gate.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(lines[2])
    raise SystemExit(0 if verdict == "PASS" else 1)


if __name__ == "__main__":
    main()
