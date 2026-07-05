#!/usr/bin/env python3
"""Shared framework for supervised-attack protocol visualizations.

PCH / SPP / PI all run the *same* multi-seed AUC + permutation protocol
(``common.py``); they differ only in how binary tasks are built from a dataset.
This module holds everything task-agnostic — per-seed AUC spread, the
permutation null histogram, the training-data health inspection, the shared
raw-row pool — and a ``run_probe`` driver.  Each experiment supplies a small
adapter: a dataset loader and a ``build_tasks`` that returns task dicts carrying
``indices`` (original dataset row ids).

Nothing here touches the of-record outputs; it emits a ``viz_data.json`` the
self-contained HTML dashboard reads.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence

import numpy as np
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import GroupShuffleSplit

from common import (
    AUC_MAX,
    DEFAULT_SEEDS,
    FEATURE_KEYS,
    MIN_TEST_SAMPLES,
    PERM_ALPHA,
    PERM_ITERS,
    SIG_FRACTION_MAX,
    TEST_RATIO,
    _average_ranks,
    _auc_from_ranks,
    evaluate_seed,
    fit_predict_proba,
    load_json,
)

OUTPUT_DIR = Path(__file__).parents[1] / "results" / "supervised_analysis"

# Structure metadata carried alongside each raw row (policy shape behind features).
# PCH and SPP share this schema; PI adapters may override via row_meta.
STRUCT_KEYS = ("structureType", "predicateCombo", "paramType", "nestingDepth")


# --------------------------------------------------------------------------- #
# Permutation null histogram (one representative seed, full null AUC array)
# --------------------------------------------------------------------------- #
def null_auc_samples(X, y, groups, seed: int, model: str, perm_iters: int) -> Optional[Dict]:
    """Recompute one seed's split + fit, then return the full null AUC array.

    Mirrors ``permutation_pvalue`` but exposes every shuffled AUC (not just the
    tail count) so a histogram can be drawn.  Returns None if the split is
    degenerate, matching ``evaluate_seed``.
    """
    gss = GroupShuffleSplit(n_splits=1, test_size=TEST_RATIO, random_state=seed)
    tr_idx, te_idx = next(gss.split(X, y, groups))
    X_tr, X_te = X[tr_idx], X[te_idx]
    y_tr, y_te = y[tr_idx], y[te_idx]
    if len(np.unique(y_tr)) < 2 or len(np.unique(y_te)) < 2:
        return None
    keep = X_tr.var(axis=0) > 0
    X_tr, X_te = X_tr[:, keep], X_te[:, keep]
    if X_tr.shape[1] == 0:
        return None

    proba = fit_predict_proba(model, X_tr, y_tr, X_te, seed, rf_n_jobs=-1)
    observed_auc = float(roc_auc_score(y_te, proba))

    y_perm = y_te.astype(int).copy()
    n_pos, n_neg = int(y_perm.sum()), int(len(y_perm) - int(y_perm.sum()))
    ranks = _average_ranks(np.asarray(proba, dtype=float))
    rng = np.random.default_rng(seed * 1009 + (17 if model == "lr" else 53))
    null_aucs: List[float] = []
    for _ in range(perm_iters):
        rng.shuffle(y_perm)
        null_aucs.append(_auc_from_ranks(y_perm, ranks, n_pos, n_neg))
    ge = sum(1 for a in null_aucs if a >= observed_auc)
    pval = (ge + 1) / (perm_iters + 1)
    return {
        "model": model,
        "seed": seed,
        "observedAuc": observed_auc,
        "pval": pval,
        "testN": int(len(y_te)),
        "nPos": n_pos,
        "nNeg": n_neg,
        "nullAucs": [round(float(a), 4) for a in null_aucs],
    }


# --------------------------------------------------------------------------- #
# Training-data inspection (per-feature distribution vs label, ICC, correlation)
# --------------------------------------------------------------------------- #
def _single_feature_auc(values: np.ndarray, y: np.ndarray) -> float:
    """Rank-AUC of one raw feature vs the label (direction-free, |auc-0.5|+0.5)."""
    n_pos = int(y.sum())
    n_neg = int(len(y) - n_pos)
    if n_pos == 0 or n_neg == 0:
        return 0.5
    ranks = _average_ranks(values.astype(float))
    auc = _auc_from_ranks(y, ranks, n_pos, n_neg)
    return 0.5 + abs(auc - 0.5)


def _within_policy_icc(values: np.ndarray, groups: np.ndarray) -> Dict:
    """One-way ICC(1) + within/between variance on the replicated-policy subset."""
    order = np.argsort(groups, kind="mergesort")
    v = values[order]
    g = groups[order]
    _, starts = np.unique(g, return_index=True)
    starts = np.sort(starts)
    ends = np.append(starts[1:], len(g))
    grand = float(v.mean()) if len(v) else 0.0
    ss_within = 0.0
    ss_between = 0.0
    n_rep_policies = 0
    n_rep_execs = 0
    group_sizes = []
    for s, e in zip(starts, ends):
        gv = v[s:e]
        size = len(gv)
        gm = float(gv.mean())
        ss_between += size * (gm - grand) ** 2
        if size >= 2:
            n_rep_policies += 1
            n_rep_execs += size
            ss_within += float(((gv - gm) ** 2).sum())
            group_sizes.append(size)
    k = len(starts)
    n = len(v)
    df_within = max(n - k, 1)
    df_between = max(k - 1, 1)
    ms_within = ss_within / df_within
    ms_between = ss_between / df_between
    m0 = (n - (sum(sz * sz for sz in group_sizes) / n)) / df_between if group_sizes and n else 1.0
    m0 = m0 if m0 > 0 else 1.0
    denom = ms_between + (m0 - 1) * ms_within
    icc = (ms_between - ms_within) / denom if denom > 0 else float("nan")
    mean_abs = abs(grand) if grand else 1.0
    within_cv = (np.sqrt(ms_within) / mean_abs) if mean_abs else float("nan")
    return {
        "icc": None if np.isnan(icc) else round(float(icc), 3),
        "withinCv": None if (isinstance(within_cv, float) and np.isnan(within_cv)) else round(float(within_cv), 4),
        "msWithin": round(ms_within, 3),
        "msBetween": round(ms_between, 3),
        "repPolicies": n_rep_policies,
        "repExecs": n_rep_execs,
    }


def inspect_training_data(task: Dict, hist_bins: int = 24) -> Dict:
    """Per-feature distribution-vs-label, within-policy variance, correlation.

    Computed on the FULL task matrix (not a fold) so it reflects the data the
    attacker is handed, before any split-time zero-variance dropping.
    """
    X, y, groups = task["X"], task["y"], task["groups"]
    y = y.astype(int)
    n_pos = int(y.sum())
    n_neg = int(len(y) - n_pos)
    pos_mask = y == 1

    features = []
    for j, name in enumerate(FEATURE_KEYS):
        col = X[:, j]
        col_var = float(col.var())
        pos_vals = col[pos_mask]
        neg_vals = col[~pos_mask]
        lo, hi = float(col.min()), float(col.max())
        if hi > lo:
            edges = np.linspace(lo, hi, hist_bins + 1)
        else:
            edges = np.array([lo - 0.5, lo + 0.5])
        pos_hist, _ = np.histogram(pos_vals, bins=edges)
        neg_hist, _ = np.histogram(neg_vals, bins=edges)
        pooled_sd = float(np.sqrt(((pos_vals.var() * n_pos) + (neg_vals.var() * n_neg)) / max(len(col), 1)))
        cohen_d = ((float(pos_vals.mean()) - float(neg_vals.mean())) / pooled_sd) if pooled_sd > 0 else 0.0
        icc = _within_policy_icc(col, groups)
        features.append({
            "name": name,
            "var": col_var,
            "zeroVar": col_var == 0.0,
            "min": lo, "max": hi,
            "posMean": round(float(pos_vals.mean()), 2) if n_pos else None,
            "negMean": round(float(neg_vals.mean()), 2) if n_neg else None,
            "cohenD": round(cohen_d, 3),
            "singleFeatAuc": round(_single_feature_auc(col, y), 3),
            "edges": [round(float(e), 2) for e in edges],
            "posHist": [int(c) for c in pos_hist],
            "negHist": [int(c) for c in neg_hist],
            "icc": icc["icc"],
            "withinCv": icc["withinCv"],
            "repPolicies": icc["repPolicies"],
        })

    with np.errstate(invalid="ignore", divide="ignore"):
        corr = np.corrcoef(X, rowvar=False)
    corr_out = [[None if (isinstance(v, float) and np.isnan(v)) else round(float(v), 2)
                 for v in row] for row in np.atleast_2d(corr)]

    return {
        "nPos": n_pos,
        "nNeg": n_neg,
        "majorityBaseline": round(max(n_pos, n_neg) / max(len(y), 1), 3),
        "features": features,
        "corr": corr_out,
        "featureOrder": list(FEATURE_KEYS),
    }


# --------------------------------------------------------------------------- #
# Shared raw-row pool (deduplicated; tasks reference pool indices + labels)
# --------------------------------------------------------------------------- #
def policy_logic(rec: dict):
    """Human-readable policy logic expression (e.g. 'GR AND DS').

    Prefers the normalized form; falls back to original, then DUO term codes.
    This is the *hidden* policy content the attacker must guess — surfaced only
    to eyeball it against the observable on-chain features on the same row.
    """
    sem = rec.get("semantics") or {}
    for key in ("logicNormalized", "logicOriginal"):
        v = sem.get(key)
        if isinstance(v, str) and v.strip():
            return v
    codes = rec.get("duoTermCodes") or sem.get("duoTerms") or []
    return " ".join(str(c) for c in codes) if codes else None


def build_row_pool(dataset: List[dict], struct_keys: Sequence[str] = STRUCT_KEYS) -> List[Dict]:
    """One shared record per execution (identity + 9 raw features + structure)."""
    pool = []
    for rec in dataset:
        feats = rec.get("features") or {}
        pool.append({
            "policyId": rec.get("policyId"),
            "executionId": rec.get("executionId"),
            "logic": policy_logic(rec),
            "features": {k: feats.get(k) for k in FEATURE_KEYS},
            "struct": {k: rec.get(k) for k in struct_keys},
        })
    return pool


def task_row_ref(task: Dict) -> Dict:
    """Per-task reference into the shared row pool: pool indices + label array."""
    return {
        "poolIdx": [int(i) for i in task["indices"]],
        "labels": [int(v) for v in task["y"]],
    }


# --------------------------------------------------------------------------- #
# Per-task probe (seed spread + permutation histogram + inspection + rows)
# --------------------------------------------------------------------------- #
def probe_task(task: Dict, seeds: int, models: Sequence[str], perm_iters: int) -> Dict:
    X, y, groups = task["X"], task["y"], task["groups"]

    raw = [(s, evaluate_seed(X, y, groups, s, models, -1, TEST_RATIO, perm_iters))
           for s in range(seeds)]
    valid_seed_ids = [s for s, r in raw if r is not None]
    per_seed = [r for _, r in raw if r is not None]

    seed_aucs = {m: [r[m]["auc"] for r in per_seed] for m in models}
    seed_pvals = {m: [r[m]["pval"] for r in per_seed] for m in models}
    test_ns = [r["testN"] for r in per_seed]
    median_test_n = float(np.median(test_ns)) if test_ns else None

    model_summary = {}
    for m in models:
        aucs = seed_aucs[m]
        pvals = seed_pvals[m]
        auc_mean = float(np.mean(aucs)) if aucs else float("nan")
        sig_fraction = float(np.mean([p < PERM_ALPHA for p in pvals])) if pvals else 0.0
        model_summary[m] = {
            "aucMean": auc_mean,
            "aucStd": float(np.std(aucs)) if aucs else float("nan"),
            "sigFraction": sig_fraction,
            "legFails": (auc_mean > AUC_MAX) and (sig_fraction >= SIG_FRACTION_MAX),
            "seedAucs": [round(a, 4) for a in aucs],
            "seedPvals": [round(p, 4) for p in pvals],
        }

    hist = None
    if per_seed:
        lead_model = max(models, key=lambda m: model_summary[m]["aucMean"])
        aucs = seed_aucs[lead_model]
        rep_local = int(np.argsort(aucs)[len(aucs) // 2])
        rep_seed = valid_seed_ids[rep_local]
        hist = null_auc_samples(X, y, groups, rep_seed, lead_model, perm_iters)

    # A task is non-gating if the test split is too small OR it is a designated
    # diagnostic (e.g. PI's controlled_difference positive control, excluded from
    # the verdict in the JS source of record).
    diagnostic = bool(task.get("diagnostic"))
    small_n = median_test_n is not None and median_test_n < MIN_TEST_SAMPLES
    return {
        "key": task["key"],
        "target": task.get("target"),
        "class0": task.get("class0"),
        "class1": task.get("class1"),
        "medianTestN": median_test_n,
        "nonGating": small_n or diagnostic,
        "diagnostic": diagnostic,
        "nSeeds": len(per_seed),
        "models": model_summary,
        "permHistogram": hist,
        "dataInspect": inspect_training_data(task),
        "rowRef": task_row_ref(task),
    }


# --------------------------------------------------------------------------- #
# Generic driver + CLI
# --------------------------------------------------------------------------- #
def add_common_args(parser: argparse.ArgumentParser, default_data_dir: Path) -> None:
    parser.add_argument("--data-dir", type=Path, default=default_data_dir)
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR)
    parser.add_argument("--seeds", type=int, default=DEFAULT_SEEDS)
    parser.add_argument("--models", nargs="+", default=["rf", "lr"], choices=["rf", "lr"])
    parser.add_argument("--perm-iters", type=int, default=PERM_ITERS)
    parser.add_argument("--limit", type=int, default=None,
                        help="probe only the first N tasks (for a quick preview)")


def run_probe(
    experiment: str,
    dataset: List[dict],
    dataset_tag: str,
    build_tasks: Callable[[List[dict]], List[Dict]],
    args: argparse.Namespace,
    out_name: str,
    struct_keys: Sequence[str] = STRUCT_KEYS,
    row_pool: Optional[List[Dict]] = None,
) -> Path:
    """Probe every task and write ``out_name`` (viz JSON) under the output dir.

    ``row_pool`` lets an adapter supply a precomputed pool when rows don't come
    one-per-top-level-dataset-record (PI: rows are pair-side executions).  When
    omitted, the pool is built from ``dataset`` (PCH / SPP).
    """
    tasks = build_tasks(dataset)
    if args.limit is not None:
        tasks = tasks[: args.limit]
    if row_pool is None:
        row_pool = build_row_pool(dataset, struct_keys)

    probed = []
    for task in tasks:
        res = probe_task(task, args.seeds, args.models, args.perm_iters)
        probed.append(res)
        lead = max(args.models, key=lambda m: res["models"][m]["aucMean"]
                   if res["models"] else 0)
        md = res["models"].get(lead, {})
        print(f"  {res['key']:24} lead={lead} "
              f"aucMean={md.get('aucMean', float('nan')):.3f} "
              f"sig={md.get('sigFraction', 0):.2f} medN={res['medianTestN']}")

    out = {
        "experiment": experiment,
        "dataset": dataset_tag,
        "criterion": {
            "seeds": args.seeds,
            "aucMax": AUC_MAX,
            "permAlpha": PERM_ALPHA,
            "sigFractionMax": SIG_FRACTION_MAX,
            "minTestSamples": MIN_TEST_SAMPLES,
            "permIters": args.perm_iters,
            "testRatio": TEST_RATIO,
        },
        "models": list(args.models),
        "featureOrder": list(FEATURE_KEYS),
        "structKeys": list(struct_keys),
        "rowPool": row_pool,
        "tasks": probed,
    }
    args.output_dir.mkdir(parents=True, exist_ok=True)
    out_path = args.output_dir / out_name
    with out_path.open("w", encoding="utf-8") as handle:
        json.dump(out, handle, indent=2)
    print(f"\nViz data -> {out_path}")
    return out_path
