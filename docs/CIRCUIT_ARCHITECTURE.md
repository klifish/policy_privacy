# PolicyPrivacyMain Circuit Architecture Documentation

## Overview

The `policy_privacy_main_instance.circom` circuit implements a zero-knowledge proof system for privacy-preserving consent management in healthcare data sharing. This circuit enables data requesters to prove they satisfy a data subject's privacy policy without revealing their actual attributes or the policy itself.

## Mathematical Foundation

The circuit proves the following relation:

```
R = {(h, pp) ; (P, a, p, r) : C(P, (a, p)) = 1 ∧ Com(P; r) = h ∧ ∀j ∈ [M] : VerifyPredicate(p_j, pp_j) = 1}
```

Where:
- `h`: Policy commitment (public)
- `pp`: Public parameters for predicate verification (public)
- `P`: Privacy policy in RPN format (private)
- `a`: Requester attributes (private)
- `p`: External predicate values (private)
- `r`: Commitment randomizer (private)

## Circuit Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| N | 3 | Number of requester attributes |
| M | 2 | Number of external predicates |
| DEPTH | 10 | Maximum policy expression depth |
| K | 3 | Operand indexing bit width |
| MERKLE_LEVELS | 8 | Merkle tree depth (supports 256 leaves) |
| RANGE_BITS | 32 | Range proof bit width |

## Circuit Components

### 1. PolicyCommitmentVerifier
**Purpose**: Verifies that the committed policy matches the one being evaluated.

**Inputs**:
- `policy[DEPTH]`: Policy tokens in RPN format
- `randomizer`: Commitment randomness
- `expectedCommitment`: Public policy commitment

**Output**: 
- `isValid`: Boolean indicating commitment validity

**Implementation**: Uses Poseidon hash to compute `Com(P; r) = Poseidon(Poseidon(P), r)`

### 2. ExternalPredicateVerifier[M]
**Purpose**: Verifies external predicates using various cryptographic proofs.

**Predicate Types**:
- **Type 0**: Disabled (always returns 0)
- **Type 1**: Merkle tree membership proof
- **Type 2**: Credential signature verification
- **Type 3**: Range proof verification

**Inputs per verifier**:
- `predicateType`: Type selector (0-3)
- Merkle proof components (leaf, path elements, path indices, root)
- Credential components (message, signature, public key)
- Range proof components (value, min, max)
- Ontology components (code, policy ID, epoch)

**Output per verifier**:
- `isValid`: Boolean predicate value

### 3. PostfixPolicyInterpreter
**Purpose**: Evaluates the privacy policy against requester attributes and predicates.

**Inputs**:
- `postfixExpr[DEPTH]`: Policy in RPN format
- `numOperations`: Actual policy length
- `requesterPolicy[N]`: Requester attributes
- `predicateValues[M]`: Verified external predicates

**Output**:
- `isValid`: Boolean policy evaluation result

**Implementation**: 
- Stack-based RPN evaluation
- Supports logical operators: AND, OR, NOT
- Operand encoding: 0-(N-1) for attributes, N-(N+M-1) for predicates

## Signal Flow Architecture

```
Private Inputs                Public Inputs
     |                            |
     v                            v
┌─────────────────────────────────────────────────┐
│              Input Layer                        │
├─────────────┬─────────────┬─────────────────────┤
│   Policy    │ Attributes  │   Predicates        │
│   P[10]     │   a[3]      │   Types, Proofs     │
└─────────────┴─────────────┴─────────────────────┘
     |             |                |
     v             |                v
┌──────────────┐   |       ┌─────────────────────┐
│ Commitment   │   |       │ External Predicate  │
│ Verifier     │   |       │ Verifiers[2]        │
│ Com(P;r)=h   │   |       │ p = Verify(proofs)  │
└──────────────┘   |       └─────────────────────┘
     |             |                |
     v             v                v
┌─────────────────────────────────────────────────┐
│           Policy Interpreter                   │
│          C(P,(a,p)) = 1                        │
└─────────────────────────────────────────────────┘
     |                            |
     v                            v
┌─────────────────────────────────────────────────┐
│              AND Gate                           │
│   commitmentValid ∧ policyResult               │
└─────────────────────────────────────────────────┘
                    |
                    v
              ┌──────────────┐
              │ isAuthorized │
              │   (output)   │
              └──────────────┘
```

## Privacy Properties

### 1. Policy Privacy
- **Property**: The actual policy rules are never revealed
- **Implementation**: Only Poseidon hash commitment `h = Com(P; r)` is public
- **Security**: Computational hiding under discrete log assumption

### 2. Attribute Privacy
- **Property**: Individual requester attributes remain private
- **Implementation**: Only policy satisfaction result is revealed
- **Security**: Zero-knowledge property of the proof system

### 3. Predicate Privacy
- **Property**: External predicate values are not directly revealed
- **Implementation**: Predicates are verified using ZK-friendly primitives
- **Security**: Composability of zero-knowledge proofs

## Constraint Analysis

### Boolean Constraints
```circom
// Ensure requester attributes are binary
for (var i = 0; i < N; i++) {
    requesterAttrs[i] * (requesterAttrs[i] - 1) === 0;
}
```

