"""Mark revised abstract words and keywords in red.

MDPI declares \\abstract{} and \\keyword{} in the preamble, which latexdiff copies
from the new version without markup. This compares them with the submitted
front matter: an abstract word that the submitted abstract does not have at that
point is red, and deleted words are not shown; a keyword is red unless it appears
verbatim (up to whitespace) in the submitted version.

Usage: python3 mark_frontmatter.py OLD_FRONTMATTER_TEX DIFF_TEX
"""
import difflib
import re
import sys


def braced(text, command):
    """Return (start, end) of the argument of the first uncommented \\command{...}.

    latexdiff keeps the old preamble line as a %DIF < comment, so it is skipped.
    """
    m = re.search(r'(?m)^[ \t]*\\' + command + r'\{', text)
    if not m:
        sys.exit(f'mark_frontmatter.py: \\{command} not found')
    depth, i = 1, m.end()
    while depth:
        depth += {'{': 1, '}': -1}.get(text[i], 0)
        i += 1
    return m.end(), i - 1


def norm(s):
    # Drop latexdiff's "%DIF >" line markers, which would otherwise comment out
    # the rest of an argument once its lines are joined.
    return ' '.join(re.sub(r'(?<!\\)%DIF[^\n]*', ' ', s).split())


def words(s):
    """Split on whitespace, keeping each $...$ and {...} group within one word."""
    s, out, i = norm(s), [], 0
    while i < len(s):
        if s[i].isspace():
            i += 1
            continue
        j = i
        while j < len(s) and not s[j].isspace():
            if s[j] == '$':
                j = s.index('$', j + 1)
            elif s[j] == '{':
                depth = 1
                while depth:
                    j += 1
                    depth += {'{': 1, '}': -1}.get(s[j], 0)
            j += 1
        out.append(s[i:j])
        i = j
    return out


def mark_words(old, new):
    """Return new with the words absent from old in red; deleted words are dropped."""
    old_w, new_w = words(old), words(new)
    out = []
    for op, _, _, j0, j1 in difflib.SequenceMatcher(None, old_w, new_w, autojunk=False).get_opcodes():
        if op == 'equal':
            out += new_w[j0:j1]
        elif j1 > j0:
            out.append('{' + RED + ' '.join(new_w[j0:j1]) + '}')
    return ' '.join(out)


# The class copies \\abstract and \\keyword into the PDF subject and keywords; hide the
# color switch from those strings, where hyperref would print its argument as text.
RED = '\\texorpdfstring{\\color{red}}{}'

old = open(sys.argv[1]).read()
diff_path = sys.argv[2]
new = open(diff_path).read()

a0, a1 = braced(old, 'abstract')
b0, b1 = braced(new, 'abstract')
new = new[:b0] + mark_words(old[a0:a1], new[b0:b1]) + new[b1:]

k0, k1 = braced(old, 'keyword')
old_keywords = {norm(k) for k in old[k0:k1].split(';')}
c0, c1 = braced(new, 'keyword')
marked_keywords = '; '.join(norm(k) if norm(k) in old_keywords else '{' + RED + norm(k) + '}'
                            for k in new[c0:c1].split(';'))
new = new[:c0] + marked_keywords + new[c1:]

open(diff_path, 'w').write(new)
