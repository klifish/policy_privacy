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

template CredentialEdDSAVerifier() {
    // Private inputs
    signal input message;                           // Credential message: Poseidon(duoToken, pid, scopeHash, expiry)
    signal input sigR8x;                            // EdDSA signature R8 x-coordinate
    signal input sigR8y;                            // EdDSA signature R8 y-coordinate
    signal input sigS;                              // EdDSA signature scalar S

    // Public inputs — Baby Jubjub curve point
    signal input pubKeyAx;                          // Issuer public key x-coordinate
    signal input pubKeyAy;                          // Issuer public key y-coordinate

    // Selector: 1 = enforce EdDSA constraints, 0 = skip (non-signature slot)
    signal input isEnabled;

    // Output
    signal output isValid;                          // 1 if proof is satisfiable; circuit fails if invalid

    // EdDSAPoseidonVerifier from circomlib uses ForceEqualIfEnabled internally:
    // when enabled=1 and signature is invalid, proof generation (witness computation) fails.
    // when enabled=0, all EdDSA constraints are bypassed (no-op for non-signature slots).
    component eddsaVerifier = EdDSAPoseidonVerifier();
    eddsaVerifier.enabled <== isEnabled;
    eddsaVerifier.Ax <== pubKeyAx;
    eddsaVerifier.Ay <== pubKeyAy;
    eddsaVerifier.R8x <== sigR8x;
    eddsaVerifier.R8y <== sigR8y;
    eddsaVerifier.S <== sigS;
    eddsaVerifier.M <== message;

    // isValid is always 1: if enabled=1 and the EdDSA signature is invalid,
    // the circuit has no satisfying witness and proof generation fails entirely.
    // A successfully generated proof implies the signature was valid.
    isValid <== 1;
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
    
    // 1. Verify ICD code is in the allowed set using Merkle proof
    merkleVerifier = MerkleProofVerifier(LEVELS);
    merkleVerifier.leaf <== icdCode;
    merkleVerifier.root <== allowedRoot;
    for (var i = 0; i < LEVELS; i++) {
        merkleVerifier.pathElements[i] <== merklePathElements[i];
        merkleVerifier.pathIndices[i] <== merklePathIndices[i];
    }
    
    // 2. Policy binding: Ensure proof is bound to specific policy
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
// 5. UNIFIED EXTERNAL PREDICATE VERIFIER
// ═══════════════════════════════════════════════════════════════════════════

template ExternalPredicateVerifier(MERKLE_LEVELS, RANGE_BITS) {
    // Predicate type selector (0=merkle, 1=signature, 2=range, 3=ontology-linked, 4=disabled)
    signal input predicateType;

    // Merkle proof inputs
    signal input merkleLeaf;
    signal input merklePathElements[MERKLE_LEVELS];
    signal input merklePathIndices[MERKLE_LEVELS];
    signal input merkleRoot;

    // EdDSA credential signature inputs
    signal input credMessage;                       // Poseidon(duoToken, pid, scopeHash, expiry)
    signal input credSigR8x;                        // EdDSA signature R8 x-coordinate
    signal input credSigR8y;                        // EdDSA signature R8 y-coordinate
    signal input credSigS;                          // EdDSA signature scalar S
    signal input credPubKeyAx;                      // Issuer public key x (Baby Jubjub)
    signal input credPubKeyAy;                      // Issuer public key y (Baby Jubjub)

    // Range proof inputs
    signal input rangeValue;
    signal input rangeMin;
    signal input rangeMax;

    // Ontology-linked terms inputs
    signal input ontologyCode;                      // ICD code or other ontology term
    signal input ontologyPolicyId;                  // Policy ID for binding
    signal input ontologyEpoch;                     // Policy epoch/version

    // Output
    signal output isValid;

    // Components
    component merkleVerifier;
    component signatureVerifier;
    component rangeVerifier;
    component ontologyVerifier;
    component type0Check, type1Check, type2Check, type3Check;

    // Type selector checks
    type0Check = IsEqual();
    type1Check = IsEqual();
    type2Check = IsEqual();
    type3Check = IsEqual();

    type0Check.in[0] <== predicateType;
    type0Check.in[1] <== 0;

    type1Check.in[0] <== predicateType;
    type1Check.in[1] <== 1;

    type2Check.in[0] <== predicateType;
    type2Check.in[1] <== 2;

    type3Check.in[0] <== predicateType;
    type3Check.in[1] <== 3;

    // Instantiate all verifiers
    merkleVerifier = MerkleProofVerifier(MERKLE_LEVELS);
    signatureVerifier = CredentialEdDSAVerifier();
    rangeVerifier = RangeProof(RANGE_BITS);
    ontologyVerifier = OntologyLinkedTermsVerifier(MERKLE_LEVELS);

    // Connect merkle verifier
    merkleVerifier.leaf <== merkleLeaf;
    for (var i = 0; i < MERKLE_LEVELS; i++) {
        merkleVerifier.pathElements[i] <== merklePathElements[i];
        merkleVerifier.pathIndices[i] <== merklePathIndices[i];
    }
    merkleVerifier.root <== merkleRoot;

    // Connect EdDSA credential verifier
    signatureVerifier.message <== credMessage;
    signatureVerifier.sigR8x <== credSigR8x;
    signatureVerifier.sigR8y <== credSigR8y;
    signatureVerifier.sigS <== credSigS;
    signatureVerifier.pubKeyAx <== credPubKeyAx;
    signatureVerifier.pubKeyAy <== credPubKeyAy;
    signatureVerifier.isEnabled <== type1Check.out;  // Only enforce EdDSA when type == SIGNATURE

    // Connect range verifier
    rangeVerifier.value <== rangeValue;
    rangeVerifier.minValue <== rangeMin;
    rangeVerifier.maxValue <== rangeMax;

    // Connect ontology-linked terms verifier
    ontologyVerifier.icdCode <== ontologyCode;
    ontologyVerifier.allowedRoot <== merkleRoot;  // Reuse merkleRoot for ontology verification
    ontologyVerifier.policyId <== ontologyPolicyId;
    ontologyVerifier.epoch <== ontologyEpoch;
    for (var i = 0; i < MERKLE_LEVELS; i++) {
        ontologyVerifier.merklePathElements[i] <== merklePathElements[i];
        ontologyVerifier.merklePathIndices[i] <== merklePathIndices[i];
    }

    // Multiply each result by its selector and sum (break into quadratic constraints)
    signal merkleSelected;
    signal signatureSelected;
    signal rangeSelected;
    signal ontologySelected;
    signal partialSum1, partialSum2;

    merkleSelected <== type0Check.out * merkleVerifier.isValid;
    signatureSelected <== type1Check.out * signatureVerifier.isValid;
    rangeSelected <== type2Check.out * rangeVerifier.isValid;
    ontologySelected <== type3Check.out * ontologyVerifier.pred;

    partialSum1 <== merkleSelected + signatureSelected;
    partialSum2 <== partialSum1 + rangeSelected;
    isValid <== partialSum2 + ontologySelected;
}
