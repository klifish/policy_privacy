# Reviewer response PDFs

The revision uses one independent LaTeX entry point per reviewer:

- `reviewer1_response.tex`
- `reviewer2_response.tex`
- `reviewer3_response.tex`

Shared typography and response environments are defined in `response_style.tex`.
Individual responses live under `responses/` and are included by the relevant reviewer entry point.

From the repository root, build all three PDFs with:

```sh
make -C "paper_mdpi/revision round 1" all
```

Or build one reviewer PDF with `reviewer1`, `reviewer2`, or `reviewer3` as the target.
Generated PDFs are written to `paper_mdpi/revision round 1/output/`.
Temporary compilation files remain under `tmp/pdfs/revision-round-1/`.

Use the `revisiontext` environment for manuscript excerpts that must appear in red under the journal's response template.
Add page and line references only after the revised manuscript pagination is stable.
