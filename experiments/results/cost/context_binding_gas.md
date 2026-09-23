# Marginal gas of the authorization-context binding

Generated: 2026-09-23T08:18:26.338Z

Local: Hardhat 2.26.3 EVM (hardfork prague), solc 0.8.27, optimizer off.
Amoy: eth_call with state overrides at blocks 47784388 (evaluation median) and 48329264 (latest); nothing deployed, no transaction sent. Results identical across these blocks; the table uses the first.
Proofs: 20 real Groth16 proofs (5 per policy), each submitted unpadded to all three ACM variants; every submission granted.

## End-to-end access gas (local, unpadded)

| Policy | Evaluated ACM | No binding | No binding, no record |
|---|---:|---:|---:|
| Simple | 553,030 | 503,478 | 437,052 |
| Ontology-heavy | 553,018 | 503,466 | 437,040 |
| Profile-heavy | 553,402 | 503,850 | 437,424 |
| Max-mixed | 555,756 | 506,204 | 439,778 |

Medians over the proofs of each policy. The paired differences below are identical for all 20 proofs.

## Marginal cost of the binding

| Component | Local | Amoy | Measured as |
|---|---:|---:|---|
| Context recomputation, field check, nonce-key word | 49,552 | 49,552 | evaluated − noBind |
| &nbsp;&nbsp;of which the Poseidon(3) call | 48,309 | 48,309 | GasProbe |
| Digest as a verifier public input | 6,654 | 13,644 | 5- minus 4-input verifier |
| Calldata: id_req and digest words | 826 | 826 | EIP-2028, per byte |
| **Binding total** | **57,032** | **64,022** | |
| Recorded context fields (3 fresh slots) | 66,426 | 68,946 | noBind − noBindNoRecord |
| **Total with the audit record** | **123,458** | **132,968** | |

Local unpadded access gas of the evaluated ACM: median 553,390 (binding 10.3%, with record 22.3%).

## Gas schedules (GasProbe, as called; the call overhead is identical on both networks)

| Operation | Local | Amoy | Amoy − local |
|---|---:|---:|---:|
| identity precompile, 128 B (call overhead) | 939 | 939 | 0 |
| ecAdd | 1,056 | 1,446 | 390 |
| ecMul | 6,828 | 13,428 | 6,600 |
| ecPairing, 2 pairs | 114,528 | 171,028 | 56,500 |
| ecPairing, 4 pairs | 183,467 | 273,967 | 90,500 |
| cold SLOAD | 2,193 | 5,553 | 3,360 |
| three fresh SSTOREs (store3) | 66,959 | 69,479 | 2,520 |
| 5-input verifyProof | 220,036 | 345,486 | 125,450 |
| 4-input verifyProof | 213,382 | 331,842 | 118,460 |
