# DUO Term Reference

Reference for the 23 Data Use Ontology (DUO) terms supported by this system,
grouped by the enforcement mechanism each term requires.

Source ontology: [Data Use Ontology](https://ega-archive.org/access/data-access-committee/data-use-ontology/) (EGA / GA4GH).
Machine-readable copy of these terms (ID, shorthand, label, description):
[`duo_terms.json`](../duo_terms.json).

## Why terms are grouped this way

A DUO term is not simply a flag. Terms differ in *what a requester must prove*
to satisfy them, and that difference drives the circuit design. The four
categories below correspond to four distinct proof mechanisms:

| Category | What must be proven | Mechanism |
| --- | --- | --- |
| Ontology-linked | The request's code is a member of an approved set in an external ontology | Merkle membership proof against an ontology whitelist |
| Obligation-required | The requester has accepted a duty that persists after access | Policy-level obligation predicate, checked at access time |
| Authorization-bound | A named authority approved this specific user, project, or institution | Signed scoped credential |
| Boolean-only | Nothing beyond the attribute value itself | Direct boolean attribute |

Grouping matters because only the first three consume a predicate slot in the
circuit. Boolean-only terms are evaluated as plain attributes and cost no
external verification.

## Ontology-linked terms

Use is limited to a value drawn from an external controlled vocabulary. The
requester proves membership in the policy's approved set without revealing
which member was used.

| DUO ID | Code | Label | Ontology namespace |
| --- | --- | --- | --- |
| DUO:0000007 | DS | disease specific research | ICD10 |
| DUO:0000012 | RS | research specific restrictions | OBI |
| DUO:0000011 | POA | population origins or ancestry research only | HANCESTRO |
| DUO:0000022 | GS | geographical restriction | ISO3166 |
| DUO:0000043 | CC | clinical care use | SNOMED |

Descriptions:

- **DS** — This data use permission indicates that use is allowed provided it is related to the specified disease.
- **RS** — This data use modifier indicates that use is limited to studies of a certain research type.
- **POA** — This data use permission indicates that use of the data is limited to the study of population origins or ancestry.
- **GS** — This data use modifier indicates that use is limited to within a specific geographic region.
- **CC** — This data use modifier indicates that use is allowed for clinical use and care.

Implementation: predicate type `3` (ontology-linked). Namespaces are
normalized by `canonicalizeNamespace()` in
[compiler/policy_generator.js](../compiler/policy_generator.js); the
term-to-namespace map lives in `ONTOLOGY_LINKED_TERMS` in
[experiments/core/data_generator.js](../experiments/core/data_generator.js).

## Obligation-required terms

The requester commits to a duty. Some obligations are enforceable as a
predicate at access time; others are procedural commitments recorded outside
the circuit.

| DUO ID | Code | Label | Enforcement |
| --- | --- | --- | --- |
| DUO:0000024 | MOR | publication moratorium | Predicate type `6` (schema tag 2003) |
| DUO:0000025 | TS | time limit on use | Predicate type `7` (schema tag 2004) |
| DUO:0000019 | PUB | publication required | Procedural (out of circuit) |
| DUO:0000020 | COL | collaboration required | Procedural (out of circuit) |
| DUO:0000029 | RTN | return to database or resource | Procedural (out of circuit) |

Descriptions:

- **MOR** — This data use modifier indicates that requestor agrees not to publish results of studies until a specific date.
- **TS** — This data use modifier indicates that use is approved for a specific number of months.
- **PUB** — This data use modifier indicates that requestor agrees to make results of studies using the data available to the larger scientific community.
- **COL** — This data use modifier indicates that the requestor must agree to collaboration with the primary study investigator(s).
- **RTN** — This data use modifier indicates that the requestor must return derived/enriched data to the database/resource.

MOR and TS are time-bounded, so they can be checked mechanically against a
date at access time. They are policy-level obligations rather than scoped
credentials, and their slots must not carry a scope kind or scope identifier
(`OBLIGATION_DUO_TERMS` in
[compiler/policy_generator.js](../compiler/policy_generator.js)).

PUB, COL, and RTN describe duties that come due after access and cannot be
decided at request time; they are carried as commitments in the data access
agreement rather than as circuit predicates.

## Authorization-bound terms

An external authority has approved a specific subject. The requester presents
a signed credential scoped to that subject.

| DUO ID | Code | Label | Scope kind |
| --- | --- | --- | --- |
| DUO:0000026 | US | user specific restriction | 26 |
| DUO:0000027 | PS | project specific restriction | 27 |
| DUO:0000028 | IS | institution specific restriction | 28 |
| DUO:0000021 | IRB | ethics approval required | Procedural (out of circuit) |

Descriptions:

- **US** — This data use modifier indicates that use is limited to use by approved users.
- **PS** — This data use modifier indicates that use is limited to use within an approved project.
- **IS** — This data use modifier indicates that use is limited to use within an approved institution.
- **IRB** — This data use modifier indicates that the requestor must provide documentation of local IRB/ERB approval.

Implementation: US, PS, and IS use predicate type `5` (scoped credential),
defined in `SCOPED_DUO_TERMS` in
[compiler/policy_generator.js](../compiler/policy_generator.js). The scope
kind numerically matches the DUO term's numeric suffix.

IRB requires documentary evidence reviewed by a human committee, so it is
handled as an out-of-circuit authorization step.

## Boolean-only terms

Satisfied or not by the attribute value alone. No external verification, no
predicate slot.

| DUO ID | Code | Label |
| --- | --- | --- |
| DUO:0000004 | NRES | no restriction |
| DUO:0000042 | GRU | general research use |
| DUO:0000006 | HMB | health or medical or biomedical research |
| DUO:0000015 | NMDS | no general methods research |
| DUO:0000016 | GSO | genetic studies only |
| DUO:0000018 | NPUNCU | not for profit, non commercial use only |
| DUO:0000044 | NPOA | population origins or ancestry research prohibited |
| DUO:0000045 | NPU | not for profit organisation use only |
| DUO:0000046 | NCU | non-commercial use only |

Descriptions:

- **NRES** — This data use permission indicates there is no restriction on use.
- **GRU** — This data use permission indicates that use is allowed for general research use for any research purpose.
- **HMB** — This data use permission indicates that use is allowed for health/medical/biomedical purposes; does not include the study of population origins or ancestry.
- **NMDS** — This data use modifier indicates that use does not allow methods development research (e.g., development of software or algorithms).
- **GSO** — This data use modifier indicates that use is limited to genetic studies only (i.e., studies that include genotype research alone or both genotype and phenotype research, but not phenotype research exclusively).
- **NPUNCU** — This data use modifier indicates that use of the data is limited to not-for-profit organizations and not-for-profit use, non-commercial use.
- **NPOA** — This data use modifier indicates use for purposes of population, origin, or ancestry research is prohibited.
- **NPU** — This data use modifier indicates that use of the data is limited to not-for-profit organisations.
- **NCU** — This data use modifier indicates that use of the data is limited to not-for-profit use.

Note that several of these terms are semantically related but not
interchangeable: NPU restricts the *organisation type*, NCU restricts the
*use*, and NPUNCU restricts both.

## Predicate type summary

Values passed as `predicateType` into the circuit
([circuits/gadgets/external_predicates.circom](../circuits/gadgets/external_predicates.circom)):

| Type | Meaning | DUO terms |
| --- | --- | --- |
| 0 | Merkle membership | — (generic) |
| 1 | Signature | — (generic) |
| 2 | Range | — (generic) |
| 3 | Ontology-linked | DS, RS, POA, GS, CC |
| 5 | Scoped credential | US, PS, IS |
| 6 | Publication moratorium | MOR |
| 7 | Time limit on use | TS |

## Identifier normalization

Policy authors may write a term as its shorthand (`DS`), its full label
(`DISEASE_SPECIFIC`), or its DUO ID in either punctuation style (`DUO0000007`,
`DUO_0000007`). All forms are normalized to the canonical shorthand code by
the alias maps in
[compiler/policy_generator.js](../compiler/policy_generator.js)
(`DUO_ALIAS_MAP`, `SCOPED_ALIAS_MAP`, `OBLIGATION_ALIAS_MAP`).

## Scope of implementation

The 23 terms above are the vocabulary this system recognizes. Terms marked
"procedural (out of circuit)" — PUB, COL, RTN, IRB — are part of the
vocabulary but are satisfied through data access agreements and committee
review rather than through zero-knowledge predicates, because they cannot be
mechanically decided at request time.

Additionally, the experimental data generator
([experiments/core/data_generator.js](../experiments/core/data_generator.js))
exercises a seven-term subset (GR, DS, RS, POA, GS, CC, CU) chosen to cover
both ontology-linked and non-ontology-linked cases; it is not the full
vocabulary.
