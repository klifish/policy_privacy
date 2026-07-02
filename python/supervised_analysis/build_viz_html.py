#!/usr/bin/env python3
"""Inline viz_data.json into the self-contained PCH protocol dashboard.

Re-run after regenerating viz_data.json (via viz_probe.py) to refresh the HTML:

    ../.venv/bin/python viz_probe.py --seeds 30
    ../.venv/bin/python build_viz_html.py

Produces a single standalone HTML file (data embedded, no external requests)
that opens directly in a browser.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Mirror viz_probe.py's OUTPUT_DIR: python/results/supervised_analysis.
RESULTS = HERE.parent / "results" / "supervised_analysis"
DEFAULT_TEMPLATE = HERE / "pch_protocol_viz.template.html"
DEFAULT_DATA = RESULTS / "viz_data.json"
DEFAULT_OUT = RESULTS / "pch_protocol_viz.html"

MARKER_START = "/*__DATA__*/"
MARKER_END = "/*__END__*/"


def main() -> None:
    ap = argparse.ArgumentParser(description="Inline viz_data.json into the standalone dashboard")
    ap.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE)
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()

    template = args.template.read_text(encoding="utf-8")
    data = json.loads(args.data.read_text(encoding="utf-8"))
    payload = json.dumps(data, separators=(",", ":"))

    start = template.index(MARKER_START)
    end = template.index(MARKER_END) + len(MARKER_END)
    html = template[:start] + payload + template[end:]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(html, encoding="utf-8")
    print(f"Dashboard -> {args.out}  ({len(html)//1024} KB, self-contained)")


if __name__ == "__main__":
    main()
