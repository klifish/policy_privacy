# Calldata-value gate

**PASS**: max |AUC - 0.5| = 0.133 over 59 fields x 4 encodings x 44 tasks; family-wise permutation p = 0.470 (alpha 0.05); positive control control.legacyPseudonym max = 0.302, p = 0.001 (detected).

| Field | max \|AUC-0.5\| | AUC | encoding | task |
|---|---:|---:|---|---|
| access.requestAccessBound._pA[0] | 0.133 | 0.633 | value | pch|ICD ch0 |
| access.requestAccessBound._pubSignals[3] | 0.123 | 0.623 | value | pi|weak_equivalent |
| access.requestAccessBound._pC[1] | 0.122 | 0.622 | value | pch|ICD ch9 |
| executionSequence | 0.121 | 0.621 | value | pch|ICD ch3 |
| commit.log0.topic1 | 0.121 | 0.621 | value | pi|controlled_difference |
| commit.tx.from | 0.121 | 0.621 | value | pi|controlled_difference |
| resource.log0.topic1 | 0.121 | 0.621 | value | pi|controlled_difference |
| resource.tx.from | 0.121 | 0.621 | value | pi|controlled_difference |
| access.log0.data0 | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.log1.data0 | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.blockNumber | 0.120 | 0.620 | value | pch|ICD ch3 |
| commit.blockNumber | 0.120 | 0.620 | value | pch|ICD ch3 |
| resource.blockNumber | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.log0.topic2 | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.log1.topic2 | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.requestAccessBound._policyId | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.requestAccessBound._resourceId | 0.120 | 0.620 | value | pch|ICD ch3 |
| commit.log0.topic2 | 0.120 | 0.620 | value | pch|ICD ch3 |
| resource.log0.topic2 | 0.120 | 0.620 | value | pch|ICD ch3 |
| resource.log0.topic3 | 0.120 | 0.620 | value | pch|ICD ch3 |
| resource.registerResource._policyId | 0.120 | 0.620 | value | pch|ICD ch3 |
| access.requestAccessBound._pubSignals[4] | 0.118 | 0.618 | value | pch|ICD ch3 |
| access.requestAccessBound._requestEpoch | 0.118 | 0.618 | value | pch|ICD ch3 |
| access.requestAccessBound._nonce | 0.118 | 0.618 | value | pi|semantic_equivalent |
| access.tx.nonce | 0.114 | 0.614 | value | pi|weak_equivalent |
| commit.tx.nonce | 0.114 | 0.614 | value | pi|weak_equivalent |
| resource.tx.nonce | 0.114 | 0.614 | value | pi|weak_equivalent |
| access.requestAccessBound._pC[0] | 0.112 | 0.612 | value | pi|semantic_equivalent |
| access.log0.topic1 | 0.107 | 0.607 | value | pi|controlled_difference |
| access.log1.topic1 | 0.107 | 0.607 | value | pi|controlled_difference |
| access.tx.from | 0.107 | 0.607 | value | pi|controlled_difference |
| access.requestAccessBound._pB[3] | 0.105 | 0.605 | value | pi|controlled_difference |
| access.requestAccessBound._pB[1] | 0.105 | 0.395 | value | pch|ICD ch7 |
| access.requestAccessBound._idReq | 0.104 | 0.604 | value | pi|controlled_difference |
| access.requestAccessBound._pubSignals[2] | 0.104 | 0.604 | value | pi|controlled_difference |
| commit.commitPolicy._paramsCommitment | 0.104 | 0.604 | value | pi|controlled_difference |
| commit.log0.data1 | 0.104 | 0.604 | value | pi|controlled_difference |
| access.requestAccessBound._pubSignals[1] | 0.104 | 0.604 | value | pi|weak_equivalent |
| commit.commitPolicy._commitment | 0.104 | 0.604 | value | pi|weak_equivalent |
| commit.log0.data0 | 0.104 | 0.604 | value | pi|weak_equivalent |
| access.requestAccessBound._pB[2] | 0.100 | 0.600 | value | pi|controlled_difference |
| access.requestAccessBound._pB[0] | 0.100 | 0.600 | value | pi|semantic_equivalent |
| access.requestAccessBound._pA[1] | 0.086 | 0.586 | value | pi|weak_equivalent |
| commit.tx.gasLimit | 0.079 | 0.421 | value | pch|ICD ch4 |
| resource.tx.gasLimit | 0.063 | 0.437 | value | pch|ICD ch1 |
| access.log1.topic0 | 0.056 | 0.444 | value | pch|ICD ch4 |
| access.requestAccessBound._pubSignals[0] | 0.056 | 0.444 | value | pch|ICD ch4 |
| access.log0.topic0 | 0.000 | 0.500 | value | pch|DUO GR |
| access.logCount | 0.000 | 0.500 | value | pch|DUO GR |
| access.requestAccessBound.selector | 0.000 | 0.500 | value | pch|DUO GR |
| access.tx.gasLimit | 0.000 | 0.500 | value | pch|DUO GR |
| commit.commitPolicy._metadataURI.length | 0.000 | 0.500 | value | pch|DUO GR |
| commit.commitPolicy._metadataURI.word0 | 0.000 | 0.500 | value | pch|DUO GR |
| commit.commitPolicy.selector | 0.000 | 0.500 | value | pch|DUO GR |
| commit.log0.topic0 | 0.000 | 0.500 | value | pch|DUO GR |
| commit.logCount | 0.000 | 0.500 | value | pch|DUO GR |
| resource.log0.topic0 | 0.000 | 0.500 | value | pch|DUO GR |
| resource.logCount | 0.000 | 0.500 | value | pch|DUO GR |
| resource.registerResource.selector | 0.000 | 0.500 | value | pch|DUO GR |
