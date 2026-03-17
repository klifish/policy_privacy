# Data Provider & Data Requester Interaction Flow

## 1. Full Interaction Sequence Diagram

```mermaid
sequenceDiagram
    autonumber
    participant P as Data Provider
    participant API as REST API<br/>(Express.js)
    participant Lib as Prover Library<br/>(lib/prover.js)
    participant SC as Smart Contract<br/>(PolicyPrivacy.sol)
    participant V as Verifier Contract<br/>(Groth16 Verifier)
    participant R as Data Requester

    %% ========== Phase 1: Policy Commitment ==========
    rect rgb(255, 245, 230)
        Note over P, Lib: Phase 1: Policy Commitment (Provider Local)

        P ->> Lib: calculatePolicyCommitment(policy, randomizer)
        Note right of Lib: Policy RPN encoding:<br/>"WillPublish AND IRBApproval"<br/>-> [0, 1, 5, 0, ..., 0]
        Lib ->> Lib: Poseidon(Poseidon(Policy), r)
        Lib -->> P: policyCommitment (hash)

        P ->> Lib: calculateParamsCommitment(merkleRoots,<br/>credKeys, rangeMin, rangeMax, ...)
        Lib ->> Lib: Poseidon hash chain<br/>over all external parameters
        Lib -->> P: paramsCommitment (hash)
    end

    %% ========== Phase 2: On-chain Policy Publication ==========
    rect rgb(230, 255, 230)
        Note over P, SC: Phase 2: On-Chain Policy Publication

        P ->>+ API: POST /data-provider/publish<br/>{providerAddress, dataHash,<br/>policyCommitment, paramsCommitment,<br/>metadataURI}
        API ->>+ SC: commitPolicy(commitment,<br/>paramsCommitment, metadataURI)
        SC ->> SC: Store PolicyCommitment{<br/>  dataSubject, commitment,<br/>  paramsCommitment, isActive,<br/>  timestamp, metadataURI<br/>}
        SC -->>- API: emit PolicyCommitted<br/>(dataSubject, policyId,<br/>commitment, paramsCommitment)
        API -->>- P: {dataId, policyId,<br/>transactionHash, gasUsed}
    end

    %% ========== Phase 3: Off-chain policy sharing ==========
    rect rgb(255, 230, 255)
        Note over P, R: Phase 3: Off-Chain Policy Sharing

        P -->> R: Share policy content P<br/>and randomizer r via off-chain channel
        R ->>+ API: Query published data<br/>GET /data-provider/data
        API -->>- R: {policyId, policyCommitment, ...}
    end

    %% ========== Phase 4: ZK Proof Generation ==========
    rect rgb(255, 255, 220)
        Note over R, Lib: Phase 4: ZK Proof Generation (Requester Local)

        R ->> Lib: createCircuitInput(policyCommitment, {<br/>  policy, requesterAttrs, randomizer,<br/>  predicateTypes, merkleLeaves,<br/>  credMessages, rangeValues, ...})
        Lib -->> R: circuitInput (structured)

        R ->> Lib: generateProof(circuitInput,<br/>{wasmPath, zkeyPath})
        Note right of Lib: ZK Circuit execution:<br/>1. Commitment verify Com(P;r)=h<br/>2. External predicate verify (Merkle/Sig/Range)<br/>3. Policy evaluation C(P,(a,p))=1<br/>4. Final auth = commitment OK AND policy OK
        Lib ->> Lib: snarkjs.groth16.fullProve()
        Lib -->> R: {pA, pB, pC, pubSignals[33]}
    end

    %% ========== Phase 5: On-chain Access Request ==========
    rect rgb(255, 230, 230)
        Note over R, V: Phase 5: On-Chain Access Request & Verification

        R ->>+ API: POST /data-requester/request<br/>{requesterAddress, policyId,<br/>proof: {pA, pB, pC, pubSignals}}
        API ->> API: validateProofFormat(proof)
        API ->>+ SC: requestAccess(policyId,<br/>pA, pB, pC, pubSignals)
        SC ->> SC: require(policy.isActive)
        SC ->> SC: require(pubSignals[1] == commitment)<br/>require(pubSignals[2] == paramsCommitment)
        SC ->>+ V: verifyProof(pA, pB, pC, pubSignals)
        V ->> V: Groth16 pairing check<br/>e(piA, piB) = e(alpha,beta) * e(vk,gamma) * e(piC,delta)
        V -->>- SC: isValidProof (bool)
        SC ->> SC: isAuthorized = isValidProof<br/>AND (pubSignals[0] == 1)

        alt isAuthorized == true
            SC -->> API: emit AccessGranted<br/>(requester, policyId, requestId)
        else isAuthorized == false
            SC -->> API: emit AccessDenied<br/>(requester, policyId, requestId)
        end
        SC -->>- API: requestId
        API -->>- R: {status: 'granted'/'denied',<br/>contractRequestId, transactionHash}
    end

    %% ========== Phase 6: Data Sharing ==========
    rect rgb(240, 240, 240)
        Note over P, R: Phase 6: Result Query & Data Sharing

        R ->>+ API: GET /data-requester/requests/:id
        API -->>- R: {status, contractDetails}

        P ->>+ API: GET /policy/:id/access-requests
        API -->>- P: Audit log [{requester, status, timestamp}]

        alt Access Granted
            P -->> R: Share protected data
        end
    end
```

