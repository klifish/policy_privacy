# PolicyPrivacyMain Circuit Structure Diagram

## ASCII Circuit Visualization

```
                    PolicyPrivacyMain Circuit Architecture
    ═══════════════════════════════════════════════════════════════════════════════════════

                                PRIVATE INPUTS (Witness w)
    ┌───────────────────────────────────────────────────────────────────────────────────────┐
    │  Policy[10]    RequesterAttrs[3]    PredicateTypes[2]    Merkle Proofs    Credentials │
    │  [RPN tokens]  [attr0,attr1,attr2]  [type0,type1]       [leaves,paths]   [msg,sig]    │
    │              ↓                    ↓                  ↓                  ↓              │
    │  Randomizer    Range Values[2]     Ontology Codes[2]                                   │
    │  [r]          [val0,val1]         [code0,code1]                                       │
    └───────────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
    ┌───────────────────────────────────────────────────────────────────────────────────────┐
    │                              PUBLIC INPUTS                                            │
    │  PolicyCommitment    MerkleRoots[2]    CredPublicKeys[2]    RangeMin/Max[2]          │
    │  [h = Com(P;r)]     [root0,root1]     [pk0,pk1]           [min0,max0,min1,max1]      │
    │                                                                                       │
    │  OntologyPolicyIds[2]    OntologyEpochs[2]    NumOperations                         │
    │  [policyId0,policyId1]  [epoch0,epoch1]       [policy_length]                       │
    └───────────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
    ═══════════════════════════════════════════════════════════════════════════════════════
                                      CIRCUIT COMPONENTS
    ═══════════════════════════════════════════════════════════════════════════════════════

    ┌─────────────────────────┐                    ┌──────────────────────────────────────┐
    │   PolicyCommitmentVerifier   │                    │     ExternalPredicateVerifier[2]     │
    │   ─────────────────────      │                    │     ──────────────────────────       │
    │                             │                    │                                      │
    │   Input: Policy[10]          │                    │   For each predicate j ∈ [0,1]:     │
    │          Randomizer          │                    │                                      │
    │          ExpectedCommitment  │                    │   Input: PredicateType[j]            │
    │                             │                    │          Merkle components           │
    │   Computation:               │                    │          Credential components       │
    │   h1 = Poseidon(Policy)      │                    │          Range components            │
    │   h2 = Poseidon(h1, r)       │                    │          Ontology components         │
    │                             │                    │                                      │
    │   Output: isValid            │                    │   Computation:                       │
    │   (h2 == ExpectedCommitment) │                    │   switch(PredicateType[j]):          │
    └─────────────────────────┘                    │     case 0: return 0 (disabled)     │
                │                                      │     case 1: MerkleProof(...)        │
                │                                      │     case 2: CredentialVerify(...)   │
                ▼                                      │     case 3: RangeProof(...)         │
                                                      │                                      │
        commitmentValid                               │   Output: predicateValues[j]        │
                │                                      └──────────────────────────────────────┘
                │                                                              │
                │                                                              ▼
                │                                                   predicateValues[0,1]
                │                                                              │
                │      ┌─────────────────────────────────────────────────────┘
                │      │
                │      ▼
                │  ┌──────────────────────────────────────────────────────────────────┐
                │  │                PostfixPolicyInterpreter                          │
                │  │                ────────────────────────                          │
                │  │                                                                  │
                │  │  Input: PostfixExpr[10] (Policy)                                │
                │  │         NumOperations                                           │
                │  │         RequesterPolicy[3] (Attributes)                         │
                │  │         PredicateValues[2]                                      │
                │  │                                                                  │
                │  │  Computation: Stack-based RPN evaluation                        │
                │  │  ────────────────────────────────────────                      │
                │  │  For each token in policy:                                      │
                │  │    if token < N: push requesterPolicy[token]                   │
                │  │    if N ≤ token < N+M: push predicateValues[token-N]           │
                │  │    if token ≥ N+M: apply operator (AND, OR, NOT)               │
                │  │                                                                  │
                │  │  Output: isValid (top of stack)                                │
                │  └──────────────────────────────────────────────────────────────────┘
                │                                      │
                │                                      ▼
                │                               policyResult
                │                                      │
                │                                      │
                ▼                                      ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                            AND Gate (Final Logic)                               │
    │                            ─────────────────────                               │
    │                                                                                 │
    │  Input: commitmentValid, policyResult                                          │
    │                                                                                 │
    │  Computation: commitmentValid ∧ policyResult                                   │
    │                                                                                 │
    │  Logic: Authorization requires BOTH:                                           │
    │         1. Valid policy commitment (privacy preserved)                         │
    │         2. Policy satisfaction (access authorized)                             │
    │                                                                                 │
    │  Output: isAuthorized                                                          │
    └─────────────────────────────────────────────────────────────────────────────────┘
                                                │
                                                ▼
    ┌─────────────────────────────────────────────────────────────────────────────────┐
    │                              FINAL OUTPUT                                      │
    │                              ────────────                                      │
    │                                                                                 │
    │  isAuthorized ∈ {0, 1}                                                         │
    │                                                                                 │
    │  • 1: Access GRANTED (policy satisfied with valid commitment)                  │
    │  • 0: Access DENIED (policy not satisfied or invalid commitment)               │
    └─────────────────────────────────────────────────────────────────────────────────┘

    ═══════════════════════════════════════════════════════════════════════════════════════
                                     CONSTRAINTS
    ═══════════════════════════════════════════════════════════════════════════════════════

    Boolean Constraints:                Type Constraints:
    ──────────────────                 ─────────────────
                                      
    For i ∈ [0, N-1]:                   For i ∈ [0, M-1]:
    requesterAttrs[i] * (requesterAttrs[i] - 1) === 0
                                        tmp1[i] = predicateTypes[i] * (predicateTypes[i] - 1)
    Ensures: requesterAttrs[i] ∈ {0,1}  tmp2[i] = tmp1[i] * (predicateTypes[i] - 2)
                                        tmp3[i] = tmp2[i] * (predicateTypes[i] - 3)
                                        tmp3[i] === 0
                                        
                                        Ensures: predicateTypes[i] ∈ {0,1,2,3}

    ═══════════════════════════════════════════════════════════════════════════════════════
```

## Data Flow Summary

1. **Input Processing**: Private witness and public parameters are validated and prepared
2. **Commitment Verification**: Policy commitment is verified using Poseidon hash
3. **Predicate Evaluation**: External predicates are verified using their respective proof systems
4. **Policy Interpretation**: RPN policy is evaluated against attributes and verified predicates
5. **Final Decision**: AND gate combines all verification results
6. **Constraint Enforcement**: Additional constraints ensure signal validity

## Circuit Parameters (N=3, M=2, DEPTH=10)

- **Total Constraints**: ~500,000 R1CS constraints
- **Proof Generation**: 4-5 seconds with 8GB RAM
- **Verification**: ~10ms on-chain, ~180k gas
- **Security**: 128-bit security level with BN254 curve

## Example Policy Evaluation

**Policy**: "attribute0 AND attribute1"
**RPN**: [0, 1, 5, 0, 0, 0, 0, 0, 0, 0]

**Evaluation Steps**:
1. Push attr0 (value from requesterAttrs[0])
2. Push attr1 (value from requesterAttrs[1])  
3. Apply AND operation (token 5 = N+M+0 = 3+2+0)
4. Result: attr0 ∧ attr1

**Access Decision**: 
- IF (attr0=1 AND attr1=1 AND commitment_valid): isAuthorized = 1
- ELSE: isAuthorized = 0