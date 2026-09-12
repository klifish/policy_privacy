pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/eddsaposeidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/mux1.circom";
include "../../node_modules/circomlib/circuits/mux3.circom";
include "../../node_modules/circomlib/circuits/gates.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

/*
    External Predicate Verifiers
    =============================
    
    These circuits implement zero-knowledge verification of external predicates
    as specified in the paper's approach section. They support:
    
    1. MerkleProofVerifier - for set membership proofs (ICD-10, MONDO codes)
    2. EdDSAVerifier - for institutional credential signatures
    3. RangeProof - for threshold and quantitative checks
    
    Each verifier takes external data and public parameters, then outputs
    a Boolean predicate value that can be used in the policy interpreter.
*/

// ═══════════════════════════════════════════════════════════════════════════
// 1. MERKLE MEMBERSHIP VERIFIER
// ═══════════════════════════════════════════════════════════════════════════

template MerkleProofVerifier(LEVELS) {
    // Private inputs
    signal input leaf;                              // The value being proven (e.g., ICD-10 code hash)
    signal input pathElements[LEVELS];              // Merkle proof path elements
    signal input pathIndices[LEVELS];               // Merkle proof path directions (0/1)
    
    // Public inputs  
    signal input root;                              // Merkle tree root (from public parameters)
    
    // Output
    signal output isValid;                          // Boolean: is leaf in tree?
    
    // Internal signals
    signal computedHash[LEVELS + 1];
    
    // Components
    component hashers[LEVELS];
    component leftSelectors[LEVELS];
    component rightSelectors[LEVELS];
    component rootCheck;
    
    // Initialize with leaf
    computedHash[0] <== leaf;
    
    // Verify Merkle path
    for (var i = 0; i < LEVELS; i++) {
        // Mux1 does not itself make the selector Boolean. Without this
        // constraint a malicious field element could select a linear mixture
        // rather than a left/right Merkle branch.
        pathIndices[i] * (pathIndices[i] - 1) === 0;
        // Select left input: if pathIndices[i] == 0, use current hash; else use path element
        leftSelectors[i] = Mux1();
        leftSelectors[i].c[0] <== computedHash[i];      // if pathIndices[i] == 0
        leftSelectors[i].c[1] <== pathElements[i];      // if pathIndices[i] == 1  
        leftSelectors[i].s <== pathIndices[i];
        
        // Select right input: if pathIndices[i] == 0, use path element; else use current hash
        rightSelectors[i] = Mux1();
        rightSelectors[i].c[0] <== pathElements[i];     // if pathIndices[i] == 0
        rightSelectors[i].c[1] <== computedHash[i];     // if pathIndices[i] == 1
        rightSelectors[i].s <== pathIndices[i];
        
        // Hash the selected pair
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== leftSelectors[i].out;
        hashers[i].inputs[1] <== rightSelectors[i].out;
        
        computedHash[i + 1] <== hashers[i].out;
    }
    
    // Verify computed root matches expected root
    rootCheck = IsEqual();
    rootCheck.in[0] <== computedHash[LEVELS];
    rootCheck.in[1] <== root;
    isValid <== rootCheck.out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. EDDSA CREDENTIAL VERIFIER  
// ═══════════════════════════════════════════════════════════════════════════

template CredentialSignatureVerifier() {
    // enabled = 1 runs the full EdDSA check as a hard constraint; enabled = 0
    // switches it off for slots that do not carry a credential predicate.
    // The caller must drive this from the predicate type, which is itself
    // constrained, never from a prover-chosen value.
    signal input enabled;

    // Policy-bound, typed approval credential inputs.  The circuit derives the
    // signed message itself; accepting a prover-provided opaque message would
    // permit a valid institutional signature to be replayed for a different
    // requester, resource, purpose, policy or validity interval.
    signal input schemaTag;
    signal input policyCommitment;
    signal input requesterId;
    signal input resourceId;
    signal input purposeCode;
    signal input validFromEpoch;
    signal input validUntilEpoch;
    signal input approvalId;
    signal input requestEpoch;

    // Private signature inputs
    signal input signature;                         // Signature scalar S
    signal input sigR8x;                            // Signature point R8.x
    signal input sigR8y;                            // Signature point R8.y
    signal input issuerAx;                          // Issuer public-key point x
    signal input issuerAy;                          // Issuer public-key point y

    // Committed issuer identity: Poseidon(Ax, Ay), bound via paramsCommitment.
    signal input publicKey;

    // Output
    signal output isValid;                          // Boolean: is signature valid?

    // 1. Bind the supplied key point to the issuer identity committed in the
    //    policy parameters. Keeping the committed value a single field element
    //    preserves the existing paramsCommitment layout and on-chain interface,
    //    while the point itself stays a private witness.
    component keyDigest = Poseidon(2);
    keyDigest.inputs[0] <== issuerAx;
    keyDigest.inputs[1] <== issuerAy;

    component keyMatches = IsEqual();
    keyMatches.in[0] <== keyDigest.out;
    keyMatches.in[1] <== publicKey;

    // 2. Construct and verify the InstitutionalApprovalV1 message.  The
    // domain and schema constants prevent cross-protocol interpretation of a
    // signature intended for another credential format.
    var INSTITUTIONAL_APPROVAL_V1 = 1001;
    component schemaMatches = IsEqual();
    schemaMatches.in[0] <== schemaTag;
    schemaMatches.in[1] <== INSTITUTIONAL_APPROVAL_V1;

    component approvalDigest = Poseidon(8);
    // schemaTag is committed in paramsCommitment and doubles as the credential
    // domain tag, so an approval cannot be reinterpreted under another schema.
    approvalDigest.inputs[0] <== schemaTag;
    approvalDigest.inputs[1] <== policyCommitment;
    approvalDigest.inputs[2] <== requesterId;
    approvalDigest.inputs[3] <== resourceId;
    approvalDigest.inputs[4] <== purposeCode;
    approvalDigest.inputs[5] <== validFromEpoch;
    approvalDigest.inputs[6] <== validUntilEpoch;
    approvalDigest.inputs[7] <== approvalId;

    component startsBeforeRequest = GreaterEqThan(32);
    startsBeforeRequest.in[0] <== requestEpoch;
    startsBeforeRequest.in[1] <== validFromEpoch;
    component endsAfterRequest = LessEqThan(32);
    endsAfterRequest.in[0] <== requestEpoch;
    endsAfterRequest.in[1] <== validUntilEpoch;
    component validityAnd = AND();
    validityAnd.a <== startsBeforeRequest.out;
    validityAnd.b <== endsAfterRequest.out;

    // 3. Verify the EdDSA signature over the typed credential digest.
    //    EdDSAPoseidonVerifier enforces validity by constraint when enabled, so
    //    an invalid signature makes the witness unsatisfiable rather than merely
    //    yielding isValid = 0. enabled is driven by the predicate type, which is
    //    constrained by the caller; gating it on keyMatches instead would let a
    //    prover switch the signature check off by supplying a key point that
    //    does not match the committed issuer.
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== enabled;
    eddsa.Ax <== issuerAx;
    eddsa.Ay <== issuerAy;
    eddsa.S <== signature;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.M <== approvalDigest.out;

    // Signature validity is enforced above by constraint; the remaining
    // condition is that the signing key is the issuer committed in the policy
    // parameters, the schema is the approved schema, and the approval is
    // temporally valid. A disabled slot never reports a satisfied predicate.
    signal keyAndSchema;
    signal typedApprovalValid;
    keyAndSchema <== keyMatches.out * schemaMatches.out;
    typedApprovalValid <== keyAndSchema * validityAnd.out;
    isValid <== enabled * typedApprovalValid;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2b. SIGNED SCOPED-CREDENTIAL VERIFIER (DUO US / PS / IS)
// ═══════════════════════════════════════════════════════════════════════════

template SignedScopedCredentialVerifier() {
    signal input enabled;
    signal input schemaTag;
    signal input scopeKind;          // 26=US, 27=PS, 28=IS
    signal input approvedScopeId;
    signal input requesterId;
    signal input validFromEpoch;
    signal input validUntilEpoch;
    signal input credentialId;
    signal input requestEpoch;
    signal input signature;
    signal input sigR8x;
    signal input sigR8y;
    signal input issuerAx;
    signal input issuerAy;
    signal input publicKey;
    signal output isValid;

    var SCOPED_AFFILIATION_CREDENTIAL_V1 = 2002;
    component schemaMatches = IsEqual();
    schemaMatches.in[0] <== schemaTag;
    schemaMatches.in[1] <== SCOPED_AFFILIATION_CREDENTIAL_V1;

    // Bind the witness issuer point to the issuer key committed by this
    // policy slot. A policy therefore decides who may issue each US/PS/IS
    // credential, rather than trusting a requester-selected signer.
    component keyDigest = Poseidon(2);
    keyDigest.inputs[0] <== issuerAx;
    keyDigest.inputs[1] <== issuerAy;
    component keyMatches = IsEqual();
    keyMatches.in[0] <== keyDigest.out;
    keyMatches.in[1] <== publicKey;

    component credentialDigest = Poseidon(7);
    credentialDigest.inputs[0] <== SCOPED_AFFILIATION_CREDENTIAL_V1;
    credentialDigest.inputs[1] <== scopeKind;
    credentialDigest.inputs[2] <== requesterId;
    credentialDigest.inputs[3] <== approvedScopeId;
    credentialDigest.inputs[4] <== validFromEpoch;
    credentialDigest.inputs[5] <== validUntilEpoch;
    credentialDigest.inputs[6] <== credentialId;

    component isUS = IsEqual();
    component isPS = IsEqual();
    component isIS = IsEqual();
    isUS.in[0] <== scopeKind;
    isUS.in[1] <== 26;
    isPS.in[0] <== scopeKind;
    isPS.in[1] <== 27;
    isIS.in[0] <== scopeKind;
    isIS.in[1] <== 28;
    // DUO:0000026 denotes a particular approved user, rather than membership
    // in a named group. Project and institution scopes intentionally do not
    // impose this equality.
    // This legacy-only constraint must be gated. Type-8 allowlist policies
    // reuse scopeKind=26 but do not use a signed-credential scope identifier.
    signal legacyUserScopeRelation;
    legacyUserScopeRelation <== (requesterId - approvedScopeId) * isUS.out;
    legacyUserScopeRelation * enabled === 0;
    signal supportedKind;
    supportedKind <== isUS.out + isPS.out + isIS.out;

    component startsBeforeRequest = GreaterEqThan(32);
    component endsAfterRequest = LessEqThan(32);
    startsBeforeRequest.in[0] <== requestEpoch;
    startsBeforeRequest.in[1] <== validFromEpoch;
    endsAfterRequest.in[0] <== requestEpoch;
    endsAfterRequest.in[1] <== validUntilEpoch;

    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== enabled;
    eddsa.Ax <== issuerAx;
    eddsa.Ay <== issuerAy;
    eddsa.S <== signature;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.M <== credentialDigest.out;

    signal temporalValid;
    signal keyAndSchema;
    signal keySchemaKind;
    signal enabledCredential;
    temporalValid <== startsBeforeRequest.out * endsAfterRequest.out;
    keyAndSchema <== keyMatches.out * schemaMatches.out;
    keySchemaKind <== keyAndSchema * supportedKind;
    enabledCredential <== enabled * keySchemaKind;
    isValid <== enabledCredential * temporalValid;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2c. REQUESTER ALLOWLIST VERIFIER (DUO US / PS / IS)
// ═══════════════════════════════════════════════════════════════════════════

/*
    A multi-user US, PS, or IS policy commits a Poseidon Merkle root of requester
    pseudonyms.  The leaf is derived in-circuit from requesterId rather than
    accepted from the prover, so a membership path is unambiguously bound to
    the holder pseudonym that the main circuit derives from holderSecret.

    Keep this distinct from SignedScopedCredentialVerifier (schema 2002): an
    old one-user credential must never be reinterpreted as an allowlist proof.
*/
template RequesterAllowlistVerifier(LEVELS) {
    signal input enabled;
    signal input requesterId;
    signal input merkleLeaf;
    signal input merklePathElements[LEVELS];
    signal input merklePathIndices[LEVELS];
    signal input merkleRoot;
    signal input schemaTag;
    signal input scopeKind;
    signal input approvedScopeId;
    signal input credPublicKey;
    signal output isValid;

    var USER_ALLOWLIST_V1 = 2005;

    component leafHasher = Poseidon(4);
    leafHasher.inputs[0] <== USER_ALLOWLIST_V1;
    leafHasher.inputs[1] <== scopeKind;
    leafHasher.inputs[2] <== approvedScopeId;
    leafHasher.inputs[3] <== requesterId;
    (merkleLeaf - leafHasher.out) * enabled === 0;

    component membership = MerkleProofVerifier(LEVELS);
    membership.leaf <== leafHasher.out;
    membership.root <== merkleRoot;
    for (var i = 0; i < LEVELS; i++) {
        membership.pathElements[i] <== merklePathElements[i];
        membership.pathIndices[i] <== merklePathIndices[i];
    }

    // Metadata is policy-bound through paramsCommitment. Constrain it rather
    // than merely returning false: a malformed type-8 slot must not turn into
    // a successful negated requester-allowlist branch in a policy expression.
    (schemaTag - USER_ALLOWLIST_V1) * enabled === 0;
    // Scope kind retains the DUO policy label while all three terms share the
    // same requester membership mechanism: 26=US, 27=PS, 28=IS.
    component scopeIsUS = IsEqual();
    component scopeIsPS = IsEqual();
    component scopeIsIS = IsEqual();
    scopeIsUS.in[0] <== scopeKind;
    scopeIsUS.in[1] <== 26;
    scopeIsPS.in[0] <== scopeKind;
    scopeIsPS.in[1] <== 27;
    scopeIsIS.in[0] <== scopeKind;
    scopeIsIS.in[1] <== 28;
    signal isRequesterScope;
    isRequesterScope <== scopeIsUS.out + scopeIsPS.out + scopeIsIS.out;
    isRequesterScope * enabled === enabled;
    // US has no project/institution identifier. PS and IS require one, and it
    // is included in the leaf to prevent a path crossing scope boundaries.
    signal userScopeId;
    userScopeId <== approvedScopeId * scopeIsUS.out;
    userScopeId * enabled === 0;
    component approvedScopeIdIsZero = IsEqual();
    approvedScopeIdIsZero.in[0] <== approvedScopeId;
    approvedScopeIdIsZero.in[1] <== 0;
    signal projectOrInstitution;
    projectOrInstitution <== scopeIsPS.out + scopeIsIS.out;
    signal missingScopedId;
    missingScopedId <== approvedScopeIdIsZero.out * projectOrInstitution;
    missingScopedId * enabled === 0;
    credPublicKey * enabled === 0;
    component rootIsZero = IsEqual();
    rootIsZero.in[0] <== merkleRoot;
    rootIsZero.in[1] <== 0;
    rootIsZero.out * enabled === 0;
    isValid <== enabled * membership.isValid;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2d. POLICY OBLIGATION VERIFIER (MOR / TS)
// ═══════════════════════════════════════════════════════════════════════════

template PolicyObligationVerifier(SCHEMA_TAG) {
    signal input schemaTag;
    signal input epochValue;
    signal output isValid;

    // MOR and TS parameters are policy parameters, not requester claims.
    // Keep the value inside the 32-bit epoch representation used everywhere
    // else in the circuit and reject the canonical zero sentinel.
    component schemaMatches = IsEqual();
    schemaMatches.in[0] <== schemaTag;
    schemaMatches.in[1] <== SCHEMA_TAG;
    component epochBits = Num2Bits(32);
    epochBits.in <== epochValue;
    component isZero = IsEqual();
    isZero.in[0] <== epochValue;
    isZero.in[1] <== 0;
    isValid <== schemaMatches.out * (1 - isZero.out);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. RANGE/THRESHOLD PROOF VERIFIER
// ═══════════════════════════════════════════════════════════════════════════

template RangeProof(BITS) {
    // Private inputs
    signal input value;                             // The private value being checked
    
    // Public inputs
    signal input minValue;                          // Minimum threshold
    signal input maxValue;                          // Maximum threshold  
    
    // Output
    signal output isValid;                          // Boolean: minValue <= value <= maxValue?
    
    // Components
    component gte, lte;
    component and;
    
    // Check value >= minValue
    gte = GreaterEqThan(BITS);
    gte.in[0] <== value;
    gte.in[1] <== minValue;
    
    // Check value <= maxValue  
    lte = LessEqThan(BITS);
    lte.in[0] <== value;
    lte.in[1] <== maxValue;
    
    // Combine results with AND
    and = AND();
    and.a <== gte.out;
    and.b <== lte.out;
    
    isValid <== and.out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. ONTOLOGY-LINKED TERMS VERIFIER (ICD-10, MONDO, etc.)
// ═══════════════════════════════════════════════════════════════════════════

template OntologyLinkedTermsVerifier(LEVELS) {
    // Private inputs (held only by the requester, not disclosed)
    signal input icdCode;                           // The ICD code chosen by the requester (after normalization)
    signal input merklePathElements[LEVELS];        // Merkle proof path elements
    signal input merklePathIndices[LEVELS];         // Merkle proof path directions (0/1)
    
    // Public inputs
    signal input allowedRoot;                       // Merkle root published by data provider
    signal input policyId;                          // Unique identifier of the policy
    signal input epoch;                             // Version number of the policy
    
    // Output
    signal output pred;                             // Boolean predicate: 1 if valid, 0 otherwise
    
    // Internal components
    component merkleVerifier;
    component policyBinding;
    component epochCheck;
    component finalAnd;
    
    // 1. Domain-separate ontology leaves from scoped affiliation leaves.
    component ontologyLeaf = Poseidon(2);
    ontologyLeaf.inputs[0] <== 2000;
    ontologyLeaf.inputs[1] <== icdCode;

    // 2. Verify the domain-separated term is in the allowed set.
    merkleVerifier = MerkleProofVerifier(LEVELS);
    merkleVerifier.leaf <== ontologyLeaf.out;
    merkleVerifier.root <== allowedRoot;
    for (var i = 0; i < LEVELS; i++) {
        merkleVerifier.pathElements[i] <== merklePathElements[i];
        merkleVerifier.pathIndices[i] <== merklePathIndices[i];
    }
    
    // 3. Policy binding: Ensure proof is bound to specific policy
    // For Phase 1, we'll use a simple constraint that policyId must be non-zero
    // In production, this would involve more sophisticated policy binding
    policyBinding = IsEqual();
    policyBinding.in[0] <== policyId;  // Compare policyId with 0
    policyBinding.in[1] <== 0;         // Always 0
    signal policyValid;
    policyValid <== 1 - policyBinding.out;  // policyValid = 1 if policyId != 0
    
    // Note: policyId is now properly used in the constraint above
    // No need for additional policyConstraint
    
    // 3. Epoch validation: Ensure epoch is valid (non-zero for now)
    // In production, this would check against allowed epoch ranges
    epochCheck = IsEqual();
    epochCheck.in[0] <== epoch;
    epochCheck.in[1] <== 0;
    signal epochValid;
    epochValid <== 1 - epochCheck.out;  // epochValid = 1 if epoch != 0
    
    // 4. Combine all checks: Merkle proof AND policy binding AND epoch validation
    component and1, and2;
    
    and1 = AND();
    and1.a <== merkleVerifier.isValid;
    and1.b <== policyValid;
    
    and2 = AND();
    and2.a <== and1.out;
    and2.b <== epochValid;
    
    // Output the final predicate
    pred <== and2.out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. DUO PROFILE CREDENTIAL (V1 / schema 2006)
// ═══════════════════════════════════════════════════════════════════════════

template DuoProfileCredentialVerifier() {
    signal input enabled;
    signal input schemaTag;
    signal input policyCommitment;
    signal input requesterId;
    signal input resourceId;
    // Seven packed bits, least significant first: research, health/medical,
    // methods-development, genetic-study, ancestry, commercial, non-profit.
    signal input profileClaims;
    signal input validFromEpoch;
    signal input validUntilEpoch;
    signal input credentialId;
    signal input requestEpoch;
    signal input signature;
    signal input sigR8x;
    signal input sigR8y;
    signal input issuerAx;
    signal input issuerAy;
    signal input publicKey;
    signal output isValid;

    component claimBits = Num2Bits(7);
    claimBits.in <== profileClaims;
    component fromBits = Num2Bits(32);
    fromBits.in <== validFromEpoch;
    component untilBits = Num2Bits(32);
    untilBits.in <== validUntilEpoch;
    component credentialIdZero = IsEqual();
    credentialIdZero.in[0] <== credentialId;
    credentialIdZero.in[1] <== 0;
    component schemaMatches = IsEqual();
    schemaMatches.in[0] <== schemaTag;
    schemaMatches.in[1] <== 2006;
    component keyDigest = Poseidon(2);
    keyDigest.inputs[0] <== issuerAx;
    keyDigest.inputs[1] <== issuerAy;
    component keyMatches = IsEqual();
    keyMatches.in[0] <== keyDigest.out;
    keyMatches.in[1] <== publicKey;
    component startsBeforeRequest = GreaterEqThan(32);
    startsBeforeRequest.in[0] <== requestEpoch;
    startsBeforeRequest.in[1] <== validFromEpoch;
    component endsAfterRequest = LessEqThan(32);
    endsAfterRequest.in[0] <== requestEpoch;
    endsAfterRequest.in[1] <== validUntilEpoch;
    component digest = Poseidon(14);
    digest.inputs[0] <== schemaTag;
    digest.inputs[1] <== policyCommitment;
    digest.inputs[2] <== requesterId;
    digest.inputs[3] <== resourceId;
    for (var i = 0; i < 7; i++) digest.inputs[4 + i] <== claimBits.out[i];
    digest.inputs[11] <== validFromEpoch;
    digest.inputs[12] <== validUntilEpoch;
    digest.inputs[13] <== credentialId;
    component eddsa = EdDSAPoseidonVerifier();
    eddsa.enabled <== enabled;
    eddsa.Ax <== issuerAx;
    eddsa.Ay <== issuerAy;
    eddsa.S <== signature;
    eddsa.R8x <== sigR8x;
    eddsa.R8y <== sigR8y;
    eddsa.M <== digest.out;
    signal keyAndSchema;
    signal validity;
    signal nonZeroId;
    signal validIdentity;
    keyAndSchema <== keyMatches.out * schemaMatches.out;
    validity <== startsBeforeRequest.out * endsAfterRequest.out;
    nonZeroId <== 1 - credentialIdZero.out;
    validIdentity <== keyAndSchema * validity;
    isValid <== validIdentity * nonZeroId;
}

// Fixed semantic production slots avoid instantiating every verifier in every
// slot.  V3 permits only the documented DUO layout: ontology 0..4, requester
// allowlists 5..7, MOR 8, TS 9, and DUO_PROFILE 10.
template ProductionPredicateVerifier(SLOT, MERKLE_LEVELS) {
    signal input predicateType;
    signal input predicateSchemaTag;
    signal input policyCommitment;
    signal input requesterId;
    signal input resourceId;
    signal input requestEpoch;
    signal input merkleLeaf;
    signal input merklePathElements[MERKLE_LEVELS];
    signal input merklePathIndices[MERKLE_LEVELS];
    signal input merkleRoot;
    signal input ontologyCode;
    signal input ontologyPolicyId;
    signal input ontologyEpoch;
    signal input scopeKind;
    signal input approvedScopeId;
    signal input moratoriumUntilEpoch;
    signal input timeLimitEpochs;
    signal input profileClaims;
    signal input credValidFromEpoch;
    signal input credValidUntilEpoch;
    signal input credentialId;
    signal input credSignature;
    signal input credSigR8x;
    signal input credSigR8y;
    signal input credIssuerAx;
    signal input credIssuerAy;
    signal input credPublicKey;
    signal output isValid;

    component disabled = IsEqual();
    disabled.in[0] <== predicateType;
    disabled.in[1] <== 4;
    if (SLOT < 5) {
        component selected = IsEqual();
        selected.in[0] <== predicateType;
        selected.in[1] <== 3;
        selected.out + disabled.out === 1;
        predicateSchemaTag === 0;
        scopeKind === 0;
        approvedScopeId === 0;
        credPublicKey === 0;
        component verifier = OntologyLinkedTermsVerifier(MERKLE_LEVELS);
        verifier.icdCode <== ontologyCode;
        verifier.allowedRoot <== merkleRoot;
        verifier.policyId <== ontologyPolicyId;
        verifier.epoch <== ontologyEpoch;
        for (var i = 0; i < MERKLE_LEVELS; i++) {
            verifier.merklePathElements[i] <== merklePathElements[i];
            verifier.merklePathIndices[i] <== merklePathIndices[i];
        }
        isValid <== selected.out * verifier.pred;
    } else if (SLOT < 8) {
        component selected = IsEqual();
        selected.in[0] <== predicateType;
        selected.in[1] <== 8;
        selected.out + disabled.out === 1;
        component verifier = RequesterAllowlistVerifier(MERKLE_LEVELS);
        verifier.enabled <== selected.out;
        verifier.requesterId <== requesterId;
        verifier.merkleLeaf <== merkleLeaf;
        verifier.merkleRoot <== merkleRoot;
        verifier.schemaTag <== predicateSchemaTag;
        verifier.scopeKind <== scopeKind;
        verifier.approvedScopeId <== approvedScopeId;
        verifier.credPublicKey <== credPublicKey;
        for (var i = 0; i < MERKLE_LEVELS; i++) {
            verifier.merklePathElements[i] <== merklePathElements[i];
            verifier.merklePathIndices[i] <== merklePathIndices[i];
        }
        scopeKind === (SLOT + 21) * selected.out;
        isValid <== selected.out * verifier.isValid;
    } else if (SLOT == 8 || SLOT == 9) {
        component selected = IsEqual();
        selected.in[0] <== predicateType;
        selected.in[1] <== (SLOT == 8 ? 6 : 7);
        selected.out + disabled.out === 1;
        predicateSchemaTag === (SLOT == 8 ? 2003 : 2004) * selected.out;
        scopeKind === 0;
        approvedScopeId === 0;
        component verifier = PolicyObligationVerifier(SLOT == 8 ? 2003 : 2004);
        verifier.schemaTag <== predicateSchemaTag;
        verifier.epochValue <== (SLOT == 8 ? moratoriumUntilEpoch : timeLimitEpochs);
        isValid <== selected.out * verifier.isValid;
    } else {
        component selected = IsEqual();
        selected.in[0] <== predicateType;
        selected.in[1] <== 9;
        selected.out + disabled.out === 1;
        predicateSchemaTag === 2006 * selected.out;
        merkleRoot === 0;
        ontologyPolicyId === 0;
        ontologyEpoch === 0;
        scopeKind === 0;
        approvedScopeId === 0;
        component verifier = DuoProfileCredentialVerifier();
        verifier.enabled <== selected.out;
        verifier.schemaTag <== predicateSchemaTag;
        verifier.policyCommitment <== policyCommitment;
        verifier.requesterId <== requesterId;
        verifier.resourceId <== resourceId;
        verifier.profileClaims <== profileClaims;
        verifier.validFromEpoch <== credValidFromEpoch;
        verifier.validUntilEpoch <== credValidUntilEpoch;
        verifier.credentialId <== credentialId;
        verifier.requestEpoch <== requestEpoch;
        verifier.signature <== credSignature;
        verifier.sigR8x <== credSigR8x;
        verifier.sigR8y <== credSigR8y;
        verifier.issuerAx <== credIssuerAx;
        verifier.issuerAy <== credIssuerAy;
        verifier.publicKey <== credPublicKey;
        isValid <== selected.out * verifier.isValid;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. UNIFIED EXTERNAL PREDICATE VERIFIER (legacy/test only)
// ═══════════════════════════════════════════════════════════════════════════

// ALLOWED is a compile-time bitmask of the predicate types this instance may
// carry: bit t set means type t is reachable here. Arithmetic circuits cannot
// branch at proving time, so every verifier instantiated below is expanded into
// R1CS whether or not its type is selected. Slots whose type is already fixed
// (DUO V3 pins each of the eleven production slots to one type — see the
// per-slot equality constraints in policy_privacy_main.circom) therefore pay for
// eight verifiers they can never select. Passing a narrow ALLOWED drops those
// branches at compile time; the omitted selectors contribute 0 to isValid, which
// is exactly what the type equality check would have forced them to contribute.
// Pass ALL_PREDICATE_TYPES to keep the fully generic behaviour.
//
// This is a compile-time specialisation only: for any witness both shapes accept
// exactly the same statements, because a type outside ALLOWED is already
// unsatisfiable in the caller.
function ALL_PREDICATE_TYPES() {
    // types 0,1,2,3,5,6,7,8,9 (4 = disabled carries no verifier)
    return 1 + 2 + 4 + 8 + 32 + 64 + 128 + 256 + 512;
}

template ExternalPredicateVerifier(MERKLE_LEVELS, RANGE_BITS, ALLOWED) {
    // Predicate type selector (0=merkle, 1=signature, 2=range, 3=ontology-linked,
    // 4=disabled, 5=legacy signed scoped credential, 6=MOR, 7=TS,
    // 8=US/PS/IS requester allowlist)
    signal input predicateType;
    
    // Merkle proof inputs
    signal input merkleLeaf;
    signal input merklePathElements[MERKLE_LEVELS]; 
    signal input merklePathIndices[MERKLE_LEVELS];
    signal input merkleRoot;
    
    // Typed institutional-approval credential inputs
    signal input predicateSchemaTag;
    signal input policyCommitment;
    signal input requesterId;
    signal input resourceId;
    signal input purposeCode;
    signal input profileClaims;
    signal input credValidFromEpoch;
    signal input credValidUntilEpoch;
    signal input credentialId;
    signal input requestEpoch;

    // Signature inputs
    signal input credSignature;                     // Signature scalar S
    signal input credSigR8x;                        // Signature point R8.x
    signal input credSigR8y;                        // Signature point R8.y
    signal input credIssuerAx;                      // Issuer public-key point x
    signal input credIssuerAy;                      // Issuer public-key point y
    signal input credPublicKey;                     // Committed issuer identity Poseidon(Ax, Ay)
    
    // Range proof inputs  
    signal input rangeValue;
    signal input rangeMin;
    signal input rangeMax;
    
    // Ontology-linked terms inputs
    signal input ontologyCode;                      // ICD code or other ontology term
    signal input ontologyPolicyId;                  // Policy ID for binding
    signal input ontologyEpoch;                     // Policy epoch/version

    // Signed scoped-credential inputs. Scope kind and ID are policy parameters;
    // the credential fields and signature remain private witness values.
    signal input scopeKind;
    signal input approvedScopeId;
    signal input moratoriumUntilEpoch;
    signal input timeLimitEpochs;
    
    // Output
    signal output isValid;
    
    // Components
    component merkleVerifier;
    component signatureVerifier;  
    component rangeVerifier;
    component ontologyVerifier;
    component scopedVerifier;
    component allowlistVerifier;
    component moratoriumVerifier;
    component timeLimitVerifier;
    component profileVerifier;
    component type0Check, type1Check, type2Check, type3Check, type5Check, type6Check, type7Check, type8Check, type9Check;
    
    // Select result based on predicate type using manual selection.
    // predicateType: 0=Merkle, 1=Signature, 2=Range, 3=Ontology-Linked
    // A selector is built only for a type this instance may carry; excluded
    // types keep a constant-0 selector so the sum below is unchanged.
    signal sel0, sel1, sel2, sel3, sel5, sel6, sel7, sel8, sel9;

    if (ALLOWED & 1) {
        type0Check = IsEqual();
        type0Check.in[0] <== predicateType;
        type0Check.in[1] <== 0;
        sel0 <== type0Check.out;
    } else { sel0 <== 0; }

    if (ALLOWED & 2) {
        type1Check = IsEqual();
        type1Check.in[0] <== predicateType;
        type1Check.in[1] <== 1;
        sel1 <== type1Check.out;
    } else { sel1 <== 0; }

    if (ALLOWED & 4) {
        type2Check = IsEqual();
        type2Check.in[0] <== predicateType;
        type2Check.in[1] <== 2;
        sel2 <== type2Check.out;
    } else { sel2 <== 0; }

    if (ALLOWED & 8) {
        type3Check = IsEqual();
        type3Check.in[0] <== predicateType;
        type3Check.in[1] <== 3;
        sel3 <== type3Check.out;
    } else { sel3 <== 0; }

    if (ALLOWED & 32) {
        type5Check = IsEqual();
        type5Check.in[0] <== predicateType;
        type5Check.in[1] <== 5;
        sel5 <== type5Check.out;
    } else { sel5 <== 0; }

    if (ALLOWED & 64) {
        type6Check = IsEqual();
        type6Check.in[0] <== predicateType;
        type6Check.in[1] <== 6;
        sel6 <== type6Check.out;
    } else { sel6 <== 0; }

    if (ALLOWED & 128) {
        type7Check = IsEqual();
        type7Check.in[0] <== predicateType;
        type7Check.in[1] <== 7;
        sel7 <== type7Check.out;
    } else { sel7 <== 0; }

    if (ALLOWED & 256) {
        type8Check = IsEqual();
        type8Check.in[0] <== predicateType;
        type8Check.in[1] <== 8;
        sel8 <== type8Check.out;
    } else { sel8 <== 0; }

    if (ALLOWED & 512) {
        type9Check = IsEqual();
        type9Check.in[0] <== predicateType;
        type9Check.in[1] <== 9;
        sel9 <== type9Check.out;
    } else { sel9 <== 0; }

    // MOR and TS are policy-level obligations, not scoped credentials.  Their
    // slots must not carry a scope kind or scope identifier that could be
    // confused with a US/PS/IS assertion.  On a slot that can carry neither the
    // guard is vacuous (both selectors are 0), so it is kept unconditionally.
    signal obligationTypeSelected;
    obligationTypeSelected <== sel6 + sel7;
    scopeKind * obligationTypeSelected === 0;
    approvedScopeId * obligationTypeSelected === 0;

    // Instantiate only the verifiers this instance may select. An omitted
    // verifier contributes 0 to isValid through its constant-0 selector.
    if (ALLOWED & 1) {
        merkleVerifier = MerkleProofVerifier(MERKLE_LEVELS);
        merkleVerifier.leaf <== merkleLeaf;
        for (var i = 0; i < MERKLE_LEVELS; i++) {
            merkleVerifier.pathElements[i] <== merklePathElements[i];
            merkleVerifier.pathIndices[i] <== merklePathIndices[i];
        }
        merkleVerifier.root <== merkleRoot;
    }

    if (ALLOWED & 2) {
        signatureVerifier = CredentialSignatureVerifier();
        signatureVerifier.schemaTag <== predicateSchemaTag;
        signatureVerifier.policyCommitment <== policyCommitment;
        signatureVerifier.requesterId <== requesterId;
        signatureVerifier.resourceId <== resourceId;
        signatureVerifier.purposeCode <== purposeCode;
        signatureVerifier.validFromEpoch <== credValidFromEpoch;
        signatureVerifier.validUntilEpoch <== credValidUntilEpoch;
        signatureVerifier.approvalId <== credentialId;
        signatureVerifier.requestEpoch <== requestEpoch;
        signatureVerifier.signature <== credSignature;
        signatureVerifier.sigR8x <== credSigR8x;
        signatureVerifier.sigR8y <== credSigR8y;
        signatureVerifier.issuerAx <== credIssuerAx;
        signatureVerifier.issuerAy <== credIssuerAy;
        signatureVerifier.publicKey <== credPublicKey;
        // Run the EdDSA check only for slots whose predicate type selects it.
        // predicateType is range-constrained by the caller, so this is not a
        // prover-controlled switch.
        signatureVerifier.enabled <== sel1;
    }

    if (ALLOWED & 512) {
        profileVerifier = DuoProfileCredentialVerifier();
        profileVerifier.enabled <== sel9;
        profileVerifier.schemaTag <== predicateSchemaTag;
        profileVerifier.policyCommitment <== policyCommitment;
        profileVerifier.requesterId <== requesterId;
        profileVerifier.resourceId <== resourceId;
        profileVerifier.profileClaims <== profileClaims;
        profileVerifier.validFromEpoch <== credValidFromEpoch;
        profileVerifier.validUntilEpoch <== credValidUntilEpoch;
        profileVerifier.credentialId <== credentialId;
        profileVerifier.requestEpoch <== requestEpoch;
        profileVerifier.signature <== credSignature;
        profileVerifier.sigR8x <== credSigR8x;
        profileVerifier.sigR8y <== credSigR8y;
        profileVerifier.issuerAx <== credIssuerAx;
        profileVerifier.issuerAy <== credIssuerAy;
        profileVerifier.publicKey <== credPublicKey;
    }

    if (ALLOWED & 32) {
        scopedVerifier = SignedScopedCredentialVerifier();
        scopedVerifier.enabled <== sel5;
        scopedVerifier.schemaTag <== predicateSchemaTag;
        scopedVerifier.scopeKind <== scopeKind;
        scopedVerifier.approvedScopeId <== approvedScopeId;
        scopedVerifier.requesterId <== requesterId;
        scopedVerifier.validFromEpoch <== credValidFromEpoch;
        scopedVerifier.validUntilEpoch <== credValidUntilEpoch;
        scopedVerifier.credentialId <== credentialId;
        scopedVerifier.requestEpoch <== requestEpoch;
        scopedVerifier.signature <== credSignature;
        scopedVerifier.sigR8x <== credSigR8x;
        scopedVerifier.sigR8y <== credSigR8y;
        scopedVerifier.issuerAx <== credIssuerAx;
        scopedVerifier.issuerAy <== credIssuerAy;
        scopedVerifier.publicKey <== credPublicKey;
    }

    if (ALLOWED & 256) {
        allowlistVerifier = RequesterAllowlistVerifier(MERKLE_LEVELS);
        allowlistVerifier.requesterId <== requesterId;
        allowlistVerifier.enabled <== sel8;
        allowlistVerifier.merkleLeaf <== merkleLeaf;
        allowlistVerifier.merkleRoot <== merkleRoot;
        allowlistVerifier.schemaTag <== predicateSchemaTag;
        allowlistVerifier.scopeKind <== scopeKind;
        allowlistVerifier.approvedScopeId <== approvedScopeId;
        allowlistVerifier.credPublicKey <== credPublicKey;
        for (var i = 0; i < MERKLE_LEVELS; i++) {
            allowlistVerifier.merklePathElements[i] <== merklePathElements[i];
            allowlistVerifier.merklePathIndices[i] <== merklePathIndices[i];
        }
    }

    if (ALLOWED & 64) {
        moratoriumVerifier = PolicyObligationVerifier(2003);
        moratoriumVerifier.schemaTag <== predicateSchemaTag;
        moratoriumVerifier.epochValue <== moratoriumUntilEpoch;
    }
    if (ALLOWED & 128) {
        timeLimitVerifier = PolicyObligationVerifier(2004);
        timeLimitVerifier.schemaTag <== predicateSchemaTag;
        timeLimitVerifier.epochValue <== timeLimitEpochs;
    }

    // Connect range verifier
    if (ALLOWED & 4) {
        rangeVerifier = RangeProof(RANGE_BITS);
        rangeVerifier.value <== rangeValue;
        rangeVerifier.minValue <== rangeMin;
        rangeVerifier.maxValue <== rangeMax;
    }

    // Connect ontology-linked terms verifier
    if (ALLOWED & 8) {
        ontologyVerifier = OntologyLinkedTermsVerifier(MERKLE_LEVELS);
        ontologyVerifier.icdCode <== ontologyCode;
        ontologyVerifier.allowedRoot <== merkleRoot;  // Reuse merkleRoot for ontology verification
        ontologyVerifier.policyId <== ontologyPolicyId;
        ontologyVerifier.epoch <== ontologyEpoch;
        for (var i = 0; i < MERKLE_LEVELS; i++) {
            ontologyVerifier.merklePathElements[i] <== merklePathElements[i];
            ontologyVerifier.merklePathIndices[i] <== merklePathIndices[i];
        }
    }


    // Multiply each result by its selector and sum (break into quadratic
    // constraints). A type outside ALLOWED has no verifier and a constant-0
    // selector, so its term is the constant 0.
    signal merkleSelected;
    signal signatureSelected;
    signal rangeSelected;
    signal ontologySelected;
    signal scopedSelected;
    signal allowlistSelected;
    signal moratoriumSelected;
    signal timeLimitSelected;
    signal profileSelected;
    signal partialSum1, partialSum2, partialSum3, partialSum4;

    if (ALLOWED & 1)   { merkleSelected <== sel0 * merkleVerifier.isValid; }
    else               { merkleSelected <== 0; }
    if (ALLOWED & 2)   { signatureSelected <== sel1 * signatureVerifier.isValid; }
    else               { signatureSelected <== 0; }
    if (ALLOWED & 4)   { rangeSelected <== sel2 * rangeVerifier.isValid; }
    else               { rangeSelected <== 0; }
    if (ALLOWED & 8)   { ontologySelected <== sel3 * ontologyVerifier.pred; }
    else               { ontologySelected <== 0; }
    if (ALLOWED & 32)  { scopedSelected <== sel5 * scopedVerifier.isValid; }
    else               { scopedSelected <== 0; }
    if (ALLOWED & 256) { allowlistSelected <== sel8 * allowlistVerifier.isValid; }
    else               { allowlistSelected <== 0; }
    if (ALLOWED & 64)  { moratoriumSelected <== sel6 * moratoriumVerifier.isValid; }
    else               { moratoriumSelected <== 0; }
    if (ALLOWED & 128) { timeLimitSelected <== sel7 * timeLimitVerifier.isValid; }
    else               { timeLimitSelected <== 0; }
    if (ALLOWED & 512) { profileSelected <== sel9 * profileVerifier.isValid; }
    else               { profileSelected <== 0; }

    partialSum1 <== merkleSelected + signatureSelected;
    partialSum2 <== partialSum1 + rangeSelected;
    partialSum3 <== partialSum2 + ontologySelected;
    partialSum4 <== partialSum3 + scopedSelected + moratoriumSelected;
    isValid <== partialSum4 + timeLimitSelected + allowlistSelected + profileSelected;
}
