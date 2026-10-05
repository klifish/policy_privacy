"""Remove author-identifying front and back matter from a flattened manuscript source.

The journal withholds author identities from reviewers: the first-round review PDF,
which the editorial office compiled from our LaTeX source, has no author names,
affiliations, or correspondence address, and an empty PDF author field. The
review copies built here must match. The LaTeX source uploaded for production keeps
the author information, so only the flattened build source is edited.

Self-citations in the reference list stay, as they did in the first-round review PDF.

Usage: python3 anonymize.py FLATTENED_TEX
"""
import re
import sys

# Macro -> replacement for its (last) mandatory argument.
BLANK = {
    '\\Author': '',
    '\\AuthorNames': '',
    '\\address': '',
    '\\corres': '',
    '\\authorcontributions': 'Withheld for review.',
    '\\funding': 'Withheld for review.',
    '\\acknowledgments': 'Withheld for review.',
}

# The archive record on Zenodo names the authors, so its link is withheld too. latexdiff
# leaves \url outside its added-text markup, so the replacement is marked as added.
ARCHIVE_LINK = re.compile(r'\\url\{https://doi\.org/10\.5281/zenodo\.\d+\}')


def argument_span(text, start):
    """Return (open, close) indices of the brace group that begins at text[start]."""
    assert text[start] == '{', text[start:start + 20]
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == '\\':
            continue
        if c == '{' and text[i - 1] != '\\':
            depth += 1
        elif c == '}' and text[i - 1] != '\\':
            depth -= 1
            if depth == 0:
                return start, i
    raise SystemExit(f'anonymize.py: unbalanced braces after position {start}')


def blank_macro(text, macro, replacement):
    count = 0
    pos = 0
    while True:
        i = text.find(macro, pos)
        if i < 0:
            return text, count
        j = i + len(macro)
        if j < len(text) and text[j].isalpha():  # a longer macro name, e.g. \AuthorNames for \Author
            pos = j
            continue
        if text[j:j + 1] == '[':                  # optional argument, e.g. \address[1]{...}
            j = text.index(']', j) + 1
        while text[j] in ' \t':
            j += 1
        if text[j] != '{':                        # a mention inside a comment or definition
            pos = j
            continue
        open_, close = argument_span(text, j)
        text = text[:open_ + 1] + replacement + text[close:]
        count += 1
        pos = open_ + 1 + len(replacement) + 1


def main(path):
    text = open(path).read()
    for macro, replacement in BLANK.items():
        text, n = blank_macro(text, macro, replacement)
        if n != 1 and macro in ('\\Author', '\\AuthorNames', '\\address', '\\corres'):
            raise SystemExit(f'anonymize.py: expected one {macro}, found {n}')
    text, n = ARCHIVE_LINK.subn(r'\\DIFadd{[link withheld for review]}', text)
    if n != 1:
        raise SystemExit(f'anonymize.py: expected one Zenodo link, found {n}')
    open(path, 'w').write(text)
    print(f'anonymize.py: author information removed from {path}')


if __name__ == '__main__':
    main(sys.argv[1])
