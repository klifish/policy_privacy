import re, sys
src = open(sys.argv[1]).read()
# latexdiff reads the old \noindent{\footnotesize{...}} table note as one command, so
# a note whose wrapper became the tablenote environment shows up as deleted and
# re-added in full. Where the text itself is unchanged, drop the addition markup.
pat = re.compile(
    r'\\DIFdelbeginFL %DIFDELCMD < \\noindent\{\\footnotesize\{(?P<old>[^\n]*)\}\}\n'
    r'%DIFDELCMD < %%%\n'
    r'\\DIFdelendFL \\DIFaddbeginFL (?P<begin>\\begin\{tablenote\}\s*)'
    r'\\DIFaddFL\{(?P<new>[^{}]*(?:\{[^{}]*\}[^{}]*)*)\}(?P<end>\\end\{tablenote\}\n)'
    r'\\DIFaddendFL ')
norm = lambda s: ' '.join(s.split())
def unmark(m):
    if norm(m.group('old')) != norm(m.group('new')):
        return m.group(0)
    return m.group('begin') + m.group('new').rstrip() + '\n' + m.group('end')
out, n = pat.subn(unmark, src)
open(sys.argv[1], 'w').write(out)
