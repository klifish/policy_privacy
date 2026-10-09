import re, sys
src = open(sys.argv[1]).read()
out, pos = [], 0
# Inside deletion blocks, a blank line is a deleted paragraph break; drop it so
# the tracked-changes PDF keeps the revised layout. A deleted equation keeps its
# displaymath wrapper around the hidden \DIFdel content and would leave an empty
# display; drop the wrapper too. A deleted (sub)section keeps its heading command
# with the title hidden and would print a bare number; drop it with its counter fix.
for m in re.finditer(r'\\DIFdelbegin(FL)?.*?\\DIFdelend(FL)?', src, re.S):
    out.append(src[pos:m.start()])
    block = re.sub(r'\\begin\{displaymath\}.*?\\end\{displaymath\}(%DIFAUXCMD)?', '', m.group(0), flags=re.S)
    block = re.sub(r'\\(sub)*section\*?\{\\DIFdel(FL)?\{[^{}]*\}\}\s*%DIFAUXCMD\s*\\addtocounter\{\w+\}\{-1\}%DIFAUXCMD', '', block)
    out.append(re.sub(r'\n[ \t]*\n', '\n', block))
    pos = m.end()
out.append(src[pos:])
open(sys.argv[1], 'w').write(''.join(out))