## 2. System Architecture Diagram

```mermaid
graph TB
    subgraph OffChain["Off-Chain Layer"]
        subgraph ProviderClient["Data Provider Client"]
            PR[Provider Registration]
            PC[Policy Commitment<br/>Poseidon Hash]
            PP[Data Publication]
        end

        subgraph RequesterClient["Data Requester Client"]
            RR[Requester Registration]
            CI[Build Circuit Input<br/>createCircuitInput]
            PG[Generate ZK Proof<br/>snarkjs.groth16]
            AR[Submit Access Request]
        end

        subgraph APILayer["REST API (Express.js)"]
            DPR["/data-provider/*"]
            DRR["/data-requester/*"]
            POL["/policy/*"]
            PRF["/proof/*"]
        end

        subgraph ProverLib["Prover Library (lib/prover.js)"]
            CPC[calculatePolicyCommitment]
            CPAC[calculateParamsCommitment]
            CCI[createCircuitInput]
            GP[generateProof]
        end
    end

    subgraph OnChain["On-Chain Layer (Blockchain)"]
        subgraph Contract["PolicyPrivacy.sol Smart Contract"]
            CP["commitPolicy()<br/>Store Policy Commitment"]
            RA["requestAccess()<br/>Process Access Request"]
            RP["revokePolicy()<br/>Revoke Policy"]
            QF["getPolicy() / isAccessGranted()<br/>Query Functions"]
        end

        subgraph Verifier["Groth16 Verifier Contract"]
            VP["verifyProof(piA, piB, piC, pubSignals)<br/>ZK Proof Verification"]
        end

        subgraph Storage["On-Chain Storage"]
            PS["policies mapping<br/>(policyId -> PolicyCommitment)"]
            ARS["accessRequests mapping<br/>(requestId -> AccessRequest)"]
            SP["subjectPolicies mapping<br/>(address -> policyId[])"]
            RQ["requesterRequests mapping<br/>(address -> requestId[])"]
        end
    end

    subgraph ZKCircuit["ZK Circuit Layer (Circom)"]
        subgraph MainCircuit["PolicyPrivacyMain Circuit"]
            CV["PolicyCommitmentVerifier<br/>Commitment Verification"]
            EP["ExternalPredicateVerifier x5<br/>External Predicate Verification"]
            PI["PostfixPolicyInterpreter<br/>Policy Evaluation (RPN)"]
            FA["AND Gate<br/>Final Authorization Decision"]
        end
    end

    %% Provider Flow
    PR --> DPR
    PC --> CPC
    PC --> CPAC
    PP --> DPR
    DPR --> CP

    %% Requester Flow
    RR --> DRR
    CI --> CCI
    PG --> GP
    GP -.-> MainCircuit
    AR --> DRR
    DRR --> RA

    %% Contract Internal
    CP --> PS
    RA --> VP
    VP --> ARS
    RA --> ARS
    QF --> PS
    QF --> ARS

    %% Circuit Internal
    CV --> FA
    EP --> PI
    PI --> FA

    style OffChain fill:#f0f8ff,stroke:#4a90d9
    style OnChain fill:#f0fff0,stroke:#27ae60
    style ZKCircuit fill:#fff8f0,stroke:#e67e22
    style Contract fill:#e8f5e9,stroke:#27ae60
    style Verifier fill:#e8f5e9,stroke:#27ae60
    style Storage fill:#e8f5e9,stroke:#27ae60
    style MainCircuit fill:#fff3e0,stroke:#e67e22
```

## 3. ZK Circuit Internal Flow

