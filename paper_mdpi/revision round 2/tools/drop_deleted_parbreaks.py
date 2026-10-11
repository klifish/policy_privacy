import re, sys
src = open(sys.argv[1]).read()
out, pos = [], 0
# Inside deletion blocks, a blank line is a deleted paragraph break; drop it so
# the tracked-changes PDF keeps the revised layout. A deleted equation keeps its
# displaymath wrapper around the hidden \DIFdel content and would leave an empty
# display; drop the wrapper too. A deleted (sub)section keeps its heading command
# with the title hidden and would print a bare number; drop it with its counter fix.
# In a float, a deleted \multicolumn leaves an empty group closed by "} %DIFAUXCMD";
# the space after it would indent the table cell it lands in, so drop the space.
for m in re.finditer(r'\\DIFdelbegin(FL)?.*?\\DIFdelend(FL)?', src, re.S):
    out.append(src[pos:m.start()])
    block = re.sub(r'\\begin\{displaymath\}.*?\\end\{displaymath\}(%DIFAUXCMD)?', '', m.group(0), flags=re.S)
    block = re.sub(r'\\(sub)*section\*?\{\\DIFdel(FL)?\{[^{}]*\}\}\s*%DIFAUXCMD\s*\\addtocounter\{\w+\}\{-1\}%DIFAUXCMD', '', block)
    if m.group(1):
        block = block.replace('} %DIFAUXCMD', '}%DIFAUXCMD')
    out.append(re.sub(r'\n[ \t]*\n', '\n', block))
    pos = m.end()
out.append(src[pos:])
# Added text in a table cell keeps the source's alignment padding before & or \\
# inside \DIFaddFL{...}; that trailing space shifts a right-aligned or centered cell
# away from where the clean source puts it, so drop it.
cell_end = re.compile(r'(\\DIFaddFL\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*?)\s+\}'
                      r'(?=[ \t]*(?:\\DIFaddendFL[ \t]*)?(?:&|\\\\))')
open(sys.argv[1], 'w').write(cell_end.sub(r'\1}', ''.join(out)))
