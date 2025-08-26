pragma circom 2.0.0;

include "../../circuits/gadgets/commitment.circom";

/*
    Simple test for Commitment component with concrete parameters
*/

component main {
    public [commitment]  
} = Commitment(10);