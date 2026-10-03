"""Paired B1-vs-B2 scatter for the gas-padding ablation (supervised attacks).

Primary evidence for the ablation is the *whole* distribution of contrasts, not a
handful of hand-picked strong rows. Each supervised contrast contributes one point at

    x = |AUC_B1 - 0.5|   (unpadded deviation from chance)
    y = |AUC_B2 - 0.5|   (padded   deviation from chance)

Points below the y = x diagonal are contrasts where randomized access-gas padding moved
the attacker back toward chance. Points are colored by the sign of the bootstrap 95% CI
of deltaLeakage = |AUC_B1 - 0.5| - |AUC_B2 - 0.5|:

    reduce   : CI > 0   (padding removes a genuine signal)
    no eff.  : CI spans 0
    neg.     : CI < 0   (padded attacker slightly further from chance; only occurs where
               B1 is already near chance -- finite-sample movement, not created leakage)

Two panels: RF (primary criterion) and LR (robustness check). LR over-separates on the
near-constant execution features (see the SPP/PCH verdict methodology), so RF is the
reference; LR is shown only to confirm the same qualitative pattern.

Source of record:
  experiments/results/supervised/gas_padding_supervised_deltaLeakage.csv
Output:
  experiments/results/clustering/summary/ablation_paired_scatter.png
"""
import csv
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

from experiments.analysis.clustering.paper_style import use_paper_fonts
from experiments.analysis.paths import CLUSTERING_RESULTS_DIR, SUPERVISED_RESULTS_DIR

DELTA_CSV = SUPERVISED_RESULTS_DIR / "gas_padding_supervised_deltaLeakage.csv"
OUT_DIR = CLUSTERING_RESULTS_DIR / "summary"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FAMILIES = ["spp", "pch", "pi"]

# reduce / no-effect / negative is ordered by sign, so it is colored as a diverging
# scale: blue and red poles with a neutral gray midpoint (CVD-validated on white).
CAT_COLOR = {"reduce": "#2A78D6", "noeff": "#8F8E88", "neg": "#E34948"}
# the y = x reference and its "padding helps" label, in a hue no category uses
DIAG = "#4A3AA7"
DIAG_FILL = "#F4F3FB"
GRID = "#D9D8D2"
AXIS = "#52514E"
CAT_LABEL = {"reduce": "reduce (CI > 0)",
             "noeff": "no eff. (CI spans 0)",
             "neg": "neg. (CI < 0)"}


def categorize(ci95):
    lo, hi = ci95
    if lo > 0:
        return "reduce"
    if hi < 0:
        return "neg"
    return "noeff"


def collect():
    """Return {classifier: [ (family, x, y, cat, dleak_mean), ... ]}."""
    out = {"rf": [], "lr": []}
    with open(DELTA_CSV) as f:
        for r in csv.DictReader(f):
            clf = r["model"]
            if clf not in out:
                continue
            x = abs(float(r["aucMean_b1_unpadded"]) - 0.5)
            y = abs(float(r["aucMean_b2_padded"]) - 0.5)
            cat = categorize((float(r["ciLow"]), float(r["ciHigh"])))
            out[clf].append((r["experiment"], x, y, cat, float(r["deltaLeakage"])))
    return out


def counts(points):
    c = {"reduce": 0, "noeff": 0, "neg": 0}
    for _f, _x, _y, cat, _d in points:
        c[cat] += 1
    return c


def panel(ax, points, tag, hi):
    # reference diagonal y = x; the lower triangle is "padding helps"
    ax.plot([0, hi], [0, hi], color=DIAG, linewidth=1.0, linestyle="--", zorder=1)
    ax.fill_between([0, hi], [0, 0], [0, hi], color=DIAG_FILL, zorder=0)  # lower triangle
    ax.text(hi * 0.76, hi * 0.63, "padding helps (below diagonal)", fontsize=9,
            color=DIAG, ha="center", va="center", rotation=45, rotation_mode="anchor")

    # plot in a stable category order so colors layer predictably
    for cat in ("noeff", "reduce", "neg"):
        xs = [p[1] for p in points if p[3] == cat]
        ys = [p[2] for p in points if p[3] == cat]
        ax.scatter(xs, ys, s=42, color=CAT_COLOR[cat], edgecolor="white",
                   linewidth=0.6, zorder=3, alpha=0.9)

    ax.set_xlim(-0.01, hi)
    ax.set_ylim(-0.01, hi)
    ax.set_aspect("equal", adjustable="box")
    # bars and minus as text, not mathtext, which pads "|" like a relation
    ax.set_xlabel("|AUC$_{\\mathrm{B1}}$ \u2212 0.5|  (unpadded)")
    ax.set_ylabel("|AUC$_{\\mathrm{B2}}$ \u2212 0.5|  (padded)")
    ax.tick_params(labelleft=True, length=0)
    ax.grid(True, color=GRID, linewidth=0.6, zorder=1)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_color(AXIS)
    ax.spines["bottom"].set_color(AXIS)
    # panel tag under the x-axis label; the caption names (a) RF and (b) LR
    ax.text(0.5, -0.2, tag, transform=ax.transAxes, ha="center", va="top", fontsize=11)


def main():
    data = collect()
    use_paper_fonts(11)
    fig, (ax_rf, ax_lr) = plt.subplots(1, 2, figsize=(9.4, 4.8), sharey=True)

    # square axes sized to the largest deviation across both panels
    allpts = data["rf"] + data["lr"]
    hi = max(0.34, max(max(p[1], p[2]) for p in allpts) + 0.02)

    panel(ax_rf, data["rf"], "(a)", hi)
    panel(ax_lr, data["lr"], "(b)", hi)

    handles = [Line2D([0], [0], marker="o", linestyle="", markersize=8,
                      markerfacecolor=CAT_COLOR[k], markeredgecolor="white",
                      label=CAT_LABEL[k]) for k in ("reduce", "noeff", "neg")]
    handles.append(Line2D([0], [0], color=DIAG, linestyle="--", label="y = x"))
    fig.legend(handles=handles, loc="lower center", ncol=4, frameon=False,
               fontsize=9, bbox_to_anchor=(0.5, -0.04))

    fig.subplots_adjust(wspace=0.3, bottom=0.20, top=0.97)

    out = OUT_DIR / "ablation_paired_scatter.png"
    fig.savefig(out, dpi=220, bbox_inches="tight")
    print(f"wrote {out}")

    # -- console cross-check numbers (single source of truth for the prose/table) --
    for clf in ("rf", "lr"):
        pts = data[clf]
        c = counts(pts)
        below = sum(1 for _f, x, y, _c, _d in pts if y < x)
        xs = np.array([p[1] for p in pts])
        ys = np.array([p[2] for p in pts])
        print(f"[{clf}] n={len(pts)}  reduce={c['reduce']} noeff={c['noeff']} "
              f"neg={c['neg']}  below_diag={below} ({100*below/len(pts):.0f}%)  "
              f"median |B1-.5|={np.median(xs):.3f} -> |B2-.5|={np.median(ys):.3f}")
    # per-family median deltaLeakage (rf), for the prose aggregate
    print("per-family rf median deltaLeakage:")
    for fam in FAMILIES:
        ds = [p[4] for p in data["rf"] if p[0] == fam]
        print(f"  {fam}: median={np.median(ds):+.3f}  n={len(ds)}")


if __name__ == "__main__":
    main()
