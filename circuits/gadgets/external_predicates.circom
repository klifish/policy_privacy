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

template CredentialSignatureVerifier() {
    // Private inputs - simplified for Phase 1
    signal input message;                           // Single message value  
    signal input signature;                         // Simplified signature value
    
    // Public inputs
    signal input publicKey;                         // Simplified public key
    
    // Output  
    signal output isValid;                          // Boolean: is signature valid?
    
    // For Phase 1, we'll use a simplified mock verification
    // In production, this would integrate with a proper EdDSA verifier
    // For now, just check that signature matches a simple hash relationship
    component hasher;
    component checker;
    
    hasher = Poseidon(2);
    hasher.inputs[0] <== message;
    hasher.inputs[1] <== publicKey;
    
    checker = IsEqual();
    checker.in[0] <== hasher.out;
    checker.in[1] <== signature;
    
    // Output verification result
    isValid <== checker.out;
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
// 4. UNIFIED EXTERNAL PREDICATE VERIFIER
// ═══════════════════════════════════════════════════════════════════════════

template ExternalPredicateVerifier(MERKLE_LEVELS, RANGE_BITS) {
    // Predicate type selector (0=merkle, 1=signature, 2=range)
    signal input predicateType;
    
    // Merkle proof inputs
    signal input merkleLeaf;
    signal input merklePathElements[MERKLE_LEVELS]; 
    signal input merklePathIndices[MERKLE_LEVELS];
    signal input merkleRoot;
    
    // Signature inputs  
    signal input credMessage;                       // Single message value
    signal input credSignature;                     // Single signature value
    signal input credPublicKey;                     // Single public key
    
    // Range proof inputs  
    signal input rangeValue;
    signal input rangeMin;
    signal input rangeMax;
    
    // Output
    signal output isValid;
    
    // Components
    component merkleVerifier;
    component signatureVerifier;  
    component rangeVerifier;
    component type0Check, type1Check, type2Check;
    
    // Instantiate all verifiers
    merkleVerifier = MerkleProofVerifier(MERKLE_LEVELS);
    signatureVerifier = CredentialSignatureVerifier();
    rangeVerifier = RangeProof(RANGE_BITS);
    
    // Connect merkle verifier
    merkleVerifier.leaf <== merkleLeaf;
    for (var i = 0; i < MERKLE_LEVELS; i++) {
        merkleVerifier.pathElements[i] <== merklePathElements[i];
        merkleVerifier.pathIndices[i] <== merklePathIndices[i];
    }
    merkleVerifier.root <== merkleRoot;
    
    // Connect signature verifier
    signatureVerifier.message <== credMessage;
    signatureVerifier.signature <== credSignature;
    signatureVerifier.publicKey <== credPublicKey;
    
    // Connect range verifier
    rangeVerifier.value <== rangeValue;
    rangeVerifier.minValue <== rangeMin;
    rangeVerifier.maxValue <== rangeMax;
    
    // Select result based on predicate type using manual selection
    // predicateType: 0=Merkle, 1=Signature, 2=Range
    type0Check = IsEqual();
    type1Check = IsEqual();
    type2Check = IsEqual();
    
    type0Check.in[0] <== predicateType;
    type0Check.in[1] <== 0;
    
    type1Check.in[0] <== predicateType;
    type1Check.in[1] <== 1;
    
    type2Check.in[0] <== predicateType;
    type2Check.in[1] <== 2;
    
    // Multiply each result by its selector and sum (break into quadratic constraints)
    signal merkleSelected;
    signal signatureSelected; 
    signal rangeSelected;
    signal partialSum;
    
    merkleSelected <== type0Check.out * merkleVerifier.isValid;
    signatureSelected <== type1Check.out * signatureVerifier.isValid;
    rangeSelected <== type2Check.out * rangeVerifier.isValid;
    
    partialSum <== merkleSelected + signatureSelected;
    isValid <== partialSum + rangeSelected;
}