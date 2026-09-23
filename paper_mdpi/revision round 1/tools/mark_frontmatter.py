"""Mark revised abstract sentences and keywords in red.

MDPI declares \\abstract{} and \\keyword{} in the preamble, which latexdiff copies
from the new version without markup. This compares them with the submitted
front matter: an abstract sentence or a keyword is red unless it appears
verbatim (up to whitespace) in the submitted version.

Usage: python3 mark_frontmatter.py OLD_FRONTMATTER_TEX DIFF_TEX
"""
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


def sentences(s):
    return [p for p in re.split(r'(?<=[.;])\s+(?=[A-Z])', norm(s)) if p]


old = open(sys.argv[1]).read()
diff_path = sys.argv[2]
new = open(diff_path).read()

a0, a1 = braced(old, 'abstract')
old_abstract = set(sentences(old[a0:a1]))
b0, b1 = braced(new, 'abstract')
marked_abstract = ' '.join(s if s in old_abstract else '{\\color{red}' + s + '}'
                           for s in sentences(new[b0:b1]))
new = new[:b0] + marked_abstract + new[b1:]

k0, k1 = braced(old, 'keyword')
old_keywords = {norm(k) for k in old[k0:k1].split(';')}
c0, c1 = braced(new, 'keyword')
marked_keywords = '; '.join(norm(k) if norm(k) in old_keywords else '{\\color{red}' + norm(k) + '}'
                            for k in new[c0:c1].split(';'))
new = new[:c0] + marked_keywords + new[c1:]

open(diff_path, 'w').write(new)
