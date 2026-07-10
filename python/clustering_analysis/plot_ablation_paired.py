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
  experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json
Output:
  python/results/clustering_summary/ablation_paired_scatter.png
"""
import json
from pathlib import Path
import numpy as np
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D

REPO = Path(__file__).resolve().parents[2]
REPORT = REPO / "experiments/ablation/gas_padding/polygonAmoy/comparison/ablation_report.json"
OUT_DIR = REPO / "python/results/clustering_summary"
OUT_DIR.mkdir(parents=True, exist_ok=True)

FAMILIES = ["spp", "pch", "pi"]

# reduce / no-effect / negative  (muted palette, consistent with the clustering figure)
CAT_COLOR = {"reduce": "#6DA86F", "noeff": "#9AA0A6", "neg": "#D26B5B"}
CAT_LABEL = {"reduce": "reduce (CI $>$ 0)",
             "noeff": "no eff. (CI spans 0)",
             "neg": "neg. (CI $<$ 0)"}


def categorize(ci95):
    lo, hi = ci95
    if lo > 0:
        return "reduce"
    if hi < 0:
        return "neg"
    return "noeff"


def collect():
    """Return {classifier: [ (family, x, y, cat, dleak_mean), ... ]}."""
    d = json.loads(REPORT.read_text())
    out = {"rf": [], "lr": []}
    for fam in FAMILIES:
        for t in d["supervised"][fam]["tasks"]:
            clf = t["classifier"]
            x = abs(t["b1AucMean"] - 0.5)
            y = abs(t["b2AucMean"] - 0.5)
            cat = categorize(t["deltaLeakage"]["ci95"])
            out[clf].append((fam, x, y, cat, t["deltaLeakage"]["mean"]))
    return out


def counts(points):
    c = {"reduce": 0, "noeff": 0, "neg": 0}
    for _f, _x, _y, cat, _d in points:
        c[cat] += 1
    return c


def panel(ax, points, title, subtitle):
    c = counts(points)
    n = len(points)
    # reference diagonal y = x; the lower triangle is "padding helps"
    hi = 0.34
    ax.plot([0, hi], [0, hi], color="#555555", linewidth=1.0, linestyle="--", zorder=1)
    ax.fill_between([0, hi], [0, 0], [0, hi], color="#F4F7F4", zorder=0)  # lower triangle
    ax.text(0.26, 0.215, "padding helps (below diagonal)", fontsize=9,
            color="#3d3d3d", ha="center", va="center", style="italic",
            rotation=45, rotation_mode="anchor")

    # plot in a stable category order so colors layer predictably
    for cat in ("noeff", "reduce", "neg"):
        xs = [p[1] for p in points if p[3] == cat]
        ys = [p[2] for p in points if p[3] == cat]
        ax.scatter(xs, ys, s=42, color=CAT_COLOR[cat], edgecolor="white",
                   linewidth=0.6, zorder=3, alpha=0.9)

    ax.set_xlim(-0.01, hi)
    ax.set_ylim(-0.01, hi)
    ax.set_aspect("equal", adjustable="box")
    ax.set_xlabel(r"$|\mathrm{AUC}_{B1}-0.5|$  (unpadded)")
    ax.grid(True, linestyle=":", alpha=0.4, zorder=1)
    for side in ("top", "right"):
        ax.spines[side].set_visible(False)
    ax.spines["left"].set_color("#888888")
    ax.spines["bottom"].set_color("#888888")
    ax.tick_params(length=0)
    counts_str = (f"{c['reduce']} reduce / {c['noeff']} no eff. / {c['neg']} neg."
                  f"   (n={n})")
    ax.set_title(f"{title}\n{counts_str}\n{subtitle}", fontsize=10, pad=8)


def main():
    data = collect()
    plt.rcParams.update({"font.size": 11, "axes.titlesize": 11})
    fig, (ax_rf, ax_lr) = plt.subplots(1, 2, figsize=(9.4, 4.8), sharey=True)

    panel(ax_rf, data["rf"], "Random forest (primary)",
          "reference criterion")
    panel(ax_lr, data["lr"], "Logistic regression (robustness)",
          "over-separates on near-constant features")

    ax_rf.set_ylabel(r"$|\mathrm{AUC}_{B2}-0.5|$  (padded)")

    handles = [Line2D([0], [0], marker="o", linestyle="", markersize=8,
                      markerfacecolor=CAT_COLOR[k], markeredgecolor="white",
                      label=CAT_LABEL[k]) for k in ("reduce", "noeff", "neg")]
    handles.append(Line2D([0], [0], color="#555555", linestyle="--", label=r"$y=x$"))
    fig.legend(handles=handles, loc="lower center", ncol=4, frameon=False,
               fontsize=9, bbox_to_anchor=(0.5, -0.02))

    fig.suptitle("Gas-padding ablation: per-contrast deviation from chance, B1 (unpadded) "
                 "vs B2 (padded)", fontsize=12, y=1.0)
    fig.subplots_adjust(wspace=0.08, bottom=0.20, top=0.82)

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
