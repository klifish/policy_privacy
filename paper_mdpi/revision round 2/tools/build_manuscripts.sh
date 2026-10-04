#!/usr/bin/env bash
# Build the two revised-manuscript PDFs for Revision Round 2:
#   output/manuscript_revised_marked.pdf  additions in red, deletions omitted
#   output/manuscript_revised_clean.pdf   the same source typeset in black
#   locations.tex                         page/line references for the letters
# Both come from one latexdiff source, so page and line numbers are identical and
# the locations cited in the response letters hold for either PDF.
# Baseline: commit efc5237, the first-round revision submitted in September 2026.
# Both PDFs are review copies and are anonymized (tools/anonymize.py); set ANONYMIZE=0
# for a version with the author information.
set -euo pipefail

BASE_COMMIT=${BASE_COMMIT:-efc5237}
ANONYMIZE=${ANONYMIZE:-1}
HERE=$(cd "$(dirname "$0")/.." && pwd)          # paper_mdpi/revision round 2
PAPER=$(cd "$HERE/.." && pwd)                   # paper_mdpi
ROOT=$(git -C "$PAPER" rev-parse --show-toplevel)
WORK="$ROOT/tmp/pdfs/revision-round-2/manuscript"
OUT="$HERE/output"

rm -rf "$WORK" && mkdir -p "$WORK/old" "$WORK/oldbuild" "$WORK/build" "$OUT"
git -C "$ROOT" archive "$BASE_COMMIT" paper_mdpi | tar -x -C "$WORK/old"

# Both .bbl files feed mark_bbl.py, which colors new or changed references. They are
# kept out of the source trees so latexdiff leaves \bibliography unflattened.
tectonic -X compile "$WORK/old/paper_mdpi/main.tex" --outdir "$WORK/oldbuild" --keep-intermediates >/dev/null
tectonic -X compile "$PAPER/main.tex" --outdir "$WORK/build" --keep-intermediates >/dev/null
trap 'rm -f "$PAPER/main_refs_tmp.bbl" "$PAPER/main_marked_tmp.tex" "$PAPER/main_clean_tmp.tex"' EXIT
python3 "$HERE/tools/mark_bbl.py" "$WORK/oldbuild/main.bbl" "$WORK/build/main.bbl" "$PAPER/main_refs_tmp.bbl"

latexdiff --flatten --math-markup=whole --graphics-markup=none --append-safecmd=xmark,cmark \
  --preamble="$HERE/tools/latexdiff_preamble.tex" \
  "$WORK/old/paper_mdpi/main.tex" "$PAPER/main.tex" > "$PAPER/main_marked_tmp.tex" 2> "$WORK/latexdiff.log"
python3 "$HERE/tools/drop_deleted_parbreaks.py" "$PAPER/main_marked_tmp.tex"
python3 "$HERE/tools/unmark_rewrapped_notes.py" "$PAPER/main_marked_tmp.tex"
python3 "$HERE/tools/color_added_floats.py" "$PAPER/main_marked_tmp.tex"
python3 "$HERE/tools/mark_frontmatter.py" "$WORK/old/paper_mdpi/sec_frontmatter.tex" "$PAPER/main_marked_tmp.tex"
# The review PDFs withhold the author identities, so the review copies do too.
if [ "$ANONYMIZE" = 1 ]; then
  python3 "$HERE/tools/anonymize.py" "$PAPER/main_marked_tmp.tex"
fi
sed -i '' 's/^\\bibliography{reference}$/\\input{main_refs_tmp.bbl}/' "$PAPER/main_marked_tmp.tex"
grep -q 'input{main_refs_tmp.bbl}' "$PAPER/main_marked_tmp.tex"
sed 's/\\color{red}/\\color{black}/g' "$PAPER/main_marked_tmp.tex" > "$PAPER/main_clean_tmp.tex"

for v in marked clean; do
  (cd "$PAPER" && tectonic -X compile "main_${v}_tmp.tex" --outdir "$WORK/build" >/dev/null)
  cp "$WORK/build/main_${v}_tmp.pdf" "$OUT/manuscript_revised_${v}.pdf"
done
echo "Wrote $OUT/manuscript_revised_marked.pdf and manuscript_revised_clean.pdf"

# Page/line references cited by the response letters.
python3 "$HERE/tools/locations.py" "$OUT/manuscript_revised_marked.pdf" "$WORK/build/main.bbl" "$HERE/locations.tex"
