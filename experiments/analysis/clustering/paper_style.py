"""Typefaces shared by the paper figures, matched to the MDPI manuscript.

mdpi.cls loads mathpazo (URW Palladio L, a Palatino clone) for the text, and \\texttt
renders in Latin Modern Mono. Labels stay regular weight and math stays upright:
matplotlib reads only the first (regular) face of macOS Palatino.ttc.
"""
from pathlib import Path

import matplotlib.pyplot as plt
from matplotlib import font_manager

SERIF = ["Palatino", "TeX Gyre Pagella", "URW Palladio L", "P052", "DejaVu Serif"]


def use_paper_fonts(size=11):
    """Palatino for text and mathtext, with a typographic minus."""
    plt.rcParams.update({
        "font.size": size,
        "font.family": "serif",
        "font.serif": SERIF,
        "axes.unicode_minus": True,
        "mathtext.fontset": "custom",
        "mathtext.rm": SERIF[0],
        "mathtext.it": SERIF[0],
        "mathtext.bf": SERIF[0],
    })


def find_lm_mono():
    """Latin Modern Mono from the local Tectonic bundle cache (macOS or Linux), if any."""
    for cache in (Path.home() / "Library/Caches/Tectonic", Path.home() / ".cache/Tectonic"):
        hits = sorted(cache.glob("bundles/data/*/lmmono10-regular.otf"))
        if hits:
            return hits[0]
    return None


def mono_font(size):
    path = find_lm_mono()
    if path is None:
        print("warning: Latin Modern Mono not found; code identifiers fall back to monospace")
        return font_manager.FontProperties(family="monospace", size=size)
    return font_manager.FontProperties(fname=str(path), size=size)
