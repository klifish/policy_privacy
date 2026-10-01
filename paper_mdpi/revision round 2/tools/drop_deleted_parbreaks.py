import re, sys
src = open(sys.argv[1]).read()
out, pos = [], 0
# Inside deletion blocks, a blank line is a deleted paragraph break; drop it so
# the tracked-changes PDF keeps the revised layout.
for m in re.finditer(r'\\DIFdelbegin(FL)?.*?\\DIFdelend(FL)?', src, re.S):
    out.append(src[pos:m.start()])
    out.append(re.sub(r'\n[ \t]*\n', '\n', m.group(0)))
    pos = m.end()
out.append(src[pos:])
open(sys.argv[1], 'w').write(''.join(out))
