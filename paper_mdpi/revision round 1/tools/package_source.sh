#!/usr/bin/env bash
# Package the LaTeX source of the revised manuscript for upload:
#   output/manuscript_revised_source.zip
# The layout matches the first-round submission (a top-level paper_mdpi/ folder with
# main.tex, the section and table files, reference.bib, Definitions/, and figures/),
# restricted to the files the manuscript uses. The source keeps the author
# information, which production needs; the review PDFs in output/ are anonymized.
# The archive is extracted and compiled once to check that it is self-contained.
set -euo pipefail

HERE=$(cd "$(dirname "$0")/.." && pwd)          # paper_mdpi/revision round 1
PAPER=$(cd "$HERE/.." && pwd)                   # paper_mdpi
ROOT=$(git -C "$PAPER" rev-parse --show-toplevel)
STAGE="$ROOT/tmp/pdfs/revision-round-1/source"
OUT="$HERE/output/manuscript_revised_source.zip"

rm -rf "$STAGE" && mkdir -p "$STAGE/paper_mdpi/figures" "$STAGE/check"
cd "$PAPER"
cp main.tex evaluation.tex sec_*.tex reference.bib "$STAGE/paper_mdpi/"
cp -R tables Definitions "$STAGE/paper_mdpi/"
# Only the figures the manuscript includes (\graphicspath resolves them in figures/).
grep -ho '\\includegraphics\(\[[^]]*\]\)\?{[^}]*}' *.tex tables/*.tex |
  sed 's/.*{\(.*\)}/\1/' | sort -u |
  while read -r fig; do cp "figures/$fig" "$STAGE/paper_mdpi/figures/"; done
find "$STAGE" -name .DS_Store -delete

rm -f "$OUT"
(cd "$STAGE" && zip -qrX "$OUT" paper_mdpi)

# Compile a fresh extraction of the archive on its own.
mkdir -p "$STAGE/check/unzipped"
unzip -q "$OUT" -d "$STAGE/check/unzipped"
(cd "$STAGE/check/unzipped/paper_mdpi" && tectonic -X compile main.tex --outdir "$STAGE/check" >/dev/null 2>&1) ||
  { echo "package_source.sh: the packaged source does not compile" >&2; exit 1; }
echo "Wrote $OUT ($(unzip -l "$OUT" | tail -1 | awk '{print $2}') files; compiles to $(pdfinfo "$STAGE/check/main.pdf" | awk '/^Pages/{print $2}') pages)"
