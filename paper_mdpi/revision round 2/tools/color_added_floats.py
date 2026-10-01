"""Color floats that latexdiff marks as added in their entirety.

latexdiff opens such a float with \\DIFaddbegin and marks only its text, so math-only
table cells (for example, a new table of measurements) stay black. A float whose
block contains no deleted text is new as a whole and is colored throughout.
"""
import re
import sys

path = sys.argv[1]
src = open(path).read()
out, pos, n = [], 0, 0
for m in re.finditer(r'\\DIFaddbegin \\begin\{(table|figure)\}(\[[^\]]*\])?', src):
    end = src.index('\\end{%s}' % m.group(1), m.end())
    if '\\DIFdel' in src[m.end():end]:
        continue
    out.append(src[pos:m.end()] + '\\color{red}')
    pos, n = m.end(), n + 1
out.append(src[pos:])
open(path, 'w').write(''.join(out))
print(f'color_added_floats.py: {n} wholly added floats colored')
