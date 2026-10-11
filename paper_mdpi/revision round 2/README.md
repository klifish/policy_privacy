# Revision Round 2: response letters and revised manuscript

From the repository root, build everything with:

```sh
make -C "paper_mdpi/revision round 2" all
```

This writes to `output/`:

- `manuscript_revised_clean.pdf` and `manuscript_revised_marked.pdf`: the revised manuscript, clean and with new or revised text in red (deleted text is not shown). The baseline is commit `efc5237`, the first-round revision submitted in September 2026, so only second-round changes are marked.
  Both are anonymized review copies: `tools/anonymize.py` removes the author names, affiliations, correspondence address, and PDF author field, and withholds the author contributions and funding statements. Build with `ANONYMIZE=0` for a version with the author information; the LaTeX source itself is not changed.
- One letter per reviewer, `reviewerN_response.pdf`, once the entry points are listed in `SOURCES` in the `Makefile`.

`make manuscript` runs `tools/build_manuscripts.sh`, and `make letters` rebuilds only the letters.
`make source` writes `output/manuscript_revised_source.zip`, the LaTeX source for upload (a top-level `paper_mdpi/` folder, only the files the manuscript uses, author information kept), and checks that the extracted archive compiles on its own.
Run `make all` after any manuscript edit, because the letters cite page and line numbers.

Edit the manuscript source in `paper_mdpi/` as usual and do not color anything by hand: the red markup is generated from the diff against the baseline.

## How the pieces fit

The tools are those of Revision Round 1 with the baseline and build directory changed.

- Both manuscript PDFs are typeset from one `latexdiff` source; the clean PDF only switches red to black. Their page and line numbers are therefore identical.
- Tables that `latexdiff` treats as added in their entirety are colored as a whole by `tools/color_added_floats.py`, because `latexdiff` leaves their math-only cells unmarked. The additions macros start with `\leavevmode` so a colored `p{}` table cell keeps its row alignment.
- Table notes moved from `\noindent{\footnotesize{...}}` into the `tablenote` environment are unmarked by `tools/unmark_rewrapped_notes.py` when their text is unchanged, because `latexdiff` reads the old wrapper as one command and would otherwise mark the whole note as added.
- Only changed content is marked, not content that moved. `latexdiff` cannot follow a value into a new column or a legend from the caption into the table note, so `baseline_relayout/` holds the baseline versions of the tables whose layout changed in this round, with their baseline wording and values set in the new layout. `tools/build_manuscripts.sh` copies them over the baseline after compiling it and before running `latexdiff`. Each file's header comment says what was moved; when such a table changes layout again, update its file there.
- The abstract and keywords are marked by `tools/mark_frontmatter.py`, since MDPI sets them in the preamble, which `latexdiff` does not mark. References are marked by `tools/mark_bbl.py`: new entries entirely, and existing entries only in their added or edited blocks, such as DOIs.
- `tools/locations.py` finds each cited passage in the marked PDF by its opening and closing words and writes `locations.tex`. The responses cite passages as `\Loc{key}`; add each cited passage to `PASSAGES`, each cited table or figure to `FLOATS`, and each new reference to `NEW_REFS`. If an anchor phrase is edited away, the build stops with an error naming it.
- Each response lives in `responses/`, is included by its reviewer's entry point, and uses the shared layout in `response_style.tex`.

Temporary files are written to `tmp/pdfs/revision-round-2/`.
