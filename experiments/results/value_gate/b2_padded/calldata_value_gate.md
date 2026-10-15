# Calldata-value gate

**PASS**: max |AUC - 0.5| = 0.136 over 61 fields x 4 encodings x 44 tasks; family-wise permutation p = 0.444 (alpha 0.05); positive control control.legacyPseudonym max = 0.302, p = 0.001 (detected).

| Field | max \|AUC-0.5\| | AUC | encoding | task |
|---|---:|---:|---|---|
| access.requestAccessBoundWithGasPad._pB[3] | 0.136 | 0.636 | value | pi|controlled_difference |
| commit.commitPolicyWithGasPad.targetGas | 0.129 | 0.629 | value | pi|controlled_difference |
| commit.tx.gasLimit | 0.127 | 0.627 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pB[0] | 0.124 | 0.624 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pC[0] | 0.124 | 0.624 | value | pi|weak_equivalent |
| access.blockNumber | 0.122 | 0.622 | value | pch|ICD ch3 |
| access.log0.data0 | 0.122 | 0.622 | value | pch|ICD ch3 |
| access.log0.topic2 | 0.122 | 0.622 | value | pch|ICD ch3 |
| access.log1.data0 | 0.122 | 0.622 | value | pch|ICD ch3 |
| access.log1.topic2 | 0.122 | 0.622 | value | pch|ICD ch3 |
| access.requestAccessBoundWithGasPad._policyId | 0.122 | 0.622 | value | pch|ICD ch3 |
| access.requestAccessBoundWithGasPad._resourceId | 0.122 | 0.622 | value | pch|ICD ch3 |
| commit.log0.topic2 | 0.122 | 0.622 | value | pch|ICD ch3 |
| resource.blockNumber | 0.122 | 0.622 | value | pch|ICD ch3 |
| resource.log0.topic2 | 0.122 | 0.622 | value | pch|ICD ch3 |
| resource.log0.topic3 | 0.122 | 0.622 | value | pch|ICD ch3 |
| resource.registerResource._policyId | 0.122 | 0.622 | value | pch|ICD ch3 |
| commit.blockNumber | 0.122 | 0.622 | value | pch|ICD ch3 |
| executionSequence | 0.121 | 0.621 | value | pch|ICD ch3 |
| commit.log0.topic1 | 0.121 | 0.621 | value | pi|controlled_difference |
| commit.tx.from | 0.121 | 0.621 | value | pi|controlled_difference |
| resource.log0.topic1 | 0.121 | 0.621 | value | pi|controlled_difference |
| resource.tx.from | 0.121 | 0.621 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pubSignals[3] | 0.120 | 0.620 | value | pch|ICD ch0 |
| access.tx.nonce | 0.114 | 0.614 | value | pi|weak_equivalent |
| commit.tx.nonce | 0.114 | 0.614 | value | pi|weak_equivalent |
| resource.tx.nonce | 0.114 | 0.614 | value | pi|weak_equivalent |
| access.requestAccessBoundWithGasPad._pB[1] | 0.113 | 0.613 | value | pi|weak_equivalent |
| access.requestAccessBoundWithGasPad._idReq | 0.111 | 0.611 | value | pi|semantic_equivalent |
| access.requestAccessBoundWithGasPad._pubSignals[4] | 0.110 | 0.610 | value | pch|ICD ch3 |
| access.requestAccessBoundWithGasPad._requestEpoch | 0.110 | 0.610 | value | pch|ICD ch3 |
| access.log0.topic1 | 0.107 | 0.607 | value | pi|controlled_difference |
| access.log1.topic1 | 0.107 | 0.607 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pA[0] | 0.107 | 0.607 | value | pi|controlled_difference |
| access.tx.from | 0.107 | 0.607 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pubSignals[2] | 0.104 | 0.604 | value | pi|controlled_difference |
| commit.commitPolicyWithGasPad._paramsCommitment | 0.104 | 0.604 | value | pi|controlled_difference |
| commit.log0.data1 | 0.104 | 0.604 | value | pi|controlled_difference |
| access.requestAccessBoundWithGasPad._pubSignals[1] | 0.104 | 0.604 | value | pi|weak_equivalent |
| commit.commitPolicyWithGasPad._commitment | 0.104 | 0.604 | value | pi|weak_equivalent |
| commit.log0.data0 | 0.104 | 0.604 | value | pi|weak_equivalent |
| access.requestAccessBoundWithGasPad._nonce | 0.102 | 0.602 | value | pi|semantic_equivalent |
| access.requestAccessBoundWithGasPad._pA[1] | 0.102 | 0.602 | value | pi|semantic_equivalent |
| access.requestAccessBoundWithGasPad._pC[1] | 0.091 | 0.591 | value | pi|semantic_equivalent |
| access.requestAccessBoundWithGasPad.targetGas | 0.091 | 0.591 | value | pi|weak_equivalent |
| access.tx.gasLimit | 0.091 | 0.591 | value | pi|weak_equivalent |
| access.requestAccessBoundWithGasPad._pB[2] | 0.085 | 0.585 | value | pi|semantic_equivalent |
| resource.tx.gasLimit | 0.056 | 0.556 | value | pi|weak_equivalent |
| access.log1.topic0 | 0.056 | 0.444 | value | pch|ICD ch4 |
| access.requestAccessBoundWithGasPad._pubSignals[0] | 0.056 | 0.444 | value | pch|ICD ch4 |
| access.log0.topic0 | 0.000 | 0.500 | value | pch|DUO GR |
| access.logCount | 0.000 | 0.500 | value | pch|DUO GR |
| access.requestAccessBoundWithGasPad.selector | 0.000 | 0.500 | value | pch|DUO GR |
| commit.commitPolicyWithGasPad._metadataURI.length | 0.000 | 0.500 | value | pch|DUO GR |
| commit.commitPolicyWithGasPad._metadataURI.word0 | 0.000 | 0.500 | value | pch|DUO GR |
| commit.commitPolicyWithGasPad.selector | 0.000 | 0.500 | value | pch|DUO GR |
| commit.log0.topic0 | 0.000 | 0.500 | value | pch|DUO GR |
| commit.logCount | 0.000 | 0.500 | value | pch|DUO GR |
| resource.log0.topic0 | 0.000 | 0.500 | value | pch|DUO GR |
| resource.logCount | 0.000 | 0.500 | value | pch|DUO GR |
| resource.registerResource.selector | 0.000 | 0.500 | value | pch|DUO GR |
