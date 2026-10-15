# Calldata-value gate

**PASS**: max |AUC - 0.5| = 0.187 over 61 fields x 4 encodings x 85 tasks; family-wise permutation p = 0.576 (alpha 0.05); positive control control.legacyPseudonym max = 0.304, p = 0.001 (detected).

| Field | max \|AUC-0.5\| | AUC | encoding | task |
|---|---:|---:|---|---|
| access.requestAccessBoundWithGasPad._pubSignals[3] | 0.187 | 0.313 | value | pch|denied | ICD ch9 |
| access.requestAccessBoundWithGasPad._pB[1] | 0.178 | 0.678 | value | pi|weak_equivalent |
| access.requestAccessBoundWithGasPad.targetGas | 0.177 | 0.323 | value | pch|granted | ICD ch0 |
| access.tx.gasLimit | 0.177 | 0.323 | value | pch|granted | ICD ch0 |
| access.requestAccessBoundWithGasPad._pB[3] | 0.174 | 0.674 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pubSignals[2] | 0.168 | 0.668 | value | pi|controlled_difference |
| commit.commitPolicyWithGasPad._paramsCommitment | 0.168 | 0.668 | value | pi|controlled_difference |
| commit.log0.data1 | 0.168 | 0.668 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._nonce | 0.164 | 0.664 | value | pch|denied | ICD ch9 |
| access.requestAccessBoundWithGasPad._pubSignals[4] | 0.158 | 0.342 | multiplicity | pch|granted | ICD ch1 |
| access.requestAccessBoundWithGasPad._requestEpoch | 0.158 | 0.342 | multiplicity | pch|granted | ICD ch1 |
| access.requestAccessBoundWithGasPad._pC[0] | 0.154 | 0.654 | value | pch|granted | ICD ch7 |
| access.requestAccessBoundWithGasPad._pB[0] | 0.152 | 0.652 | value | pi|controlled_difference |
| access.tx.nonce | 0.150 | 0.650 | zeroBytes | pch|granted | ICD ch1 |
| access.requestAccessBoundWithGasPad._pB[2] | 0.150 | 0.650 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._idReq | 0.147 | 0.647 | value | pi|controlled_difference |
| commit.commitPolicyWithGasPad.targetGas | 0.145 | 0.645 | value | pi|controlled_difference |
| commit.tx.gasLimit | 0.144 | 0.644 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pubSignals[1] | 0.142 | 0.642 | value | pi|weak_equivalent |
| commit.commitPolicyWithGasPad._commitment | 0.142 | 0.642 | value | pi|weak_equivalent |
| commit.log0.data0 | 0.142 | 0.642 | value | pi|weak_equivalent |
| access.blockNumber | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.log0.data0 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.log0.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.log1.data0 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.log1.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.requestAccessBoundWithGasPad._policyId | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| access.requestAccessBoundWithGasPad._resourceId | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| commit.blockNumber | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| commit.log0.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| resource.log0.topic2 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| resource.log0.topic3 | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| resource.registerResource._policyId | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| resource.blockNumber | 0.138 | 0.638 | value | pch|granted | ICD ch3 |
| executionSequence | 0.137 | 0.637 | value | pch|granted | ICD ch3 |
| access.requestAccessBoundWithGasPad._pA[0] | 0.137 | 0.637 | value | pch|granted | ICD ch9 |
| access.requestAccessBoundWithGasPad._pC[1] | 0.137 | 0.637 | value | pi|semantic_equivalent |
| commit.tx.nonce | 0.136 | 0.364 | value | pch|granted | ICD ch1 |
| resource.tx.nonce | 0.136 | 0.364 | value | pch|granted | ICD ch1 |
| access.log0.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| access.log1.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| access.tx.from | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| commit.log0.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| commit.tx.from | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| resource.log0.topic1 | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| resource.tx.from | 0.127 | 0.627 | multiplicity | pi|weak_equivalent |
| access.requestAccessBoundWithGasPad._pA[1] | 0.127 | 0.373 | value | pch|granted | ICD ch5 |
| resource.tx.gasLimit | 0.075 | 0.575 | value | pi|weak_equivalent |
| access.log0.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.log1.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.logCount | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.requestAccessBoundWithGasPad._pubSignals[0] | 0.000 | 0.500 | value | pch|granted | DUO GR |
| access.requestAccessBoundWithGasPad.selector | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.commitPolicyWithGasPad._metadataURI.length | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.commitPolicyWithGasPad._metadataURI.word0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.commitPolicyWithGasPad.selector | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.log0.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| commit.logCount | 0.000 | 0.500 | value | pch|granted | DUO GR |
| resource.log0.topic0 | 0.000 | 0.500 | value | pch|granted | DUO GR |
| resource.logCount | 0.000 | 0.500 | value | pch|granted | DUO GR |
| resource.registerResource.selector | 0.000 | 0.500 | value | pch|granted | DUO GR |
