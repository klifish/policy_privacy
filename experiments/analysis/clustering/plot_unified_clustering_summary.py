"""Unified cross-property clustering summary figure (PCH / PI / SPP).

Replaces the three heterogeneous per-experiment plots with one publication-style figure
in a single coordinate system: every clustering target on one axis, grouped by privacy
property and separated by dashed lines, ARI (top) and NMI (bottom), with a y=0 reference line. Values are
the of-record numbers behind Table `tab:clustering-summary`, read from the same CSVs:

  PCH-DUO   : pch/pch_global_duo_clustering.csv
  PCH-ICD10 : pch/pch_global_icd10_clustering.csv
  PI        : pi/pi_balanced_debiased.csv   (mean over 127 balanced pairs)
  SPP       : spp/spp_clustering_summary.csv

SPP targets are labeled with the supervised axis names used in the paper, in the
table's row order.

Output: experiments/results/clustering/summary/clustering_summary_unified.png
"""
import csv
import re
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

from experiments.analysis.clustering.paper_style import mono_font, use_paper_fonts
from experiments.analysis.paths import CLUSTERING_RESULTS_DIR

RESULTS = CLUSTERING_RESULTS_DIR
OUT_DIR = RESULTS / "summary"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# one hue per property (categorical slots 1-3, CVD-validated all-pairs on white)
COLORS = {"PCH": "#2A78D6", "PI": "#EB6834", "SPP": "#1BAF7A"}
INK = "#333333"
MUTED = "#52514E"
GRID = "#D9D8D2"


def signed(v):
    """+0.0021 / \u22120.0005 with a typographic minus, as in the table."""
    return f"{v:+.4f}".replace("-", "\u2212")


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

    # raw CSV field -> supervised axis name (same mapping as tab:clustering-summary)
    spp_axes = [
        ("logicStructure", "structureType"),
        ("predicateCount", "predicateCombo"),
        ("setSize", "paramType"),
        ("nestingDepth", "nestingDepth"),
    ]
    spp = {r["target"]: r for r in read_rows(RESULTS / "spp/spp_clustering_summary.csv")}
    for field, lbl in spp_axes:
        r = spp[field]
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

    use_paper_fonts(11)
    fig, (ax_a, ax_n) = plt.subplots(2, 1, figsize=(7.2, 5.0), sharex=True)

    for ax, vals, name in [(ax_a, ari, "ARI"), (ax_n, nmi, "NMI")]:
        # dashed separators midway between adjacent property groups
        groups = list(spans.values())
        for left, right in zip(groups, groups[1:]):
            ax.axvline((max(left) + min(right)) / 2, color=MUTED, linewidth=0.8,
                       linestyle=(0, (4, 3)), zorder=1)
        bars = ax.bar(pos, vals, width=0.62, color=bar_colors,
                      edgecolor="white", linewidth=0.6, zorder=3)
        ax.axhline(0, color=MUTED, linewidth=0.9, zorder=2)
        m = max(0.024, float(np.abs(np.concatenate([ari, nmi])).max()) * 1.25)
        ax.set_ylim(-m, m)
        ax.set_ylabel(name)
        ax.grid(axis="y", color=GRID, linewidth=0.6, zorder=1)
        # value labels at bar tips
        for b, v in zip(bars, vals):
            off = m * 0.06
            ax.text(b.get_x() + b.get_width() / 2,
                    v + (off if v >= 0 else -off), signed(v),
                    ha="center", va="bottom" if v >= 0 else "top", fontsize=7.5,
                    color=INK)
        for side in ("top", "right"):
            ax.spines[side].set_visible(False)
        ax.spines["left"].set_color(GRID)
        ax.spines["bottom"].set_color(MUTED)
        ax.tick_params(length=0)

    # property group names under the x-axis
    ax_n.set_xticks(pos)
    # break camelCase axis names onto two lines so adjacent labels do not collide
    wrapped = [re.sub(r"([a-z])([A-Z])", r"\1\n\2", l) for l in labels]
    ax_n.set_xticklabels(wrapped, fontsize=8.5, color=INK, linespacing=1.1)
    # SPP axis names are code identifiers (\texttt in the table and text)
    mono = mono_font(8)
    for tick, p in zip(ax_n.get_xticklabels(), props):
        if p == "SPP":
            tick.set_fontproperties(mono)
    for p, xs in spans.items():
        ax_n.text(np.mean(xs), -m * 1.6, p, ha="center", va="top",
                  fontsize=11, color=MUTED)

    legend = [Patch(facecolor=COLORS[k], label=k) for k in ("PCH", "PI", "SPP")]
    ax_a.legend(handles=legend, loc="upper right", ncol=3, frameon=False,
                fontsize=9, handlelength=1.1)

    fig.subplots_adjust(hspace=0.12, bottom=0.16, top=0.97)
    out = OUT_DIR / "clustering_summary_unified.png"
    fig.savefig(out, dpi=220, bbox_inches="tight")
    print(f"wrote {out}")
    for p, l, a, n in rows:
        print(f"  {p:4s} {l:8s} ARI={a:+.4f} NMI={n:+.4f}")


if __name__ == "__main__":
    main()