### Type Constraints
```circom
// Ensure predicate types are in valid range {0,1,2,3}
for (var i = 0; i < M; i++) {
    tmp1[i] <== predicateTypes[i] * (predicateTypes[i] - 1);
    tmp2[i] <== tmp1[i] * (predicateTypes[i] - 2);
    tmp3[i] <== tmp2[i] * (predicateTypes[i] - 3);
    tmp3[i] === 0;
}
```

## Example Policy Encoding

### Policy: "attribute0 AND attribute1"
**RPN Encoding**: `[0, 1, 5, 0, 0, 0, 0, 0, 0, 0]`
- `0`: Push attribute0 onto stack
- `1`: Push attribute1 onto stack  
- `5`: AND operation (N+M+0 = 3+2+0 = 5)
- `0...0`: Padding tokens

### Evaluation Process
1. Stack: `[]`
2. Push attr0: Stack: `[attr0_value]`
3. Push attr1: Stack: `[attr0_value, attr1_value]`
4. AND: Stack: `[attr0_value ∧ attr1_value]`
5. Result: Top of stack

## Performance Characteristics

### Circuit Size
- **R1CS Constraints**: ~500,000
- **Variables**: ~750,000
- **Circuit Depth**: ~50 (logarithmic in expression size)

### Proof Generation
- **Time**: 4-5 seconds on modern hardware
- **Memory**: ~8GB RAM for setup
- **Trusted Setup**: One-time ceremony per circuit

### Verification
- **On-chain Time**: ~10ms
- **Gas Cost**: ~180,000 gas
- **Verification Key Size**: ~1KB

## Security Considerations

### Trusted Setup
- Uses Powers of Tau ceremony for universal setup
- Circuit-specific setup generates proving/verification keys
- Compromise of setup randomness breaks soundness

### Circuit Security
- **Completeness**: Valid witnesses always produce valid proofs
- **Soundness**: Invalid witnesses cannot produce valid proofs
- **Zero-Knowledge**: Proofs reveal no information beyond validity

### Implementation Security
- All constraints are rank-1 quadratic
- No under-constrained signals
- Proper signal initialization and bounds checking

## Integration with Smart Contracts

### Verifier Contract
Generated using `snarkjs zkey export solidityverifier`:

```solidity
contract PolicyPrivacyMainVerifier {
    function verifyProof(
        uint[2] memory _pA,
        uint[2][2] memory _pB,
        uint[2] memory _pC,
        uint[15] memory _pubSignals
    ) public view returns (bool);
}
```

### Public Signal Layout
```
pubSignals[0]  = isAuthorized       // Circuit output
pubSignals[1]  = policyCommitment   // Policy commitment hash
pubSignals[2]  = merkleRoots[0]     // Merkle root for predicate 0
pubSignals[3]  = merkleRoots[1]     // Merkle root for predicate 1
pubSignals[4]  = credPublicKeys[0]  // Public key for predicate 0
pubSignals[5]  = credPublicKeys[1]  // Public key for predicate 1
pubSignals[6]  = rangeMin[0]        // Range minimum for predicate 0
pubSignals[7]  = rangeMax[0]        // Range maximum for predicate 0
pubSignals[8]  = rangeMin[1]        // Range minimum for predicate 1
pubSignals[9]  = rangeMax[1]        // Range maximum for predicate 1
pubSignals[10] = ontologyPolicyIds[0] // Ontology policy ID for predicate 0
pubSignals[11] = ontologyEpochs[0]    // Ontology epoch for predicate 0
pubSignals[12] = ontologyPolicyIds[1] // Ontology policy ID for predicate 1
pubSignals[13] = ontologyEpochs[1]    // Ontology epoch for predicate 1
pubSignals[14] = numOperations        // Policy length
```

## Usage Example

### 1. Policy Commitment
```javascript
const policy = [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]; // attr0 AND attr1
const randomizer = BigInt('12345');
const commitment = await calculatePolicyCommitment(policy, randomizer);
```

### 2. Proof Generation
```javascript
const input = {
    policy: policy,
    requesterAttrs: [1, 1, 0], // Satisfies policy
    predicateTypes: [0, 0],    // Disabled predicates
    randomizer: randomizer.toString(),
    // ... other inputs
};
const proof = await generateGroth16Proof(input);
```

### 3. Smart Contract Verification
```javascript
const isValid = await verifier.verifyProof(
    proof.pA, proof.pB, proof.pC, proof.pubSignals
);
```

## Future Extensions

### Multi-Policy Support
- Support for multiple simultaneous policies
- Policy composition operators
- Hierarchical policy structures

### Advanced Predicates
- Time-based predicates
- Geo-location predicates
- Machine learning model predicates

### Optimization
- Lookup table optimizations
- Custom gates for common operations
- Parallelization for multiple predicates

## References

1. [Original Paper]: Privacy-Preserving Consent Management in Healthcare
2. [Circom Documentation]: https://docs.circom.io/
3. [SnarkJS Documentation]: https://github.com/iden3/snarkjs
4. [Groth16 Paper]: On the Size of Pairing-based Non-interactive Arguments