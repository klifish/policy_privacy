pragma circom 2.0.0;

include "../../circuits/gadgets/external_predicates.circom";

/*
    Test for OntologyLinkedTermsVerifier with concrete parameters
    
    This circuit tests the new ontology-linked terms verification
    which extends Merkle proof verification with policy ID and epoch binding.
*/

component main {
    public [allowedRoot, policyId, epoch]  
} = OntologyLinkedTermsVerifier(8);