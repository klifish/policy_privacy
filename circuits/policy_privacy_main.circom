pragma circom 2.0.0;

include "interpreter/postfix_policy_interpreter.circom";
include "gadgets/policy_commitment.circom";
include "gadgets/external_predicates.circom";
include "../node_modules/circomlib/circuits/gates.circom";
include "../node_modules/circomlib/circuits/poseidon.circom";

/*
    PolicyPrivacyMain Circuit
    =========================
    
    This is the main circuit implementing the paper's zero-knowledge approach
    for privacy-preserving consent management. It proves simultaneously that:
    
    1. C(P,(a,p)) = 1  - Policy P is satisfied by attributes a and predicates p
    2. Com(P;r) = h    - Policy commitment is consistent  
    3. Each p_j ∈ p is correctly derived from external predicate verification
    
    This circuit embodies the complete witness structure: w = (P, a, p, r)
    
    Parameters:
    - N: Number of requester attributes
    - M: Number of external predicates  
    - DEPTH: Maximum policy token depth
    - K: Bit width for operand indexing
    - MERKLE_LEVELS: Merkle tree depth for set membership proofs
    - RANGE_BITS: Bit width for range/threshold proofs
*/

template PolicyPrivacyMain(N, M, DEPTH, K, MERKLE_LEVELS, RANGE_BITS) {
    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE WITNESS INPUTS (w = (P, a, p, r))
    // ═══════════════════════════════════════════════════════════════════════
    
    var DEFAULT_MERKLE_VALUE = 0;
    var DEFAULT_CRED_MESSAGE = 0;
    var DEFAULT_CRED_SIGNATURE = 0;
    var DEFAULT_CRED_PUBLIC_KEY = 0;
    var DEFAULT_RANGE_VALUE = 0;
    var DEFAULT_RANGE_MIN = 0;
    var DEFAULT_RANGE_MAX = 0;
    var DEFAULT_ONTOLOGY_CODE = 0;
    var DEFAULT_ONTOLOGY_POLICY_ID = 0;
    var DEFAULT_ONTOLOGY_EPOCH = 0;
    // V2 parameter layout includes predicate type/schema and temporal fields.
    // A distinct domain prevents accidental V1/V2 parameter-commitment reuse.
    var PARAM_DOMAIN_SEPARATOR = 4;
    
    // Policy P: RPN token sequence
    signal input policy[DEPTH];
    
    // Requester attributes a ∈ {0,1}^N
    signal input requesterAttrs[N];
    
    // External predicate inputs for generating p ∈ {0,1}^M
    // Predicate types and schema tags are provider-provisioned policy
    // parameters.  They are committed through paramsCommitment below, so the
    // requester cannot reinterpret a slot under a weaker verifier.
    signal input predicateTypes[M];                     // 0=Merkle, 1=typed approval, 2=range, 3=ontology, 4=disabled, 5=scoped
    signal input predicateSchemaTags[M];
    signal input scopeKinds[M];                         // 26=US, 27=PS, 28=IS
    signal input approvedScopeIds[M];
    
    // Merkle proof inputs (for predicates that use them)
    signal input merkleLeaves[M];
    signal input merklePathElements[M][MERKLE_LEVELS];
    signal input merklePathIndices[M][MERKLE_LEVELS];
    
    // Credential signature inputs (for predicates that use them)  
    signal input credSignatures[M];                 // Signature scalars S
    signal input credSigR8x[M];                     // Signature points R8.x
    signal input credSigR8y[M];                     // Signature points R8.y
    signal input credIssuerAx[M];                   // Issuer public-key points x
    signal input credIssuerAy[M];                   // Issuer public-key points y
    
    // Range proof inputs (for predicates that use them)
    signal input rangeValues[M];
    
    // Ontology-linked terms inputs (for predicates that use them)
    signal input ontologyCodes[M];                   // ICD codes or other ontology terms

    // Private request-purpose and approval fields.  purposeCode never appears
    // in calldata or the public statement; it is bound only inside a typed
    // institutional-approval signature.
    signal input purposeCode;
    signal input credValidFromEpochs[M];
    signal input credValidUntilEpochs[M];
    signal input credentialIds[M];
    // Scoped credentials bind idReq to a secret-held pseudonym. It is zero for
    // policies without type-5 slots and never appears in the public statement.
    signal input holderSecret;
    
    // Commitment randomizer r
    signal input randomizer;

    // Actual policy length
    signal input numOperations;

    // Authorization context (requester, resource, session). These are private
    // witness values: only their Poseidon digest is public, so the requester
    // identity is bound to the proof without being disclosed on-chain.
    signal input idReq;
    signal input idRes;
    signal input nonce;
    
    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC INPUTS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Policy commitment h = Com(P;r)
    signal input policyCommitment;
    signal input paramsCommitment;

    // Authorization-context binding: ctx = Poseidon(id_req || id_res || nonce).
    // Binding the context into the statement makes a proof non-transferable
    // across requesters, resources and sessions.
    signal input contextHash;
    // Current EVM hour bucket.  The ACM checks it against block.timestamp;
    // the circuit uses it for policy and approval validity checks.
    signal input requestEpoch;
    
    // Public parameters pp for external predicate verification
    signal input merkleRoots[M];                        // Merkle tree roots
    signal input credPublicKeys[M];                     // Institution public keys (simplified)
    signal input rangeMin[M];                           // Range minimum values
    signal input rangeMax[M];                           // Range maximum values
    signal input ontologyPolicyIds[M];                  // Policy IDs for ontology-linked terms
    signal input ontologyEpochs[M];                     // Policy epochs for ontology-linked terms
    signal input policyValidFromEpoch;
    signal input policyValidUntilEpoch;
    
    // ═══════════════════════════════════════════════════════════════════════
    // OUTPUT
    // ═══════════════════════════════════════════════════════════════════════
    
    signal output isAuthorized;                         // Final authorization decision
    
    // ═══════════════════════════════════════════════════════════════════════
    // INTERNAL SIGNALS
    // ═══════════════════════════════════════════════════════════════════════
    
    signal predicateValues[M];                          // Computed predicate values p
    signal policyResult;                                // Policy evaluation result
    signal commitmentValid;                             // Commitment verification result
    signal scopedFlagSum[M + 1];
    
    // ═══════════════════════════════════════════════════════════════════════  
    // CIRCUIT COMPONENTS
    // ═══════════════════════════════════════════════════════════════════════
    
    component policyInterpreter;
    component commitmentVerifier;
    component predicateVerifiers[M];
    component disabledCheckers[M];
    component scopedCheckers[M];
    component merkleRootHashers[M];
    component predicateTypeHashers[M];
    component predicateSchemaTagHashers[M];
    component credPublicKeyHashers[M];
    component rangeMinHashers[M];
    component rangeMaxHashers[M];
    component ontologyPolicyIdHashers[M];
    component ontologyEpochHashers[M];
    component scopeKindHashers[M];
    component approvedScopeIdHashers[M];
    component paramsDigestHashers[13];
    signal disabledFlags[M];
    signal scopedFlags[M];
    signal predicateTypeHashChain[M + 1];
    signal predicateSchemaTagHashChain[M + 1];
    signal merkleRootHashChain[M + 1];
    signal credPublicKeyHashChain[M + 1];
    signal rangeMinHashChain[M + 1];
    signal rangeMaxHashChain[M + 1];
    signal ontologyPolicyIdHashChain[M + 1];
    signal ontologyEpochHashChain[M + 1];
    signal scopeKindHashChain[M + 1];
    signal approvedScopeIdHashChain[M + 1];
    signal paramsDigestChain[14];
    component finalAnd;
    component contextHasher;
    component policyValidityVerifier;
    component policyWindowWellFormed;
    component noScopedPredicate;
    component holderIdHasher;
    component holderIdMatches;
    component holderSecretIsZero;
    
    // ───────────────────────────────────────────────────────────────────────
    // 1. VERIFY POLICY COMMITMENT: Com(P;r) = h
    // ───────────────────────────────────────────────────────────────────────
    
    commitmentVerifier = PolicyCommitmentVerifier(DEPTH);
    
    // Connect policy, program length and randomizer.
    // numOperations is bound into the commitment preimage so that the same
    // committed token array cannot be re-interpreted at a shorter prefix.
    for (var i = 0; i < DEPTH; i++) {
        commitmentVerifier.policy[i] <== policy[i];
    }
    commitmentVerifier.programLength <== numOperations;
    commitmentVerifier.randomizer <== randomizer;
    commitmentVerifier.expectedCommitment <== policyCommitment;
    
    commitmentValid <== commitmentVerifier.isValid;
    
    // ───────────────────────────────────────────────────────────────────────
    // 2. VERIFY EXTERNAL PREDICATES: Generate p from external proofs  
    // ───────────────────────────────────────────────────────────────────────
    
    predicateTypeHashChain[0] <== 0;
    predicateSchemaTagHashChain[0] <== 0;
    merkleRootHashChain[0] <== 0;
    credPublicKeyHashChain[0] <== 0;
    rangeMinHashChain[0] <== 0;
    rangeMaxHashChain[0] <== 0;
    ontologyPolicyIdHashChain[0] <== 0;
    ontologyEpochHashChain[0] <== 0;
    scopeKindHashChain[0] <== 0;
    approvedScopeIdHashChain[0] <== 0;
    scopedFlagSum[0] <== 0;

    for (var i = 0; i < M; i++) {
        predicateVerifiers[i] = ExternalPredicateVerifier(MERKLE_LEVELS, RANGE_BITS);
        
        // Connect predicate type
        predicateVerifiers[i].predicateType <== predicateTypes[i];
        predicateVerifiers[i].predicateSchemaTag <== predicateSchemaTags[i];
        predicateVerifiers[i].policyCommitment <== policyCommitment;
        predicateVerifiers[i].requesterId <== idReq;
        predicateVerifiers[i].resourceId <== idRes;
        predicateVerifiers[i].purposeCode <== purposeCode;
        predicateVerifiers[i].credValidFromEpoch <== credValidFromEpochs[i];
        predicateVerifiers[i].credValidUntilEpoch <== credValidUntilEpochs[i];
        predicateVerifiers[i].credentialId <== credentialIds[i];
        predicateVerifiers[i].requestEpoch <== requestEpoch;
        predicateVerifiers[i].scopeKind <== scopeKinds[i];
        predicateVerifiers[i].approvedScopeId <== approvedScopeIds[i];
        disabledCheckers[i] = IsEqual();
        disabledCheckers[i].in[0] <== predicateTypes[i];
        disabledCheckers[i].in[1] <== 4;
        disabledFlags[i] <== disabledCheckers[i].out;
        scopedCheckers[i] = IsEqual();
        scopedCheckers[i].in[0] <== predicateTypes[i];
        scopedCheckers[i].in[1] <== 5;
        scopedFlags[i] <== scopedCheckers[i].out;
        scopedFlagSum[i + 1] <== scopedFlagSum[i] + scopedFlags[i];
        
        // Connect Merkle proof inputs
        predicateVerifiers[i].merkleLeaf <== merkleLeaves[i];
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            predicateVerifiers[i].merklePathElements[j] <== merklePathElements[i][j];
            predicateVerifiers[i].merklePathIndices[j] <== merklePathIndices[i][j];
        }
        predicateVerifiers[i].merkleRoot <== merkleRoots[i];
        
        // Connect credential signature inputs
        predicateVerifiers[i].credSignature <== credSignatures[i];
        predicateVerifiers[i].credSigR8x <== credSigR8x[i];
        predicateVerifiers[i].credSigR8y <== credSigR8y[i];
        predicateVerifiers[i].credIssuerAx <== credIssuerAx[i];
        predicateVerifiers[i].credIssuerAy <== credIssuerAy[i];
        predicateVerifiers[i].credPublicKey <== credPublicKeys[i];
        
        // Connect range proof inputs
        predicateVerifiers[i].rangeValue <== rangeValues[i];
        predicateVerifiers[i].rangeMin <== rangeMin[i];
        predicateVerifiers[i].rangeMax <== rangeMax[i];
        
        // Connect ontology-linked terms inputs
        predicateVerifiers[i].ontologyCode <== ontologyCodes[i];
        predicateVerifiers[i].ontologyPolicyId <== ontologyPolicyIds[i];
        predicateVerifiers[i].ontologyEpoch <== ontologyEpochs[i];
        
        // Extract verified predicate value
        predicateValues[i] <== predicateVerifiers[i].isValid;

        // Enforce default padding for disabled predicates
        (merkleLeaves[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
        for (var j = 0; j < MERKLE_LEVELS; j++) {
            (merklePathElements[i][j] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;
            merklePathIndices[i][j] * disabledFlags[i] === 0;
        }
        (merkleRoots[i] - DEFAULT_MERKLE_VALUE) * disabledFlags[i] === 0;

        (credSignatures[i] - DEFAULT_CRED_SIGNATURE) * disabledFlags[i] === 0;
        (credPublicKeys[i] - DEFAULT_CRED_PUBLIC_KEY) * disabledFlags[i] === 0;

        (rangeValues[i] - DEFAULT_RANGE_VALUE) * disabledFlags[i] === 0;
        (rangeMin[i] - DEFAULT_RANGE_MIN) * disabledFlags[i] === 0;
        (rangeMax[i] - DEFAULT_RANGE_MAX) * disabledFlags[i] === 0;

        (ontologyCodes[i] - DEFAULT_ONTOLOGY_CODE) * disabledFlags[i] === 0;
        (ontologyPolicyIds[i] - DEFAULT_ONTOLOGY_POLICY_ID) * disabledFlags[i] === 0;
        (ontologyEpochs[i] - DEFAULT_ONTOLOGY_EPOCH) * disabledFlags[i] === 0;
        predicateSchemaTags[i] * disabledFlags[i] === 0;
        credValidFromEpochs[i] * disabledFlags[i] === 0;
        credValidUntilEpochs[i] * disabledFlags[i] === 0;
        credentialIds[i] * disabledFlags[i] === 0;

        predicateValues[i] * disabledFlags[i] === 0;

        // Scope values are canonical zero padding unless the slot selects the
        // signed scoped-credential verifier.
        scopeKinds[i] * (1 - scopedFlags[i]) === 0;
        approvedScopeIds[i] * (1 - scopedFlags[i]) === 0;

        // Hash chains for parameter commitment
        predicateTypeHashers[i] = Poseidon(2);
        predicateTypeHashers[i].inputs[0] <== predicateTypeHashChain[i];
        predicateTypeHashers[i].inputs[1] <== predicateTypes[i];
        predicateTypeHashChain[i + 1] <== predicateTypeHashers[i].out;

        predicateSchemaTagHashers[i] = Poseidon(2);
        predicateSchemaTagHashers[i].inputs[0] <== predicateSchemaTagHashChain[i];
        predicateSchemaTagHashers[i].inputs[1] <== predicateSchemaTags[i];
        predicateSchemaTagHashChain[i + 1] <== predicateSchemaTagHashers[i].out;

        merkleRootHashers[i] = Poseidon(2);
        merkleRootHashers[i].inputs[0] <== merkleRootHashChain[i];
        merkleRootHashers[i].inputs[1] <== merkleRoots[i];
        merkleRootHashChain[i + 1] <== merkleRootHashers[i].out;

        credPublicKeyHashers[i] = Poseidon(2);
        credPublicKeyHashers[i].inputs[0] <== credPublicKeyHashChain[i];
        credPublicKeyHashers[i].inputs[1] <== credPublicKeys[i];
        credPublicKeyHashChain[i + 1] <== credPublicKeyHashers[i].out;

        rangeMinHashers[i] = Poseidon(2);
        rangeMinHashers[i].inputs[0] <== rangeMinHashChain[i];
        rangeMinHashers[i].inputs[1] <== rangeMin[i];
        rangeMinHashChain[i + 1] <== rangeMinHashers[i].out;

        rangeMaxHashers[i] = Poseidon(2);
        rangeMaxHashers[i].inputs[0] <== rangeMaxHashChain[i];
        rangeMaxHashers[i].inputs[1] <== rangeMax[i];
        rangeMaxHashChain[i + 1] <== rangeMaxHashers[i].out;

        ontologyPolicyIdHashers[i] = Poseidon(2);
        ontologyPolicyIdHashers[i].inputs[0] <== ontologyPolicyIdHashChain[i];
        ontologyPolicyIdHashers[i].inputs[1] <== ontologyPolicyIds[i];
        ontologyPolicyIdHashChain[i + 1] <== ontologyPolicyIdHashers[i].out;

        ontologyEpochHashers[i] = Poseidon(2);
        ontologyEpochHashers[i].inputs[0] <== ontologyEpochHashChain[i];
        ontologyEpochHashers[i].inputs[1] <== ontologyEpochs[i];
        ontologyEpochHashChain[i + 1] <== ontologyEpochHashers[i].out;

        scopeKindHashers[i] = Poseidon(2);
        scopeKindHashers[i].inputs[0] <== scopeKindHashChain[i];
        scopeKindHashers[i].inputs[1] <== scopeKinds[i];
        scopeKindHashChain[i + 1] <== scopeKindHashers[i].out;

        approvedScopeIdHashers[i] = Poseidon(2);
        approvedScopeIdHashers[i].inputs[0] <== approvedScopeIdHashChain[i];
        approvedScopeIdHashers[i].inputs[1] <== approvedScopeIds[i];
        approvedScopeIdHashChain[i + 1] <== approvedScopeIdHashers[i].out;
    }

    paramsDigestChain[0] <== 0;

    paramsDigestHashers[0] = Poseidon(2);
    paramsDigestHashers[0].inputs[0] <== paramsDigestChain[0];
    paramsDigestHashers[0].inputs[1] <== predicateTypeHashChain[M];
    paramsDigestChain[1] <== paramsDigestHashers[0].out;

    paramsDigestHashers[1] = Poseidon(2);
    paramsDigestHashers[1].inputs[0] <== paramsDigestChain[1];
    paramsDigestHashers[1].inputs[1] <== predicateSchemaTagHashChain[M];
    paramsDigestChain[2] <== paramsDigestHashers[1].out;

    paramsDigestHashers[2] = Poseidon(2);
    paramsDigestHashers[2].inputs[0] <== paramsDigestChain[2];
    paramsDigestHashers[2].inputs[1] <== merkleRootHashChain[M];
    paramsDigestChain[3] <== paramsDigestHashers[2].out;

    paramsDigestHashers[3] = Poseidon(2);
    paramsDigestHashers[3].inputs[0] <== paramsDigestChain[3];
    paramsDigestHashers[3].inputs[1] <== credPublicKeyHashChain[M];
    paramsDigestChain[4] <== paramsDigestHashers[3].out;

    paramsDigestHashers[4] = Poseidon(2);
    paramsDigestHashers[4].inputs[0] <== paramsDigestChain[4];
    paramsDigestHashers[4].inputs[1] <== rangeMinHashChain[M];
    paramsDigestChain[5] <== paramsDigestHashers[4].out;

    paramsDigestHashers[5] = Poseidon(2);
    paramsDigestHashers[5].inputs[0] <== paramsDigestChain[5];
    paramsDigestHashers[5].inputs[1] <== rangeMaxHashChain[M];
    paramsDigestChain[6] <== paramsDigestHashers[5].out;

    paramsDigestHashers[6] = Poseidon(2);
    paramsDigestHashers[6].inputs[0] <== paramsDigestChain[6];
    paramsDigestHashers[6].inputs[1] <== ontologyPolicyIdHashChain[M];
    paramsDigestChain[7] <== paramsDigestHashers[6].out;

    paramsDigestHashers[7] = Poseidon(2);
    paramsDigestHashers[7].inputs[0] <== paramsDigestChain[7];
    paramsDigestHashers[7].inputs[1] <== ontologyEpochHashChain[M];
    paramsDigestChain[8] <== paramsDigestHashers[7].out;

    paramsDigestHashers[8] = Poseidon(2);
    paramsDigestHashers[8].inputs[0] <== paramsDigestChain[8];
    paramsDigestHashers[8].inputs[1] <== scopeKindHashChain[M];
    paramsDigestChain[9] <== paramsDigestHashers[8].out;

    paramsDigestHashers[9] = Poseidon(2);
    paramsDigestHashers[9].inputs[0] <== paramsDigestChain[9];
    paramsDigestHashers[9].inputs[1] <== approvedScopeIdHashChain[M];
    paramsDigestChain[10] <== paramsDigestHashers[9].out;

    paramsDigestHashers[10] = Poseidon(2);
    paramsDigestHashers[10].inputs[0] <== paramsDigestChain[10];
    paramsDigestHashers[10].inputs[1] <== policyValidFromEpoch;
    paramsDigestChain[11] <== paramsDigestHashers[10].out;

    paramsDigestHashers[11] = Poseidon(2);
    paramsDigestHashers[11].inputs[0] <== paramsDigestChain[11];
    paramsDigestHashers[11].inputs[1] <== policyValidUntilEpoch;
    paramsDigestChain[12] <== paramsDigestHashers[11].out;

    paramsDigestHashers[12] = Poseidon(2);
    paramsDigestHashers[12].inputs[0] <== paramsDigestChain[12];
    paramsDigestHashers[12].inputs[1] <== PARAM_DOMAIN_SEPARATOR;
    paramsDigestChain[13] <== paramsDigestHashers[12].out;

    paramsCommitment === paramsDigestChain[13];

    // A type-5 credential identifies its holder as Poseidon(holderSecret).
    // Non-scoped policies cannot smuggle an unused secret into the witness.
    noScopedPredicate = IsEqual();
    noScopedPredicate.in[0] <== scopedFlagSum[M];
    noScopedPredicate.in[1] <== 0;
    holderSecret * noScopedPredicate.out === 0;
    holderIdHasher = Poseidon(1);
    holderIdHasher.inputs[0] <== holderSecret;
    holderIdMatches = IsEqual();
    holderIdMatches.in[0] <== idReq;
    holderIdMatches.in[1] <== holderIdHasher.out;
    (1 - noScopedPredicate.out) * (1 - holderIdMatches.out) === 0;
    holderSecretIsZero = IsEqual();
    holderSecretIsZero.in[0] <== holderSecret;
    holderSecretIsZero.in[1] <== 0;
    holderSecretIsZero.out * (1 - noScopedPredicate.out) === 0;
    
    // ───────────────────────────────────────────────────────────────────────
    // 3. EVALUATE POLICY: C(P,(a,p)) = 1
    // ───────────────────────────────────────────────────────────────────────
    
    policyInterpreter = PostfixPolicyInterpreter(N, M, DEPTH, K);
    
    // Connect policy  
    for (var i = 0; i < DEPTH; i++) {
        policyInterpreter.postfixExpr[i] <== policy[i];
    }
    policyInterpreter.numOperations <== numOperations;
    
    // Connect requester attributes
    for (var i = 0; i < N; i++) {
        policyInterpreter.requesterPolicy[i] <== requesterAttrs[i];
    }
    
    // Connect verified predicate values
    for (var i = 0; i < M; i++) {
        policyInterpreter.predicateValues[i] <== predicateValues[i];
    }
    
    policyResult <== policyInterpreter.isValid;

    // ───────────────────────────────────────────────────────────────────────
    // 3b. BIND THE AUTHORIZATION CONTEXT: ctx = Poseidon(id_req || id_res || nonce)
    // ───────────────────────────────────────────────────────────────────────
    //
    // The context values stay private; only their digest is public. The digest
    // is bound by a hard equality rather than folded into isAuthorized, so a
    // proof produced for one (requester, resource, session) triple cannot be
    // replayed under another: witness generation fails outright.
    contextHasher = Poseidon(3);
    contextHasher.inputs[0] <== idReq;
    contextHasher.inputs[1] <== idRes;
    contextHasher.inputs[2] <== nonce;
    contextHash === contextHasher.out;

    // ───────────────────────────────────────────────────────────────────────
    // 4. COMBINE RESULTS: Authorization requires all components to be valid
    // ───────────────────────────────────────────────────────────────────────
    
    // Import AND gate from circomlib
    component and = AND();
    and.a <== commitmentValid;
    and.b <== policyResult;

    // Policy-wide temporal validity is bound by paramsCommitment.  requestEpoch
    // is public and checked against the EVM hour bucket by the ACM.
    policyValidityVerifier = RangeProof(RANGE_BITS);
    policyValidityVerifier.value <== requestEpoch;
    policyValidityVerifier.minValue <== policyValidFromEpoch;
    policyValidityVerifier.maxValue <== policyValidUntilEpoch;
    policyWindowWellFormed = GreaterEqThan(RANGE_BITS);
    policyWindowWellFormed.in[0] <== policyValidUntilEpoch;
    policyWindowWellFormed.in[1] <== policyValidFromEpoch;
    policyWindowWellFormed.out === 1;
    finalAnd = AND();
    finalAnd.a <== and.out;
    finalAnd.b <== policyValidityVerifier.isValid;
    
    // Final authorization decision
    isAuthorized <== finalAnd.out;
    
    // Internal signals for type checking
    signal tmp1[M];
    signal tmp2[M];
    signal tmp3[M];
    signal tmp4[M];
    
    // ═══════════════════════════════════════════════════════════════════════
    // ADDITIONAL CONSTRAINTS
    // ═══════════════════════════════════════════════════════════════════════
    
    // Enforce Boolean nature of requester attributes
    for (var i = 0; i < N; i++) {
        requesterAttrs[i] * (requesterAttrs[i] - 1) === 0;
    }
    
    // Ensure predicate types are valid (0 through 5) using quadratic constraints.
    for (var i = 0; i < M; i++) {
        // Check the product of (type - 0) through (type - 5) is zero.
        // Break down into quadratic operations
        tmp1[i] <== predicateTypes[i] * (predicateTypes[i] - 1);
        tmp2[i] <== (predicateTypes[i] - 2) * (predicateTypes[i] - 3);
        tmp3[i] <== tmp1[i] * tmp2[i];
        tmp4[i] <== (predicateTypes[i] - 4) * (predicateTypes[i] - 5);
        tmp3[i] * tmp4[i] === 0;
    }
}
