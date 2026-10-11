import re, sys


def group_end(s, i):
    """Index of the brace that closes the group opened at s[i]; comments are skipped."""
    depth = 0
    while i < len(s):
        c = s[i]
        if c == '\\':
            i += 2
            continue
        if c == '%':
            i = s.find('\n', i)
            if i < 0:
                return -1
            continue
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def drop_hidden_groups(block):
    """Drop each {%DIFAUXCMD ...} group that holds only hidden \\DIFdelFL text, together
    with the space and %DIFAUXCMD marker after it."""
    out, pos = [], 0
    while True:
        j = block.find('{%DIFAUXCMD', pos)
        k = group_end(block, j) if j >= 0 else -1
        if k < 0:
            break
        visible = block[j:k + 1]
        while (d := visible.find('\\DIFdelFL{')) >= 0:
            visible = visible[:d] + visible[group_end(visible, d + len('\\DIFdelFL')) + 1:]
        visible = re.sub(r'\\[a-zA-Z]+', '', re.sub(r'%[^\n]*', '', visible))
        if visible.strip('{} \t\n'):
            out.append(block[pos:k + 1])
            pos = k + 1
            continue
        out.append(block[pos:j])
        marker = re.match(r'[ \t]*%DIFAUXCMD', block[k + 1:])
        pos = k + 1 + (marker.end() if marker else 0)
    out.append(block[pos:])
    return ''.join(out)


src = open(sys.argv[1]).read()
out, pos = [], 0
# Inside deletion blocks, a blank line is a deleted paragraph break; drop it so
# the tracked-changes PDF keeps the revised layout. A deleted equation keeps its
# displaymath wrapper around the hidden \DIFdel content and would leave an empty
# display; drop the wrapper too. A deleted (sub)section keeps its heading command
# with the title hidden and would print a bare number; drop it with its counter fix.
# In a float, a deleted \multicolumn leaves a group "{%DIFAUXCMD ...} %DIFAUXCMD" that
# holds only hidden text; drop it with the space after it, since the space would
# indent the table cell and a \multicolumn that follows must come first in its cell.
for m in re.finditer(r'\\DIFdelbegin(FL)?.*?\\DIFdelend(FL)?', src, re.S):
    out.append(src[pos:m.start()])
    block = re.sub(r'\\begin\{displaymath\}.*?\\end\{displaymath\}(%DIFAUXCMD)?', '', m.group(0), flags=re.S)
    block = re.sub(r'\\(sub)*section\*?\{\\DIFdel(FL)?\{[^{}]*\}\}\s*%DIFAUXCMD\s*\\addtocounter\{\w+\}\{-1\}%DIFAUXCMD', '', block)
    if m.group(1):
        block = drop_hidden_groups(block).replace('} %DIFAUXCMD', '}%DIFAUXCMD')
    out.append(re.sub(r'\n[ \t]*\n', '\n', block))
    pos = m.end()
out.append(src[pos:])
# Added text in a table cell keeps the source's alignment padding before & or \\
# inside \DIFaddFL{...}; that trailing space shifts a right-aligned or centered cell
# away from where the clean source puts it, so drop it.
cell_end = re.compile(r'(\\DIFaddFL\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?)\s+\}'
                      r'(?=[ \t]*(?:\\DIFaddendFL[ \t]*)?(?:&|\\\\))')
open(sys.argv[1], 'w').write(cell_end.sub(r'\1}', ''.join(out)))