```mermaid
graph LR
    subgraph PrivateInputs["Private Inputs (Hidden)"]
        P["policy[20]<br/>RPN Policy Sequence"]
        A["requesterAttrs[6]<br/>Requester Attributes"]
        R["randomizer<br/>Commitment Randomness"]
        ML["merkleLeaves[5]"]
        MPE["merklePathElements[5][8]"]
        MPI["merklePathIndices[5][8]"]
        CM["credMessages[5]"]
        CS["credSignatures[5]"]
        RV["rangeValues[5]"]
        OC["ontologyCodes[5]"]
    end

    subgraph PublicInputs["Public Inputs (Revealed)"]
        PC["policyCommitment"]
        PAC["paramsCommitment"]
        MR["merkleRoots[5]"]
        CPK["credPublicKeys[5]"]
        RMin["rangeMin[5]"]
        RMax["rangeMax[5]"]
        OPI["ontologyPolicyIds[5]"]
        OE["ontologyEpochs[5]"]
    end

    subgraph Circuit["ZK Circuit Processing"]
        CV["1. PolicyCommitmentVerifier<br/>Verify Com(P;r) == h"]
        EPV["2. ExternalPredicateVerifier x5"]
        PCI["3. ParamsCommitment Verification<br/>Poseidon Hash Chain"]
        PPI["4. PostfixPolicyInterpreter<br/>Policy RPN Evaluation"]
        AND["5. AND Gate<br/>Final Authorization"]
    end

    subgraph PredicateTypes["Predicate Types"]
        MT["type=0: Merkle Membership Proof<br/>(ICD-10 Code Verification)"]
        SIG["type=1: Credential Signature Verification<br/>(IRB Approval, etc.)"]
        RP["type=2: Range Proof<br/>(Age, Numeric Range)"]
        ONT["type=3: Ontology Verification<br/>(Medical Terminology)"]
        DIS["type=4: Disabled<br/>(Skip Verification)"]
    end

    subgraph Output["Output"]
        IA["isAuthorized<br/>0 or 1"]
    end

    P --> CV
    R --> CV
    PC --> CV

    ML --> EPV
    MPE --> EPV
    MPI --> EPV
    CM --> EPV
    CS --> EPV
    RV --> EPV
    OC --> EPV
    MR --> EPV
    CPK --> EPV
    RMin --> EPV
    RMax --> EPV
    OPI --> EPV
    OE --> EPV

    EPV --> MT
    EPV --> SIG
    EPV --> RP
    EPV --> ONT
    EPV --> DIS

    MR --> PCI
    CPK --> PCI
    RMin --> PCI
    RMax --> PCI
    OPI --> PCI
    OE --> PCI
    PAC --> PCI

    P --> PPI
    A --> PPI
    EPV -->|"predicateValues[5]"| PPI

    CV -->|"commitmentValid"| AND
    PPI -->|"policyResult"| AND
    AND --> IA

    style PrivateInputs fill:#ffe0e0,stroke:#c0392b
    style PublicInputs fill:#e0ffe0,stroke:#27ae60
    style Circuit fill:#fff8e0,stroke:#f39c12
    style PredicateTypes fill:#e0e0ff,stroke:#8e44ad
    style Output fill:#e0ffff,stroke:#16a085
```

## 4. Policy Evaluation Engine (Policy Interpreter)

```mermaid
graph TD
    subgraph PolicyEncoding["Policy RPN Encoding"]
        PE["Policy Example: WillPublish AND IRBApproval AND NOT DataSale"]
        RPN["RPN Encoding: [0, 1, 5, 2, 7, 5, 0, 0, ..., 0]"]
        OPS["Opcodes:<br/>0-5 = Attribute operands (requesterAttrs index)<br/>6-10 = Predicate operands (predicateValues index)<br/>11 = AND<br/>12 = OR<br/>13 = NOT<br/>4 = Disabled / Padding"]
    end

    subgraph StackExec["Stack-Based Execution"]
        S1["Read token=0 -> Push attrs[0]=1"]
        S2["Read token=1 -> Push attrs[1]=1"]
        S3["Read token=5 (AND) -> Pop 1,1 -> Push 1 AND 1 = 1"]
        S4["Read token=2 -> Push attrs[2]=0"]
        S5["Read token=7 (NOT) -> Pop 0 -> Push NOT 0 = 1"]
        S6["Read token=5 (AND) -> Pop 1,1 -> Push 1 AND 1 = 1"]
        S7["Stack top = 1 -> Policy Satisfied"]
    end

    PE --> RPN
    RPN --> S1
    S1 -->|"Stack: [1]"| S2
    S2 -->|"Stack: [1,1]"| S3
    S3 -->|"Stack: [1]"| S4
    S4 -->|"Stack: [1,0]"| S5
    S5 -->|"Stack: [1,1]"| S6
    S6 -->|"Stack: [1]"| S7

    style PolicyEncoding fill:#f5f5ff,stroke:#7b68ee
    style StackExec fill:#f5fff5,stroke:#3cb371
```

## 5. Smart Contract State Diagram

