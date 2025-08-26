pragma circom 2.0.0;

include "../../circuits/gadgets/external_predicates.circom";

/*
    Test for CredentialSignatureVerifier component
*/

component main {
    public [publicKey]  
} = CredentialSignatureVerifier();