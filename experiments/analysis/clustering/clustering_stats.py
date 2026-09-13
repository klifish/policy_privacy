"""Shared reproducible statistics for label-free privacy clustering."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Dict, Iterable, Sequence

import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
from sklearn.preprocessing import StandardScaler


DEFAULT_KMEANS_SEEDS = 20
DEFAULT_PERMUTATIONS = 200
DEFAULT_BOOTSTRAPS = 500


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _predictions(X, k: int, seeds: int):
    Xs = StandardScaler().fit_transform(np.asarray(X, dtype=float))
    return [
        KMeans(n_clusters=k, random_state=seed, n_init=10).fit_predict(Xs)
        for seed in range(seeds)
    ]


def _mean_metrics(y, predictions):
    ari = [adjusted_rand_score(y, pred) for pred in predictions]
    nmi = [normalized_mutual_info_score(y, pred) for pred in predictions]
    return {
        "ari": float(np.mean(ari)),
        "ariStd": float(np.std(ari)),
        "nmi": float(np.mean(nmi)),
        "nmiStd": float(np.std(nmi)),
    }


def ensemble_permutation_analysis(
    X,
    y,
    k: int,
    *,
    kmeans_seeds: int = DEFAULT_KMEANS_SEEDS,
    permutations: int = DEFAULT_PERMUTATIONS,
    random_seed: int = 42,
) -> Dict:
    """Compare a multi-initialization observed statistic to the matching null."""
    y = np.asarray(y)
    predictions = _predictions(X, k, kmeans_seeds)
    observed = _mean_metrics(y, predictions)
    rng = np.random.default_rng(random_seed)
    null_ari = []
    null_nmi = []
    for _ in range(permutations):
        permuted = rng.permutation(y)
        metrics = _mean_metrics(permuted, predictions)
        null_ari.append(metrics["ari"])
        null_nmi.append(metrics["nmi"])

    def summarize(values, observed_value):
        values = np.asarray(values, dtype=float)
        return {
            "mean": float(values.mean()),
            "std": float(values.std()),
            "p95": float(np.percentile(values, 95)),
            "pValue": float((np.sum(values >= observed_value) + 1) / (len(values) + 1)),
            "debiased": float(observed_value - values.mean()),
        }

    return {
        "observed": observed,
        "nullAri": summarize(null_ari, observed["ari"]),
        "nullNmi": summarize(null_nmi, observed["nmi"]),
        "firstPrediction": predictions[0],
    }


def policy_bootstrap_ci(
    X,
    y,
    groups,
    k: int,
    *,
    iterations: int = DEFAULT_BOOTSTRAPS,
    random_seed: int = 42,
) -> Dict:
    """Refit clustering after resampling whole policies with replacement."""
    X = np.asarray(X, dtype=float)
    y = np.asarray(y)
    groups = np.asarray(groups, dtype=object)
    unique_groups = np.array(sorted({str(g) for g in groups}), dtype=object)
    group_strings = np.array([str(g) for g in groups], dtype=object)
    by_group = {g: np.flatnonzero(group_strings == g) for g in unique_groups}
    rng = np.random.default_rng(random_seed)
    aris = []
    nmis = []
    for iteration in range(iterations):
        sampled = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        indices = np.concatenate([by_group[g] for g in sampled])
        if len(np.unique(y[indices])) < 2:
            continue
        scaled = StandardScaler().fit_transform(X[indices])
        pred = KMeans(n_clusters=k, random_state=iteration, n_init=10).fit_predict(scaled)
        aris.append(adjusted_rand_score(y[indices], pred))
        nmis.append(normalized_mutual_info_score(y[indices], pred))

    def ci(values):
        values = np.asarray(values, dtype=float)
        return [float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))]

    return {"ariCi95": ci(aris), "nmiCi95": ci(nmis), "n": len(nmis)}


def benjamini_hochberg(p_values: Sequence[float]) -> np.ndarray:
    """Benjamini-Hochberg adjusted q-values, returned in original order."""
    p = np.asarray(p_values, dtype=float)
    order = np.argsort(p)
    ranked = p[order]
    q_ranked = ranked * len(p) / np.arange(1, len(p) + 1)
    q_ranked = np.minimum.accumulate(q_ranked[::-1])[::-1]
    out = np.empty_like(q_ranked)
    out[order] = np.clip(q_ranked, 0.0, 1.0)
    return out


def write_metadata(path: Path, *, source: Path, feature_keys: Iterable[str], **extra) -> None:
    payload = {
        "source": str(source),
        "sourceSha256": file_sha256(source),
        "featureKeys": list(feature_keys),
        **extra,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
