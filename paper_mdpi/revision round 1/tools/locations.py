"""Generate locations.tex: page/line references into the revised manuscript.

The response letters cite passages through \\Loc{key}. Each key is resolved here
against the text of output/manuscript_revised_marked.pdf, which has the same
pagination as the clean PDF, so the citations stay correct after any manuscript
edit once build_manuscripts.sh and this script are rerun. A missing anchor is a
hard error rather than a silently stale line number.

Usage: python3 locations.py MARKED_PDF MAIN_BBL OUT_TEX
"""
import re
import subprocess
import sys
import unicodedata

# key: (kind, start anchor, end anchor)
#   range   - from the line holding `start` to the line holding `end`
#   between - the lines strictly between `start` and `end`
#   float   - page of the table or figure whose caption begins with `start`
#   eqnum   - equation number printed on the line holding `start`
PASSAGES = {
    'abstract':   ('between', 'Abstract', 'Keywords'),
    'keywords':   ('range', 'Keywords', 'metadata leakage'),
    'bg-access':  ('range', 'Fine-grained consent management in blockchain-based',
                   'public chain is discussed in Section'),
    'rw-hidden':  ('range', 'Hidden-policy access-control work reduces direct policy exposure',
                   'as they are on public blockchains'),
    'rw-ssi':     ('range', 'Self-sovereign-identity (SSI) architectures place verifiable claims',
                   'reusing observed evidence for fresh sessions'),
    'tm-tps':     ('range', 'Conceptually, the TPS is an independent proof',
                   'external functions or does not provide'),
    'tm-origin':  ('range', 'Attribute-origin guarantees depend on the evidence type',
                   'remain external trust and lifecycle functions'),
    'tm-adv':     ('range', 'Adaptive requester probing and off-chain side channels',
                   "proof of the requester's real-world identity"),
    'tm-req1':    ('range', 'First, authorization must be publicly verifiable and bound',
                   'so that it cannot be reused for another context'),
    'ds-scope':   ('range', 'Scope of the supported policies',
                   'bounded Boolean policies over standardized terms'),
    'ds-len':     ('range', 'To bind each proof to a provider-defined',
                   'which keeps the sponge input unambiguous'),
    'ds-ctx':     ('range', 'For an access request, let',
                   'proof material are not posted on-chain'),
    'ds-cred':    ('range', 'The circuit reserves one fixed predicate slot',
                   'are constrained to these claim-derived values'),
    'ev-obs':     ('range', 'That channel is wider than the verifier',
                   'contains no TS policies'),
    'ev-thr':     ('range', 'Operational thresholds and sensitivity',
                   'padding suppresses the modeled gas channel'),
    'ev-corpus':  ('range', 'Shared corpus. We evaluate all three objectives',
                   'production key management'),
    'ev-issuer':  ('range', 'uses a deterministic test issuer', 'production key management'),
    'pch-sup':    ('range', 'Supervised attack. Each DUO term defines a',
                   'examine below what the classifier separates'),
    'pch-ch5':    ('range', 'meets both legs: mean AUC', 'examine below what the classifier separates'),
    'pch-diag':   ('range', 'What the ch5 classifier separates',
                   'policy contrasts, as shown in Section'),
    'pi-sup':     ('range', 'We train a logistic-regression and a random-forest',
                   'produces a distinguishable positive control'),
    'spp-sup':    ('range', 'reports all 21 pairwise contrasts',
                   'signal collapses under the full normalization'),
    'ab-eq':      ('range', 'The paired leakage metric is', 'layer and reports its gas cost'),
    'ab-eqnum':   ('eqnum', 'leak = |AUCB1', None),
    'ab-source':  ('range', 'Source of the unpadded signal',
                   'other public encodings or execution effects'),
    'ab-cost':    ('range', 'Cost. Padding is not free',
                   'converts the measured capacity into requests per day'),
    'ab-scal':    ('range', 'reports two offline capacity sweeps',
                   'converts the measured capacity into requests per day'),
    'di-find':    ('range', 'Privacy findings. The evaluation supports',
                   'or structural properties from authorization transactions'),
    'di-cost':    ('range', 'The cost of padding. Within the evaluated scope',
                   'address channels that are not gas'),
    'di-tps':     ('range', 'TPS trust and credential provenance',
                   'legitimate denial at the on-chain interface'),
    'di-origin':  ('range', 'Attribute origin is only partially delegated',
                   'valid evidence within its signed scope'),
    'di-issuer':  ('range', 'Issuer governance and deployment path',
                   'TPS re-signing cannot establish issuer-origin assurance'),
    'di-ext':     ('range', 'A concrete deployment can add issuer governance',
                   'TPS re-signing cannot establish issuer-origin assurance'),
    'di-len':     ('range', 'Policy and context binding. As described in',
                   'reveal information about the hidden policy'),
    'di-ctx':     ('range', 'The authorization context is likewise part of',
                   'the origin of every private attribute'),
    'di-future':  ('range', 'Future directions. Three directions follow',
                   'them is left to future work'),
    'co-all':     ('range', 'This work presents TPS-ZKPI, a Trusted Proof',
                   'ordering channels beyond the present model'),
    'co-limits':  ('range', 'These findings are empirical and scoped to',
                   'ordering channels beyond the present model'),
}
FLOATS = {
    'fig1': 'Figure 1.', 'fig2': 'Figure 2.', 'fig3': 'Figure 3.',
    **{f'tab{i}': f'Table {i}.' for i in range(1, 18)},
}
NEW_REFS = ['pei2024proxy', 'zhou2024secure', 'yang2024hamed', 'ding2026badsabe',
            'buccafurri2024holder', 'madine2025zero', 'shashidhara2024promise']