```mermaid
stateDiagram-v2
    [*] --> PolicyCreation: Provider calls commitPolicy()

    state PolicyCreation {
        [*] --> Active: Policy created successfully
        Active --> Active: Multiple requestAccess() calls
        Active --> Revoked: Provider calls revokePolicy()
    }

    state AccessRequest {
        [*] --> Validating: Requester submits proof
        Validating --> CommitmentCheck: Check policy active status
        CommitmentCheck --> ProofVerification: Commitment match passed
        CommitmentCheck --> Denied: Commitment mismatch
        ProofVerification --> Granted: isValidProof && pubSignals[0]==1
        ProofVerification --> Denied: Invalid proof or pubSignals[0]==0
    }

    Active --> AccessRequest: Requester initiates request
    AccessRequest --> Active: Request processed

    Granted --> [*]: emit AccessGranted
    Denied --> [*]: emit AccessDenied
    Revoked --> [*]: emit PolicyRevoked
```

## 6. Data Flow & Privacy Boundary

```mermaid
graph TB
    subgraph ProviderDomain["Provider Domain (Private)"]
        Policy["Privacy Policy P<br/>(Plaintext)"]
        Rand["Randomizer r"]
        Data["Protected Data"]
    end

    subgraph RequesterDomain["Requester Domain (Private)"]
        Attrs["Requester Attributes a<br/>(Age, Credentials, etc.)"]
        Creds["External Credentials<br/>(Merkle Proofs, Signatures, etc.)"]
        Proof["ZK Proof pi<br/>(piA, piB, piC)"]
    end

    subgraph PublicDomain["Public Domain (Blockchain)"]
        Commit["Policy Commitment h<br/>= Poseidon(P, r)"]
        ParamsC["Parameters Commitment<br/>= Poseidon(params)"]
        PubSig["Public Signals pubSignals[33]"]
        Result["Authorization Result<br/>isAuthorized in {0, 1}"]
        Events["On-Chain Events<br/>AccessGranted / AccessDenied"]
    end

    Policy -->|"Poseidon Hash"| Commit
    Rand -->|"Poseidon Hash"| Commit
    Policy -.->|"Off-chain sharing"| RequesterDomain

    Attrs -->|"ZK Proof<br/>Attributes not revealed"| Proof
    Creds -->|"ZK Proof<br/>Credentials not revealed"| Proof
    Policy -->|"ZK Proof<br/>Policy not revealed"| Proof

    Proof --> PubSig
    Commit --> PublicDomain
    ParamsC --> PublicDomain

    PubSig -->|"Groth16 Verification"| Result
    Result --> Events

    Events -.->|"Authorization notification"| ProviderDomain
    Events -.->|"Authorization notification"| RequesterDomain

    Data -.->|"Shared only when Granted"| RequesterDomain

    style ProviderDomain fill:#ffe0e0,stroke:#c0392b
    style RequesterDomain fill:#e0e0ff,stroke:#2c3e50
    style PublicDomain fill:#e0ffe0,stroke:#27ae60
```

## 7. API Routes & Contract Functions Mapping

```mermaid
graph LR
    subgraph APIRoutes["REST API Routes"]
        A1["POST /data-provider/register"]
        A2["POST /data-provider/publish"]
        A3["GET /data-provider/data"]
        A4["POST /data-requester/register"]
        A5["POST /data-requester/request"]
        A6["GET /data-requester/requests/:id"]
        A7["GET /policy/:id"]
        A8["DELETE /data-provider/data/:id"]
    end

    subgraph ContractFunctions["Contract Functions"]
        C1["commitPolicy()"]
        C2["commitPolicyWithGasPad()"]
        C3["requestAccess()"]
        C4["requestAccessWithGasPad()"]
        C5["revokePolicy()"]
        C6["getPolicy()"]
        C7["isAccessGranted()"]
        C8["verifyProof()"]
    end

    subgraph Events["Contract Events"]
        E1["PolicyCommitted"]
        E2["AccessRequested"]
        E3["AccessGranted"]
        E4["AccessDenied"]
        E5["PolicyRevoked"]
    end

    A2 --> C1
    A2 -.->|"Optional gas padding"| C2
    A5 --> C3
    A5 -.->|"Optional gas padding"| C4
    A8 --> C5
    A7 --> C6
    A6 --> C7

    C1 --> E1
    C3 --> E2
    C3 --> E3
    C3 --> E4
    C5 --> E5
    C3 --> C8

    style APIRoutes fill:#e3f2fd,stroke:#1976d2
    style ContractFunctions fill:#e8f5e9,stroke:#388e3c
    style Events fill:#fff3e0,stroke:#f57c00
```
