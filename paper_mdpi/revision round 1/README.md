# Revision Round 1: response letters and revised manuscript

From the repository root, build everything with:

```sh
make -C "paper_mdpi/revision round 1" all
```

This writes to `output/`:

- `manuscript_revised_clean.pdf` and `manuscript_revised_marked.pdf`: the revised manuscript, clean and with new or revised text in red (deleted text is not shown). The baseline is commit `57142fe`, the version submitted on 13 July 2026.
  Both are anonymized review copies: `tools/anonymize.py` removes the author names, affiliations, correspondence address, and PDF author field, and withholds the author contributions and funding statements, because the first-round review PDF withheld the author identities. Build with `ANONYMIZE=0` for a version with the author information; the LaTeX source itself is not changed.
- `reviewer1_response.pdf`, `reviewer2_response.pdf`, `reviewer3_response.pdf`: one letter per reviewer.

`make manuscript` runs `tools/build_manuscripts.sh`, and `make letters` rebuilds only the letters.
Run `make all` after any manuscript edit, because the letters cite page and line numbers.

## How the pieces fit

- Both manuscript PDFs are typeset from one `latexdiff` source; the clean PDF only switches red to black. Their page and line numbers are therefore identical.
- Tables that `latexdiff` treats as added in their entirety are colored as a whole by `tools/color_added_floats.py`, because `latexdiff` leaves their math-only cells unmarked. The additions macros start with `\leavevmode` so a colored `p{}` table cell keeps its row alignment.
- The abstract and keywords are marked by `tools/mark_frontmatter.py`, since MDPI sets them in the preamble, which `latexdiff` does not mark. References are marked by `tools/mark_bbl.py`: new entries entirely, and existing entries only in their added or edited blocks, such as DOIs.
- `tools/locations.py` finds each cited passage in the marked PDF by its opening and closing words and writes `locations.tex`. The responses cite passages as `\Loc{key}`. If an anchor phrase is edited away, the build stops with an error naming it; update the anchor in `PASSAGES`.
- Each response lives in `responses/`, is included by its reviewer's entry point, and uses the shared layout in `response_style.tex`.

Temporary files are written to `tmp/pdfs/revision-round-1/`.
