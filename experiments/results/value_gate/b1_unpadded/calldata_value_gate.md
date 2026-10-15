# Calldata-value gate

**PASS**: max |AUC - 0.5| = 0.206 over 59 fields x 4 encodings x 85 tasks; family-wise permutation p = 0.613 (alpha 0.05); positive control control.legacyPseudonym max = 0.304, p = 0.001 (detected).

| Field | max \|AUC-0.5\| | AUC | encoding | task |
|---|---:|---:|---|---|
| access.requestAccessBound._pC[1] | 0.206 | 0.706 | value | pch|denied | ICD ch9 |
| access.requestAccessBound._pB[0] | 0.183 | 0.683 | value | pch|granted | ICD ch2 |
| access.requestAccessBound._pubSignals[3] | 0.176 | 0.676 | value | pi|weak_equivalent |
| access.requestAccessBound._pA[0] | 0.173 | 0.673 | value | pi|controlled_difference |
| access.requestAccessBound._pubSignals[2] | 0.168 | 0.668 | value | pi|controlled_difference |
| commit.commitPolicy._paramsCommitment | 0.168 | 0.668 | value | pi|controlled_difference |
| commit.log0.data1 | 0.168 | 0.668 | value | pi|controlled_difference |
| access.blockNumber | 0.157 | 0.657 | multiplicity | pch|denied | ICD ch9 |
| access.requestAccessBound._pB[1] | 0.156 | 0.344 | value | pch|granted | ICD ch7 |
| access.requestAccessBound._nonce | 0.150 | 0.350 | value | pch|granted | ICD ch8 |
| access.requestAccessBound._pubSignals[1] | 0.142 | 0.642 | value | pi|weak_equivalent |
| commit.commitPolicy._commitment | 0.142 | 0.642 | value | pi|weak_equivalent |
| commit.log0.data0 | 0.142 | 0.642 | value | pi|weak_equivalent |
| access.requestAccessBound._idReq | 0.140 | 0.640 | value | pi|controlled_difference |
| access.requestAccessBound._pC[0] | 0.140 | 0.640 | value | pi|semantic_equivalent |
| access.requestAccessBound._pA[1] | 0.140 | 0.640 | value | pch|granted | ICD ch7 |
| access.log0.data0 | 0.139 | 0.639 | value | pch|granted | ICD ch3 |
| access.log1.data0 | 0.139 | 0.639 | value | pch|granted | ICD ch3 |
| access.requestAccessBound._resourceId | 0.139 | 0.639 | value | pch|granted | ICD ch3 |
| resource.blockNumber | 0.139 | 0.639 | value | pch|granted | ICD ch3 |
| resource.log0.topic2 | 0.139 | 0.639 | value | pch|granted | ICD ch3 |
| commit.blockNumber | 0.139 | 0.639 | value | pch|granted | ICD ch3 |
| access.log0.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.log1.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.requestAccessBound._policyId | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| commit.log0.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| resource.log0.topic3 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| resource.registerResource._policyId | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| executionSequence | 0.137 | 0.637 | value | pch|granted | ICD ch3 |
| access.requestAccessBound._pB[3] | 0.137 | 0.637 | value | pi|semantic_equivalent |
| access.tx.nonce | 0.136 | 0.364 | value | pch|granted | ICD ch1 |
| commit.tx.nonce | 0.136 | 0.364 | value | pch|granted | ICD ch1 |
| resource.tx.nonce | 0.136 | 0.364 | value | pch|granted | ICD ch1 |
| access.requestAccessBound._pubSignals[4] | 0.135 | 0.365 | multiplicity | pch|granted | ICD ch1 |
| access.requestAccessBound._requestEpoch | 0.135 | 0.365 | multiplicity | pch|granted | ICD ch1 |
| access.log0.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| access.log1.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| access.tx.from | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| commit.log0.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| commit.tx.from | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| resource.log0.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| resource.tx.from | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| access.requestAccessBound._pB[2] | 0.118 | 0.618 | value | pi|controlled_difference |
| commit.tx.gasLimit | 0.114 | 0.614 | multiplicity | pch|granted | ICD ch8 |
| resource.tx.gasLimit | 0.081 | 0.581 | value | pi|weak_equivalent |
| access.log0.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.log1.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.logCount | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.requestAccessBound._pubSignals[0] | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.requestAccessBound.selector | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.tx.gasLimit | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.commitPolicy._metadataURI.length | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.commitPolicy._metadataURI.word0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.commitPolicy.selector | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.log0.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.logCount | 0.000 | 0.500 | value | pch|granted | DUO GR |
| resource.log0.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| resource.logCount | 0.000 | 0.500 | value | pch|granted | DUO GR |
| resource.registerResource.selector | 0.000 | 0.500 | value | pch|granted | DUO GR |
