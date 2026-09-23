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
    if key not in old:
        colored = head + '\\color{red}' + body + '\\color{black}'
        n_new += 1
    else:
        old_blocks = {norm(b) for b in re.split(r'\\newblock', old[key])}
        parts = re.split(r'(\\newblock)', body)
        out = []
        for part in parts:
            if part == '\\newblock' or not part.strip():
                out.append(part)
            elif norm(part) in old_blocks or norm(head + part) in old_blocks:
                out.append('\\color{black}' + part)
            else:
                out.append('\\color{red}' + part + '\\color{black}')
        colored = head + ''.join(out)
        n_edit += colored != head + ''.join('\\color{black}' + p if p.strip() and p != '\\newblock' else p for p in parts)
    marked = marked.replace(item, colored, 1)
open(dest, 'w').write(marked)
print(f'references: {n_new} new, {n_edit} edited, {len(new)} total')
