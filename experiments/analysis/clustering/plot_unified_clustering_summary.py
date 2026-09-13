"""Unified cross-property clustering summary figure (PCH / PI / SPP).

Replaces the three heterogeneous per-experiment plots with one publication-style figure
in a single coordinate system: every clustering target on one axis, grouped and shaded
by privacy property, ARI (top) and NMI (bottom), with a y=0 reference line. Values are
the of-record numbers behind Table `tab:clustering-summary`, read from the same CSVs:

  PCH-DUO   : pch_clustering_analysis/pch_global_duo_clustering.csv
  PCH-ICD10 : pch_clustering_analysis/pch_global_icd10_clustering.csv
  PI        : pi_clustering_analysis/pi_balanced_debiased.csv   (mean over 133 pairs)
  SPP       : spp_clustering_analysis/spp_clustering_summary.csv

Output: experiments/results/clustering/summary/clustering_summary_unified.png
"""
import csv
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

from experiments.analysis.paths import CLUSTERING_RESULTS_DIR

RESULTS = CLUSTERING_RESULTS_DIR
OUT_DIR = RESULTS / "summary"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# soft, muted palette (one hue per property)
COLORS = {"PCH": "#5B8FB0", "PI": "#E0925F", "SPP": "#6DA86F"}
BAND = {"PCH": "#F2F6F8", "PI": "#FBF3EC", "SPP": "#F1F7F1"}


def read_rows(path):
    with open(path) as f:
        return list(csv.DictReader(f))


def collect():
    rows = []
    duo = read_rows(RESULTS / "pch/pch_global_duo_clustering.csv")[0]
    rows.append(("PCH", "DUO", float(duo["kmeans_ari"]), float(duo["kmeans_nmi"])))
    icd = read_rows(RESULTS / "pch/pch_global_icd10_clustering.csv")[0]
    rows.append(("PCH", "ICD-10", float(icd["kmeans_ari"]), float(icd["kmeans_nmi"])))

    pi = read_rows(RESULTS / "pi/pi_balanced_debiased.csv")
    pi_ari = float(np.mean([float(r["observed_ari"]) for r in pi]))
    pi_nmi = float(np.mean([float(r["observed_nmi"]) for r in pi]))
    rows.append(("PI", "pairs", pi_ari, pi_nmi))

    spp_short = {
        "logicStructure": "logic",
        "nestingDepth": "depth",
        "predicateCount": "preds",
        "setSize": "setSize",
    }
    for r in read_rows(RESULTS / "spp/spp_clustering_summary.csv"):
        lbl = spp_short.get(r["target"], r["target"])
        rows.append(("SPP", lbl, float(r["kmeans_ari"]), float(r["kmeans_nmi"])))
    return rows


def grouped_positions(props):
    """x positions with a gap between property groups."""
    pos, x, gap = [], 0.0, 0.8
    prev = None
    spans = {}
    for p in props:
        if prev is not None and p != prev:
            x += gap
        pos.append(x)
        spans.setdefault(p, []).append(x)
        x += 1.0
        prev = p
    return np.array(pos), spans


def main():
    rows = collect()
    props = [r[0] for r in rows]
    labels = [r[1] for r in rows]
    ari = np.array([r[2] for r in rows])
    nmi = np.array([r[3] for r in rows])
    bar_colors = [COLORS[p] for p in props]
    pos, spans = grouped_positions(props)

    plt.rcParams.update({"font.size": 11, "axes.titlesize": 12})
    fig, (ax_a, ax_n) = plt.subplots(2, 1, figsize=(7.2, 5.0), sharex=True)

    for ax, vals, name in [(ax_a, ari, "ARI"), (ax_n, nmi, "NMI")]:
        # shaded property bands behind the bars
        for p, xs in spans.items():
            ax.axvspan(min(xs) - 0.5, max(xs) + 0.5, color=BAND[p], zorder=0)
        bars = ax.bar(pos, vals, width=0.62, color=bar_colors,
                      edgecolor="white", linewidth=0.6, zorder=3)
        ax.axhline(0, color="#444444", linewidth=0.9, zorder=2)
        m = max(0.024, float(np.abs(np.concatenate([ari, nmi])).max()) * 1.25)
        ax.set_ylim(-m, m)
        ax.set_ylabel(name, fontweight="bold")
        ax.grid(axis="y", linestyle=":", alpha=0.45, zorder=1)
        # value labels at bar tips
        for b, v in zip(bars, vals):
            off = m * 0.06
            ax.text(b.get_x() + b.get_width() / 2,
                    v + (off if v >= 0 else -off), f"{v:+.4f}",
                    ha="center", va="bottom" if v >= 0 else "top", fontsize=7.5,
                    color="#333333")
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        ax.spines["left"].set_color("#888888")
        ax.tick_params(length=0)

    # property group names under the x-axis
    ax_n.set_xticks(pos)
    ax_n.set_xticklabels(labels, fontsize=9)
    for p, xs in spans.items():
        ax_n.text(np.mean(xs), -m * 1.42, p, ha="center", va="top",
                  fontsize=11, fontweight="bold", color=COLORS[p])

    ax_a.set_title("Unsupervised K-Means clustering by target  (closer to 0 = no leakage)",
                   pad=8)
    legend = [Patch(facecolor=COLORS[k], label=k) for k in ("PCH", "PI", "SPP")]
    ax_a.legend(handles=legend, loc="upper right", ncol=3, frameon=False,
                fontsize=9, handlelength=1.1)

    fig.subplots_adjust(hspace=0.12, bottom=0.16, top=0.92)
    out = OUT_DIR / "clustering_summary_unified.png"
    fig.savefig(out, dpi=220, bbox_inches="tight")
    print(f"wrote {out}")
    for p, l, a, n in rows:
        print(f"  {p:4s} {l:8s} ARI={a:+.4f} NMI={n:+.4f}")


if __name__ == "__main__":
    main()