def alnum(s):
    return ''.join(c.lower() for c in s if c.isalnum())


def load(pdf):
    text = subprocess.run(['pdftotext', '-layout', pdf, '-'], check=True,
                          capture_output=True, text=True).stdout
    text = unicodedata.normalize('NFKC', text)
    chars, owners, raw_lines = [], [], []
    for page, body in enumerate(text.split('\f'), 1):
        for line in body.split('\n'):
            raw_lines.append((page, line))
            m = re.match(r'^(.*?)\s+(\d{1,4})\s*$', line)
            if not m or 'submitted to Blockchains' in line:
                continue
            for c in m.group(1):
                if c.isalnum():
                    chars.append(c.lower())
                    owners.append((page, int(m.group(2))))
    return ''.join(chars), owners, raw_lines


def locate(joined, owners, anchor, start=0, unique=True):
    key = alnum(anchor)
    i = joined.find(key, start)
    if i < 0:
        sys.exit(f'locations.py: anchor not found: {anchor!r}')
    if unique and start == 0 and joined.find(key, i + 1) >= 0:
        sys.exit(f'locations.py: anchor not unique: {anchor!r}')
    return i, i + len(key) - 1


def fmt(first, last):
    (p1, l1), (p2, l2) = first, last
    lines = f'line~{l1}' if l1 == l2 else f'lines~{l1}--{l2}'
    pages = f'page~{p1}' if p1 == p2 else f'pages~{p1}--{p2}'
    return f'{pages}, {lines}'


def main(pdf, bbl, out):
    joined, owners, raw_lines = load(pdf)
    macros = {}
    for key, (kind, a, b) in PASSAGES.items():
        if kind == 'eqnum':
            hits = [(p, l) for p, l in raw_lines if alnum(a) in alnum(l)]
            m = re.search(r'\((\d+)\)\s+\d+\s*$', hits[0][1]) if len(hits) == 1 else None
            if not m:
                sys.exit(f'locations.py: equation number not found for {a!r}')
            macros[key] = m.group(1)
            continue
        # The abstract heading is the first line of the paper; later text reuses the word.
        s0, s1 = locate(joined, owners, a, unique=(key != 'abstract'))
        if kind == 'range':
            _, e1 = locate(joined, owners, b, s0)
            macros[key] = fmt(owners[s0], owners[e1])
        else:  # between
            e0, _ = locate(joined, owners, b, s1)
            macros[key] = fmt(owners[s1 + 1], owners[e0 - 1])
    for key, caption in FLOATS.items():
        pages = [p for p, l in raw_lines if l.strip().startswith(caption)]
        if len(pages) != 1:
            sys.exit(f'locations.py: caption {caption!r} found {len(pages)} times')
        macros[key] = f'page~{pages[0]}'
    order = re.findall(r'\\bibitem(?:\[.*?\])?\{([^}]*)\}', open(bbl).read(), re.S)
    for ref in NEW_REFS:
        if ref not in order:
            sys.exit(f'locations.py: reference {ref!r} not in {bbl}')
        macros[f'ref-{ref}'] = str(order.index(ref) + 1)
    macros['ref-count'] = str(len(order))
    with open(out, 'w') as f:
        f.write('% Generated by tools/locations.py from the revised manuscript; do not edit.\n')
        for key, value in macros.items():
            f.write(f'\\expandafter\\def\\csname loc@{key}\\endcsname{{{value}}}\n')
    print(f'locations.py: {len(macros)} locations written to {out}')


if __name__ == '__main__':
    main(*sys.argv[1:4])
