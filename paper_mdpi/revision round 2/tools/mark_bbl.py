"""Write the revised bibliography with new or changed text in red.

latexdiff's own .bbl flattening treats a moved entry as a deletion plus an
addition, which leaves a stray \\bibitem and shifts every later citation number.
Comparing entries by key keeps the numbering identical to the clean build.
New entries are red throughout; in existing entries only the \\newblock
segments that were added or edited (for example, a DOI line) are red.
"""
import re
import sys

def entries(path):
    text = open(path).read()
    body = text.split('\\begin{thebibliography}', 1)[1].rsplit('\\end{thebibliography}', 1)[0]
    head, *items = re.split(r'(?=\\bibitem)', body)
    out = {}
    for item in items:
        key = re.match(r'\\bibitem(?:\[.*?\])?\{([^}]*)\}', item, re.S).group(1)
        out[key] = item
    return text, out

def red(part):
    """Wrap one \\newblock segment in a red group, keeping its trailing whitespace."""
    text = part.rstrip()
    return '{\\leavevmode\\color{red}' + text + '}' + part[len(text):]

def norm(s):
    return ' '.join(s.split())

old_path, new_path, dest = sys.argv[1:4]
_, old = entries(old_path)
new_text, new = entries(new_path)
marked = new_text
n_new = n_edit = 0
for key, item in new.items():
    m = re.match(r'\\bibitem(?:\[.*?\])?\{[^}]*\}\s*', item, re.S)
    head, body = item[:m.end()], item[m.end():]
    old_blocks = set() if key not in old else {norm(b) for b in re.split(r'\\newblock', old[key])}
    # Unchanged segments stay as they are. An explicit \color{black} on them is not
    # needed, and under XeTeX each bare \color pushes onto the color stack until the
    # list ends; across a page break the stack underflows and drops the red of the
    # new entries.
    out = []
    for part in re.split(r'(\\newblock)', body):
        if part == '\\newblock' or not part.strip() or norm(part) in old_blocks \
                or norm(head + part) in old_blocks:
            out.append(part)
        else:
            out.append(red(part))
    colored = head + ''.join(out)
    if key not in old:
        n_new += 1
    elif colored != item:
        n_edit += 1
    marked = marked.replace(item, colored, 1)
open(dest, 'w').write(marked)
print(f'references: {n_new} new, {n_edit} edited, {len(new)} total')
